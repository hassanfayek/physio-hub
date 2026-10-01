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
  active:    boolean; // false once deactivated — data kept, access revoked
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
        ...(d.data() as Omit<Secretary, "uid" | "active">),
        active: d.data().active !== false,
      }));
      onData(secs);
    },
    (err) => onError?.(err)
  );
}

// Revoke or restore a physio's/secretary's access without deleting anything.
export async function setStaffActive(uid: string, active: boolean): Promise<{ error?: string }> {
  try {
    const { getFunctions, httpsCallable } = await import("firebase/functions");
    const fn = httpsCallable(getFunctions(db.app), "setStaffActive");
    await fn({ uid, active });
    return {};
  } catch (err) {
    const e = err as { message?: string };
    return { error: e.message ?? "Could not update staff access." };
  }
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
