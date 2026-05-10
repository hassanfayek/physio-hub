// FILE: src/services/viewerService.ts

import {
  collection,
  query,
  onSnapshot,
  deleteDoc,
  doc,
} from "firebase/firestore";
import { db } from "../firebase";

export interface Viewer {
  uid:       string;
  firstName: string;
  lastName:  string;
  email:     string;
  phone:     string;
}

export function subscribeToViewers(
  onData:   (viewers: Viewer[]) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    query(collection(db, "viewers")),
    (snap) => {
      const viewers = snap.docs.map((d) => ({
        uid: d.id,
        ...(d.data() as Omit<Viewer, "uid">),
      }));
      onData(viewers);
    },
    (err) => onError?.(err)
  );
}

export async function deleteViewer(uid: string): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "viewers", uid));
    await deleteDoc(doc(db, "users", uid));
    try {
      const { getFunctions, httpsCallable } = await import("firebase/functions");
      const functions = getFunctions(db.app);
      const deleteAuthUser = httpsCallable(functions, "deleteAuthUser");
      await deleteAuthUser({ uid });
    } catch { /* auth deletion is best-effort */ }
    return {};
  } catch (err) {
    const e = err as { message?: string };
    return { error: e.message ?? "Failed to delete viewer." };
  }
}
