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
import { logPackagePayment } from "./businessService";
import { db } from "../firebase";
import { earnPoints } from "./pointsService";

// ─── Types ────────────────────────────────────────────────────────────────────

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
  paymentMethod?: string;  // PAYMENT_METHODS value; "" / missing = not recorded
  keptAsExtra?:  boolean;  // reviewed: a charge not tied to a completed session that should still count (e.g. cancellation fee)
  pointsAwarded?: number;  // loyalty points already earned for this record — internal bookkeeping, set by setSessionPrice
  createdAt:     Timestamp | null;
}

export function docToSessionPrice(id: string, data: Record<string, unknown>): SessionPrice {
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
    paymentMethod: (data.paymentMethod as string)           ?? "",
    keptAsExtra:   (data.keptAsExtra   as boolean)          ?? false,
    pointsAwarded: (data.pointsAwarded as number | undefined) ?? 0,
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

// Pass `opts.id` when editing a specific charge so exactly that record is updated.
// Otherwise this upserts by appointmentId; a new charge for an appointment gets the
// deterministic id `appt_<appointmentId>`, so double saves can't create duplicates.
export async function setSessionPrice(
  price: Omit<SessionPrice, "id" | "createdAt">,
  opts: { id?: string } = {}
): Promise<{ id: string; error?: never } | { id?: never; error: string }> {
  try {
    let existingRef: ReturnType<typeof doc> | null = null;
    let existing: SessionPrice | null = null;
    if (opts.id) {
      const s = await getDoc(doc(db, "patientSessionPrices", opts.id));
      if (s.exists()) { existingRef = s.ref; existing = docToSessionPrice(s.id, s.data()); }
    } else if (price.appointmentId) {
      const snap = await getDocs(query(collection(db, "patientSessionPrices"), where("appointmentId", "==", price.appointmentId)));
      if (!snap.empty) { existingRef = snap.docs[0].ref; existing = docToSessionPrice(snap.docs[0].id, snap.docs[0].data()); }
    }

    // Loyalty points: earn 1 pt per 1 EGP actually paid, once — never for
    // package-linked sessions (that money was already counted at package
    // purchase, see addSessionPackage/updateSessionPackage below).
    const pointsAwarded = (!price.packageId && price.paid)
      ? Math.max(existing?.pointsAwarded ?? 0, Math.floor(price.amount))
      : (existing?.pointsAwarded ?? 0);
    const delta = pointsAwarded - (existing?.pointsAwarded ?? 0);
    if (delta > 0) {
      try {
        await earnPoints(price.patientId, delta, {
          sourceType:  "session",
          sourceId:    price.appointmentId,
          description: `${price.sessionType || "Session"} on ${price.date}`,
        });
      } catch (pointsErr) {
        // Points bookkeeping must never block a billing save.
        console.error("earnPoints failed for session", price.appointmentId, pointsErr);
      }
    }

    if (existing && existingRef) {
      await updateDoc(existingRef, { ...price, pointsAwarded, updatedAt: null });
      return { id: existingRef.id };
    }
    const data = { ...price, pointsAwarded, createdAt: serverTimestamp() };
    if (price.appointmentId) {
      const id = `appt_${price.appointmentId}`;
      await setDoc(doc(db, "patientSessionPrices", id), data);
      return { id };
    }
    const ref = await addDoc(collection(db, "patientSessionPrices"), data);
    return { id: ref.id };
  } catch (err) {
    return { error: parseError(err) };
  }
}

/** Mark a charge that isn't tied to a completed session as deliberately kept (counts in totals). */
export async function setChargeKept(priceId: string, kept: boolean): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "patientSessionPrices", priceId), { keptAsExtra: kept });
    return {};
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
  paymentMethod?:  string;  // method of the most recent payment (each payment is logged in packagePayments)
  pointsAwarded?:  number;  // loyalty points already earned against paidAmount — internal bookkeeping
  createdAt:       Timestamp | null;
}

export function docToPackage(id: string, data: Record<string, unknown>): SessionPackage {
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
    paymentMethod:   (data.paymentMethod   as string)           ?? "",
    pointsAwarded:   (data.pointsAwarded   as number | undefined) ?? 0,
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
    const pointsAwarded = Math.max(0, Math.floor(pkg.paidAmount || 0));
    const ref = await addDoc(collection(db, "patientPackages"), {
      ...pkg,
      pointsAwarded,
      createdAt: serverTimestamp(),
    });
    if (pkg.paidAmount) {
      try {
        await logPackagePayment({ packageId: ref.id, patientId: pkg.patientId, amount: pkg.paidAmount, method: pkg.paymentMethod ?? "" });
      } catch (logErr) {
        console.error("logPackagePayment failed for package", ref.id, logErr);
      }
    }
    if (pointsAwarded > 0) {
      try {
        await earnPoints(pkg.patientId, pointsAwarded, {
          sourceType:  "package",
          sourceId:    ref.id,
          description: `${pkg.packageSize}-session package payment`,
        });
      } catch (pointsErr) {
        console.error("earnPoints failed for package", ref.id, pointsErr);
      }
    }
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
    const payload: Record<string, unknown> = { ...updates, updatedAt: serverTimestamp() };

    // Loyalty points: earn on the paidAmount delta (handles installments —
    // points trickle in as paidAmount rises), never re-awarded on unrelated edits.
    if (updates.paidAmount !== undefined) {
      const snap = await getDoc(doc(db, "patientPackages", pkgId));
      const pkg = snap.exists() ? docToPackage(pkgId, snap.data()) : null;
      // Dated payment log for analytics — any change (incl. corrections) so totals reconcile.
      const paidDelta = pkg ? updates.paidAmount - pkg.paidAmount : 0;
      if (pkg && paidDelta) {
        try {
          await logPackagePayment({ packageId: pkgId, patientId: pkg.patientId, amount: paidDelta, method: updates.paymentMethod ?? "" });
        } catch (logErr) {
          console.error("logPackagePayment failed for package", pkgId, logErr);
        }
      }
      const target  = Math.max(0, Math.floor(updates.paidAmount));
      const already = pkg?.pointsAwarded ?? 0;
      const delta   = target - already;
      if (delta > 0 && pkg) {
        try {
          await earnPoints(pkg.patientId, delta, {
            sourceType:  "package",
            sourceId:    pkgId,
            description: `${pkg.packageSize}-session package payment`,
          });
        } catch (pointsErr) {
          console.error("earnPoints failed for package", pkgId, pointsErr);
        }
      }
      payload.pointsAwarded = Math.max(target, already);
    }

    await updateDoc(doc(db, "patientPackages", pkgId), payload);
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
