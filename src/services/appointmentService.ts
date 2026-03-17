// FILE: src/services/appointmentService.ts

import {
  collection,
  doc,
  addDoc,
  deleteDoc,
  updateDoc,
  setDoc,
  getDoc,
  getDocs,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Appointment {
  id:          string;
  patientId:   string;
  patientName: string;
  physioId:    string;
  physioName:  string;
  date:        string;   // YYYY-MM-DD
  hour:        number;   // 0–23
  sessionType: string;
  status:      "scheduled" | "completed" | "cancelled";
  createdAt:   Timestamp | null;
}

export interface ClinicSettings {
  maxPatientsPerHour: number;
  openingHour:        number;
  closingHour:        number;
}

export interface CreateAppointmentPayload {
  patientId:   string;
  patientName: string;
  physioId:    string;
  physioName:  string;
  date:        string;
  hour:        number;
  sessionType: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

export const DEFAULT_SETTINGS: ClinicSettings = {
  maxPatientsPerHour: 4,
  openingHour:        9,
  closingHour:        21,
};

// ─── Error parser ─────────────────────────────────────────────────────────────

function parseError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const map: Record<string, string> = {
    "permission-denied": "You do not have permission to perform this action.",
  };
  return map[e.code ?? ""] ?? e.message ?? "An unexpected error occurred.";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function docToAppointment(id: string, data: Record<string, unknown>): Appointment {
  return {
    id,
    patientId:   (data.patientId   as string) ?? "",
    patientName: (data.patientName as string) ?? "",
    physioId:    (data.physioId    as string) ?? "",
    physioName:  (data.physioName  as string) ?? "",
    date:        (data.date        as string) ?? "",
    hour:        (data.hour        as number) ?? 0,
    sessionType: (data.sessionType as string) ?? "",
    status:      ((data.status as string) === "completed" ? "completed"
                : (data.status as string) === "cancelled"  ? "cancelled"
                : "scheduled") as "scheduled" | "completed" | "cancelled",
    createdAt:   (data.createdAt   as Timestamp | null) ?? null,
  };
}

// ─── Clinic settings ──────────────────────────────────────────────────────────

export async function getClinicSettings(): Promise<ClinicSettings> {
  try {
    const snap = await getDoc(doc(db, "clinicSettings", "schedule"));
    if (snap.exists()) return snap.data() as ClinicSettings;
    return DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export async function saveClinicSettings(
  settings: ClinicSettings
): Promise<{ error?: string }> {
  try {
    await setDoc(doc(db, "clinicSettings", "schedule"), settings);
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Realtime listener: subscribe to clinic settings ─────────────────────────

export function subscribeToClinicSettings(
  onData:   (settings: ClinicSettings) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    doc(db, "clinicSettings", "schedule"),
    (snap) => {
      if (snap.exists()) onData(snap.data() as ClinicSettings);
      else               onData(DEFAULT_SETTINGS);
    },
    (err) => onError?.(err)
  );
}

// ─── Create appointment ───────────────────────────────────────────────────────

export async function createAppointment(
  payload: CreateAppointmentPayload
): Promise<{ id: string; error?: never } | { id?: never; error: string }> {
  try {
    const ref = await addDoc(collection(db, "appointments"), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    return { id: ref.id };
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Delete appointment ───────────────────────────────────────────────────────

export async function deleteAppointment(
  appointmentId: string
): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "appointments", appointmentId));
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Realtime: appointments by month ─────────────────────────────────────────
// Returns all appointments where date starts with YYYY-MM (prefix match via >=/<)

export function subscribeToAppointmentsByMonth(
  yearMonth: string,  // "YYYY-MM"
  physioId:  string | null,  // null = all (manager); string = filter by physio
  onData:    (appts: Appointment[]) => void,
  onError?:  (err: Error) => void
): () => void {
  const start = `${yearMonth}-01`;
  const end   = `${yearMonth}-32`;   // no real date, just higher than any valid day

  let q = query(
    collection(db, "appointments"),
    where("date", ">=", start),
    where("date", "<=", end)
  );

  if (physioId) {
    q = query(
      collection(db, "appointments"),
      where("date",     ">=", start),
      where("date",     "<=", end),
      where("physioId", "==", physioId)
    );
  }

  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => docToAppointment(d.id, d.data()))),
    (err)  => onError?.(err)
  );
}

// ─── Realtime: appointments by day ───────────────────────────────────────────

export function subscribeToAppointmentsByDay(
  date:     string,          // "YYYY-MM-DD"
  physioId: string | null,   // null = all (manager)
  onData:   (appts: Appointment[]) => void,
  onError?: (err: Error) => void
): () => void {
  let q = query(
    collection(db, "appointments"),
    where("date", "==", date)
  );

  if (physioId) {
    q = query(
      collection(db, "appointments"),
      where("date",     "==", date),
      where("physioId", "==", physioId)
    );
  }

  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => docToAppointment(d.id, d.data()))),
    (err)  => onError?.(err)
  );
}

