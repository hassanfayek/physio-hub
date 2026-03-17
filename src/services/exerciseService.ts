// FILE: src/services/exerciseService.ts
// Handles:
//   - exerciseLibrary  — global exercise catalogue
//   - patientExercises — exercises assigned to a specific patient

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface LibraryExercise {
  id:           string;
  name:         string;
  category:     string;
  description:  string;
  defaultSets:  number;
  defaultReps:  number;
  defaultHoldTime: number;
  notes:        string;
  mediaUrl:     string;
  createdAt:    Timestamp | null;
}

export interface PatientExercise {
  id:          string;
  patientId:   string;
  exerciseId:  string;
  exerciseName: string;
  sets:        number;
  reps:        number;
  holdTime:    number;
  notes:       string;
  createdBy:   string;
  createdAt:   Timestamp | null;
  completed:   boolean;
  completedAt: Timestamp | null;
  mediaUrl:    string;   // copied from library at assign-time for display
  programType: "clinic" | "home";  // defaults to "clinic"
}

export interface CreateExercisePayload {
  name:            string;
  category:        string;
  description:     string;
  defaultSets:     number;
  defaultReps:     number;
  defaultHoldTime: number;
  notes:           string;
  mediaUrl:        string;
}

export interface AssignExercisePayload {
  patientId:    string;
  exerciseId:   string;
  exerciseName: string;
  sets:         number;
  reps:         number;
  holdTime:     number;
  notes:        string;
  createdBy:    string;
  mediaUrl:     string;
  programType?: "clinic" | "home";  // optional, defaults to "clinic"
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseError(err: unknown): string {
  const e = err as { code?: string; message?: string };
  const map: Record<string, string> = {
    "permission-denied": "You do not have permission to perform this action.",
  };
  return map[e.code ?? ""] ?? e.message ?? "An unexpected error occurred.";
}

function docToLibraryExercise(id: string, data: Record<string, unknown>): LibraryExercise {
  return {
    id,
    name:            (data.name            as string)  ?? "",
    category:        (data.category        as string)  ?? "",
    description:     (data.description     as string)  ?? "",
    defaultSets:     (data.defaultSets     as number)  ?? 3,
    defaultReps:     (data.defaultReps     as number)  ?? 10,
    defaultHoldTime: (data.defaultHoldTime as number)  ?? 0,
    notes:           (data.notes           as string)  ?? "",
    mediaUrl:        (data.mediaUrl        as string)  ?? "",
    createdAt:       (data.createdAt       as Timestamp | null) ?? null,
  };
}

function docToPatientExercise(id: string, data: Record<string, unknown>): PatientExercise {
  return {
    id,
    patientId:    (data.patientId    as string)  ?? "",
    exerciseId:   (data.exerciseId   as string)  ?? "",
    exerciseName: (data.exerciseName as string)  ?? "",
    sets:         (data.sets         as number)  ?? 3,
    reps:         (data.reps         as number)  ?? 10,
    holdTime:     (data.holdTime     as number)  ?? 0,
    notes:        (data.notes        as string)  ?? "",
    createdBy:    (data.createdBy    as string)  ?? "",
    createdAt:    (data.createdAt    as Timestamp | null) ?? null,
    completed:    (data.completed    as boolean) ?? false,
    completedAt:  (data.completedAt  as Timestamp | null) ?? null,
    mediaUrl:     (data.mediaUrl     as string)  ?? "",
    programType:  ((data.programType as string) === "home" ? "home" : "clinic") as "clinic" | "home",
  };
}

// ─── Exercise Library: CRUD ───────────────────────────────────────────────────

export async function createExercise(
  payload: CreateExercisePayload
): Promise<{ id: string; error?: never } | { id?: never; error: string }> {
  try {
    const ref = await addDoc(collection(db, "exerciseLibrary"), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    return { id: ref.id };
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function updateExercise(
  exerciseId: string,
  payload: Partial<CreateExercisePayload>
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "exerciseLibrary", exerciseId), payload);
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function deleteExercise(
  exerciseId: string
): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "exerciseLibrary", exerciseId));
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Exercise Library: realtime listener ─────────────────────────────────────

export function subscribeToExerciseLibrary(
  onData:   (exercises: LibraryExercise[]) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, "exerciseLibrary"), orderBy("name", "asc")),
    (snap) => onData(snap.docs.map((d) => docToLibraryExercise(d.id, d.data()))),
    (err)  => onError?.(err)
  );
}

