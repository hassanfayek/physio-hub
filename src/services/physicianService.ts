// FILE: src/services/physicianService.ts

import {
  collection,
  query,
  onSnapshot,
  deleteDoc,
  doc,
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
