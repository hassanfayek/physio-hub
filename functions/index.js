const { setGlobalOptions } = require("firebase-functions");
const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const Anthropic = require("@anthropic-ai/sdk");

admin.initializeApp();
setGlobalOptions({ maxInstances: 10 });

const WHATSAPP_TOKEN    = defineSecret("WHATSAPP_TOKEN");
const WHATSAPP_VERIFY   = defineSecret("WHATSAPP_VERIFY_TOKEN");
const WHATSAPP_PHONE_ID = defineSecret("WHATSAPP_PHONE_NUMBER_ID");
const CLAUDE_API_KEY    = defineSecret("CLAUDE_API_KEY");

// ─── Helpers ────────────────────────────────────────────────────────────────

function normalizePhone(raw) {
  return String(raw).replace(/\D/g, "");
}

async function findPatientByPhone(phone) {
  const normalized = normalizePhone(phone);
  const snap = await admin.firestore().collection("users")
    .where("role", "==", "patient")
    .get();
  for (const doc of snap.docs) {
    const stored = normalizePhone(doc.data().phone || "");
    if (stored && (stored === normalized || stored.endsWith(normalized) || normalized.endsWith(stored))) {
      return { uid: doc.id, ...doc.data() };
    }
  }
  return null;
}

async function sendWhatsAppMessage(phoneId, token, to, text) {
  const res = await fetch(
    `https://graph.facebook.com/v21.0/${phoneId}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      }),
    }
  );
  if (!res.ok) {
    const err = await res.text();
    console.error("WhatsApp send error:", err);
  }
}

async function getConversationHistory(phone) {
  const docRef = admin.firestore().collection("whatsappSessions").doc(phone);
  const snap = await docRef.get();
  if (!snap.exists) return [];
  return snap.data().messages || [];
}

async function saveConversationHistory(phone, messages) {
  // Keep last 12 messages only
  const trimmed = messages.slice(-12);
  await admin.firestore().collection("whatsappSessions").doc(phone).set(
    { messages: trimmed, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
    { merge: true }
  );
}

function detectLanguage(text) {
  return /[\u0600-\u06FF]/.test(text) ? "ar" : "en";
}

// ─── Claude Tools ────────────────────────────────────────────────────────────

const CLAUDE_TOOLS = [
  {
    name: "get_appointments",
    description: "Get the patient's upcoming appointments",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Max appointments to return (default 5)" },
      },
      required: [],
    },
  },
  {
    name: "cancel_appointment",
    description: "Cancel a specific appointment by its Firestore document ID",
    input_schema: {
      type: "object",
      properties: {
        appointmentId: { type: "string", description: "The Firestore doc ID of the appointment" },
      },
      required: ["appointmentId"],
    },
  },
  {
    name: "get_exercises",
    description: "Get the patient's active exercise programs",
    input_schema: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "log_pain_feedback",
    description: "Log a pain level feedback entry for the patient (1–10 scale)",
    input_schema: {
      type: "object",
      properties: {
        painLevel: { type: "number", description: "Pain level from 1 (no pain) to 10 (worst pain)" },
        notes: { type: "string", description: "Optional notes about the pain" },
      },
      required: ["painLevel"],
    },
  },
];

async function executeTool(toolName, toolInput, patient) {
  const db = admin.firestore();
  const now = new Date();

  if (toolName === "get_appointments") {
    const limit = toolInput.limit || 5;
    const snap = await db.collection("appointments")
      .where("patientId", "==", patient.uid)
      .where("status", "in", ["scheduled", "confirmed"])
      .orderBy("dateTime", "asc")
      .limit(limit)
      .get();

    if (snap.empty) return "No upcoming appointments found.";

    return snap.docs.map((d) => {
      const data = d.data();
      const dt = data.dateTime?.toDate ? data.dateTime.toDate() : new Date(data.dateTime);
      return `ID: ${d.id} | ${dt.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} at ${dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} | ${data.type || "Session"} with ${data.physioName || "Physiotherapist"}`;
    }).join("\n");
  }

  if (toolName === "cancel_appointment") {
    const { appointmentId } = toolInput;
    const docRef = db.collection("appointments").doc(appointmentId);
    const snap = await docRef.get();
    if (!snap.exists) return "Appointment not found.";
    const data = snap.data();
    if (data.patientId !== patient.uid) return "You can only cancel your own appointments.";

    const dt = data.dateTime?.toDate ? data.dateTime.toDate() : new Date(data.dateTime);
    const hoursUntil = (dt - now) / 3600000;
    if (hoursUntil < 24) return "Appointments can only be cancelled at least 24 hours in advance. Please call the clinic directly.";

    await docRef.update({ status: "cancelled", cancelledAt: admin.firestore.FieldValue.serverTimestamp(), cancelledBy: "patient_whatsapp" });
    return `Appointment on ${dt.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} at ${dt.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })} has been cancelled.`;
  }

  if (toolName === "get_exercises") {
    const snap = await db.collection("exercisePrograms")
      .where("patientId", "==", patient.uid)
      .where("status", "==", "active")
      .get();

    if (snap.empty) return "No active exercise programs found.";

    const programs = snap.docs.map((d) => {
      const data = d.data();
      const exList = (data.exercises || []).map((ex) =>
        `  • ${ex.name} — ${ex.sets || "?"}x${ex.reps || "?"} (${data.programType === "home" ? "Home" : "Clinic"})`
      ).join("\n");
      return `Program: ${data.name || "Exercise Program"}\n${exList}`;
    });
    return programs.join("\n\n");
  }

  if (toolName === "log_pain_feedback") {
    const { painLevel, notes } = toolInput;
    if (painLevel < 1 || painLevel > 10) return "Pain level must be between 1 and 10.";
    const today = now.toISOString().slice(0, 10);
    await db.collection("sessionFeedback").add({
      patientId: patient.uid,
      painLevel,
      notes: notes || "",
      sessionDate: today,
      source: "whatsapp",
      loggedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return `Pain level ${painLevel}/10 logged successfully.${notes ? ` Note: "${notes}"` : ""}`;
  }

  return "Unknown tool.";
}

// ─── Claude Agentic Loop ─────────────────────────────────────────────────────

async function processMessage(userText, patient, history, claudeKey) {
  const lang = detectLanguage(userText);
  const client = new Anthropic({ apiKey: claudeKey });

  const systemPrompt = `You are a friendly and professional physiotherapy clinic assistant for PhysioHub clinic.
