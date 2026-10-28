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
  runTransaction,
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

export const labelFor = (list: readonly { value: string; label: string }[], value: string | undefined | null, fallback = "Unknown") =>
  list.find((o) => o.value === value)?.label ?? fallback;

// ─── Monthly expenses ─────────────────────────────────────────────────────────
// One record per (month, category) holding the total PAID that month, entered by
// the owner (often from their own spreadsheet). Doc id `${month}__${categoryId}`
// makes duplicates impossible. A missing record means "not entered" — never 0.
// Amounts are cash paid, not accrual-basis expenses or depreciation.

export interface ExpenseCategory {
  id:     string;                      // stable; labels can be renamed freely
  label:  string;
  kind:   "operating" | "capital";     // capital (e.g. equipment purchases) is kept out of operating results
  active: boolean;                     // inactive: hidden for new months, history kept
}

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  { id: "rent",                  label: "Rent",                              kind: "operating", active: true },
  { id: "salaries",              label: "Salaries and staff compensation",   kind: "operating", active: true },
  { id: "marketing",             label: "Marketing and advertising",         kind: "operating", active: true },
  { id: "utilities",             label: "Utilities and internet",            kind: "operating", active: true },
  { id: "equipment_purchase",    label: "Equipment purchases",               kind: "capital",   active: true },
  { id: "equipment_maintenance", label: "Equipment maintenance",             kind: "operating", active: true },
  { id: "consumables",           label: "Consumables and clinical supplies", kind: "operating", active: true },
  { id: "software",              label: "Software and subscriptions",        kind: "operating", active: true },
  { id: "other",                 label: "Other operating expenses",          kind: "operating", active: true },
];

export const expenseDocId = (month: string, categoryId: string) => `${month}__${categoryId}`;

export interface ExpenseHistoryEntry { amount: number; notes: string; changedAt: string; by: string; }

export interface MonthlyExpense {
  id:         string;
  month:      string;   // YYYY-MM
  categoryId: string;
  amount:     number;   // EGP paid that month; 0 = explicitly entered zero
  notes:      string;
  createdAt:  Timestamp | null;
  updatedAt:  Timestamp | null;
  createdBy:  string;
  updatedBy:  string;
  history:    ExpenseHistoryEntry[];   // previous values, oldest first
}

function docToMonthlyExpense(id: string, d: Record<string, unknown>): MonthlyExpense {
  return {
    id,
    month:      (d.month      as string) ?? "",
    categoryId: (d.categoryId as string) ?? "",
    amount:     Number(d.amount) || 0,
    notes:      (d.notes      as string) ?? "",
    createdAt:  (d.createdAt  as Timestamp | null) ?? null,
    updatedAt:  (d.updatedAt  as Timestamp | null) ?? null,
    createdBy:  (d.createdBy  as string) ?? "",
    updatedBy:  (d.updatedBy  as string) ?? "",
    history:    Array.isArray(d.history) ? (d.history as ExpenseHistoryEntry[]) : [],
  };
}

export function subscribeToMonthlyExpenses(
  fromMonth: string,
  onData: (rows: MonthlyExpense[]) => void,
  onError?: (err: Error) => void
): () => void {
  const q = query(collection(db, "clinicExpenses"), where("month", ">=", fromMonth));
  return onSnapshot(q, (s) => onData(s.docs.map((d) => docToMonthlyExpense(d.id, d.data()))), (e) => onError?.(e));
}

/** Old per-transaction entries (shape: date/category/amount) from before monthly totals. */
export interface LegacyExpense { id: string; date: string; category: string; amount: number; note: string; }
export function subscribeToLegacyExpenses(onData: (rows: LegacyExpense[]) => void, onError?: (err: Error) => void): () => void {
  const q = query(collection(db, "clinicExpenses"), where("date", ">=", ""));
  return onSnapshot(q, (s) => onData(s.docs.map((d) => {
    const x = d.data();
    return { id: d.id, date: (x.date as string) ?? "", category: (x.category as string) ?? "", amount: Number(x.amount) || 0, note: (x.note as string) ?? "" };
  })), (e) => onError?.(e));
}
export async function deleteLegacyExpense(id: string): Promise<{ error?: string }> {
  try { await deleteDoc(doc(db, "clinicExpenses", id)); return {}; }
  catch (err) { return { error: parseError(err) }; }
}

export interface ExpenseChange {
  month: string; categoryId: string;
  amount: number | null;          // null = clear (back to "not entered")
  notes: string;
  expectedUpdatedAtMs: number | null;   // what the editor saw; null = expected not to exist
}

/** Saves a set of month/category values atomically. Refuses if any record changed
 *  since the editor loaded it (someone else edited) so nothing is overwritten
 *  unseen. Previous values are appended to the record's history. */
export async function saveExpenseChanges(changes: ExpenseChange[], uid: string): Promise<{ error?: string }> {
  if (!changes.length) return {};
  for (const c of changes) {
    if (!/^\d{4}-\d{2}$/.test(c.month)) return { error: `Invalid month "${c.month}".` };
    if (c.amount !== null && !(Number.isFinite(c.amount) && c.amount >= 0)) return { error: `Invalid amount for ${c.categoryId} in ${c.month}.` };
  }
  try {
    await runTransaction(db, async (tx) => {
      const refs = changes.map((c) => doc(db, "clinicExpenses", expenseDocId(c.month, c.categoryId)));
      const snaps = await Promise.all(refs.map((r) => tx.get(r)));
      snaps.forEach((snap, i) => {
        const cur = snap.exists() ? docToMonthlyExpense(snap.id, snap.data()) : null;
        const curMs = cur?.updatedAt?.toMillis?.() ?? null;
        const exp = changes[i].expectedUpdatedAtMs;
        if ((exp === null && cur) || (exp !== null && curMs !== exp)) {
          throw new Error(`${changes[i].month} · ${changes[i].categoryId} was changed by someone else. Reload and try again.`);
        }
      });
      snaps.forEach((snap, i) => {
        const c = changes[i];
        const cur = snap.exists() ? docToMonthlyExpense(snap.id, snap.data()) : null;
        if (c.amount === null) { if (cur) tx.delete(refs[i]); return; }
        const history = cur ? [...cur.history, { amount: cur.amount, notes: cur.notes, changedAt: new Date().toISOString(), by: cur.updatedBy }].slice(-20) : [];
        tx.set(refs[i], {
          month: c.month, categoryId: c.categoryId, amount: c.amount, notes: c.notes.trim(),
          createdAt: cur ? cur.createdAt : serverTimestamp(), createdBy: cur ? cur.createdBy : uid,
          updatedAt: serverTimestamp(), updatedBy: uid, history,
        });
      });
    });
    return {};
  } catch (err) { return { error: parseError(err) }; }
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
  expenseCategories:    ExpenseCategory[];
  fixedCostsSource:     "recorded" | "manual"; // break-even fixed costs: avg of recorded months, or the manual figure
}

export const DEFAULT_BUSINESS_SETTINGS: BusinessSettings = {
  fixedMonthlyCosts: null, variableCostPerSession: null, variableIncludedInExpenses: false,
  targetMonthlyResult: null, minCashReserve: null, cashBalance: null, cashBalanceAsOf: "",
  morningStart: 9, morningEnd: 13, eveningStart: 15, eveningEnd: 22,
  closedWeekdays: [],
  targetUtilization: null, maxOwnerSharePct: null, monthsAtTarget: 3,
  expenseCategories: DEFAULT_EXPENSE_CATEGORIES, fixedCostsSource: "recorded",
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
