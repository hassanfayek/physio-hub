// FILE: src/services/secretaryService.ts

import {
  collection,
  query,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";

export interface Secretary {
  uid:       string;
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
}

export function subscribeToSecretaries(
  onData:   (secs: Secretary[]) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, "secretaries")),
    (snap) => {
      const secs = snap.docs.map((d) => ({
        uid: d.id,
        ...(d.data() as Omit<Secretary, "uid">),
      }));
      onData(secs);
    },
    (err) => onError?.(err)
  );
}

export async function deleteSecretary(uid: string): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "secretaries", uid));
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
    return { error: e.message ?? "Failed to delete secretary." };
  }
}
