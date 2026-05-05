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

    const { patientId, diagnosis, bodyProfile, sessionHistory, patientAge, patientGender, notes } = request.data;

    if (!patientId || !diagnosis) {
      throw new HttpsError("invalid-argument", "patientId and diagnosis are required.");
    }

    const client = new Anthropic({ apiKey: CLAUDE_API_KEY.value() });

    const systemPrompt = `You are an expert physiotherapy clinical assistant helping experienced physiotherapists create evidence-based treatment plans.
Generate structured, practical treatment plans based on the patient information provided.
Always follow physiotherapy best practices and evidence-based guidelines.
Format your response as a structured plan with clear sections.`;

    const userPrompt = `Create a physiotherapy treatment plan for the following patient:

Diagnosis: ${diagnosis}
${patientAge ? `Age: ${patientAge}` : ""}
${patientGender ? `Gender: ${patientGender}` : ""}
${bodyProfile ? `Body Profile / Joint Assessment:\n${JSON.stringify(bodyProfile, null, 2)}` : ""}
${sessionHistory ? `Session History Summary:\n${sessionHistory}` : ""}
${notes ? `Additional Notes:\n${notes}` : ""}

Please provide:
1. **Treatment Goals** (short-term 2-4 weeks, long-term 6-12 weeks)
2. **Manual Therapy** (techniques, frequency)
3. **Exercise Program** (specific exercises with sets/reps/frequency, progressing from initial to advanced)
4. **Modalities** (if applicable: ultrasound, TENS, heat/ice, etc.)
5. **Patient Education** (key points to communicate)
6. **Home Exercise Program** (3-5 exercises the patient can do independently)
7. **Expected Outcomes & Milestones**
8. **Red Flags to Monitor**

Keep it practical and clinic-ready.`;

    const response = await client.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 2048,
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
