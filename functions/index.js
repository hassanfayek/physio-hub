const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

const CLAUDE_API_KEY = defineSecret("CLAUDE_API_KEY");

// ─── Delete Auth User ─────────────────────────────────────────────────────────

exports.deleteAuthUser = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in.");
  }

  const callerDoc = await admin.firestore()
    .collection("users")
    .doc(request.auth.uid)
    .get();

  if (!callerDoc.exists || callerDoc.data().role !== "clinic_manager") {
    throw new HttpsError("permission-denied", "Only clinic managers can delete accounts.");
  }

  const uid = request.data.uid;
  if (!uid || typeof uid !== "string") {
    throw new HttpsError("invalid-argument", "uid is required.");
  }

  await admin.auth().deleteUser(uid);
  return { success: true };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatSection(title, fields) {
  const lines = fields
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `  ${k}: ${v}`);
  if (lines.length === 0) return "";
  return `${title}:\n${lines.join("\n")}`;
}

function formatJointAssessment(jointDoc) {
  if (!jointDoc || !jointDoc.selectedJoints || jointDoc.selectedJoints.length === 0) {
    return "";
  }

  const lines = [];

  lines.push(`Assessed joints: ${jointDoc.selectedJoints.join(", ")}`);
  if (jointDoc.dominantSide) lines.push(`Dominant side: ${jointDoc.dominantSide}`);
  if (jointDoc.sport)        lines.push(`Sport/activity: ${jointDoc.sport}`);
  if (jointDoc.mechanism)    lines.push(`Mechanism: ${jointDoc.mechanism}`);
  if (jointDoc.impression)   lines.push(`Clinical impression: ${jointDoc.impression}`);
  if (jointDoc.assessor)     lines.push(`Assessor: ${jointDoc.assessor}`);
  if (jointDoc.date)         lines.push(`Date: ${jointDoc.date}`);

  for (const jointKey of (jointDoc.selectedJoints || [])) {
    const jd = jointDoc.joints?.[jointKey];
    if (!jd) continue;

    lines.push(`\n[${jointKey.replace(/_/g, " ").toUpperCase()}]`);
    if (jd.pain)     lines.push(`  Pain: ${jd.pain}`);
    if (jd.swelling) lines.push(`  Swelling: ${jd.swelling}`);
    if (jd.notes)    lines.push(`  Notes: ${jd.notes}`);

    // Range of Motion
    const romLines = Object.entries(jd.rom || {})
      .filter(([, r]) => r && (r.active || r.passive))
      .map(([motionId, r]) => {
        const parts = [];
        if (r.active)  parts.push(`active ${r.active}`);
        if (r.passive) parts.push(`passive ${r.passive}`);
        if (r.pain)    parts.push(`pain: ${r.pain}`);
        return `    ${motionId}: ${parts.join(", ")}`;
      });
    if (romLines.length > 0) {
      lines.push("  Range of Motion:");
      lines.push(...romLines);
    }

    // Muscle Strength
    const muscleLines = Object.entries(jd.muscles || {})
      .filter(([, m]) => m && m.grade)
      .map(([muscleId, m]) => {
        const parts = [`grade ${m.grade}`];
        if (m.pain)  parts.push(`pain: ${m.pain}`);
        if (m.notes) parts.push(m.notes);
        return `    ${muscleId}: ${parts.join(", ")}`;
      });
    if (muscleLines.length > 0) {
      lines.push("  Muscle Strength (MMT):");
      lines.push(...muscleLines);
    }

    // Special Tests
    const testLines = Object.entries(jd.tests || {})
      .filter(([, t]) => t && t.result)
      .map(([testId, t]) => {
        return `    ${testId}: ${t.result}${t.notes ? ` (${t.notes})` : ""}`;
      });
    if (testLines.length > 0) {
      lines.push("  Special Tests:");
      lines.push(...testLines);
    }

    // Balance Tests
    const balanceLines = Object.entries(jd.balance || {})
      .filter(([, b]) => b && b.value)
      .map(([balId, b]) => {
        return `    ${balId}: ${b.value}${b.unit ? ` ${b.unit}` : ""}${b.notes ? ` — ${b.notes}` : ""}`;
      });
    if (balanceLines.length > 0) {
      lines.push("  Balance / Functional Tests:");
      lines.push(...balanceLines);
    }
  }

  return lines.join("\n");
}

// ─── Generate Treatment Plan ──────────────────────────────────────────────────

