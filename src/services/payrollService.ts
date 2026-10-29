// FILE: src/services/payrollService.ts
// Manager-only salary data for the Staff tab. Attendance itself stays in the
// existing staffAttendance collection; this only adds what attendance can't hold.
//
//   staffPayroll/{physioId}                 { monthlySalary, updatedAt, updatedBy }
//   staffPayroll/{physioId}/months/{YYYY-MM} { expectedWorkingDays, marks, finalized, snapshot… }

import { doc, onSnapshot, setDoc, updateDoc, serverTimestamp, runTransaction, type Timestamp } from "firebase/firestore";
import { db } from "../firebase";
import type { DayMark, PayrollRules } from "../features/staff/payroll";

function parseError(err: unknown): string {
  const e = err as { message?: string };
  return e.message ?? "An unexpected error occurred.";
}

export interface StaffPay { monthlySalary: number | null; recoveryCommissionPct: number | null; updatedAt: Timestamp | null; }

export interface PayrollSnapshot {
  monthlySalary: number; expectedWorkingDays: number; rules: PayrollRules;
  totalCountedLateness: number; latenessDeduction: number; absenceDeduction: number;
  recoverySessions?: number; recoveryValue?: number; recoveryCommissionPct?: number | null; recoveryCommission?: number;
  net: number;   // salary − deductions + recovery commission
}

export interface PayrollMonth {
  expectedWorkingDays: number | null;
  marks: Record<string, DayMark>;    // "YYYY-MM-DD" → admin-confirmed status
  finalized: boolean;
  finalizedAt: Timestamp | null; finalizedBy: string;
  snapshot: PayrollSnapshot | null;  // figures as finalized (never silently overwritten)
}

const EMPTY_MONTH: PayrollMonth = { expectedWorkingDays: null, marks: {}, finalized: false, finalizedAt: null, finalizedBy: "", snapshot: null };

export function subscribeToStaffPay(physioId: string, onData: (p: StaffPay) => void, onError?: (e: Error) => void) {
  return onSnapshot(doc(db, "staffPayroll", physioId), (s) => {
    const d = s.exists() ? s.data() : {};
    onData({
      monthlySalary: typeof d.monthlySalary === "number" ? d.monthlySalary : null,
      recoveryCommissionPct: typeof d.recoveryCommissionPct === "number" ? d.recoveryCommissionPct : null,
      updatedAt: (d.updatedAt as Timestamp) ?? null,
    });
  }, (e) => onError?.(e));
}

export function subscribeToPayrollMonth(physioId: string, month: string, onData: (m: PayrollMonth) => void, onError?: (e: Error) => void) {
  return onSnapshot(doc(db, "staffPayroll", physioId, "months", month), (s) => {
    const d = s.exists() ? s.data() : {};
    onData({
      expectedWorkingDays: typeof d.expectedWorkingDays === "number" ? d.expectedWorkingDays : null,
      marks: (d.marks as Record<string, DayMark>) ?? {},
      finalized: !!d.finalized, finalizedAt: (d.finalizedAt as Timestamp) ?? null, finalizedBy: (d.finalizedBy as string) ?? "",
      snapshot: (d.snapshot as PayrollSnapshot) ?? null,
    });
  }, (e) => onError?.(e));
}

export async function saveMonthlySalary(physioId: string, monthlySalary: number, uid: string): Promise<{ error?: string }> {
  if (!(Number.isFinite(monthlySalary) && monthlySalary >= 0)) return { error: "Enter a valid salary (0 or more)." };
  try { await setDoc(doc(db, "staffPayroll", physioId), { monthlySalary, updatedAt: serverTimestamp(), updatedBy: uid }, { merge: true }); return {}; }
  catch (err) { return { error: parseError(err) }; }
}

export async function saveCommissionPct(physioId: string, pct: number | null, uid: string): Promise<{ error?: string }> {
  if (pct !== null && !(Number.isFinite(pct) && pct >= 0 && pct <= 100)) return { error: "Commission must be between 0 and 100%." };
  try { await setDoc(doc(db, "staffPayroll", physioId), { recoveryCommissionPct: pct, updatedAt: serverTimestamp(), updatedBy: uid }, { merge: true }); return {}; }
  catch (err) { return { error: parseError(err) }; }
}

/** Month inputs can't change once finalized (reopen first). */
async function editMonth(physioId: string, month: string, patch: Record<string, unknown>): Promise<{ error?: string }> {
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, "staffPayroll", physioId, "months", month);
      const snap = await tx.get(ref);
      if (snap.exists() && snap.data().finalized) throw new Error("This month is finalized. Reopen it before making changes.");
      tx.set(ref, { ...patch, updatedAt: serverTimestamp() }, { merge: true });
    });
    return {};
  } catch (err) { return { error: parseError(err) }; }
}

export function saveExpectedDays(physioId: string, month: string, days: number | null) {
  if (days !== null && !(Number.isInteger(days) && days > 0 && days <= 31)) return Promise.resolve({ error: "Expected working days must be a whole number from 1 to 31." });
  return editMonth(physioId, month, { expectedWorkingDays: days });
}

export async function setDayMark(physioId: string, month: string, date: string, mark: DayMark | null): Promise<{ error?: string }> {
  if (!date.startsWith(month)) return { error: "That date isn't in this month." };
  try {
    await runTransaction(db, async (tx) => {
      const ref = doc(db, "staffPayroll", physioId, "months", month);
      const snap = await tx.get(ref);
      if (snap.exists() && snap.data().finalized) throw new Error("This month is finalized. Reopen it before making changes.");
      const marks = { ...((snap.exists() ? snap.data().marks : {}) as Record<string, DayMark>) };
      if (mark) marks[date] = mark; else delete marks[date];
      tx.set(ref, { marks, updatedAt: serverTimestamp() }, { mergeFields: ["marks", "updatedAt"] });
    });
    return {};
  } catch (err) { return { error: parseError(err) }; }
}

export async function finalizeMonth(physioId: string, month: string, snapshot: PayrollSnapshot, uid: string): Promise<{ error?: string }> {
  return editMonth(physioId, month, { finalized: true, finalizedAt: serverTimestamp(), finalizedBy: uid, snapshot });
}

export async function reopenMonth(physioId: string, month: string): Promise<{ error?: string }> {
  try { await updateDoc(doc(db, "staffPayroll", physioId, "months", month), { finalized: false, updatedAt: serverTimestamp() }); return {}; }
  catch (err) { return { error: parseError(err) }; }
}

export { EMPTY_MONTH };
