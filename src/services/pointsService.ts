// FILE: src/services/pointsService.ts

import {
  collection,
  doc,
  query,
  where,
  onSnapshot,
  getDocs,
  updateDoc,
  runTransaction,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

// ─── Redemption tiers (mirrors functions/loyalty.js TIERS exactly) ────────────

export interface LoyaltyTier {
  points: number;
  value:  number; // EGP voucher value
}

export const LOYALTY_TIERS: LoyaltyTier[] = [
  { points: 1000,  value: 80   },
  { points: 2500,  value: 220  },
  { points: 5000,  value: 475  },
  { points: 7500,  value: 750  },
  { points: 10000, value: 1100 },
  { points: 15000, value: 1800 },
];

export const VOUCHER_SESSION_CAP = 200; // EGP — max a single voucher can knock off one session

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PatientPoints {
  balance:          number;
  lifetimeEarned:   number;
  lifetimeRedeemed: number;
  lifetimeExpired:  number;
  updatedAt:        Timestamp | null;
}

export const EMPTY_POINTS: PatientPoints = {
  balance: 0, lifetimeEarned: 0, lifetimeRedeemed: 0, lifetimeExpired: 0, updatedAt: null,
};

export interface PointsLedgerEntry {
  id:          string;
  patientId:   string;
  type:        "earn" | "redeem" | "expire" | "adjustment";
  points:      number; // signed: +earn/+credit, -redeem/-deduction/-expire
  sourceType:  string;
  sourceId:    string;
  description: string;
  createdAt:   Timestamp | null;
}

export interface PointsVoucher {
  id:                    string;
  patientId:             string;
  tier:                  number;
  pointsCost:            number;
  voucherValue:          number;
  code:                  string;
  status:                "active" | "applied" | "expired" | "voided";
  createdAt:             Timestamp | null;
  voucherExpiresAt:      Timestamp | null;
  appliedAt:             Timestamp | null;
  appliedAppointmentId:  string;
  appliedAmount:         number;
  voidedAt?:             Timestamp | null;
  voidedReason?:         string;
}

// ─── Error parser ─────────────────────────────────────────────────────────────

function parseError(err: unknown): string {
  const e = err as { message?: string };
  return e.message ?? "An unexpected error occurred.";
}

// ─── Converters ─────────────────────────────────────────────────────────────

function docToLedgerEntry(id: string, data: Record<string, unknown>): PointsLedgerEntry {
  return {
    id,
    patientId:   (data.patientId   as string) ?? "",
    type:        (data.type        as PointsLedgerEntry["type"]) ?? "earn",
    points:      (data.points      as number) ?? 0,
    sourceType:  (data.sourceType  as string) ?? "",
    sourceId:    (data.sourceId    as string) ?? "",
    description: (data.description as string) ?? "",
    createdAt:   (data.createdAt   as Timestamp | null) ?? null,
  };
}

function docToVoucher(id: string, data: Record<string, unknown>): PointsVoucher {
  return {
    id,
    patientId:            (data.patientId            as string)  ?? "",
    tier:                 (data.tier                 as number)  ?? 0,
    pointsCost:           (data.pointsCost            as number)  ?? 0,
    voucherValue:         (data.voucherValue          as number)  ?? 0,
    code:                 (data.code                  as string)  ?? "",
    status:               (data.status                as PointsVoucher["status"]) ?? "active",
    createdAt:            (data.createdAt             as Timestamp | null) ?? null,
    voucherExpiresAt:     (data.voucherExpiresAt       as Timestamp | null) ?? null,
    appliedAt:            (data.appliedAt              as Timestamp | null) ?? null,
    appliedAppointmentId: (data.appliedAppointmentId   as string)  ?? "",
    appliedAmount:        (data.appliedAmount          as number)  ?? 0,
    voidedAt:             (data.voidedAt               as Timestamp | null) ?? null,
    voidedReason:         (data.voidedReason           as string)  ?? "",
  };
}

// ─── Earn points (called only from priceService.ts, on the "paid" delta) ─────
// Runs as a client transaction — staff already have direct write access to
// billing data in this app's trust model, so this mirrors that (see
// firestore.rules: patientPoints/pointsLedger write is isManager()||isSecretary()).

export async function earnPoints(
  patientId: string,
  points:    number,
  source:    { sourceType: "session" | "package"; sourceId: string; description: string }
): Promise<void> {
  if (points <= 0 || !patientId) return;

  const pointsRef = doc(db, "patientPoints", patientId);
  const ledgerRef = doc(collection(db, "pointsLedger"));
  const now       = new Date();
  const expiresAt = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000); // ~12 months

  await runTransaction(db, async (tx) => {
    const snap    = await tx.get(pointsRef);
    const current = snap.exists() ? (snap.data() as Partial<PatientPoints>) : {};

    tx.set(pointsRef, {
      balance:          (current.balance ?? 0) + points,
      lifetimeEarned:   (current.lifetimeEarned ?? 0) + points,
      lifetimeRedeemed: current.lifetimeRedeemed ?? 0,
      lifetimeExpired:  current.lifetimeExpired ?? 0,
      updatedAt:        serverTimestamp(),
    });

    tx.set(ledgerRef, {
      patientId,
      type:        "earn",
      points,
      sourceType:  source.sourceType,
      sourceId:    source.sourceId,
      description: source.description,
      createdAt:   now,
      expiresAt,
      processed:   false,
    });
  });
}