exports.generateTreatmentPlan = onCall(
  { secrets: [CLAUDE_API_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in.");
    }

    const callerDoc = await admin.firestore()
      .collection("users")
      .doc(request.auth.uid)
      .get();

    if (!callerDoc.exists) {
      throw new HttpsError("permission-denied", "User not found.");
    }

    const role = callerDoc.data().role;
    if (role !== "clinic_manager" && role !== "physiotherapist") {
      throw new HttpsError("permission-denied", "Only physiotherapists and managers can generate treatment plans.");
    }

    const { patientId, notes } = request.data;
    if (!patientId) {
      throw new HttpsError("invalid-argument", "patientId is required.");
    }

    const db = admin.firestore();

    // Fetch all patient data in parallel
    const [patientSnap, diagSnap, assessSnap, jointSnap] = await Promise.all([
      db.collection("patients").doc(patientId).get(),
      db.collection("patientDiagnosis").doc(patientId).get(),
      db.collection("patientAssessments").doc(patientId).get(),
      db.collection("jointAssessments").doc(patientId).get(),
    ]);

    const patient  = patientSnap.exists  ? patientSnap.data()  : {};
    const diag     = diagSnap.exists     ? diagSnap.data()     : {};
    const assess   = assessSnap.exists   ? assessSnap.data()   : {};
    const jointDoc = jointSnap.exists    ? jointSnap.data()    : null;

    // ── Build clinical summary ───────────────────────────────────────────────

    const sections = [];

    // Patient info
    const patientSection = formatSection("Patient", [
      ["Name",       [patient.firstName, patient.lastName].filter(Boolean).join(" ")],
      ["Age",        patient.age],
      ["Occupation", patient.occupation],
    ]);
    if (patientSection) sections.push(patientSection);

    // Diagnosis
    const diagSection = formatSection("Diagnosis", [
      ["Primary Diagnosis",  diag.primaryDiagnosis],
      ["ICD-10 Code",        diag.icdCode],
      ["Onset Date",         diag.onsetDate],
      ["Mechanism of Injury",diag.mechanism],
      ["Surgery Date",       diag.surgeryDate],
      ["Surgeon",            diag.surgeon],
      ["Contraindications",  diag.contraindications],
    ]);
    if (diagSection) sections.push(diagSection);

    // PT Assessment — Subjective
    const subjectiveSection = formatSection("Subjective Assessment", [
      ["Chief Complaints",    assess.subjectiveComplaints],
      ["Pain Location",       assess.painLocation],
      ["Pain Score (NRS)",    assess.painScore],
      ["Aggravating Factors", assess.aggravatingFactors],
      ["Relieving Factors",   assess.relievingFactors],
      ["Medical History",     assess.medicalHistory],
      ["Current Medications", assess.medications],
    ]);
    if (subjectiveSection) sections.push(subjectiveSection);

    // PT Assessment — Objective
    const objectiveSection = formatSection("Objective Assessment", [
      ["Posture / Observation",  assess.postureObservation],
      ["Range of Motion",        assess.rangeOfMotion],
      ["Muscle Strength (MMT)",  assess.muscleStrength],
      ["Special Tests",          assess.specialTests],
      ["Functional Limitations", assess.functionalLimits],
      ["Precautions",            assess.precautions],
    ]);
    if (objectiveSection) sections.push(objectiveSection);

    // Therapist's own goals / approach
    const planSection = formatSection("Therapist's Initial Plan", [
      ["Short-Term Goals",   assess.shortTermGoals],
      ["Long-Term Goals",    assess.longTermGoals],
      ["Treatment Approach", assess.treatmentApproach],
      ["Assessed By",        assess.assessorName],
      ["Assessment Date",    assess.assessmentDate],
    ]);
    if (planSection) sections.push(planSection);

    // Body Profile / Joint Assessment
    const jointText = formatJointAssessment(jointDoc);
    if (jointText) sections.push(`Body Profile (Joint Assessment):\n${jointText}`);

    // Clinician's extra notes
    if (notes && notes.trim()) {
      sections.push(`Additional Notes from Clinician:\n  ${notes.trim()}`);
    }

    const clinicalSummary = sections.length > 0
      ? sections.join("\n\n")
      : "No clinical data recorded yet.";

    // ── Call Claude ──────────────────────────────────────────────────────────

    const client = new Anthropic({ apiKey: CLAUDE_API_KEY.value() });

    const systemPrompt = `You are a senior physiotherapist writing a treatment plan for a colleague's clinical records.
Write in a natural, professional clinical tone — like a detailed handover note from one physio to another.
Use plain language. Write in flowing paragraphs where appropriate, and use bullet points (starting with -) only for exercise lists.
Be specific and directly reference the patient's actual findings (ROM values, muscle grades, positive tests, pain scores) throughout.
Do not be generic. Every sentence should be grounded in the data provided.`;

    const userPrompt = `Based on the following complete clinical data, write a detailed physiotherapy treatment plan:

${clinicalSummary}

Format your response EXACTLY like this — no JSON, no code blocks, just plain text with these two markers:

##GOALS##
Write 2-3 sentences covering short-term (2-4 weeks) and long-term (6-12 weeks) goals tied to this patient's specific deficits.

##PLAN##
Write the full treatment plan covering these sections, each on its own line with a blank line between sections:

Manual Therapy
[paragraphs describing techniques, structures targeted, frequency, rationale]

Exercise Program
Phase 1 — Weeks 1-2:
- exercise name — sets x reps, frequency, brief rationale
(continue for all exercises in this phase)

Phase 2 — Weeks 3-4:
- exercise name — sets x reps, frequency

Phase 3 — Weeks 5+:
- exercise name — sets x reps, frequency

Modalities
[only if clinically indicated — explain rationale tied to findings]

Patient Education
[key points specific to this patient's diagnosis and lifestyle]

Home Program
- exercise — sets x reps, frequency

Progression Criteria
[objective ROM values, strength grades, functional tests to progress between phases]

Red Flags
[specific to this patient's diagnosis and findings]`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    let goals = "";
    let plan = rawText.trim();

    const goalsMarker = "##GOALS##";
    const planMarker  = "##PLAN##";
    const goalsIdx = rawText.indexOf(goalsMarker);
    const planIdx  = rawText.indexOf(planMarker);

    if (goalsIdx !== -1 && planIdx !== -1) {
      goals = rawText.slice(goalsIdx + goalsMarker.length, planIdx).trim();
      plan  = rawText.slice(planIdx  + planMarker.length).trim();
    } else if (planIdx !== -1) {
      plan = rawText.slice(planIdx + planMarker.length).trim();
    }

    return { goals, plan };
  }
);