// ─── Patient Exercises: assign ────────────────────────────────────────────────

export async function assignExerciseToPatient(
  payload: AssignExercisePayload
): Promise<{ id: string; error?: never } | { id?: never; error: string }> {
  try {
    const ref = await addDoc(collection(db, "patientExercises"), {
      patientId:    payload.patientId,
      exerciseId:   payload.exerciseId,
      exerciseName: payload.exerciseName,
      sets:         payload.sets,
      reps:         payload.reps,
      holdTime:     payload.holdTime,
      notes:        payload.notes,
      createdBy:    payload.createdBy,
      mediaUrl:     payload.mediaUrl,
      programType:  payload.programType ?? "clinic",
      completed:    false,
      completedAt:  null,
      createdAt:    serverTimestamp(),
    });
    return { id: ref.id };
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Patient Exercises: realtime listener ─────────────────────────────────────

export function subscribeToPatientExercises(
  patientId: string,
  onData:    (exercises: PatientExercise[]) => void,
  onError?:  (err: Error) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, "patientExercises"),
      where("patientId", "==", patientId),
      orderBy("createdAt", "asc")
    ),
    (snap) => onData(snap.docs.map((d) => docToPatientExercise(d.id, d.data()))),
    (err)  => onError?.(err)
  );
}

// ─── Patient Exercises: toggle completion ─────────────────────────────────────

export async function toggleExerciseCompletion(
  recordId:    string,
  completed:   boolean
): Promise<{ error?: string }> {
  try {
    const safeCompleted = completed ?? false;
    await updateDoc(doc(db, "patientExercises", recordId), {
      completed:   safeCompleted,
      completedAt: safeCompleted ? serverTimestamp() : null,
    });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Patient Exercises: remove ───────────────────────────────────────────────

export async function removePatientExercise(
  recordId: string
): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "patientExercises", recordId));
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Legacy exports — required by ExercisesPage.tsx (patient portal) ──────────
// The patient-facing ExercisesPage uses the old assignedExercises collection.
// These are kept here so that file compiles without changes.

export interface AssignedExercise {
  uid:         string;
  patientId:   string;
  exerciseId:  string;
  exercise?:   LibraryExercise;
  sets:        number;
  reps:        number;
  notes:       string;
  assignedBy:  string;
  frequency:   number;
  isCompleted: boolean;
  createdAt:   Timestamp | null;
}

export function subscribeToAssignedExercises(
  patientId: string,
  onData:    (exercises: AssignedExercise[]) => void,
  onError?:  (err: Error) => void
): () => void {
  return onSnapshot(
    query(
      collection(db, "assignedExercises"),
      where("patientId", "==", patientId),
      orderBy("createdAt", "desc")
    ),
    (snap) => {
      onData(snap.docs.map((d) => {
        const data = d.data();
        return {
          uid:         d.id,
          patientId:   (data.patientId   as string)  ?? "",
          exerciseId:  (data.exerciseId  as string)  ?? "",
          sets:        (data.sets        as number)  ?? 3,
          reps:        (data.reps        as number)  ?? 10,
          notes:       (data.notes       as string)  ?? "",
          assignedBy:  (data.assignedBy  as string)  ?? "",
          frequency:   (data.frequency   as number)  ?? 3,
          isCompleted: (data.isCompleted as boolean) ?? false,
          createdAt:   (data.createdAt   as Timestamp | null) ?? null,
        };
      }));
    },
    (err) => onError?.(err)
  );
}
