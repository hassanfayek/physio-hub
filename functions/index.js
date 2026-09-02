const { setGlobalOptions } = require("firebase-functions");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

const CLAUDE_API_KEY = defineSecret("CLAUDE_API_KEY");

// ─── Kapso WhatsApp bridge (onRequest, shared-secret auth) ───────────────────

const bridgeApi = require("./bridgeApi");
exports.lookupPatient           = bridgeApi.lookupPatient;
exports.rescheduleAppointment   = bridgeApi.rescheduleAppointment;
exports.cancelAppointment       = bridgeApi.cancelAppointment;
exports.createWalkInAppointment = bridgeApi.createWalkInAppointment;
exports.bookNextSession         = bridgeApi.bookNextSession;
exports.getAvailableSlots       = bridgeApi.getAvailableSlots;

// ─── Webapp-facing atomic booking (onCall) ───────────────────────────────────
// Mirrors firestore.rules' `allow create` condition for /appointments exactly
// (isStaff() || (isPatient() && patientId == auth.uid)), since this callable
// uses the Admin SDK and therefore bypasses those rules — this check is the
// only authorization boundary. Shares the same atomic booking primitive
// (scheduling.bookAppointmentAtomic) used by the WhatsApp bridge, so both
// callers enforce identical capacity/hours/Friday rules with no duplicated
// transaction logic.

const scheduling = require("./scheduling");
const STAFF_ROLES = new Set(["clinic_manager", "manager", "physiotherapist", "secretary"]);