You help patients in both Arabic and English — always respond in the same language the patient uses.
Be warm, concise, and medically responsible.

Patient name: ${patient.displayName || patient.name || "Patient"}

You can help with:
- Viewing upcoming appointments
- Cancelling appointments (24h+ notice required)
- Viewing exercise programs
- Logging pain level feedback (1–10 scale)
- Answering general physiotherapy questions

For general physio questions (pain management, exercise tips, recovery advice), answer helpfully but always remind the patient to consult their physiotherapist for personalised advice.

Current date/time: ${new Date().toLocaleString("en-GB", { timeZone: "Asia/Dubai" })} (UAE time)

${lang === "ar" ? "المريض يتحدث العربية — رد بالعربية دائماً." : ""}`;

  const messages = [
    ...history,
    { role: "user", content: userText },
  ];

  let response = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1024,
    system: systemPrompt,
    tools: CLAUDE_TOOLS,
    messages,
  });

  const assistantTurns = [response];

  // Agentic tool loop
  while (response.stop_reason === "tool_use") {
    const toolUseBlocks = response.content.filter((b) => b.type === "tool_use");
    const toolResults = [];

    for (const block of toolUseBlocks) {
      const result = await executeTool(block.name, block.input, patient);
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    response = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      system: systemPrompt,
      tools: CLAUDE_TOOLS,
      messages,
    });
    assistantTurns.push(response);
  }

  const replyText = response.content
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  // Build updated history (user + final assistant turn)
  const newHistory = [
    ...history,
    { role: "user", content: userText },
    { role: "assistant", content: replyText },
  ];

  return { replyText, newHistory };
}

// ─── WhatsApp Webhook ────────────────────────────────────────────────────────

exports.whatsappWebhook = onRequest(
  { secrets: [WHATSAPP_TOKEN, WHATSAPP_VERIFY, WHATSAPP_PHONE_ID, CLAUDE_API_KEY] },
  async (req, res) => {
    // GET — webhook verification
    if (req.method === "GET") {
      const mode      = req.query["hub.mode"];
      const token     = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];
      if (mode === "subscribe" && token === WHATSAPP_VERIFY.value()) {
        console.log("WhatsApp webhook verified");
        return res.status(200).send(challenge);
      }
      return res.sendStatus(403);
    }

    // POST — incoming message
    if (req.method !== "POST") return res.sendStatus(405);
    res.sendStatus(200); // Acknowledge immediately

    try {
      const body = req.body;
      const entry = body?.entry?.[0];
      const change = entry?.changes?.[0];
      const value = change?.value;

      if (!value?.messages) return;

      const message = value.messages[0];
      if (!message || message.type !== "text") return;

      const fromPhone = message.from;
      const userText  = message.text?.body?.trim();
      if (!userText) return;

      // Look up patient
      const patient = await findPatientByPhone(fromPhone);
      if (!patient) {
        await sendWhatsAppMessage(
          WHATSAPP_PHONE_ID.value(),
          WHATSAPP_TOKEN.value(),
          fromPhone,
          "Sorry, your number is not registered in our system. Please contact the clinic to register. / عذراً، رقمك غير مسجل في نظامنا. يرجى التواصل مع العيادة."
        );
        return;
      }

      // Get history and process
      const history = await getConversationHistory(fromPhone);
      const { replyText, newHistory } = await processMessage(
        userText,
        patient,
        history,
        CLAUDE_API_KEY.value()
      );

      // Save history and send reply in parallel
      await Promise.all([
        saveConversationHistory(fromPhone, newHistory),
        sendWhatsAppMessage(WHATSAPP_PHONE_ID.value(), WHATSAPP_TOKEN.value(), fromPhone, replyText),
      ]);
    } catch (err) {
      console.error("WhatsApp webhook error:", err);
    }
  }
);

// ─── Daily Appointment Reminders (08:00 UAE = 04:00 UTC) ────────────────────

exports.sendAppointmentReminders = onSchedule(
  { schedule: "0 4 * * *", timeZone: "UTC", secrets: [WHATSAPP_TOKEN, WHATSAPP_PHONE_ID] },
  async () => {
    const db = admin.firestore();
    const now = new Date();

    // Tomorrow's date range (UAE UTC+4)
    const uaeOffset = 4 * 60 * 60 * 1000;
    const uaeNow = new Date(now.getTime() + uaeOffset);
    const tomorrowStart = new Date(uaeNow);
    tomorrowStart.setUTCHours(0, 0, 0, 0);
    tomorrowStart.setUTCDate(tomorrowStart.getUTCDate() + 1);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setUTCDate(tomorrowEnd.getUTCDate() + 1);

    // Adjust back to UTC for Firestore query
    const startUtc = new Date(tomorrowStart.getTime() - uaeOffset);
    const endUtc   = new Date(tomorrowEnd.getTime() - uaeOffset);

    const snap = await db.collection("appointments")
      .where("status", "in", ["scheduled", "confirmed"])
      .where("dateTime", ">=", admin.firestore.Timestamp.fromDate(startUtc))
      .where("dateTime", "<",  admin.firestore.Timestamp.fromDate(endUtc))
      .get();

    if (snap.empty) {
      console.log("No appointments tomorrow — no reminders sent.");
      return;
    }

    const token   = WHATSAPP_TOKEN.value();
    const phoneId = WHATSAPP_PHONE_ID.value();

    for (const apptDoc of snap.docs) {
      const appt = apptDoc.data();
      if (!appt.patientId) continue;

      try {
        const userSnap = await db.collection("users").doc(appt.patientId).get();
        if (!userSnap.exists) continue;
        const userData = userSnap.data();
        const phone = normalizePhone(userData.phone || "");
        if (!phone) continue;

        const dt = appt.dateTime.toDate();
        const timeStr = dt.toLocaleTimeString("en-GB", {
          hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai"
        });
        const dateStr = dt.toLocaleDateString("en-GB", {
          weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Dubai"
        });

        const lang = detectLanguage(userData.displayName || "");
        const msg = lang === "ar"
          ? `مرحباً ${userData.displayName || ""}! 👋\nتذكير بموعدك غداً في عيادة PhysioHub:\n📅 ${dateStr}\n⏰ الساعة ${timeStr}\nمع ${appt.physioName || "الفيزيوثيرابيست"}\n\nنراك قريباً! إذا احتجت إلى إلغاء الموعد يرجى إخبارنا قبل 24 ساعة.`
          : `Hi ${userData.displayName || ""}! 👋\nReminder: You have an appointment tomorrow at PhysioHub:\n📅 ${dateStr}\n⏰ ${timeStr}\nWith ${appt.physioName || "your Physiotherapist"}\n\nSee you soon! To cancel, please let us know at least 24 hours in advance.`;

        await sendWhatsAppMessage(phoneId, token, phone, msg);
        console.log(`Reminder sent to ${phone} for appointment ${apptDoc.id}`);
      } catch (err) {
        console.error(`Failed reminder for appointment ${apptDoc.id}:`, err);
      }
    }
  }
);

// ─── Existing: Delete Auth User ───────────────────────────────────────────────

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