// ─── Generate Nutrition Quantities ───────────────────────────────────────────

exports.generateNutritionQuantities = onCall(
  { secrets: [CLAUDE_API_KEY] },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Must be logged in.");
    }

    const callerDoc = await admin.firestore()
      .collection("users").doc(request.auth.uid).get();
    if (!callerDoc.exists) throw new HttpsError("permission-denied", "User not found.");
    const role = callerDoc.data().role;
    if (role !== "clinic_manager" && role !== "physiotherapist") {
      throw new HttpsError("permission-denied", "Only physiotherapists and managers can use AI nutrition.");
    }

    const { patientId } = request.data;
    if (!patientId) throw new HttpsError("invalid-argument", "patientId is required.");

    const db = admin.firestore();
    const [patientSnap, nutritionSnap] = await Promise.all([
      db.collection("patients").doc(patientId).get(),
      db.collection("nutritionProfiles").doc(patientId).get(),
    ]);

    const patient   = patientSnap.exists   ? patientSnap.data()   : {};
    const nutrition = nutritionSnap.exists ? nutritionSnap.data() : {};

    // ── Build context ────────────────────────────────────────────────────────

    const weight      = nutrition.weight        ?? 75;
    const gender      = nutrition.gender        ?? "male";
    const goal        = (nutrition.goal         ?? "maintenance").replace(/_/g, " ");
    const activity    = nutrition.activityLevel ?? "moderate";
    const carbChoice  = nutrition.carbChoice    ?? "rice";
    const meal3Choice = nutrition.meal3Choice   ?? "chicken";
    const ib          = nutrition.inBody        ?? {};

    const inBodyLines = [];
    if (ib.weight)             inBodyLines.push(`  Measured Weight: ${ib.weight} kg`);
    if (ib.skeletalMuscleMass) inBodyLines.push(`  Skeletal Muscle Mass (SMM): ${ib.skeletalMuscleMass} kg`);
    if (ib.bodyFatMass)        inBodyLines.push(`  Body Fat Mass: ${ib.bodyFatMass} kg`);
    if (ib.bodyFatPercent)     inBodyLines.push(`  Body Fat %: ${ib.bodyFatPercent}%`);
    if (ib.bmi)                inBodyLines.push(`  BMI: ${ib.bmi}`);
    if (ib.bmr)                inBodyLines.push(`  BMR (Basal Metabolic Rate): ${ib.bmr} kcal/day`);
    if (ib.visceralFatLevel)   inBodyLines.push(`  Visceral Fat Level: ${ib.visceralFatLevel}/20`);
    if (ib.totalBodyWater)     inBodyLines.push(`  Total Body Water: ${ib.totalBodyWater} L`);
    if (ib.notes && ib.notes.trim()) inBodyLines.push(`  Notes: ${ib.notes}`);

    const inBodySection = inBodyLines.length > 0
      ? `InBody Measurement:\n${inBodyLines.join("\n")}`
      : "InBody Measurement: Not recorded";

    const prompt = `You are a clinical nutrition specialist. Analyse the patient data below and return optimised food quantities for the 3-meal diet plan template.

PATIENT:
  Name: ${[patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Unknown"}
  Self-reported weight: ${weight} kg
  Gender: ${gender}
  Goal: ${goal}
  Activity level: ${activity}

${inBodySection}

BASE DIET PLAN TEMPLATE:
Meal 1 (~1 PM — Lunch):
  - Eggs: base 3 eggs
  - Bran bread: base 30 g
  - Fresh cheese: base 150 g
  - Green salad: unlimited (do not quantify)
  - Fruit: 1 piece (do not quantify)

Meal 2 (5–7 PM):
  - Animal protein: base 200 g (cooked weight)
  - Carb — ${carbChoice === "rice" ? "Rice: base 100 g" : "Potatoes: base 150 g"} (cooked weight)
  - Sautéed vegetables: base 150 g

Meal 3 (11 PM):
  - ${meal3Choice === "chicken" ? "Chicken breast: base 150 g (cooked weight)" : "Tuna: 1 can (do not quantify)"}
  - Sweet corn: base 50 g
  - Greek yogurt: base 170 g
  - Honey: 1 tsp (do not quantify)

CALCULATION RULES:
1. If BMR is provided, compute TDEE = BMR × activity_multiplier:
   - sedentary: ×1.20, moderate: ×1.55, active: ×1.725, athlete: ×1.90
2. Adjust for goal:
   - weight loss: TDEE × 0.80 (20% deficit)
   - maintenance: TDEE × 1.00
   - muscle gain: TDEE × 1.00 + extra 250–300 kcal (mostly protein)
   - performance: TDEE × 1.10
3. Protein target:
   - If SMM known: protein_g = SMM(kg) × 3.5 (to protect muscle)
   - Else: weight × (1.8 for weight loss, 2.0 maintenance, 2.4 muscle gain, 2.6 performance)
4. Carbs: drive by activity — athlete gets significantly more than sedentary
5. Water: max(4.0, weight × 0.040) L + activity bonus (sedentary: 0, moderate: +0.5, active: +1.0, athlete: +1.5), round to nearest 0.5
6. Eggs: 1–6, integer only
7. All gram values must be multiples of 5
8. Apply gender factor for females: multiply all quantities by 0.85 before rounding

Return ONLY valid JSON, no markdown, no explanation outside the "reasoning" field:
{
  "eggs": <1–6>,
  "bran_bread": <grams, multiple of 5>,
  "fresh_cheese": <grams, multiple of 5>,
  "protein2": <grams, multiple of 5>,
  ${carbChoice === "rice" ? '"rice"' : '"potatoes"'}: <grams, multiple of 5>,
  "veg2": <grams, multiple of 5>,
  ${meal3Choice === "chicken" ? '"chicken3": <grams, multiple of 5>,' : ""}
  "sweetcorn3": <grams, multiple of 5>,
  "yogurt3": <grams, multiple of 5>,
  "waterLiters": <number, one decimal, e.g. 3.5>,
  "reasoning": "<2–3 sentences explaining the key decisions, referencing specific InBody values if available>"
}`;

    const client = new Anthropic({ apiKey: CLAUDE_API_KEY.value() });

    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 600,
      messages:   [{ role: "user", content: prompt }],
    });

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    // Strip markdown code fences if present
    const jsonStr = raw.replace(/^```[a-z]*\n?/i, "").replace(/```$/,"").trim();

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new HttpsError("internal", "AI returned invalid JSON. Please try again.");
    }

    const { reasoning, ...quantities } = parsed;
    return { quantities, reasoning: reasoning ?? "" };
  }
);
