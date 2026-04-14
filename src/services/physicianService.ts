// FILE: src/services/physicianService.ts

import {
  collection,
  query,
  where,
  onSnapshot,
  addDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

export interface Physician {
  uid:            string;
  firstName:      string;
  lastName:       string;
  email:          string;
  phone:          string;
  specialization: string;
  clinicName:     string;
}

export function subscribeToPhysicians(
  onData:   (physicians: Physician[]) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, "physicians")),
    (snap) => {
      const physicians = snap.docs.map((d) => ({
        uid: d.id,
        ...(d.data() as Omit<Physician, "uid">),
      }));
      onData(physicians);
    },
    (err) => onError?.(err)
  );
}

// ─── Physician Notes ──────────────────────────────────────────────────────────

export interface PhysicianNote {
  id:            string;
  patientId:     string;
  physicianId:   string;
  physicianName: string;
  date:          string;
  note:          string;
  createdAt:     Timestamp | null;
}

export function subscribeToPhysicianNotes(
  patientId: string,
  onData:    (notes: PhysicianNote[]) => void,
  onError?:  (err: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, "physicianNotes"), where("patientId", "==", patientId)),
    (snap) => {
      const notes: PhysicianNote[] = snap.docs.map((d) => ({
        id:            d.id,
        patientId:     (d.data().patientId     as string)          ?? "",
        physicianId:   (d.data().physicianId   as string)          ?? "",
        physicianName: (d.data().physicianName as string)          ?? "",
        date:          (d.data().date          as string)          ?? "",
        note:          (d.data().note          as string)          ?? "",
        createdAt:     (d.data().createdAt     as Timestamp | null) ?? null,
      }));
      notes.sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      onData(notes);
    },
    (err) => onError?.(err)
  );
}

export async function addPhysicianNote(payload: {
  patientId:     string;
  physicianId:   string;
  physicianName: string;
  date:          string;
  note:          string;
}): Promise<{ error?: string }> {
  try {
    await addDoc(collection(db, "physicianNotes"), {
      ...payload,
      createdAt: serverTimestamp(),
    });
    return {};
  } catch (err) {
    const e = err as { message?: string };
    return { error: e.message ?? "Failed to save note." };
  }
}

export async function deletePhysicianNote(noteId: string): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "physicianNotes", noteId));
    return {};
  } catch (err) {
    const e = err as { message?: string };
    return { error: e.message ?? "Failed to delete note." };
  }
}

// ─── Physician management ─────────────────────────────────────────────────────

export async function deletePhysician(uid: string): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "physicians", uid));
    await deleteDoc(doc(db, "users", uid));
    // Best-effort: delete Firebase Auth account via Cloud Function
    try {
      const { getFunctions, httpsCallable } = await import("firebase/functions");
      const functions = getFunctions(db.app);
      const deleteAuthUser = httpsCallable(functions, "deleteAuthUser");
      await deleteAuthUser({ uid });
    } catch { /* auth deletion is best-effort */ }
    return {};
  } catch (err) {
    const e = err as { message?: string };
    return { error: e.message ?? "Failed to delete physician." };
  }
}
