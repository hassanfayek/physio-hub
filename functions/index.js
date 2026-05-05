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

    const systemPrompt = `You are an expert physiotherapy clinical assistant helping experienced physiotherapists create evidence-based, highly personalised treatment plans.
You will receive a full clinical picture: diagnosis, subjective and objective assessment, body profile with joint ROM, muscle strength, special tests, and balance data.
Use ALL of this information to produce a specific, practical, and clinically sound treatment plan.
Do not make generic recommendations — tailor everything to the exact deficits, findings, and context provided.
Format your response with clear sections using markdown-style headings (##).`;

    const userPrompt = `Based on the following complete clinical data, create a detailed physiotherapy treatment plan:

${clinicalSummary}

Please provide:
## Treatment Goals
- Short-term (2–4 weeks)
- Long-term (6–12 weeks)

## Manual Therapy
Specific techniques, target structures, frequency, and rationale based on the findings above.

## Exercise Program
Phase 1 (Weeks 1–2), Phase 2 (Weeks 3–4), Phase 3 (Weeks 5+) — each with specific exercises, sets, reps, frequency, and parameters. Address the specific ROM deficits, muscle weakness grades, and functional limitations found.

## Modalities
If applicable: electrotherapy, heat/cold, ultrasound, taping — with rationale tied to the findings.

## Patient Education
Key points to communicate based on this patient's specific situation.

## Home Exercise Program
3–5 exercises the patient can perform independently, matched to their deficits.

## Progression Criteria & Milestones
Objective criteria (ROM values, strength grades, functional tests) to progress between phases.

## Red Flags to Monitor
Based on the diagnosis and findings, what should trigger re-evaluation or referral.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2500,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });

    const plan = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();

    return { plan };
  }
);
