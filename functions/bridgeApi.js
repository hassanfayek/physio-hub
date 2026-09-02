const crypto = require("crypto");
const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const admin = require("firebase-admin");
const scheduling = require("./scheduling");

const BRIDGE_SECRET = defineSecret("BRIDGE_SECRET");

// ─── Phone normalization ────────────────────────────────────────────────────
// Mirrors src/utils/phone.ts normalizePhone() exactly. Kept in sync manually —
// functions/ is a separate Node package and can't import the frontend TS module.

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";

  const stripped = digits.startsWith("00") ? digits.slice(2) : digits;

  if (stripped.startsWith("1") && stripped.length === 10) return `20${stripped}`;
  if (stripped.startsWith("01") && stripped.length === 11) return `20${stripped.slice(1)}`;

  return stripped;
}

// ─── Auth ────────────────────────────────────────────────────────────────────

function checkBridgeSecret(req) {
  const provided = req.get("X-Bridge-Secret") || "";
  const expected = BRIDGE_SECRET.value() || "";

  if (!expected) return false;

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// ─── Audit log ───────────────────────────────────────────────────────────────

async function logBridgeEvent({ phone, appointmentId, action, outcome }) {
  const db = admin.firestore();
  console.log("bridge event:", { phone, appointmentId, action, outcome });
  try {
    await db.collection("bridgeAuditLog").add({
      phone:         phone || "",
      appointmentId: appointmentId || "",
      action,
      outcome,
      createdAt:     admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("bridge audit log write failed:", err);
  }
}

async function logOwnershipMismatch({ phone, appointmentId, action }) {
  await logBridgeEvent({ phone, appointmentId, action, outcome: "ownership_mismatch" });

  try {
    const db = admin.firestore();
    const fifteenMinAgo = new Date(Date.now() - 15 * 60 * 1000);
    const recent = await db.collection("bridgeAuditLog")
      .where("phone", "==", phone || "")
      .where("outcome", "==", "ownership_mismatch")
      .where("createdAt", ">=", fifteenMinAgo)
      .get();

    if (recent.size >= 3) {
      console.error(
        `bridge SECURITY ALERT: ${recent.size} ownership-check failures for phone ${phone} in the last 15 minutes — possible enumeration attempt`
      );
    }
  } catch (err) {
    console.error("bridge mismatch-count query failed:", err);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function docToAppointmentSummary(id, data) {
  return {
    id,
    date:        data.date        ?? "",
    hour:        data.hour        ?? 0,
    sessionType: data.sessionType ?? "",
    status:      data.status      ?? "scheduled",
  };
}

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const TERMINAL_STATUSES = new Set(["cancelled", "completed"]);

// ─── POST /lookupPatient ───────────────────────────────────────────────────

exports.lookupPatient = onRequest({ secrets: [BRIDGE_SECRET] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!checkBridgeSecret(req)) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const phone = normalizePhone(req.body?.phone);
  if (!phone) {
    res.status(400).json({ error: "phone is required." });
    return;
  }

  const db = admin.firestore();

  const patientSnap = await db.collection("patients").where("phone", "==", phone).limit(1).get();
  if (patientSnap.empty) {
    res.status(404).json({ error: "Not found." });
    return;
  }

  const patientDoc = patientSnap.docs[0];
  const patient = patientDoc.data();

  const today = todayStr();
  const apptSnap = await db.collection("appointments")
    .where("patientId", "==", patientDoc.id)
    .where("date", ">=", today)
    .get();

  const upcomingAppointments = apptSnap.docs
    .map((d) => docToAppointmentSummary(d.id, d.data()))
    .filter((a) => a.status === "scheduled" || a.status === "rescheduled")
    .sort((a, b) => (a.date !== b.date ? a.date.localeCompare(b.date) : a.hour - b.hour));

  res.status(200).json({
    patient: {
      id:    patientDoc.id,
      name:  [patient.firstName, patient.lastName].filter(Boolean).join(" "),
      phone: patient.phone ?? phone,
    },
    upcomingAppointments,
  });
});

// ─── GET/POST /getAvailableSlots ────────────────────────────────────────────
// Read-only. Returns real, currently-available starting hours for a date,
// using the shared scheduling module — Firebase remains the sole source of
// truth for availability. Never invents times.

exports.getAvailableSlots = onRequest({ secrets: [BRIDGE_SECRET] }, async (req, res) => {
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!checkBridgeSecret(req)) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const date = req.method === "GET" ? req.query.date : req.body?.date;
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    res.status(400).json({ error: "date (YYYY-MM-DD) is required." });
    return;
  }

  const today = todayStr();
  if (date < today) {
    res.status(400).json({ error: "date cannot be in the past." });
    return;
  }

  const result = await scheduling.getAvailableSlots(date);
  res.status(200).json(result);
});

// ─── POST /bookNextSession ──────────────────────────────────────────────────
// Books a new appointment for an EXISTING, registered patient — uses their real
// patientId and their own assigned physio (not the walk-in pattern used for
// new leads, which forces the first-assessment physio and a blank patientId).
// Final write goes through the shared atomic booking primitive.

const VALID_SESSION_TYPES = new Set([
  "Physiotherapy Session",
  "Recovery Session",
  "Assessment Session",
  "Rehabilitation Session",
  "Online Assessment Session",
]);
const DEFAULT_SESSION_TYPE = "Physiotherapy Session";

exports.bookNextSession = onRequest({ secrets: [BRIDGE_SECRET] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!checkBridgeSecret(req)) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const phone = normalizePhone(req.body?.phone);
  const date = req.body?.date;
  const hour = Number.parseInt(req.body?.hour, 10);
  const requestedSessionType = req.body?.sessionType;
  const sessionType = VALID_SESSION_TYPES.has(requestedSessionType) ? requestedSessionType : DEFAULT_SESSION_TYPE;

  if (!phone || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(hour)) {
    res.status(400).json({ error: "phone, date (YYYY-MM-DD), and hour are required." });
    return;
  }

  const today = todayStr();
  if (date < today) {
    res.status(400).json({ error: "date cannot be in the past." });
    return;
  }

  const db = admin.firestore();
  const patientSnap = await db.collection("patients").where("phone", "==", phone).limit(1).get();
  if (patientSnap.empty) {
    res.status(404).json({ error: "Not found." });
    return;
  }
  const patientDoc = patientSnap.docs[0];
  const patient = patientDoc.data();

  const physioId = patient.physioId || "";
  let physioName = "Physiotherapist";
  if (physioId) {
    const physioSnap = await db.collection("physiotherapists").doc(physioId).get();
    if (physioSnap.exists) {
      const physio = physioSnap.data();
      physioName = [physio.firstName, physio.lastName].filter(Boolean).join(" ") || physioName;
    }
  }

  const result = await scheduling.bookAppointmentAtomic({
    date,
    hour,
    patientId: patientDoc.id,
    patientName: [patient.firstName, patient.lastName].filter(Boolean).join(" ") || "Patient",
    patientPhone: phone,
    physioId,
    physioName,
    sessionType,
  });

  if (!result.ok) {
    await logBridgeEvent({ phone, appointmentId: "", action: "book_next", outcome: result.reason.toLowerCase() });
    if (result.reason === "SLOT_UNAVAILABLE") {
      res.status(409).json({ error: "This time slot is fully booked. Please choose a different time.", reason: result.reason });
    } else {
      res.status(400).json({ error: `Booking rejected: ${result.reason}.`, reason: result.reason });
    }
    return;
  }

  await logBridgeEvent({ phone, appointmentId: result.appointmentId, action: "book_next", outcome: "success" });

  res.status(200).json({
    success: true,
    appointment: { id: result.appointmentId, date, hour, sessionType, physioName },
  });
});

// ─── POST /rescheduleAppointment ───────────────────────────────────────────
// Final update goes through the shared atomic reschedule primitive.

exports.rescheduleAppointment = onRequest({ secrets: [BRIDGE_SECRET] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!checkBridgeSecret(req)) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const phone         = normalizePhone(req.body?.phone);
  const appointmentId = req.body?.appointmentId;
  const newDate        = req.body?.newDate;
  const newHour         = Number.parseInt(req.body?.newHour, 10);

  if (!phone || !appointmentId || typeof newDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(newDate) || Number.isNaN(newHour)) {
    res.status(400).json({ error: "phone, appointmentId, newDate (YYYY-MM-DD), and newHour are required." });
    return;
  }

  const result = await scheduling.rescheduleAppointmentAtomic({ appointmentId, phone, newDate, newHour });

  if (!result.ok) {
    if (result.reason === "NOT_FOUND") {
      res.status(404).json({ error: "Appointment not found." });
      return;
    }
    if (result.reason === "FORBIDDEN") {
      await logOwnershipMismatch({ phone, appointmentId, action: "reschedule" });
      res.status(403).json({ error: "Forbidden." });
      return;
    }
    if (result.reason === "ALREADY_TERMINAL") {
      res.status(409).json({ error: `Appointment is already ${result.status}.` });
      return;
    }
    if (result.reason === "SLOT_UNAVAILABLE") {
      await logBridgeEvent({ phone, appointmentId, action: "reschedule", outcome: "slot_conflict" });
      res.status(409).json({ error: "This time slot is fully booked. Please choose a different time.", reason: result.reason });
      return;
    }
    // CLOSED_DAY / OUTSIDE_HOURS
    res.status(400).json({ error: `Reschedule rejected: ${result.reason}.`, reason: result.reason });
    return;
  }

  await logBridgeEvent({ phone, appointmentId, action: "reschedule", outcome: "success" });

  res.status(200).json({
    success: true,
    appointment: docToAppointmentSummary(appointmentId, result.appointment),
  });
});

