// FILE: src/services/priceService.ts

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  onSnapshot,
  setDoc,
  getDoc,
  getDocs,
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
    where("patientId", "==", patientId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const entries = snap.docs
        .map((d) => docToEntry(d.id, d.data()))
        .sort((a, b) => b.date.localeCompare(a.date));
      onData(entries);
    },
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

// ─── Session Price (per completed appointment) ────────────────────────────────

export interface SessionPrice {
  id:            string;
  patientId:     string;
  appointmentId: string;
  date:          string;
  sessionType:   string;
  physioName:    string;
  amount:        number;
  paid:          boolean;
  paidDate:      string;
  packageId:     string;   // empty if not covered by a package
  notes:         string;
  createdAt:     Timestamp | null;
}

function docToSessionPrice(id: string, data: Record<string, unknown>): SessionPrice {
  return {
    id,
    patientId:     (data.patientId     as string)           ?? "",
    appointmentId: (data.appointmentId as string)           ?? "",
    date:          (data.date          as string)           ?? "",
    sessionType:   (data.sessionType   as string)           ?? "",
    physioName:    (data.physioName    as string)           ?? "",
    amount:        (data.amount        as number)           ?? 0,
    paid:          (data.paid          as boolean)          ?? false,
    paidDate:      (data.paidDate      as string)           ?? "",
    packageId:     (data.packageId     as string)           ?? "",
    notes:         (data.notes         as string)           ?? "",
    createdAt:     (data.createdAt     as Timestamp | null) ?? null,
  };
}

export function subscribeToSessionPrices(
  patientId: string,
  onData:    (prices: SessionPrice[]) => void,
  onError?:  (err: Error) => void
): () => void {
  const q = query(
    collection(db, "patientSessionPrices"),
    where("patientId", "==", patientId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const prices = snap.docs
        .map((d) => docToSessionPrice(d.id, d.data()))
        .sort((a, b) => b.date.localeCompare(a.date));
      onData(prices);
    },
    (err)  => onError?.(err)
  );
}

export async function setSessionPrice(
  price: Omit<SessionPrice, "id" | "createdAt">
): Promise<{ id: string; error?: never } | { id?: never; error: string }> {
  try {
    // upsert by appointmentId
    const q = query(
      collection(db, "patientSessionPrices"),
      where("appointmentId", "==", price.appointmentId)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const ref = snap.docs[0].ref;
      await updateDoc(ref, { ...price, updatedAt: null });
      return { id: ref.id };
    }
    const ref = await addDoc(collection(db, "patientSessionPrices"), {
      ...price,
      createdAt: serverTimestamp(),
    });
    return { id: ref.id };
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function deleteSessionPrice(
  priceId: string
): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "patientSessionPrices", priceId));
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Session Packages ─────────────────────────────────────────────────────────

export interface SessionPackage {
  id:              string;
  patientId:       string;
  packageSize:     number;   // 6, 12, or 24
  pricePerSession: number;
  totalAmount:     number;
  paidAmount:      number;
  startDate:       string;
  sessionsUsed:    number;
  active:          boolean;
  notes:           string;
  createdAt:       Timestamp | null;
}

function docToPackage(id: string, data: Record<string, unknown>): SessionPackage {
  return {
    id,
    patientId:       (data.patientId       as string)           ?? "",
    packageSize:     (data.packageSize     as number)           ?? 6,
    pricePerSession: (data.pricePerSession as number)           ?? 0,
    totalAmount:     (data.totalAmount     as number)           ?? 0,
    paidAmount:      (data.paidAmount      as number)           ?? 0,
    startDate:       (data.startDate       as string)           ?? "",
    sessionsUsed:    (data.sessionsUsed    as number)           ?? 0,
    active:          (data.active          as boolean)          ?? true,
    notes:           (data.notes           as string)           ?? "",
    createdAt:       (data.createdAt       as Timestamp | null) ?? null,
  };
}

export function subscribeToPatientPackages(
  patientId: string,
  onData:    (packages: SessionPackage[]) => void,
  onError?:  (err: Error) => void
): () => void {
  const q = query(
    collection(db, "patientPackages"),
    where("patientId", "==", patientId)
  );
  return onSnapshot(
    q,
    (snap) => {
      const pkgs = snap.docs.map((d) => docToPackage(d.id, d.data()));
      pkgs.sort((a, b) => {
        const ta = a.createdAt?.toMillis() ?? 0;
        const tb = b.createdAt?.toMillis() ?? 0;
        return tb - ta;
      });
      onData(pkgs);
    },
    (err)  => onError?.(err)
  );
}

export async function addSessionPackage(
  pkg: Omit<SessionPackage, "id" | "createdAt">
): Promise<{ id: string; error?: never } | { id?: never; error: string }> {
  try {
    const ref = await addDoc(collection(db, "patientPackages"), {
      ...pkg,
      createdAt: serverTimestamp(),
    });
    return { id: ref.id };
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function updateSessionPackage(
  pkgId:   string,
  updates: Partial<Omit<SessionPackage, "id" | "createdAt">>
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "patientPackages", pkgId), {
      ...updates,
      updatedAt: serverTimestamp(),
    });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function deleteSessionPackage(
  pkgId: string
): Promise<{ error?: string }> {
  try {
    await deleteDoc(doc(db, "patientPackages", pkgId));
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}