exports.bookAppointment = onCall(async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "Must be logged in.");
  }

  const userDoc = await admin.firestore().collection("users").doc(request.auth.uid).get();
  const role = userDoc.exists ? userDoc.data().role : null;
  const isStaff = STAFF_ROLES.has(role);
  const isPatient = role === "patient";

  const data = request.data || {};

  if (!isStaff && !(isPatient && data.patientId === request.auth.uid)) {
    throw new HttpsError("permission-denied", "Not authorized to book this appointment.");
  }

  const result = await scheduling.bookAppointmentAtomic({
    patientId: data.patientId,
    patientName: data.patientName,
    patientPhone: data.patientPhone,
    physioId: data.physioId,
    physioName: data.physioName,
    date: data.date,
    hour: data.hour,
    sessionType: data.sessionType,
  });

  if (!result.ok) {
    if (result.reason === "SLOT_UNAVAILABLE") {
      throw new HttpsError("already-exists", "This time slot is fully booked.", { reason: result.reason });
    }
    throw new HttpsError("failed-precondition", `Booking rejected: ${result.reason}`, { reason: result.reason });
  }

  return { id: result.appointmentId };
});

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

    // Muscle Strength / Force
    const muscleLines = Object.entries(jd.muscles || {})
      .filter(([, m]) => m && (m.force || m.timeToPeak || m.firingDuration))
      .map(([muscleId, m]) => {
        const parts = [];
        if (m.force)          parts.push(`force ${m.force} N`);
        if (m.timeToPeak)     parts.push(`time to peak ${m.timeToPeak} s`);
        if (m.firingDuration) parts.push(`firing duration ${m.firingDuration} s`);
        return `    ${muscleId}: ${parts.join(", ")}`;
      });
    if (muscleLines.length > 0) {
      lines.push("  Muscle Force:");
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
  { secrets: [CLAUDE_API_KEY], timeoutSeconds: 120 },
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

    const { patientId, notes, duration } = request.data;
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

    // Program duration
    if (duration && duration.trim()) {
      sections.push(`Treatment Program Duration:\n  ${duration.trim()}`);
    }

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

    const durationLine = duration && duration.trim()
      ? `The clinician has specified a total program duration of: ${duration.trim()}. Structure all phases, goals, and timelines to fit within this duration.`
      : "";

    const userPrompt = `Based on the following complete clinical data, write a detailed physiotherapy treatment plan:

${clinicalSummary}
${durationLine ? `\n${durationLine}` : ""}
Format your response EXACTLY like this — no JSON, no code blocks, just plain text with these two markers:

##GOALS##
Write 2-3 sentences covering short-term and long-term goals tied to this patient's specific deficits${duration ? ` within the ${duration.trim()} program` : " (2-4 weeks short-term, 6-12 weeks long-term)"}.

##PLAN##
Write the full treatment plan covering these sections, each on its own line with a blank line between sections:

Manual Therapy
[paragraphs describing techniques, structures targeted, frequency, rationale]

Exercise Program
${duration ? `Structure phases to span the full ${duration.trim()} program:` : ""}
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

    let response;
    try {
      response = await client.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      });
    } catch (aiErr) {
      const msg = aiErr?.message || "AI service unavailable";
      const status = aiErr?.status;
      console.error("generateTreatmentPlan Claude API error:", { status, msg, raw: aiErr?.error ?? aiErr });
      if (status === 529 || status === 503 || msg.toLowerCase().includes("overloaded")) {
        throw new HttpsError("unavailable", "The AI service is temporarily overloaded. Please try again in a moment.");
      }
      if (/credit balance|spend limit|usage limit|billing/i.test(msg)) {
        throw new HttpsError("resource-exhausted", "The clinic's AI account has hit its usage/credit limit. Please check the Anthropic Console billing page to top up or raise the limit.");
      }
      if (status === 429 || msg.toLowerCase().includes("rate limit")) {
        throw new HttpsError("resource-exhausted", "Too many requests. Please wait a few seconds and try again.");
      }
      throw new HttpsError("internal", `AI error: ${msg}`);
    }

    const rawText = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    if (!rawText.trim()) {
      throw new HttpsError("internal", "AI returned an empty response. Please try again.");
    }

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

// ─── Generate Exercise Program ────────────────────────────────────────────────

const PROGRAM_DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

exports.generateExerciseProgram = onCall(
  { secrets: [CLAUDE_API_KEY], timeoutSeconds: 120 },
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
      throw new HttpsError("permission-denied", "Only physiotherapists and managers can generate exercise programs.");
    }

    const { patientId, diagnosisGoal, weeks, daySplit } = request.data;
    if (!patientId) {
      throw new HttpsError("invalid-argument", "patientId is required.");
    }
    if (!diagnosisGoal || !String(diagnosisGoal).trim()) {
      throw new HttpsError("invalid-argument", "diagnosisGoal is required.");
    }
    const weekCount = Math.min(8, Math.max(1, parseInt(weeks, 10) || 1));

    const trainingDays = (Array.isArray(daySplit) ? daySplit : [])
      .filter((d) => d && PROGRAM_DAYS.includes(d.day) && !d.isRest)
      .map((d) => ({ day: d.day, focus: String(d.focus || "Full Body").trim() || "Full Body" }));
    if (trainingDays.length === 0) {
      throw new HttpsError("invalid-argument", "At least one training day is required.");
    }

    const db = admin.firestore();

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

    const sections = [];

    const patientSection = formatSection("Patient", [
      ["Name",       [patient.firstName, patient.lastName].filter(Boolean).join(" ")],
      ["Age",        patient.age],
      ["Occupation", patient.occupation],
    ]);
    if (patientSection) sections.push(patientSection);

    const diagSection = formatSection("Diagnosis", [
      ["Primary Diagnosis",   diag.primaryDiagnosis],
      ["ICD-10 Code",         diag.icdCode],
      ["Onset Date",          diag.onsetDate],
      ["Mechanism of Injury", diag.mechanism],
      ["Surgery Date",        diag.surgeryDate],
      ["Contraindications",   diag.contraindications],
    ]);
    if (diagSection) sections.push(diagSection);

    const assessSection = formatSection("PT Assessment", [
      ["Chief Complaints",     assess.subjectiveComplaints],
      ["Pain Location",        assess.painLocation],
      ["Pain Score (NRS)",     assess.painScore],
      ["Functional Limitations", assess.functionalLimits],
      ["Precautions",          assess.precautions],
    ]);
    if (assessSection) sections.push(assessSection);

    const jointText = formatJointAssessment(jointDoc);
    if (jointText) sections.push(`Body Profile (Joint Assessment):\n${jointText}`);

    const clinicalSummary = sections.length > 0
      ? sections.join("\n\n")
      : "No clinical data recorded yet.";

    const client = new Anthropic({ apiKey: CLAUDE_API_KEY.value() });

    const systemPrompt = `You are a senior physiotherapist designing a remote/home exercise program for a patient.
Be specific and ground exercise selection in the diagnosis and goal provided. Progress difficulty/load across
the weeks (early weeks: mobility, activation, low load; later weeks: strengthening, functional, higher load) —
unless the goal/diagnosis calls for a different progression. The clinician has already fixed which days are
training days and what each day's focus/split is — do not change that, and do not include rest days in your
response at all. Name real, well-known physiotherapy/rehab exercises — do not invent exercises that don't exist.
Be concise: short exercise names, brief notes. Return ONLY valid JSON, no markdown fences, no text outside the JSON.`;

    const trainingDaysList = trainingDays.map((d) => `  - ${d.day}: focus = "${d.focus}"`).join("\n");

    const userPrompt = `Design a ${weekCount}-week home/online exercise program for this patient.

═══ CLINICAL CONTEXT ═══
${clinicalSummary}

═══ CLINICIAN'S GOAL / DIAGNOSIS NOTES ═══
${String(diagnosisGoal).trim()}

═══ FIXED TRAINING SCHEDULE (do not add, remove, or change days) ═══
${trainingDaysList}

═══ RESPONSE FORMAT ═══
Return JSON exactly in this shape — ONLY the training days listed above, one entry per week:
{
  "weeks": [
    {
      "weekLabel": "Week 1",
      "trainingDays": [
        { "day": "${trainingDays[0].day}", "exercises": [ { "name": "...", "sets": "3", "reps": "10-12", "duration": "", "rest": "60 sec", "notes": "..." } ] }
        // one entry per training day listed above, same day keys, same order
      ]
    }
    // one entry per week, weekLabel as "Week 1", "Week 2", etc.
  ]
}
Rules:
  - Only include the ${trainingDays.length} training day(s) listed above, using their exact "day" keys. Do not include rest days.
  - Exercises must match each day's stated focus (e.g. a "Chest" day gets chest exercises, a "Post-op Knee" day gets knee-appropriate exercises).
  - "duration" is only for timed exercises (e.g. plank "30 sec"); leave "" for rep-based exercises.
  - "notes" should be a brief phrase (form cue or why it was chosen) — a few words, not a full sentence.
  - Keep exercises realistic in count per day (2-5 exercises).`;

    let response;
    try {
      response = await client.messages.create({
        model:      "claude-sonnet-4-6",
        max_tokens: Math.min(8192, 1000 + weekCount * trainingDays.length * 260),
        system:     systemPrompt,
        messages:   [{ role: "user", content: userPrompt }],
      });
    } catch (aiErr) {
      const msg = aiErr?.message || "AI service unavailable";
      const status = aiErr?.status;
      if (status === 529 || status === 503 || msg.includes("overloaded")) {
        throw new HttpsError("unavailable", "The AI service is temporarily overloaded. Please try again in a moment.");
      }
      if (status === 429 || msg.includes("rate limit")) {
        throw new HttpsError("resource-exhausted", "Too many requests. Please wait a few seconds and try again.");
      }
      throw new HttpsError("internal", `AI error: ${msg}`);
    }

    const raw = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    if (response.stop_reason === "max_tokens") {
      console.error("generateExerciseProgram: response truncated at max_tokens", { weekCount, rawLength: raw.length });
      throw new HttpsError("internal", "The program was too long to generate in one go. Try a shorter timeframe (fewer weeks) and add more weeks afterward.");
    }

    // Extract the JSON object even if the model added stray text/fences around it.
    const firstBrace = raw.indexOf("{");
    const lastBrace  = raw.lastIndexOf("}");
    const jsonStr = firstBrace !== -1 && lastBrace !== -1 ? raw.slice(firstBrace, lastBrace + 1) : raw;

    let parsed;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      console.error("generateExerciseProgram: failed to parse AI JSON", { rawLength: raw.length, preview: raw.slice(0, 300) });
      throw new HttpsError("internal", "AI returned invalid JSON. Please try again.");
    }

    const weeksOut = Array.isArray(parsed.weeks) ? parsed.weeks : [];
    if (weeksOut.length === 0) {
      throw new HttpsError("internal", "AI returned no weeks. Please try again.");
    }

    // Normalise so the frontend always gets a predictable shape, regardless of
    // minor deviations in what the model returned. Only the fixed training days
    // are expected back — rest days are already known client-side.
    const trainingDayKeys = new Set(trainingDays.map((d) => d.day));
    const normalised = weeksOut.map((w, i) => {
      const dayMap = new Map((Array.isArray(w.trainingDays) ? w.trainingDays : []).map((d) => [d.day, d]));
      return {
        weekLabel: String(w.weekLabel || `Week ${i + 1}`),
        trainingDays: trainingDays.map(({ day: dayKey }) => {
          const d = trainingDayKeys.has(dayKey) ? (dayMap.get(dayKey) ?? {}) : {};
          const exercises = (Array.isArray(d.exercises) ? d.exercises : []).map((ex) => ({
            name:     String(ex.name     ?? ""),
            sets:     String(ex.sets     ?? ""),
            reps:     String(ex.reps     ?? ""),
            duration: String(ex.duration ?? ""),
            rest:     String(ex.rest     ?? ""),
            notes:    String(ex.notes    ?? ""),
          })).filter((ex) => ex.name);
          return { day: dayKey, exercises };
        }),
      };
    });

    return { weeks: normalised };
  }
);

// ─── Generate Nutrition Quantities ───────────────────────────────────────────

exports.generateNutritionQuantities = onCall(
  { secrets: [CLAUDE_API_KEY], timeoutSeconds: 120 },
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

    // ── Core profile ─────────────────────────────────────────────────────────

    const weight   = nutrition.weight        ?? 75;
    const gender   = nutrition.gender        ?? "male";
    const goal     = (nutrition.goal         ?? "maintenance").replace(/_/g, " ");
    const activity = nutrition.activityLevel ?? "moderate";
    const ibHistory = [...(nutrition.inBodyHistory ?? [])].sort((a, b) =>
      (b.measuredAt || "").localeCompare(a.measuredAt || "")
    );
    // also handle legacy single inBody field
    if (ibHistory.length === 0 && nutrition.inBody) ibHistory.push(nutrition.inBody);
    const ib     = ibHistory[0] ?? {};
    const intake      = nutrition.intakeForm ?? {};
    // Intake form only ever offers 4 or 5 meals and defaults to 5 — mirror that here
    // instead of silently falling back to the unreachable 3-meal template.
    const mealsPerDay = intake.mealsPerDay === 4 ? 4 : 5;

    // ── Build meal plan template based on patient preference ─────────────────

    let dietTemplate;
    let extraResponseFields = "";

    if (mealsPerDay === 5) {
      dietTemplate = `Meal 1 — Morning (7:00–8:00 AM):
  - Oats (cooked with water, no milk): base 50 g  [key: oats_morning]
  - Fruit (1 piece): unlimited

Meal 2 — Lunch (~12:00–1:00 PM):
  - Eggs (boiled or omelette, no oil): base 3 eggs  [key: eggs]
  - Bran bread: base 30 g  [key: bran_bread]
  - Fresh cheese: base 150 g  [key: fresh_cheese]
  - Green salad: unlimited

Meal 3 — Afternoon Snack (3:00–4:00 PM):
  - Mixed Nuts / Almonds (unsalted): base 20 g  [key: snack_nuts]
  - Fruit (1 piece): unlimited

Meal 4 — Dinner (5:00–7:00 PM):
  - Animal protein (chicken/fish/meat, cooked weight): base 200 g  [key: protein2]
  - Rice or Potatoes (cooked weight): base 100 g  [key: carb2]  — rice as reference; potatoes ×1.5 if preferred
  - Sautéed / grilled vegetables: base 150 g  [key: veg2]

Meal 5 — Night (9:00–10:00 PM):
  - Grilled Chicken Breast / Tuna: base 150 g  [key: protein3]
  - Sweet corn: base 50 g  [key: sweetcorn3]
  - Greek yogurt: base 170 g  [key: yogurt3]
  - Natural honey (1 tsp): fixed`;
      extraResponseFields = `  "oats_morning": <grams, multiple of 5>,\n  "snack_nuts": <grams, multiple of 5>,\n  `;
    } else if (mealsPerDay === 4) {
      dietTemplate = `Meal 1 — Morning (7:00–8:00 AM):
  - Oats (cooked with water, no milk): base 50 g  [key: oats_morning]
  - Fruit (1 piece): unlimited

Meal 2 — Lunch (12:00–1:00 PM):
  - Eggs (boiled or omelette, no oil): base 3 eggs  [key: eggs]
  - Bran bread: base 30 g  [key: bran_bread]
  - Fresh cheese: base 150 g  [key: fresh_cheese]
  - Green salad: unlimited
  - Fruit (1 piece): unlimited

Meal 3 — Post-noon (4:00–6:00 PM):
  - Animal protein (chicken/fish/meat, cooked weight): base 200 g  [key: protein2]
  - Rice or Potatoes (cooked weight): base 100 g  [key: carb2]  — rice as reference; potatoes ×1.5 if preferred
  - Sautéed / grilled vegetables: base 150 g  [key: veg2]

Meal 4 — Night (9:00–10:00 PM):
  - Grilled Chicken Breast / Tuna: base 150 g  [key: protein3]
  - Sweet corn: base 50 g  [key: sweetcorn3]
  - Greek yogurt: base 170 g  [key: yogurt3]
  - Natural honey (1 tsp): fixed`;
      extraResponseFields = `  "oats_morning": <grams, multiple of 5>,\n  `;
    } else {
      dietTemplate = `Meal 1 (~1:00 PM — Lunch):
  - Eggs (boiled or omelette, no oil): base 3 eggs  [key: eggs]
  - Bran bread: base 30 g  [key: bran_bread]
  - Fresh cheese: base 150 g  [key: fresh_cheese]
  - Green salad: unlimited
  - Fruit (1 piece): fixed

Meal 2 (5:00–7:00 PM):
  - Animal protein (chicken/fish/meat, cooked weight): base 200 g  [key: protein2]
  - Rice or Potatoes (cooked weight): base 100 g  [key: carb2]  — rice as reference; potatoes ×1.5 if preferred
  - Sautéed / grilled vegetables: base 150 g  [key: veg2]

Meal 3 (11:00 PM):
  - Grilled Chicken Breast / Tuna: base 150 g  [key: protein3]
  - Sweet corn: base 50 g  [key: sweetcorn3]
  - Greek yogurt: base 170 g  [key: yogurt3]
  - Natural honey (1 tsp): fixed`;
      extraResponseFields = "";
    }

    // ── InBody section ───────────────────────────────────────────────────────

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

    // Build progression context from older readings
    const progressionLines = [];
    for (let i = 1; i < Math.min(ibHistory.length, 4); i++) {
      const prev = ibHistory[i];
      const parts = [`  ${prev.measuredAt || "unknown date"}:`];
      if (prev.weight)          parts.push(`weight ${prev.weight} kg`);
      if (prev.bodyFatPercent)  parts.push(`fat ${prev.bodyFatPercent}%`);
      if (prev.skeletalMuscleMass) parts.push(`SMM ${prev.skeletalMuscleMass} kg`);
      if (prev.bmr)             parts.push(`BMR ${prev.bmr}`);
      progressionLines.push(parts.join(" — "));
    }

    const inBodySection = inBodyLines.length > 0
      ? `InBody Measurement — Latest (${ib.measuredAt || "date unknown"}):\n${inBodyLines.join("\n")}`
        + (progressionLines.length > 0 ? `\n\nPrevious readings (for trend context):\n${progressionLines.join("\n")}` : "")
      : "InBody Measurement: Not yet recorded";

    // ── Mifflin-St Jeor estimated BMR (fallback when InBody BMR absent) ──────

    let estimatedBmr = null;
    if (!ib.bmr && intake.age && intake.height) {
      const w = ib.weight || weight;
      const h = intake.height;
      const a = intake.age;
      estimatedBmr = gender === "female"
        ? Math.round(10 * w + 6.25 * h - 5 * a - 161)
        : Math.round(10 * w + 6.25 * h - 5 * a + 5);
    }

    // ── Intake questionnaire section ─────────────────────────────────────────

    const intakeLines = [];
    if (intake.age)               intakeLines.push(`  Age: ${intake.age} years`);
    if (intake.height)            intakeLines.push(`  Height: ${intake.height} cm`);
    if (estimatedBmr)             intakeLines.push(`  Estimated BMR (Mifflin-St Jeor, no InBody): ${estimatedBmr} kcal/day`);
    if (intake.target)            intakeLines.push(`  Patient's stated target: "${intake.target}"`);
    if (intake.mealsPerDay)       intakeLines.push(`  Preferred meals per day: ${intake.mealsPerDay}`);
    if (intake.trainingLocation)  intakeLines.push(`  Training location: ${intake.trainingLocation}`);
    if (intake.trainingDaysPerWeek) intakeLines.push(`  Training days per week: ${intake.trainingDaysPerWeek}`);
    if (intake.trainingHistory)   intakeLines.push(`  Training history: ${intake.trainingHistory}`);
    if (intake.dailyRoutine)      intakeLines.push(`  Daily routine: ${intake.dailyRoutine}`);
    if (intake.currentSupplements) intakeLines.push(`  Current supplements: ${intake.currentSupplements}`);
    if (intake.medicalCondition)  intakeLines.push(`  Medical conditions: ${intake.medicalCondition}`);
    if (intake.allergies)         intakeLines.push(`  Allergies / food dislikes: ${intake.allergies}`);
    if ((intake.carbPreferences || []).length)    intakeLines.push(`  Preferred carbs: ${intake.carbPreferences.join(", ")}`);
    if ((intake.proteinPreferences || []).length) intakeLines.push(`  Preferred proteins: ${intake.proteinPreferences.join(", ")}`);
    if ((intake.fruitPreferences || []).length)   intakeLines.push(`  Preferred fruits: ${intake.fruitPreferences.join(", ")}`);
    if ((intake.fatPreferences || []).length)     intakeLines.push(`  Preferred fats: ${intake.fatPreferences.join(", ")}`);
    if (intake.comments)          intakeLines.push(`  Additional comments: ${intake.comments}`);

    const intakeSection = intakeLines.length > 0
      ? `Patient Intake Questionnaire:\n${intakeLines.join("\n")}`
      : "Patient Intake Questionnaire: Not yet completed";

    const prompt = `You are a clinical nutrition specialist. Analyse ALL the patient data below and return precisely optimised food quantities for the fixed 3-meal diet plan template.

═══ PATIENT PROFILE ═══
  Name: ${[patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Unknown"}
  Self-reported weight: ${weight} kg
  Gender: ${gender}
  Clinic goal category: ${goal}
  Activity level: ${activity}

${inBodySection}

${intakeSection}

═══ FIXED DIET PLAN TEMPLATE ═══
This is the patient's chosen ${mealsPerDay}-meal plan. Produce quantities for every quantifiable item (items marked "fixed" or "unlimited" need no quantity key in the response).

${dietTemplate}

═══ CALCULATION INSTRUCTIONS ═══
Step 1 — Determine BMR:
  • Use InBody BMR if available (most accurate).
  • Else use Estimated BMR from Mifflin-St Jeor if age + height are known.
  • Else estimate from weight: males weight×24, females weight×22.

Step 2 — Compute TDEE = BMR × activity multiplier:
  sedentary ×1.20 | moderate ×1.55 | active ×1.725 | athlete ×1.90
  Also factor in training days/week: each extra day beyond 3 adds ~+0.05 to multiplier.

Step 3 — Apply goal adjustment to TDEE:
  weight loss −20% | maintenance ×1.00 | muscle gain +250–300 kcal | performance +10%

Step 4 — Set protein target (distribute across all ${mealsPerDay} meals):
  • If SMM known: protein_g = SMM × 3.5 (to protect muscle mass)
  • Else: weight × (1.8 weight_loss | 2.0 maintenance | 2.4 muscle_gain | 2.6 performance)
  • If medical conditions affect protein (e.g. kidney issues) — reduce accordingly and note it.

Step 5 — Set carb quantities:
  • Drive carbs by activity level and training days — athletes need significantly more.
  • Reduce carbs for weight loss and sedentary patients.

Step 6 — Water:
  • Base: max(4.0, weight × 0.040) L
  • Add: sedentary +0 | moderate +0.5 | active +1.0 | athlete +1.5
  • Round to nearest 0.5 L

Step 7 — Rounding and gender:
  • All gram values: nearest multiple of 5
  • Eggs: integer 1–6
  • Female patients: multiply all quantities by 0.85 before rounding
  • Do NOT go below minimum safe values: protein ≥100 g/day total, eggs ≥1

Step 8 — Apply clinical judgment:
  • If allergies/dislikes conflict with any item, note it in reasoning.
  • If medical conditions (diabetes, hypertension, etc.) affect macros, adjust and explain.
  • Use training history and daily routine to fine-tune activity multiplier.

═══ RESPONSE FORMAT ═══
Return ONLY valid JSON (no markdown fences, no text outside JSON):
{
${extraResponseFields}  "eggs": <integer 1–6>,
  "bran_bread": <grams, multiple of 5>,
  "fresh_cheese": <grams, multiple of 5>,
  "protein2": <grams, multiple of 5>,
  "carb2": <grams, multiple of 5>,
  "veg2": <grams, multiple of 5>,
  "protein3": <grams, multiple of 5>,
  "sweetcorn3": <grams, multiple of 5>,
  "yogurt3": <grams, multiple of 5>,
  "waterLiters": <number to one decimal place>,
  "reasoning": "<3–4 sentences: state the BMR source used, TDEE calculated, key adjustments made for goal/activity/medical, and any allergy or clinical notes>"
}`;

    const client = new Anthropic({ apiKey: CLAUDE_API_KEY.value() });

    const response = await client.messages.create({
      model:      "claude-sonnet-4-6",
      max_tokens: 900,
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