// ─── POST /createWalkInAppointment ─────────────────────────────────────────
// Books a new-patient first assessment the same way the receptionist's walk-in
// flow does: patientId "" (no Patient record/account yet — created in person
// later), always assigned to the clinic's first-assessment physio. Final write
// goes through the shared atomic booking primitive.

const FIRST_ASSESSMENT_PHYSIO_ID = "ESXsmQ2sc9anFMMTvCdIegoisrf1";

exports.createWalkInAppointment = onRequest({ secrets: [BRIDGE_SECRET] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!checkBridgeSecret(req)) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const phone       = normalizePhone(req.body?.phone);
  const patientName = String(req.body?.patientName || "").trim().slice(0, 100);
  const date        = req.body?.date;
  const hour        = Number.parseInt(req.body?.hour, 10);

  if (!phone || !patientName || typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(hour)) {
    res.status(400).json({ error: "phone, patientName, date (YYYY-MM-DD), and hour are required." });
    return;
  }

  const today = todayStr();
  if (date < today) {
    res.status(400).json({ error: "date cannot be in the past." });
    return;
  }

  const db = admin.firestore();
  const physioSnap = await db.collection("physiotherapists").doc(FIRST_ASSESSMENT_PHYSIO_ID).get();
  const physio = physioSnap.exists ? physioSnap.data() : {};
  const physioName = [physio.firstName, physio.lastName].filter(Boolean).join(" ") || "Physiotherapist";

  const result = await scheduling.bookAppointmentAtomic({
    date,
    hour,
    patientId: "",
    patientName: patientName || "Walk-in",
    patientPhone: phone,
    physioId: FIRST_ASSESSMENT_PHYSIO_ID,
    physioName,
    sessionType: "Assessment Session",
  });

  if (!result.ok) {
    await logBridgeEvent({ phone, appointmentId: "", action: "book", outcome: result.reason.toLowerCase() });
    if (result.reason === "SLOT_UNAVAILABLE") {
      res.status(409).json({ error: "This time slot is fully booked. Please choose a different time.", reason: result.reason });
    } else {
      res.status(400).json({ error: `Booking rejected: ${result.reason}.`, reason: result.reason });
    }
    return;
  }

  await logBridgeEvent({ phone, appointmentId: result.appointmentId, action: "book", outcome: "success" });

  res.status(200).json({
    success: true,
    appointment: { id: result.appointmentId, date, hour, sessionType: "Assessment Session", physioName },
  });
});

