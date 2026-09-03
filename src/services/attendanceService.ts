// FILE: src/services/attendanceService.ts

import {
  collection,
  query,
  where,
  onSnapshot,
  getDocs,
  updateDoc,
  addDoc,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AttendanceRecord {
  id:          string;
  physioId:    string;
  physioName:  string;
  date:        string; // "YYYY-MM-DD"
  checkIn:     string; // "HH:MM" or ""
  checkOut:    string; // "HH:MM" or ""
  recordedBy:  string;
  updatedAt:   Timestamp | null;
}

// ─── Error parser ─────────────────────────────────────────────────────────────

function parseError(err: unknown): string {
  const e = err as { message?: string };
  return e.message ?? "An unexpected error occurred.";
}

// ─── Converter ─────────────────────────────────────────────────────────────

function docToAttendance(id: string, data: Record<string, unknown>): AttendanceRecord {
  return {
    id,
    physioId:   (data.physioId   as string) ?? "",
    physioName: (data.physioName as string) ?? "",
    date:       (data.date       as string) ?? "",
    checkIn:    (data.checkIn    as string) ?? "",
    checkOut:   (data.checkOut   as string) ?? "",
    recordedBy: (data.recordedBy as string) ?? "",
    updatedAt:  (data.updatedAt  as Timestamp | null) ?? null,
  };
}

// ─── Realtime: all physios' attendance for one day ────────────────────────────

export function subscribeToAttendanceForDate(
  date:     string,
  onData:   (records: AttendanceRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(collection(db, "staffAttendance"), where("date", "==", date));
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => docToAttendance(d.id, d.data()))),
    (err)  => onError?.(err)
  );
}

// ─── Realtime: one physio's attendance history ────────────────────────────────

export function subscribeToAttendanceForPhysio(
  physioId: string,
  onData:   (records: AttendanceRecord[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(collection(db, "staffAttendance"), where("physioId", "==", physioId));
  return onSnapshot(
    q,
    (snap) => {
      const records = snap.docs
        .map((d) => docToAttendance(d.id, d.data()))
        .sort((a, b) => b.date.localeCompare(a.date));
      onData(records);
    },
    (err) => onError?.(err)
  );
}

// ─── Upsert: mark check-in / check-out for a physio on a given date ───────────

export async function upsertAttendance(
  physioId:   string,
  physioName: string,
  date:       string,
  updates:    { checkIn?: string; checkOut?: string },
  recordedBy: string
): Promise<{ error?: string }> {
  try {
    const q = query(
      collection(db, "staffAttendance"),
      where("physioId", "==", physioId),
      where("date", "==", date)
    );
    const snap = await getDocs(q);

    if (!snap.empty) {
      await updateDoc(snap.docs[0].ref, { ...updates, recordedBy, updatedAt: serverTimestamp() });
      return {};
    }

    await addDoc(collection(db, "staffAttendance"), {
      physioId,
      physioName,
      date,
      checkIn:  "",
      checkOut: "",
      ...updates,
      recordedBy,
      updatedAt: serverTimestamp(),
    });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}
