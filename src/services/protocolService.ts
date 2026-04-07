// FILE: src/services/protocolService.ts
// Treatment protocols library — read by all physios, written only by clinic_manager.

import {
  collection, doc, addDoc, updateDoc, deleteDoc,
  query, onSnapshot, orderBy, serverTimestamp, type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ProtocolPhase {
  name:             string;   // e.g. "Phase 1 — Acute"
  duration:         string;   // e.g. "Week 1–2"
  goals:            string;
  interventions:    string;
  exercises:        string;
  exerciseRefs:     string[]; // IDs from the exercise library
  precautions:      string;
  progressCriteria: string;   // criteria patient must meet to advance to next phase
}

export interface TreatmentProtocol {
  id:          string;
  title:       string;
  injury:      string;
  category:    string;   // Knee, Shoulder, Spine, etc.
  overview:    string;
  duration:    string;   // e.g. "6–8 weeks"
  phases:      ProtocolPhase[];
  tags:        string[];
  createdBy:   string;
  createdAt:   Timestamp | null;
}

export interface AssignedProtocol {
  id:             string;
  patientId:      string;
  protocolId:     string;
  protocolTitle:  string;
  injury:         string;
  assignedBy:     string;
  assignedAt:     Timestamp | null;
  notes:          string;
  status:         "active" | "completed";
}

export type CreateProtocolPayload = Omit<TreatmentProtocol, "id" | "createdAt">;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseError(err: unknown): string {
  const e = err as { message?: string };
  return e.message ?? "An unexpected error occurred.";
}

function docToProtocol(id: string, data: Record<string, unknown>): TreatmentProtocol {
  return {
    id,
    title:     (data.title     as string)   ?? "",
    injury:    (data.injury    as string)   ?? "",
    category:  (data.category  as string)   ?? "",
    overview:  (data.overview  as string)   ?? "",
    duration:  (data.duration  as string)   ?? "",
    phases:    ((data.phases as Array<Record<string, unknown>>) ?? []).map((ph) => ({
      name:             (ph.name             as string)   ?? "",
      duration:         (ph.duration         as string)   ?? "",
      goals:            (ph.goals            as string)   ?? "",
      interventions:    (ph.interventions    as string)   ?? "",
      exercises:        (ph.exercises        as string)   ?? "",
      exerciseRefs:     (ph.exerciseRefs     as string[]) ?? [],
      precautions:      (ph.precautions      as string)   ?? "",
      progressCriteria: (ph.progressCriteria as string)   ?? "",
    })),
    tags:      (data.tags      as string[]) ?? [],
    createdBy: (data.createdBy as string)   ?? "",
    createdAt: (data.createdAt as Timestamp | null) ?? null,
  };
}

function docToAssigned(id: string, data: Record<string, unknown>): AssignedProtocol {
  return {
    id,
    patientId:     (data.patientId     as string) ?? "",
    protocolId:    (data.protocolId    as string) ?? "",
    protocolTitle: (data.protocolTitle as string) ?? "",
    injury:        (data.injury        as string) ?? "",
    assignedBy:    (data.assignedBy    as string) ?? "",
    assignedAt:    (data.assignedAt    as Timestamp | null) ?? null,
    notes:         (data.notes         as string) ?? "",
    status:        ((data.status as string) === "completed" ? "completed" : "active"),
  };
}

// ─── Protocol CRUD ────────────────────────────────────────────────────────────

export async function createProtocol(
  payload: CreateProtocolPayload
): Promise<{ id: string; error?: never } | { id?: never; error: string }> {
  try {
    const ref = await addDoc(collection(db, "treatmentProtocols"), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    return { id: ref.id };
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function updateProtocol(
  id: string,
  payload: Partial<CreateProtocolPayload>
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "treatmentProtocols", id), { ...payload, updatedAt: serverTimestamp() });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function deleteProtocol(id: string): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "treatmentProtocols", id));
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

export function subscribeToProtocols(
  onData:   (protocols: TreatmentProtocol[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(collection(db, "treatmentProtocols"), orderBy("createdAt", "desc"));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => docToProtocol(d.id, d.data()))),
    (err)  => onError?.(err)
  );
}

// ─── Assign protocol to patient ───────────────────────────────────────────────

export async function assignProtocolToPatient(payload: {
  patientId:     string;
  protocolId:    string;
  protocolTitle: string;
  injury:        string;
  assignedBy:    string;
  notes:         string;
}): Promise<{ id: string; error?: never } | { id?: never; error: string }> {
  try {
    const ref = await addDoc(collection(db, "patientProtocols"), {
      ...payload,
      status:     "active",
      assignedAt: serverTimestamp(),
    });
    return { id: ref.id };
  } catch (err) {
    return { error: parseError(err) };
  }
}

export function subscribeToPatientProtocols(
  patientId: string,
  onData:    (protocols: AssignedProtocol[]) => void,
  onError?:  (err: Error) => void
): () => void {
  const q = query(collection(db, "patientProtocols"));
  return onSnapshot(
    q,
    (snap) => {
      const all = snap.docs
        .map((d) => docToAssigned(d.id, d.data()))
        .filter((p) => p.patientId === patientId)
        .sort((a, b) => (b.assignedAt?.toMillis() ?? 0) - (a.assignedAt?.toMillis() ?? 0));
      onData(all);
    },
    (err) => onError?.(err)
  );
}
