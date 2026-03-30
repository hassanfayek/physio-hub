// FILE: src/services/priceService.ts

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
  setDoc,
  getDoc,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BillingEntry {
  id:          string;
  patientId:   string;
  date:        string;        // YYYY-MM-DD
  description: string;
  amount:      number;        // in local currency
  paid:        boolean;
  paidDate:    string;        // YYYY-MM-DD, empty if not paid
  notes:       string;
  createdAt:   Timestamp | null;
}

export interface BillingSettings {
  secretaryCanView: boolean;
}

export const DEFAULT_BILLING_SETTINGS: BillingSettings = {
  secretaryCanView: true,
};

// ─── Error parser ─────────────────────────────────────────────────────────────

function parseError(err: unknown): string {
  const e = err as { message?: string };
  return e.message ?? "An unexpected error occurred.";
}

// ─── Helper ───────────────────────────────────────────────────────────────────

function docToEntry(id: string, data: Record<string, unknown>): BillingEntry {
  return {
    id,
    patientId:   (data.patientId   as string)          ?? "",
    date:        (data.date        as string)          ?? "",
    description: (data.description as string)          ?? "",
    amount:      (data.amount      as number)          ?? 0,
    paid:        (data.paid        as boolean)         ?? false,
    paidDate:    (data.paidDate    as string)          ?? "",
    notes:       (data.notes       as string)          ?? "",
    createdAt:   (data.createdAt   as Timestamp | null) ?? null,
  };
}

// ─── Billing settings (secretary visibility) ──────────────────────────────────

export function subscribeToBillingSettings(
  onData:   (s: BillingSettings) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(
    doc(db, "clinicSettings", "billing"),
    (snap) => {
      if (snap.exists()) onData(snap.data() as BillingSettings);
      else               onData(DEFAULT_BILLING_SETTINGS);
    },
    (err) => onError?.(err)
  );
}

export async function saveBillingSettings(
  settings: BillingSettings
): Promise<{ error?: string }> {
  try {
    await setDoc(doc(db, "clinicSettings", "billing"), settings);
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function getBillingSettings(): Promise<BillingSettings> {
  try {
    const snap = await getDoc(doc(db, "clinicSettings", "billing"));
    if (snap.exists()) return snap.data() as BillingSettings;
    return DEFAULT_BILLING_SETTINGS;
  } catch {
    return DEFAULT_BILLING_SETTINGS;
  }
}

// ─── Realtime: billing entries for a patient ──────────────────────────────────

export function subscribeToPatientBilling(
  patientId: string,
  onData:    (entries: BillingEntry[]) => void,
  onError?:  (err: Error) => void
): () => void {
  const q = query(
    collection(db, "patientBilling"),
    where("patientId", "==", patientId),
    orderBy("date", "desc")
  );
  return onSnapshot(
    q,
    (snap) => onData(snap.docs.map((d) => docToEntry(d.id, d.data()))),
    (err)  => onError?.(err)
  );
}

// ─── Add billing entry ────────────────────────────────────────────────────────

export async function addBillingEntry(
  entry: Omit<BillingEntry, "id" | "createdAt">
): Promise<{ id: string; error?: never } | { id?: never; error: string }> {
  try {
    const ref = await addDoc(collection(db, "patientBilling"), {
      ...entry,
      createdAt: serverTimestamp(),
    });
    return { id: ref.id };
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Update billing entry ─────────────────────────────────────────────────────

export async function updateBillingEntry(
  entryId: string,
  updates: Partial<Omit<BillingEntry, "id" | "createdAt">>
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "patientBilling", entryId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Delete billing entry ─────────────────────────────────────────────────────

export async function deleteBillingEntry(
  entryId: string
): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "patientBilling", entryId));
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}