// ─── Realtime: appointments by week ──────────────────────────────────────────
// Queries date range [weekStart, weekEnd] inclusive.

export function subscribeToAppointmentsByWeek(
  weekStart: string,         // "YYYY-MM-DD"
  weekEnd:   string,         // "YYYY-MM-DD"
  physioId:  string | null,
  onData:    (appts: Appointment[]) => void,
  onError?:  (err: Error) => void
): () => void {
  let q = query(
    collection(db, "appointments"),
    where("date", ">=", weekStart),
    where("date", "<=", weekEnd)
  );

  if (physioId) {
    q = query(
      collection(db, "appointments"),
      where("date",     ">=", weekStart),
      where("date",     "<=", weekEnd),
      where("physioId", "==", physioId)
    );
  }

  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => docToAppointment(d.id, d.data()))),
    (err)  => onError?.(err)
  );
}

// ─── Helpers: date utilities ──────────────────────────────────────────────────

/** Returns "YYYY-MM-DD" for a given Date object */
export function toDateStr(d: Date): string {
  const y  = d.getFullYear();
  const m  = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Returns the Monday of the week containing the given date */
export function getWeekStart(d: Date): Date {
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  const monday = new Date(d);
  monday.setDate(d.getDate() + diff);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

/** Format hour as "09:00" */
export function fmtHour(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

// ─── Realtime: upcoming appointments for a patient ───────────────────────────
// Queries appointments where patientId == uid and date >= today, sorted by
// date then hour ascending. Uses onSnapshot for realtime updates.

export function subscribeToPatientAppointments(
  patientId: string,
  onData:    (appts: Appointment[]) => void,
  onError?:  (err: Error) => void
): () => void {
  const today = toDateStr(new Date());

  const q = query(
    collection(db, "appointments"),
    where("patientId", "==", patientId),
    where("date", ">=", today)
  );

  return onSnapshot(
    q,
    (snap) => {
      const appts = snap.docs
        .map((d) => docToAppointment(d.id, d.data()))
        // client-side sort: date asc, then hour asc
        .sort((a, b) => {
          if (a.date !== b.date) return a.date.localeCompare(b.date);
          return a.hour - b.hour;
        });
      onData(appts);
    },
    (err) => onError?.(err)
  );
}

// ─── Patient booking: check capacity then create ──────────────────────────────
// Reads clinicSettings.maxPatientsPerHour, counts existing appointments for
// the chosen date+hour, and only writes if there is capacity remaining.
// Returns the new appointment id, or an error string.

export async function bookPatientAppointment(
  payload:     CreateAppointmentPayload,
  maxPerHour?: number   // optional override; defaults to clinicSettings value
): Promise<{ id: string; error?: never } | { id?: never; error: string }> {
  try {
    // ── Step 3: double-booking protection ─────────────────────────────────
    const limit = maxPerHour ?? (await getClinicSettings()).maxPatientsPerHour;

    const existing = await getDocs(
      query(
        collection(db, "appointments"),
        where("date", "==", payload.date),
        where("hour", "==", payload.hour)
      )
    );

    if (existing.size >= limit) {
      return {
        error: `This time slot is fully booked (${limit} patient${limit !== 1 ? "s" : ""} max). Please choose a different time.`,
      };
    }

    // ── Step 1: write to shared appointments collection ───────────────────
    const ref = await addDoc(collection(db, "appointments"), {
      ...payload,
      createdAt: serverTimestamp(),
    });

    return { id: ref.id };
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Patient cancel: delete own appointment from shared collection ────────────
// Step 6: removing the document immediately clears it from the clinic schedule.

export async function cancelPatientAppointment(
  appointmentId: string
): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "appointments", appointmentId));
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Update appointment status (clinic manager only) ─────────────────────────

export async function updateAppointmentStatus(
  appointmentId: string,
  status: "scheduled" | "completed" | "cancelled"
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "appointments", appointmentId), { status });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Realtime: all appointments for a patient (no date filter, sorted desc) ──

export function subscribeToPatientAllAppointments(
  patientId: string,
  onData:    (appts: Appointment[]) => void,
  onError?:  (err: Error) => void
): () => void {
  const q = query(
    collection(db, "appointments"),
    where("patientId", "==", patientId),
    orderBy("date", "desc")
  );
  return onSnapshot(
    q,
    (snap) => {
      const appts = snap.docs
        .map((d) => docToAppointment(d.id, d.data()))
        .sort((a, b) => {
          if (a.date !== b.date) return b.date.localeCompare(a.date);
          return b.hour - a.hour;
        });
      onData(appts);
    },
    (err) => onError?.(err)
  );
}
