// FILE: src/services/onlineRehabService.ts
// Online rehabilitation — enroll patients, build weekly exercise programs, print PDF plans.

import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, where, onSnapshot, orderBy, serverTimestamp, type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export type DayKey =
  | "monday" | "tuesday" | "wednesday" | "thursday"
  | "friday" | "saturday" | "sunday";

export interface RehabExercise {
  id:          string;   // local UUID for list keying
  exerciseId?: string;   // reference to exerciseLibrary doc (if from library)
  name:        string;
  sets:        string;   // e.g. "3"
  reps:        string;   // e.g. "10–12"
  duration:    string;   // e.g. "30 sec" or ""
  rest:        string;   // e.g. "60 sec" or ""
  notes:       string;
  videoId?:    string;   // YouTube ID if from library
}

export interface DayPlan {
  day:       DayKey;
  isRest:    boolean;
  exercises: RehabExercise[];
}

export interface WeeklyProgram {
  id:            string;
  patientId:     string;
  weekLabel:     string;   // "Week 1", "Phase 2 – Week 3", etc.
  weekStart:     string;   // ISO date "2026-04-07"
  weekEnd:       string;   // ISO date "2026-04-13"
  createdBy:     string;
  createdByName: string;
  createdAt:     Timestamp | null;
  days:          DayPlan[];
}

export interface OnlineRehabEnrollment {
  id:             string;
  patientId:      string;
  patientName:    string;
  assignedBy:     string;
  assignedByName: string;
  assignedAt:     Timestamp | null;
  status:         "active" | "completed";
  notes:          string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const DAYS: DayKey[] = [
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
];

function parseError(err: unknown): string {
  return (err as { message?: string }).message ?? "An unexpected error occurred.";
}

function parseExercise(raw: Record<string, unknown>): RehabExercise {
  return {
    id:         (raw.id         as string)           ?? Math.random().toString(36).slice(2),
    exerciseId: (raw.exerciseId as string | undefined),
    name:       (raw.name       as string)           ?? "",
    sets:       (raw.sets       as string)           ?? "",
    reps:       (raw.reps       as string)           ?? "",
    duration:   (raw.duration   as string)           ?? "",
    rest:       (raw.rest       as string)           ?? "",
    notes:      (raw.notes      as string)           ?? "",
    videoId:    (raw.videoId    as string | undefined),
  };
}

function parseDay(raw: Record<string, unknown>): DayPlan {
  return {
    day:       (raw.day    as DayKey)                       ?? "monday",
    isRest:    (raw.isRest as boolean)                      ?? false,
    exercises: ((raw.exercises as Array<Record<string, unknown>>) ?? []).map(parseExercise),
  };
}

function docToEnrollment(id: string, data: Record<string, unknown>): OnlineRehabEnrollment {
  return {
    id,
    patientId:      (data.patientId      as string)           ?? "",
    patientName:    (data.patientName    as string)           ?? "",
    assignedBy:     (data.assignedBy     as string)           ?? "",
    assignedByName: (data.assignedByName as string)           ?? "",
    assignedAt:     (data.assignedAt     as Timestamp | null) ?? null,
    status:         (data.status as string) === "completed" ? "completed" : "active",
    notes:          (data.notes          as string)           ?? "",
  };
}

function docToProgram(id: string, data: Record<string, unknown>): WeeklyProgram {
  const rawDays = (data.days as Array<Record<string, unknown>>) ?? [];
  const dayMap  = new Map(rawDays.map((d) => [(d.day as string), parseDay(d)]));
  const days    = DAYS.map((dk) => dayMap.get(dk) ?? { day: dk, isRest: false, exercises: [] });
  return {
    id,
    patientId:     (data.patientId     as string)           ?? "",
    weekLabel:     (data.weekLabel     as string)           ?? "",
    weekStart:     (data.weekStart     as string)           ?? "",
    weekEnd:       (data.weekEnd       as string)           ?? "",
    createdBy:     (data.createdBy     as string)           ?? "",
    createdByName: (data.createdByName as string)           ?? "",
    createdAt:     (data.createdAt     as Timestamp | null) ?? null,
    days,
  };
}

// ─── Enrollment CRUD ──────────────────────────────────────────────────────────

export async function enrollPatient(payload: {
  patientId:      string;
  patientName:    string;
  assignedBy:     string;
  assignedByName: string;
  notes:          string;
}): Promise<{ id: string; error?: never } | { id?: never; error: string }> {
  try {
    const ref = await addDoc(collection(db, "onlineRehabEnrollments"), {
      ...payload,
      status:     "active",
      assignedAt: serverTimestamp(),
    });
    return { id: ref.id };
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function updateEnrollmentStatus(
  id:     string,
  status: "active" | "completed",
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "onlineRehabEnrollments", id), { status });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function deleteEnrollment(id: string): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "onlineRehabEnrollments", id));
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

export function subscribeToEnrollments(
  onData:   (enrollments: OnlineRehabEnrollment[]) => void,
  onError?: (err: Error) => void,
): () => void {
  const q = query(collection(db, "onlineRehabEnrollments"), orderBy("assignedAt", "desc"));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => docToEnrollment(d.id, d.data()))),
    (err)  => onError?.(err),
  );
}

// ─── Program CRUD ─────────────────────────────────────────────────────────────

// Firestore rejects `undefined` — strip optional fields that were never set.
function sanitiseExercise(ex: RehabExercise): Record<string, unknown> {
  const out: Record<string, unknown> = {
    id:       ex.id,
    name:     ex.name,
    sets:     ex.sets,
    reps:     ex.reps,
    duration: ex.duration,
    rest:     ex.rest,
    notes:    ex.notes,
  };
  if (ex.exerciseId !== undefined) out.exerciseId = ex.exerciseId;
  if (ex.videoId    !== undefined) out.videoId    = ex.videoId;
  return out;
}

function sanitiseDays(days: DayPlan[]): Record<string, unknown>[] {
  return days.map((d) => ({
    day:       d.day,
    isRest:    d.isRest,
    exercises: d.exercises.map(sanitiseExercise),
  }));
}

export async function createProgram(
  payload: Omit<WeeklyProgram, "id" | "createdAt">,
): Promise<{ id: string; error?: never } | { id?: never; error: string }> {
  try {
    const ref = await addDoc(collection(db, "onlineRehabPrograms"), {
      ...payload,
      days:      sanitiseDays(payload.days),
      createdAt: serverTimestamp(),
    });
    return { id: ref.id };
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function updateProgram(
  id:      string,
  payload: Partial<Omit<WeeklyProgram, "id" | "createdAt">>,
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "onlineRehabPrograms", id), {
      ...payload,
      ...(payload.days ? { days: sanitiseDays(payload.days) } : {}),
      updatedAt: serverTimestamp(),
    });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function deleteProgram(id: string): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "onlineRehabPrograms", id));
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

export function subscribeToPatientPrograms(
  patientId: string,
  onData:    (programs: WeeklyProgram[]) => void,
  onError?:  (err: Error) => void,
): () => void {
  const q = query(
    collection(db, "onlineRehabPrograms"),
    where("patientId", "==", patientId),
  );
  return onSnapshot(
    q,
    (snap) => {
      const sorted = snap.docs
        .map((d) => docToProgram(d.id, d.data()))
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      onData(sorted);
    },
    (err)  => onError?.(err),
  );
}