// ─── POST /cancelAppointment ────────────────────────────────────────────────

exports.cancelAppointment = onRequest({ secrets: [BRIDGE_SECRET] }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed." });
    return;
  }
  if (!checkBridgeSecret(req)) {
    res.status(401).json({ error: "Unauthorized." });
    return;
  }

  const phone         = normalizePhone(req.body?.phone);
  const appointmentId = req.body?.appointmentId;

  if (!phone || !appointmentId) {
    res.status(400).json({ error: "phone and appointmentId are required." });
    return;
  }

  const db = admin.firestore();
  const apptRef = db.collection("appointments").doc(appointmentId);
  const apptSnap = await apptRef.get();

  if (!apptSnap.exists) {
    res.status(404).json({ error: "Appointment not found." });
    return;
  }

  const appt = apptSnap.data();
  const ownerPhone = normalizePhone(appt.patientPhone);

  if (!ownerPhone || ownerPhone !== phone) {
    await logOwnershipMismatch({ phone, appointmentId, action: "cancel" });
    res.status(403).json({ error: "Forbidden." });
    return;
  }

  if (TERMINAL_STATUSES.has(appt.status)) {
    res.status(409).json({ error: `Appointment is already ${appt.status}.` });
    return;
  }

  await apptRef.update({ status: "cancelled" });
  await logBridgeEvent({ phone, appointmentId, action: "cancel", outcome: "success" });

  res.status(200).json({ success: true });
});