// ─── Manual balance adjustment (manager-only, gated in the UI) ────────────────
// Same trust model as earnPoints — staff already have direct write access to
// these collections (see firestore.rules). Balance is clamped at 0; delta can
// be positive (credit) or negative (deduction).

export async function adjustPoints(
  patientId: string,
  delta:     number,
  reason:    string
): Promise<{ error?: string }> {
  if (!patientId || !delta) return {};
  try {
    const pointsRef = doc(db, "patientPoints", patientId);
    const ledgerRef = doc(collection(db, "pointsLedger"));

    await runTransaction(db, async (tx) => {
      const snap    = await tx.get(pointsRef);
      const current = snap.exists() ? (snap.data() as Partial<PatientPoints>) : {};
      const balance = Math.max(0, (current.balance ?? 0) + delta);

      tx.set(pointsRef, {
        balance,
        lifetimeEarned:   current.lifetimeEarned ?? 0,
        lifetimeRedeemed: current.lifetimeRedeemed ?? 0,
        lifetimeExpired:  current.lifetimeExpired ?? 0,
        updatedAt:        serverTimestamp(),
      });

      tx.set(ledgerRef, {
        patientId,
        type:        "adjustment",
        points:      delta,
        sourceType:  "manual",
        sourceId:    "",
        description: reason.trim() || (delta > 0 ? "Manual credit" : "Manual deduction"),
        createdAt:   new Date(),
      });
    });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Void a voucher (manager-only, gated in the UI) ───────────────────────────
// Soft delete — keeps the ledger's sourceId references and audit trail intact.
// `refund` is a per-voucher choice made by the manager at void time, not a
// fixed policy.

export async function voidVoucher(
  voucherId: string,
  options:   { refund: boolean; reason: string }
): Promise<{ error?: string }> {
  try {
    const voucherRef = doc(db, "pointsVouchers", voucherId);

    // Firestore transactions require all reads before any writes — resolve
    // both the voucher and (conditionally) the points doc up front.
    await runTransaction(db, async (tx) => {
      const voucherSnap = await tx.get(voucherRef);
      if (!voucherSnap.exists()) throw new Error("Voucher not found.");
      const voucher = docToVoucher(voucherSnap.id, voucherSnap.data());
      if (voucher.status === "voided") throw new Error("This voucher is already voided.");

      const shouldRefund = options.refund && voucher.pointsCost > 0;
      const pointsRef = shouldRefund ? doc(db, "patientPoints", voucher.patientId) : null;
      const pointsSnap = pointsRef ? await tx.get(pointsRef) : null;

      tx.update(voucherRef, {
        status:       "voided",
        voidedAt:     serverTimestamp(),
        voidedReason: options.reason.trim(),
      });

      if (pointsRef) {
        const current = pointsSnap?.exists() ? (pointsSnap.data() as Partial<PatientPoints>) : {};
        tx.set(pointsRef, {
          balance:          (current.balance ?? 0) + voucher.pointsCost,
          lifetimeEarned:   current.lifetimeEarned ?? 0,
          lifetimeRedeemed: current.lifetimeRedeemed ?? 0,
          lifetimeExpired:  current.lifetimeExpired ?? 0,
          updatedAt:        serverTimestamp(),
        });

        tx.set(doc(collection(db, "pointsLedger")), {
          patientId:   voucher.patientId,
          type:        "adjustment",
          points:      voucher.pointsCost,
          sourceType:  "voucher",
          sourceId:    voucherId,
          description: `Refund: voided voucher ${voucher.code}`,
          createdAt:   new Date(),
        });
      }
    });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Realtime: patient's points balance ───────────────────────────────────────

export function subscribeToPatientPoints(
  patientId: string,
  onData:    (points: PatientPoints) => void,
  onError?:  (err: Error) => void
): () => void {
  return onSnapshot(
    doc(db, "patientPoints", patientId),
    (snap) => onData(snap.exists() ? (snap.data() as PatientPoints) : EMPTY_POINTS),
    (err)  => onError?.(err)
  );
}

// ─── Realtime: ledger history ─────────────────────────────────────────────────

export function subscribeToPointsLedger(
  patientId: string,
  onData:    (entries: PointsLedgerEntry[]) => void,
  onError?:  (err: Error) => void
): () => void {
  const q = query(collection(db, "pointsLedger"), where("patientId", "==", patientId));
  return onSnapshot(
    q,
    (snap) => {
      const entries = snap.docs
        .map((d) => docToLedgerEntry(d.id, d.data()))
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      onData(entries);
    },
    (err) => onError?.(err)
  );
}

// ─── Realtime: vouchers ───────────────────────────────────────────────────────

export function subscribeToVouchers(
  patientId: string,
  onData:    (vouchers: PointsVoucher[]) => void,
  onError?:  (err: Error) => void
): () => void {
  const q = query(collection(db, "pointsVouchers"), where("patientId", "==", patientId));
  return onSnapshot(
    q,
    (snap) => {
      const vouchers = snap.docs
        .map((d) => docToVoucher(d.id, d.data()))
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      onData(vouchers);
    },
    (err) => onError?.(err)
  );
}

// ─── Redeem: patient converts points → voucher (Cloud Function) ──────────────
// Server-validated (balance check + transaction) since this is patient-initiated
// and money-equivalent — see functions/loyalty.js.

export async function redeemPoints(
  tierPoints: number
): Promise<{ voucher: PointsVoucher; error?: never } | { voucher?: never; error: string }> {
  try {
    const { getFunctions, httpsCallable } = await import("firebase/functions");
    const { default: app } = await import("../firebase");
    const functions = getFunctions(app);
    const redeem = httpsCallable(functions, "redeemLoyaltyPoints");
    const result = await redeem({ tierPoints });
    const data = result.data as { voucher: Record<string, unknown> & { id: string } };
    return { voucher: docToVoucher(data.voucher.id, data.voucher) };
  } catch (err) {
    return { error: parseError(err) };
  }
}

// ─── Voucher lookup + apply (staff, at checkout) ──────────────────────────────

export async function lookupVoucherByCode(
  patientId: string,
  code:      string
): Promise<{ voucher: PointsVoucher; error?: never } | { voucher?: never; error: string }> {
  try {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return { error: "Enter a voucher code." };

    const q = query(collection(db, "pointsVouchers"), where("patientId", "==", patientId));
    const snap = await getDocs(q);

    const match = snap.docs
      .map((d) => docToVoucher(d.id, d.data()))
      .find((v) => v.code === normalized);

    if (!match) return { error: "No voucher found with that code for this patient." };
    if (match.status !== "active") return { error: `This voucher has already been ${match.status}.` };
    if (match.voucherExpiresAt && match.voucherExpiresAt.toMillis() < Date.now()) {
      return { error: "This voucher has expired." };
    }
    return { voucher: match };
  } catch (err) {
    return { error: parseError(err) };
  }
}

export async function applyVoucher(
  voucherId:     string,
  appointmentId: string,
  appliedAmount: number
): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "pointsVouchers", voucherId), {
      status:               "applied",
      appliedAt:            serverTimestamp(),
      appliedAppointmentId: appointmentId,
      appliedAmount,
    });
    return {};
  } catch (err) {
    return { error: parseError(err) };
  }
}
