const admin = require("firebase-admin");

// ─── Phone normalization ────────────────────────────────────────────────────
// Mirrors src/utils/phone.ts normalizePhone() exactly. Kept in sync manually,
// same convention already used in bridgeApi.js — functions/ can't import the
// frontend TS module.

function normalizePhone(raw) {
  const digits = String(raw || "").replace(/\D/g, "");
  if (!digits) return "";
  const stripped = digits.startsWith("00") ? digits.slice(2) : digits;
  if (stripped.startsWith("1") && stripped.length === 10) return `20${stripped}`;
  if (stripped.startsWith("01") && stripped.length === 11) return `20${stripped.slice(1)}`;
  return stripped;
}

// ─── Clinic settings (single source of truth for both webapp and WhatsApp) ─

const DEFAULT_SETTINGS = {
  maxPatientsPerHour: 4,
  openingHour: 15,
  closingHour: 23,
  // Friday. Verified against this codebase's existing weekday convention:
  // Date.prototype.getDay() is used throughout (appointmentService.ts
  // getWeekStart, MonthView.tsx firstWeekdayOffset) as Sunday=0...Saturday=6,
  // so Friday=5.
  closedWeekdays: [5],
};

async function getClinicSettings() {
  const snap = await admin.firestore().collection("clinicSettings").doc("schedule").get();
  if (snap.exists) return { ...DEFAULT_SETTINGS, ...snap.data() };
  return DEFAULT_SETTINGS;
}

// ─── Capacity rules ─────────────────────────────────────────────────────────
// Only these statuses occupy a slot. cancelled/completed never consume
// capacity; rescheduled is active at whatever date/hour it currently holds.

const ACTIVE_STATUSES = new Set(["scheduled", "in_progress", "rescheduled"]);

function countsTowardCapacity(status) {
  return ACTIVE_STATUSES.has(status);
}

function isClosedDay(dateStr, closedWeekdays) {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return (closedWeekdays || DEFAULT_SETTINGS.closedWeekdays).includes(day);
}

function isWithinHours(hour, opening, closing) {
  return hour >= opening && hour < closing;
}

// ─── Availability ───────────────────────────────────────────────────────────

async function getAvailableSlots(date) {
  const settings = await getClinicSettings();

  if (isClosedDay(date, settings.closedWeekdays)) {
    return { date, closed: true, availableHours: [] };
  }

  const db = admin.firestore();
  const snap = await db.collection("appointments").where("date", "==", date).get();

  const counts = {};
  snap.docs.forEach((doc) => {
    const data = doc.data();
    if (!countsTowardCapacity(data.status)) return;
    counts[data.hour] = (counts[data.hour] || 0) + 1;
  });

  const availableHours = [];
  for (let h = settings.openingHour; h < settings.closingHour; h++) {
    if ((counts[h] || 0) < settings.maxPatientsPerHour) availableHours.push(h);
  }

  return { date, closed: false, availableHours };
}

// ─── Atomic booking ─────────────────────────────────────────────────────────
// Re-reads the slot's current occupancy INSIDE the transaction immediately
// before writing, so two simultaneous bookings can't both land in a full slot.

async function bookAppointmentAtomic(payload) {
  const { date, hour } = payload;
  const settings = await getClinicSettings();

  if (isClosedDay(date, settings.closedWeekdays)) return { ok: false, reason: "CLOSED_DAY" };
  if (!isWithinHours(hour, settings.openingHour, settings.closingHour)) {
    return { ok: false, reason: "OUTSIDE_HOURS" };
  }

  const db = admin.firestore();
  const apptsRef = db.collection("appointments");

  try {
    const appointmentId = await db.runTransaction(async (t) => {
      const q = apptsRef.where("date", "==", date).where("hour", "==", hour);
      const snap = await t.get(q);
      const activeCount = snap.docs.filter((d) => countsTowardCapacity(d.data().status)).length;

      if (activeCount >= settings.maxPatientsPerHour) {
        throw { code: "SLOT_UNAVAILABLE" };
      }

      const newRef = apptsRef.doc();
      t.set(newRef, {
        patientId: payload.patientId ?? "",
        patientName: payload.patientName,
        patientPhone: payload.patientPhone,
        physioId: payload.physioId,
        physioName: payload.physioName,
        date,
        hour,
        sessionType: payload.sessionType,
        status: "scheduled",
        confirmedByPatient: payload.confirmedByPatient ?? true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      return newRef.id;
    });

    return { ok: true, appointmentId };
  } catch (err) {
    if (err && err.code === "SLOT_UNAVAILABLE") return { ok: false, reason: "SLOT_UNAVAILABLE" };
    throw err;
  }
}

// ─── Atomic reschedule ──────────────────────────────────────────────────────
// Re-reads both the appointment's own current state (ownership/status) AND
// the target slot's occupancy INSIDE the transaction. All reads happen before
// the write, per Firestore transaction rules.

async function rescheduleAppointmentAtomic({ appointmentId, phone, newDate, newHour }) {
  const settings = await getClinicSettings();

  if (isClosedDay(newDate, settings.closedWeekdays)) return { ok: false, reason: "CLOSED_DAY" };
  if (!isWithinHours(newHour, settings.openingHour, settings.closingHour)) {
    return { ok: false, reason: "OUTSIDE_HOURS" };
  }

  const db = admin.firestore();
  const apptsRef = db.collection("appointments");
  const apptRef = apptsRef.doc(appointmentId);

  try {
    const result = await db.runTransaction(async (t) => {
      const apptSnap = await t.get(apptRef);
      if (!apptSnap.exists) throw { code: "NOT_FOUND" };

      const appt = apptSnap.data();
      const ownerPhone = normalizePhone(appt.patientPhone);
      if (!ownerPhone || ownerPhone !== phone) throw { code: "FORBIDDEN" };
      if (appt.status === "cancelled" || appt.status === "completed") {
        throw { code: "ALREADY_TERMINAL", status: appt.status };
      }

      const q = apptsRef.where("date", "==", newDate).where("hour", "==", newHour);
      const slotSnap = await t.get(q);
      const activeCount = slotSnap.docs.filter(
        (d) => d.id !== appointmentId && countsTowardCapacity(d.data().status)
      ).length;

      if (activeCount >= settings.maxPatientsPerHour) throw { code: "SLOT_UNAVAILABLE" };

      t.update(apptRef, { date: newDate, hour: newHour, status: "rescheduled" });
      return { ...appt, date: newDate, hour: newHour, status: "rescheduled" };
    });

    return { ok: true, appointment: result };
  } catch (err) {
    if (err && err.code) return { ok: false, reason: err.code, status: err.status };
    throw err;
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  ACTIVE_STATUSES,
  normalizePhone,
  getClinicSettings,
  isClosedDay,
  isWithinHours,
  countsTowardCapacity,
  getAvailableSlots,
  bookAppointmentAtomic,
  rescheduleAppointmentAtomic,
};
