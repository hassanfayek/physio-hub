// FILE: src/services/businessService.ts
// Data capture for Business Analytics: clinic expenses, package payment log,
// and the owner's configurable assumptions/targets. All manager-only except
// the package payment log, which any role that edits packages writes to.

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  setDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  type Timestamp,
} from "firebase/firestore";
import { db } from "../firebase";

function parseError(err: unknown): string {
  const e = err as { message?: string };
  return e.message ?? "An unexpected error occurred.";
}

// Clinic-local "today" (dates/hours across the app are stored as Cairo-local strings).
export const CLINIC_TIMEZONE = "Africa/Cairo";
export function clinicToday(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

// Data-capture start dates — analytics flag anything before these as "not tracked".
export const NO_SHOW_TRACKING_SINCE     = "2026-10-27";
export const PAYMENT_LOG_TRACKING_SINCE = "2026-10-27";

// ─── Shared option lists ──────────────────────────────────────────────────────

export const PAYMENT_METHODS = [
  { value: "cash",     label: "Cash" },
  { value: "card",     label: "Card" },
  { value: "transfer", label: "Bank transfer" },
  { value: "wallet",   label: "Mobile wallet" },
] as const;

export const ACQUISITION_SOURCES = [
  { value: "clinic_instagram",   label: "Clinic Instagram" },
  { value: "personal_instagram", label: "Personal Instagram" },
  { value: "meta_ads",           label: "Meta Ads" },
  { value: "google",             label: "Google" },
  { value: "doctor_referral",    label: "Doctor referral" },
  { value: "gym",                label: "Gym" },
  { value: "sports_academy",     label: "Sports academy" },
  { value: "existing_patient",   label: "Existing patient" },
  { value: "other",              label: "Other" },
] as const;

export const EXPENSE_CATEGORIES = [
  { value: "rent",        label: "Rent" },
  { value: "salaries",    label: "Salaries & wages" },
  { value: "utilities",   label: "Utilities" },
  { value: "supplies",    label: "Supplies & consumables" },
  { value: "equipment",   label: "Equipment" },
  { value: "marketing",   label: "Marketing" },
  { value: "maintenance", label: "Maintenance" },
  { value: "software",    label: "Software & subscriptions" },
  { value: "other",       label: "Other" },
] as const;

export const labelFor = (list: readonly { value: string; label: string }[], value: string | undefined | null, fallback = "Unknown") =>
  list.find((o) => o.value === value)?.label ?? fallback;

// ─── Expenses ─────────────────────────────────────────────────────────────────

export interface Expense {
  id:              string;
  date:            string;   // YYYY-MM-DD
  category:        string;   // EXPENSE_CATEGORIES value
  amount:          number;   // EGP, positive
  note:            string;
  marketingSource: string;   // ACQUISITION_SOURCES value, only for category "marketing"
  createdAt:       Timestamp | null;
}

function docToExpense(id: string, d: Record<string, unknown>): Expense {
  return {
    id,
    date:            (d.date            as string) ?? "",
    category:        (d.category        as string) ?? "other",
    amount:          (d.amount          as number) ?? 0,
    note:            (d.note            as string) ?? "",
    marketingSource: (d.marketingSource as string) ?? "",
    createdAt:       (d.createdAt       as Timestamp | null) ?? null,
  };
}

export function subscribeToExpenses(
  from: string, to: string,
  onData: (rows: Expense[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(collection(db, "clinicExpenses"), where("date", ">=", from), where("date", "<=", to), orderBy("date", "desc"));
  return onSnapshot(q, (s) => onData(s.docs.map((d) => docToExpense(d.id, d.data()))), (e) => onError?.(e));
}

export async function addExpense(e: Omit<Expense, "id" | "createdAt">): Promise<{ error?: string }> {
  try {
    if (!(e.amount > 0)) return { error: "Amount must be greater than zero." };
    await addDoc(collection(db, "clinicExpenses"), { ...e, createdAt: serverTimestamp() });
    return {};
  } catch (err) { return { error: parseError(err) }; }
}

export async function updateExpense(id: string, e: Partial<Omit<Expense, "id" | "createdAt">>): Promise<{ error?: string }> {
  try {
    await updateDoc(doc(db, "clinicExpenses", id), { ...e, updatedAt: serverTimestamp() });
    return {};
  } catch (err) { return { error: parseError(err) }; }
}

export async function deleteExpense(id: string): Promise<{ error?: string }> {
  try { await deleteDoc(doc(db, "clinicExpenses", id)); return {}; }
  catch (err) { return { error: parseError(err) }; }
}

// ─── Package payment log ──────────────────────────────────────────────────────
// Packages only store a running paidAmount, so each change is logged here with
// its date. A negative amount is a correction, so totals always reconcile.

export interface PackagePayment {
  id:        string;
  packageId: string;
  patientId: string;
  amount:    number;   // signed EGP delta of paidAmount
  date:      string;   // clinic-local YYYY-MM-DD
  method:    string;   // PAYMENT_METHODS value or ""
  createdAt: Timestamp | null;
}

export async function logPackagePayment(p: Omit<PackagePayment, "id" | "createdAt" | "date"> & { date?: string }): Promise<void> {
  if (!p.amount) return;
  await addDoc(collection(db, "packagePayments"), {
    ...p,
    date:      p.date ?? clinicToday(),
    createdAt: serverTimestamp(),
  });
}

export function subscribeToPackagePayments(
  from: string, to: string,
  onData: (rows: PackagePayment[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(collection(db, "packagePayments"), where("date", ">=", from), where("date", "<=", to));
  return onSnapshot(q, (s) => onData(s.docs.map((d) => {
    const x = d.data();
    return {
      id: d.id,
      packageId: (x.packageId as string) ?? "",
      patientId: (x.patientId as string) ?? "",
      amount:    (x.amount    as number) ?? 0,
      date:      (x.date      as string) ?? "",
      method:    (x.method    as string) ?? "",
      createdAt: (x.createdAt as Timestamp | null) ?? null,
    };
  })), (e) => onError?.(e));
}

// ─── Owner assumptions & targets ──────────────────────────────────────────────
// Everything here is a user-entered estimate, never a recorded transaction.
// null = not configured (analytics show "not set" instead of assuming 0).

export interface BusinessSettings {
  fixedMonthlyCosts:          number | null;
  variableCostPerSession:     number | null;
  // true when recorded expenses already include per-session variable costs
  // (consumables etc.) — break-even then skips the estimate to avoid double counting.
  variableIncludedInExpenses: boolean;
  targetMonthlyResult:        number | null;
  minCashReserve:             number | null;
  cashBalance:                number | null;
  cashBalanceAsOf:            string;
  morningStart: number; morningEnd: number;   // hour range [start, end)
  eveningStart: number; eveningEnd: number;
  closedWeekdays: number[];                    // 0 = Sun … 6 = Sat; drives operating days & capacity
  // Expansion thresholds (owner-set; null = criterion shows "not set")
  targetUtilization:    number | null;         // 0–100 %
  maxOwnerSharePct:     number | null;         // 0–100 % of completed sessions treated by the owner
  monthsAtTarget:       number;                // consecutive full months required
}

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  fixedMonthlyCosts: null, variableCostPerSession: null, variableIncludedInExpenses: false,
  targetMonthlyResult: null, minCashReserve: null, cashBalance: null, cashBalanceAsOf: "",
  morningStart: 9, morningEnd: 13, eveningStart: 15, eveningEnd: 22,
  closedWeekdays: [],
  targetUtilization: null, maxOwnerSharePct: null, monthsAtTarget: 3,
};

export function subscribeToBusinessSettings(
  onData: (s: BusinessSettings) => void,
  onError?: (err: Error) => void
): () => void {
  return onSnapshot(doc(db, "businessSettings", "main"),
    (s) => onData({ ...DEFAULT_BUSINESS_SETTINGS, ...(s.exists() ? (s.data() as Partial<BusinessSettings>) : {}) }),
    (e) => onError?.(e));
}

export async function saveBusinessSettings(s: BusinessSettings): Promise<{ error?: string }> {
  try {
    await setDoc(doc(db, "businessSettings", "main"), { ...s, updatedAt: serverTimestamp() }, { merge: true });
    return {};
  } catch (err) { return { error: parseError(err) }; }
}

// ─── Inquiries (leads) ────────────────────────────────────────────────────────
// Logged by the front desk when someone asks about treatment. Name/phone are
// optional and restricted to manager + secretary.

export const LEAD_STATUSES = [
  { value: "new",               label: "New inquiry" },
  { value: "assessment_booked", label: "Assessment booked" },
  { value: "converted",         label: "Became a patient" },
  { value: "not_interested",    label: "Not interested" },
] as const;

export interface Lead {
  id:        string;
  date:      string;   // clinic-local YYYY-MM-DD of the inquiry
  source:    string;   // ACQUISITION_SOURCES value or ""
  name:      string;
  phone:     string;
  note:      string;
  status:    string;   // LEAD_STATUSES value
  patientId: string;   // linked patient once they register
  createdAt: Timestamp | null;
}

export function docToLead(id: string, d: Record<string, unknown>): Lead {
  return {
    id,
    date:      (d.date      as string) ?? "",
    source:    (d.source    as string) ?? "",
    name:      (d.name      as string) ?? "",
    phone:     (d.phone     as string) ?? "",
    note:      (d.note      as string) ?? "",
    status:    (d.status    as string) ?? "new",
    patientId: (d.patientId as string) ?? "",
    createdAt: (d.createdAt as Timestamp | null) ?? null,
  };
}

export function subscribeToLeads(from: string, onData: (rows: Lead[]) => void, onError?: (err: Error) => void): () => void {
  const q = query(collection(db, "leads"), where("date", ">=", from), orderBy("date", "desc"));
  return onSnapshot(q, (s) => onData(s.docs.map((d) => docToLead(d.id, d.data()))), (e) => onError?.(e));
}

export async function addLead(l: Omit<Lead, "id" | "createdAt">): Promise<{ error?: string }> {
  try { await addDoc(collection(db, "leads"), { ...l, createdAt: serverTimestamp() }); return {}; }
  catch (err) { return { error: parseError(err) }; }
}

export async function updateLead(id: string, l: Partial<Omit<Lead, "id" | "createdAt">>): Promise<{ error?: string }> {
  try { await updateDoc(doc(db, "leads", id), { ...l, updatedAt: serverTimestamp() }); return {}; }
  catch (err) { return { error: parseError(err) }; }
}

export async function deleteLead(id: string): Promise<{ error?: string }> {
  try { await deleteDoc(doc(db, "leads", id)); return {}; }
  catch (err) { return { error: parseError(err) }; }
}

// ─── Follow-up review (administrative, never clinical) ────────────────────────
// Stored on the patient doc. `reviewedFor` is the last-session date the review
// applies to, so a new completed session automatically re-opens the item.

export const FOLLOW_UP_OUTCOMES = [
  { value: "contacted",          label: "Contacted" },
  { value: "treatment_complete", label: "Treatment complete / discharged" },
  { value: "paused",             label: "Paused on purpose" },
  { value: "no_action",          label: "No action needed" },
] as const;

export interface FollowUp { outcome: string; note: string; reviewedFor: string; reviewedAt: string; }

export async function setPatientFollowUp(patientId: string, f: FollowUp): Promise<{ error?: string }> {
  try { await updateDoc(doc(db, "patients", patientId), { followUp: f }); return {}; }
  catch (err) { return { error: parseError(err) }; }
}
