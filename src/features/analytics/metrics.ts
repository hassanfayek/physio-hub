// FILE: src/features/analytics/metrics.ts
// Pure calculations for Business Analytics — no Firestore, no React, so every
// formula is unit-tested (metrics.test.ts). All dates are clinic-local
// "YYYY-MM-DD" strings and hours are clinic-local 0–23, exactly as stored.

// ─── Normalised inputs ────────────────────────────────────────────────────────

export type ApptStatus = "scheduled" | "in_progress" | "completed" | "cancelled" | "rescheduled" | "no_show";

export interface AAppt {
  id: string; patientId: string; physioId: string; physioName: string;
  date: string; hour: number; sessionType: string; status: ApptStatus;
}
export interface APrice {
  id: string; patientId: string; appointmentId: string; date: string; sessionType: string;
  amount: number; paid: boolean; paidDate: string; packageId: string; paymentMethod: string;
}
export interface APackage {
  id: string; patientId: string; packageSize: number; pricePerSession: number;
  totalAmount: number; paidAmount: number; startDate: string; sessionsUsed: number; active: boolean;
}
export interface APkgPayment { id: string; packageId: string; amount: number; date: string; method: string; }
/** One owner-entered monthly total: amount PAID in a category during a calendar month. */
export interface AMonthlyExpense { month: string; categoryId: string; amount: number; }
export interface ACategory { id: string; label: string; kind: "operating" | "capital"; active: boolean; }
export interface APatient {
  uid: string; name: string; createdDate: string; status: string; acquisitionSource: string; referredByPhysicianId: string;
  followUpReviewedFor?: string;   // last-session date an administrative follow-up decision was recorded for
}
export interface Capacity { openingHour: number; closingHour: number; maxPerHour: number; closedWeekdays: number[]; }
export interface Range { from: string; to: string; }

// ─── Date helpers (string math in UTC — immune to DST / local TZ) ─────────────

const toUTC = (d: string) => { const [y, m, day] = d.split("-").map(Number); return Date.UTC(y, m - 1, day); };
const fromUTC = (t: number) => new Date(t).toISOString().slice(0, 10);
export const addDays = (d: string, n: number) => fromUTC(toUTC(d) + n * 86_400_000);
export const daysBetween = (a: string, b: string) => Math.round((toUTC(b) - toUTC(a)) / 86_400_000);
export const weekday = (d: string) => new Date(toUTC(d)).getUTCDay();   // 0 = Sun
export const inRange = (d: string, r: Range) => !!d && d >= r.from && d <= r.to;
export const monthKey = (d: string) => d.slice(0, 7);
const daysInMonth = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };

/** The same-length period immediately before `r`. */
export function previousRange(r: Range): Range {
  const len = daysBetween(r.from, r.to) + 1;
  return { from: addDays(r.from, -len), to: addDays(r.from, -1) };
}

export type PresetKey = "week" | "30d" | "month" | "prevMonth" | "custom";

/** Period + the comparison period for a preset. "This month" is month-to-date,
 *  compared with the same days of last month (clamped to its length). */
export function presetRanges(key: PresetKey, today: string, custom?: Range): { cur: Range; prev: Range } {
  if (key === "week") {
    const wd = weekday(today); const monday = addDays(today, wd === 0 ? -6 : 1 - wd);
    const cur = { from: monday, to: today };
    return { cur, prev: { from: addDays(monday, -7), to: addDays(today, -7) } };
  }
  if (key === "30d") { const cur = { from: addDays(today, -29), to: today }; return { cur, prev: previousRange(cur) }; }
  const ym = monthKey(today);
  const [y, m] = ym.split("-").map(Number);
  const prevYm = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
  if (key === "month") {
    const cur = { from: `${ym}-01`, to: today };
    const dom = Math.min(Number(today.slice(8, 10)), daysInMonth(prevYm));
    return { cur, prev: { from: `${prevYm}-01`, to: `${prevYm}-${String(dom).padStart(2, "0")}` } };
  }
  if (key === "prevMonth") {
    const cur = { from: `${prevYm}-01`, to: `${prevYm}-${String(daysInMonth(prevYm)).padStart(2, "0")}` };
    const [py, pm] = prevYm.split("-").map(Number);
    const pp = pm === 1 ? `${py - 1}-12` : `${py}-${String(pm - 1).padStart(2, "0")}`;
    return { cur, prev: { from: `${pp}-01`, to: `${pp}-${String(daysInMonth(pp)).padStart(2, "0")}` } };
  }
  const cur = custom && custom.from <= custom.to ? custom : { from: today, to: today };
  return { cur, prev: previousRange(cur) };
}

/** Days in `r` the clinic is open (excludes configured closed weekdays). */
export function operatingDays(r: Range, closedWeekdays: number[]): number {
  let n = 0;
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) if (!closedWeekdays.includes(weekday(d))) n++;
  return n;
}

// ─── Small utils ──────────────────────────────────────────────────────────────

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
/** a / b, or null when the denominator is 0 (UI shows "—", never a fake 0%). */
export const ratio = (a: number, b: number): number | null => (b > 0 ? a / b : null);
export function pctChange(cur: number | null, prev: number | null): number | null {
  if (cur === null || prev === null || prev === 0) return null;
  return (cur - prev) / Math.abs(prev);
}
export const isAssessment = (sessionType: string) => /assessment/i.test(sessionType);
function groupSum<T>(rows: T[], key: (r: T) => string, val: (r: T) => number): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) { const k = key(r); out[k] = (out[k] ?? 0) + val(r); }
  return out;
}
export function dedupeById<T extends { id: string }>(rows: T[]): T[] {
  const m = new Map<string, T>(); rows.forEach((r) => m.set(r.id, r)); return [...m.values()];
}

// ─── Appointments ─────────────────────────────────────────────────────────────
// "Booked" = appointments dated in the period, excluding "rescheduled" (the
// moved booking exists as its own appointment, so counting both double-counts).
// Only "completed" counts as a delivered session — in-progress, cancelled and
// no-show never inflate session counts.

export interface ApptStats {
  booked: number; completed: number; cancelled: number; noShow: number; open: number;
  cancellationRate: number | null;
  noShowRate: number | null;          // only over appointments since no-show tracking began
  noShowTrackedFully: boolean;
  uniquePatients: number;
  assessmentsBooked: number; assessmentsAttended: number; assessmentAttendanceRate: number | null;
}

export function apptStats(appts: AAppt[], r: Range, noShowSince: string): ApptStats {
  const inP = appts.filter((a) => inRange(a.date, r) && a.status !== "rescheduled");
  const completed = inP.filter((a) => a.status === "completed");
  const cancelled = inP.filter((a) => a.status === "cancelled").length;
  const tracked = inP.filter((a) => a.date >= noShowSince);
  const noShow = tracked.filter((a) => a.status === "no_show").length;
  const assess = inP.filter((a) => isAssessment(a.sessionType));
  const assessDone = assess.filter((a) => a.status === "completed").length;
  return {
    booked: inP.length,
    completed: completed.length,
    cancelled,
    noShow,
    open: inP.filter((a) => a.status === "scheduled" || a.status === "in_progress").length,
    cancellationRate: ratio(cancelled, inP.length),
    noShowRate: ratio(noShow, tracked.length),
    noShowTrackedFully: r.from >= noShowSince,
    uniquePatients: new Set(completed.map((a) => a.patientId).filter(Boolean)).size,
    assessmentsBooked: assess.length,
    assessmentsAttended: assessDone,
    assessmentAttendanceRate: ratio(assessDone, assess.length),
  };
}

// ─── Money ────────────────────────────────────────────────────────────────────

export type EstimateReason = "package_legacy" | "session_no_paid_date";
export interface CashLine {
  date: string; amount: number; method: string; kind: "session" | "package";
  /** Set when the real payment date is unknown and `date` is a stand-in. */
  estimated: EstimateReason | null;
  /** Counted on a date set by the owner's rule (older package money → first session), not a recorded date. */
  assumed?: "first_session";
  sourceId: string; patientId: string;
}

/** Cash actually received.
 *  - Pay-per-session: paid, non-package price records, on their recorded paid date.
 *    (Package-linked price records are excluded — that money arrives via the package.)
 *    Paid with no paid date → the session date is used as a stand-in, flagged estimated.
 *  - Packages: each logged payment on its date (verified). Money paid before the log
 *    existed (paidAmount − Σ logged) has no recorded date. With the owner's rule
 *    `legacyAtFirstSession`, it counts as paid on the package's first session; otherwise
 *    (or if the package has no session yet) it's placed on the first session / start date
 *    as a stand-in and flagged estimated. */
export function cashLines(prices: APrice[], pkgs: APackage[], pkgPayments: APkgPayment[], firstSessionByPkg: Record<string, string> = {}, opts: { legacyAtFirstSession?: boolean } = {}): CashLine[] {
  const lines: CashLine[] = [];
  for (const p of prices) {
    if (p.packageId || !p.paid || !(p.amount > 0)) continue;
    lines.push({ date: p.paidDate || p.date, amount: p.amount, method: p.paymentMethod, kind: "session",
      estimated: p.paidDate ? null : "session_no_paid_date", sourceId: p.id, patientId: p.patientId });
  }
  const patientOfPkg = new Map(pkgs.map((k) => [k.id, k.patientId] as const));
  const logged = groupSum(pkgPayments, (x) => x.packageId, (x) => x.amount);
  for (const x of pkgPayments) lines.push({ date: x.date, amount: x.amount, method: x.method, kind: "package", estimated: null, sourceId: x.packageId, patientId: patientOfPkg.get(x.packageId) ?? "" });
  for (const k of pkgs) {
    const legacy = (k.paidAmount || 0) - (logged[k.id] ?? 0);
    if (!(legacy > 0.0001)) continue;
    const first = firstSessionByPkg[k.id];
    if (opts.legacyAtFirstSession && first) {
      lines.push({ date: first, amount: legacy, method: "", kind: "package", estimated: null, assumed: "first_session", sourceId: k.id, patientId: k.patientId });
    } else {
      lines.push({ date: first || k.startDate, amount: legacy, method: "", kind: "package", estimated: "package_legacy", sourceId: k.id, patientId: k.patientId });
    }
  }
  return lines;
}

/** Date of each package's first recorded session (earliest linked price record). */
export function firstSessionByPackage(pkgPrices: APrice[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of pkgPrices) if (p.packageId && p.date && (!out[p.packageId] || p.date < out[p.packageId])) out[p.packageId] = p.date;
  return out;
}

export interface AmountCount { amount: number; count: number; }
export interface CashStats {
  verified: number;            // payments counted in the period: recorded dates + the owner's first-session rule
  estimated: number;           // payments whose real date is unknown, placed in the period by a stand-in date
  total: number;               // verified + estimated (only ever shown labelled)
  sessions: number; packages: number;                       // verified, by kind
  estimatedPackages: AmountCount; estimatedSessions: AmountCount;
  assumedPackages: AmountCount;                             // older package money counted on its first session (owner's rule)
  methodMissing: AmountCount;                               // all payments in the period with no payment method
  byMethod: Record<string, number>;                         // all payments ("" = not recorded)
  estimatedLines: CashLine[];                               // the records behind `estimated`, for drill-down
}
export function cashStats(lines: CashLine[], r: Range): CashStats {
  const inP = lines.filter((l) => inRange(l.date, r));
  const ver = inP.filter((l) => !l.estimated);
  const est = inP.filter((l) => l.estimated);
  const ac = (xs: CashLine[]): AmountCount => ({ amount: sum(xs.map((l) => l.amount)), count: xs.length });
  return {
    verified: sum(ver.map((l) => l.amount)),
    estimated: sum(est.map((l) => l.amount)),
    total: sum(inP.map((l) => l.amount)),
    sessions: sum(ver.filter((l) => l.kind === "session").map((l) => l.amount)),
    packages: sum(ver.filter((l) => l.kind === "package").map((l) => l.amount)),
    estimatedPackages: ac(est.filter((l) => l.estimated === "package_legacy")),
    estimatedSessions: ac(est.filter((l) => l.estimated === "session_no_paid_date")),
    assumedPackages: ac(ver.filter((l) => l.assumed === "first_session")),
    methodMissing: ac(inP.filter((l) => !l.method && l.amount > 0)),
    byMethod: groupSum(inP, (l) => l.method || "", (l) => l.amount),
    estimatedLines: [...est].sort((a, b) => b.amount - a.amount),
  };
}

// ─── Data-quality issues (per selected period) ────────────────────────────────
// Each issue is computed from the records the metrics actually use; null means
// it doesn't affect the period (or has been resolved for every relevant record).

export interface NoShowCoverage { untracked: number; tracked: number; }
/** Booked (non-rescheduled) appointments in `r` dated before / since no-show tracking began. */
export function noShowCoverage(appts: AAppt[], r: Range, since: string): NoShowCoverage {
  const inP = appts.filter((a) => inRange(a.date, r) && a.status !== "rescheduled");
  return { untracked: inP.filter((a) => a.date < since).length, tracked: inP.filter((a) => a.date >= since).length };
}

export interface DataQuality {
  paymentDates:   { cur: CashStats; prev: CashStats } | null;
  paymentMethods: { cur: AmountCount; prev: AmountCount } | null;
  noShow:         { cur: NoShowCoverage; prev: NoShowCoverage } | null;
}
export function dataQuality(cur: CashStats, prev: CashStats, curNS: NoShowCoverage, prevNS: NoShowCoverage): DataQuality {
  return {
    paymentDates:   cur.estimated > 0 || prev.estimated > 0 ? { cur, prev } : null,
    paymentMethods: cur.methodMissing.count > 0 || prev.methodMissing.count > 0 ? { cur: cur.methodMissing, prev: prev.methodMissing } : null,
    noShow:         curNS.untracked > 0 || prevNS.untracked > 0 ? { cur: curNS, prev: prevNS } : null,
  };
}

/** Earned (recognised) revenue: value of sessions actually delivered in the period —
 *  completed appointments × their price record (package sessions are priced at the
 *  package's per-session rate). Completed sessions with no price record are counted
 *  separately as "unpriced", never assumed to be 0. */
export interface EarnedStats {
  total: number; pricedSessions: number; unpricedSessions: number; packageRedemptions: number; packageRedemptionValue: number;
  avgPerSession: number | null;
  byServiceType: Record<string, number>; byPhysio: Record<string, number>; physioNames: Record<string, string>;
}
export function earnedStats(appts: AAppt[], prices: APrice[], r: Range): EarnedStats {
  const priceByAppt = new Map<string, APrice>();
  prices.forEach((p) => { if (p.appointmentId) priceByAppt.set(p.appointmentId, p); });
  let total = 0, priced = 0, unpriced = 0, redemptions = 0, redemptionValue = 0;
  const byService: Record<string, number> = {}, byPhysio: Record<string, number> = {}, names: Record<string, string> = {};
  for (const a of appts) {
    if (a.status !== "completed" || !inRange(a.date, r)) continue;
    const p = priceByAppt.get(a.id);
    if (!p) { unpriced++; continue; }
    priced++; total += p.amount;
    if (p.packageId) { redemptions++; redemptionValue += p.amount; }
    const st = a.sessionType || "Unspecified";
    byService[st] = (byService[st] ?? 0) + p.amount;
    const pk = a.physioId || "unknown";
    byPhysio[pk] = (byPhysio[pk] ?? 0) + p.amount;
    names[pk] = a.physioName || "Unknown";
  }
  return { total, pricedSessions: priced, unpricedSessions: unpriced, packageRedemptions: redemptions, packageRedemptionValue: redemptionValue,
    avgPerSession: ratio(total, priced), byServiceType: byService, byPhysio, physioNames: names };
}

// ─── Monthly expenses ─────────────────────────────────────────────────────────
// Expenses are monthly totals, so they only line up with periods made of whole
// calendar months. They are never prorated, and a missing entry is "not entered",
// never 0.

/** Months (YYYY-MM) a range touches. */
export function monthsInRange(r: Range): string[] {
  const out: string[] = [];
  let m = monthKey(r.from);
  const last = monthKey(r.to);
  while (m <= last) {
    out.push(m);
    const [y, mo] = m.split("-").map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  }
  return out;
}

/** True when `r` starts on the 1st and ends on the last day of a month. */
export function isWholeMonths(r: Range): boolean {
  return r.from.slice(8) === "01" && Number(r.to.slice(8)) === daysInMonth(monthKey(r.to));
}

export interface MonthCoverage { month: string; entered: number; required: number; complete: boolean; missing: string[]; }

/** Coverage for one month: every currently-active category needs an entry (0 counts). */
export function monthCoverage(entries: AMonthlyExpense[], cats: ACategory[], month: string): MonthCoverage {
  const have = new Set(entries.filter((e) => e.month === month).map((e) => e.categoryId));
  const required = cats.filter((c) => c.active);
  const missing = required.filter((c) => !have.has(c.id)).map((c) => c.id);
  return { month, entered: required.length - missing.length, required: required.length, complete: required.length > 0 && missing.length === 0, missing };
}

export interface ExpensePeriod {
  wholeMonths: boolean;   // the range is exactly whole calendar months
  months: string[];       // months the range touches
  anyEntered: boolean;
  complete: boolean;      // whole months AND every month fully covered
  operating: number;      // operating categories (everything except capital)
  capital: number;        // e.g. equipment purchases, kept out of operating results
  total: number;
  marketing: number;      // the "marketing" category (blended across channels)
  byCategory: Record<string, number>;
  coverage: MonthCoverage[];
}

export function expensesForRange(entries: AMonthlyExpense[], cats: ACategory[], r: Range): ExpensePeriod {
  const months = monthsInRange(r);
  const inP = entries.filter((e) => months.includes(e.month));
  const kind = new Map(cats.map((c) => [c.id, c.kind] as const));
  const capital = sum(inP.filter((e) => kind.get(e.categoryId) === "capital").map((e) => e.amount));
  const total = sum(inP.map((e) => e.amount));
  const coverage = months.map((m) => monthCoverage(entries, cats, m));
  const wholeMonths = isWholeMonths(r);
  return {
    wholeMonths, months, anyEntered: inP.length > 0,
    complete: wholeMonths && coverage.every((c) => c.complete),
    operating: total - capital, capital, total,
    marketing: sum(inP.filter((e) => e.categoryId === "marketing").map((e) => e.amount)),
    byCategory: groupSum(inP, (e) => e.categoryId, (e) => e.amount),
    coverage,
  };
}

/** Why an expense-based figure can't be shown for a period, or null if it can. */
export function expenseGap(e: ExpensePeriod): string | null {
  if (!e.wholeMonths) return "Expenses are monthly totals. Select a whole month to compare.";
  const inc = e.coverage.filter((c) => !c.complete);
  if (inc.length === 0) return null;
  return inc.every((c) => c.entered === 0)
    ? `Expenses not entered for ${inc.map((c) => c.month).join(", ")}.`
    : `Incomplete expense data: ${inc.map((c) => `${c.month} (${c.entered} of ${c.required})`).join(", ")}.`;
}

/** Average operating expenses over the most recent complete months strictly before `beforeMonth`. */
export function recordedFixedCosts(entries: AMonthlyExpense[], cats: ACategory[], beforeMonth: string, maxMonths = 3) {
  const months = [...new Set(entries.map((e) => e.month))].filter((m) => m < beforeMonth).sort().reverse();
  const used: string[] = [];
  for (const m of months) {
    if (used.length >= maxMonths) break;
    if (monthCoverage(entries, cats, m).complete) used.push(m);
  }
  if (!used.length) return { average: null as number | null, months: used };
  const totals = used.map((m) => expensesForRange(entries, cats, { from: `${m}-01`, to: `${m}-${String(daysInMonth(m)).padStart(2, "0")}` }).operating);
  return { average: sum(totals) / totals.length, months: used };
}

/** Money still owed to the clinic: unpaid pay-per-session charges + unpaid package balances. */
export function outstanding(unpaidPrices: APrice[], pkgs: APackage[]) {
  const sessions = sum(unpaidPrices.filter((p) => !p.packageId && !p.paid).map((p) => p.amount));
  const packages = sum(pkgs.map((k) => Math.max(0, (k.totalAmount || 0) - (k.paidAmount || 0))));
  return { sessions, packages, total: sessions + packages };
}

/** Treatment still owed to patients in active packages (the clinic's obligation). */
export function packageObligations(pkgs: APackage[]) {
  const act = pkgs.filter((k) => k.active);
  const remaining = act.map((k) => Math.max(0, k.packageSize - k.sessionsUsed));
  return {
    activePackages: act.length,
    remainingSessions: sum(remaining),
    remainingValue: sum(act.map((k, i) => remaining[i] * (k.pricePerSession || 0))),
    avgUtilization: ratio(sum(act.map((k) => Math.min(1, k.sessionsUsed / Math.max(1, k.packageSize)))), act.length),
  };
}

export function packageSales(pkgs: APackage[], r: Range) {
  const inP = pkgs.filter((k) => inRange(k.startDate, r));
  return { count: inP.length, value: sum(inP.map((k) => k.totalAmount)), sessions: sum(inP.map((k) => k.packageSize)) };
}

// ─── Break-even ───────────────────────────────────────────────────────────────

export interface BreakEvenInput {
  fixedMonthlyCosts: number | null;
  variableCostPerSession: number | null;
  variableIncludedInExpenses: boolean;
  avgRevenuePerSession: number | null;
  operatingDaysInMonth: number;
}
export type BreakEven =
  | { ok: true; contribution: number; sessionsPerMonth: number; sessionsPerDay: number | null; variableUsed: number }
  | { ok: false; reason: string };

export function breakEven(i: BreakEvenInput): BreakEven {
  if (i.fixedMonthlyCosts === null || !(i.fixedMonthlyCosts >= 0)) return { ok: false, reason: "Set your monthly fixed operating costs in Assumptions." };
  if (i.avgRevenuePerSession === null) return { ok: false, reason: "No priced completed sessions in this period to measure revenue per session." };
  // If recorded expenses already include per-session variable costs, don't subtract them twice.
  let variable = 0;
  if (!i.variableIncludedInExpenses) {
    if (i.variableCostPerSession === null || !(i.variableCostPerSession >= 0)) return { ok: false, reason: "Set the variable cost per session (or mark it as already included in expenses)." };
    variable = i.variableCostPerSession;
  }
  const contribution = i.avgRevenuePerSession - variable;
  if (contribution <= 0) return { ok: false, reason: `Each session contributes ${contribution.toFixed(0)} EGP after variable costs, so break-even can't be reached under these assumptions.` };
  const sessionsPerMonth = Math.ceil(i.fixedMonthlyCosts / contribution);
  return { ok: true, contribution, sessionsPerMonth, variableUsed: variable,
    sessionsPerDay: i.operatingDaysInMonth > 0 ? sessionsPerMonth / i.operatingDaysInMonth : null };
}

// ─── Schedule & capacity ──────────────────────────────────────────────────────

export const isOpenHour = (h: number, c: Capacity) => h >= c.openingHour && h < c.closingHour;

/** Bookable patient-slots in a range: operating days × open hours × patients/hour,
 *  optionally limited to an hour window [hFrom, hTo). */
export function slotCapacity(r: Range, c: Capacity, hFrom = 0, hTo = 24): number {
  const hours = Math.max(0, Math.min(c.closingHour, hTo) - Math.max(c.openingHour, hFrom));
  return operatingDays(r, c.closedWeekdays) * hours * c.maxPerHour;
}

export interface Grid { counts: number[][]; capacity: number[][]; }  // [weekday 0-6][hour 0-23]
export function weekdayHourGrid(appts: AAppt[], r: Range, c: Capacity, status: ApptStatus = "completed"): Grid {
  const counts = Array.from({ length: 7 }, () => Array(24).fill(0));
  const capacity = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const a of appts) if (a.status === status && inRange(a.date, r) && a.hour >= 0 && a.hour < 24) counts[weekday(a.date)][a.hour]++;
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
    const wd = weekday(d);
    if (c.closedWeekdays.includes(wd)) continue;
    for (let h = 0; h < 24; h++) if (isOpenHour(h, c)) capacity[wd][h] += c.maxPerHour;
  }
  return { counts, capacity };
}

export interface ShiftStats {
  label: string; hFrom: number; hTo: number; openHours: number;
  booked: number; completed: number; cancelled: number; noShow: number;
  capacity: number; utilization: number | null; cancelRate: number | null;
  earned: number; earnedPerOpenHour: number | null;
}
export function shiftStats(label: string, hFrom: number, hTo: number, appts: AAppt[], prices: APrice[], r: Range, c: Capacity): ShiftStats {
  const inP = appts.filter((a) => inRange(a.date, r) && a.hour >= hFrom && a.hour < hTo && a.status !== "rescheduled");
  const completed = inP.filter((a) => a.status === "completed");
  const priceByAppt = new Map(prices.filter((p) => p.appointmentId).map((p) => [p.appointmentId, p.amount] as const));
  const earned = sum(completed.map((a) => priceByAppt.get(a.id) ?? 0));
  const openHours = operatingDays(r, c.closedWeekdays) * Math.max(0, Math.min(c.closingHour, hTo) - Math.max(c.openingHour, hFrom));
  const capacity = slotCapacity(r, c, hFrom, hTo);
  return {
    label, hFrom, hTo, openHours,
    booked: inP.length, completed: completed.length,
    cancelled: inP.filter((a) => a.status === "cancelled").length,
    noShow: inP.filter((a) => a.status === "no_show").length,
    capacity, utilization: ratio(completed.length, capacity), cancelRate: ratio(inP.filter((a) => a.status === "cancelled").length, inP.length),
    earned, earnedPerOpenHour: ratio(earned, openHours),
  };
}

/** Are morning sessions new demand, or evening patients moving? For each patient with a
 *  completed morning session in `r`, check whether they had a completed evening session in
 *  the lookback range before it. */
export function morningDemandSplit(appts: AAppt[], r: Range, lookback: Range, morning: [number, number], evening: [number, number]) {
  const done = appts.filter((a) => a.status === "completed" && a.patientId);
  const morningPatients = new Set(done.filter((a) => inRange(a.date, r) && a.hour >= morning[0] && a.hour < morning[1]).map((a) => a.patientId));
  const priorEvening = new Set(done.filter((a) => inRange(a.date, lookback) && a.hour >= evening[0] && a.hour < evening[1]).map((a) => a.patientId));
  let shifted = 0;
  morningPatients.forEach((p) => { if (priorEvening.has(p)) shifted++; });
  return { morningPatients: morningPatients.size, shiftedFromEvening: shifted, newToSchedule: morningPatients.size - shifted };
}

// ─── Patients ─────────────────────────────────────────────────────────────────

export function newPatients(patients: APatient[], r: Range) { return patients.filter((p) => inRange(p.createdDate, r)); }

/** Acquisition source as recorded. Historical patients without one are "unknown",
 *  except an explicitly recorded referring physician, which is a doctor referral. */
export function sourceOf(p: APatient): string {
  if (p.acquisitionSource) return p.acquisitionSource;
  if (p.referredByPhysicianId) return "doctor_referral";
  return "";
}

export function bySource(patients: APatient[]) { return groupSum(patients, sourceOf, () => 1); }

export function retention(appts: AAppt[], patients: APatient[], r: Range) {
  const created = new Map(patients.map((p) => [p.uid, p.createdDate] as const));
  const treated = new Set(appts.filter((a) => a.status === "completed" && inRange(a.date, r) && a.patientId).map((a) => a.patientId));
  let isNew = 0;
  treated.forEach((id) => { if (inRange(created.get(id) ?? "", r)) isNew++; });
  const completed = appts.filter((a) => a.status === "completed" && inRange(a.date, r)).length;
  return { treated: treated.size, newTreated: isNew, returningTreated: treated.size - isNew, sessionsPerPatient: ratio(completed, treated.size) };
}

/** Administrative review list — NOT a "lost patient" label. Active patients whose last
 *  completed session was within `lookbackDays`, with nothing booked from today on. */
export function followUpCandidates(appts: AAppt[], patients: APatient[], today: string, lookbackDays = 60) {
  const since = addDays(today, -lookbackDays);
  const lastDone = new Map<string, string>();
  const hasUpcoming = new Set<string>();
  for (const a of appts) {
    if (!a.patientId) continue;
    if (a.status === "completed" && a.date >= since && a.date <= today && (lastDone.get(a.patientId) ?? "") < a.date) lastDone.set(a.patientId, a.date);
    if ((a.status === "scheduled" || a.status === "in_progress") && a.date >= today) hasUpcoming.add(a.patientId);
  }
  return patients
    .filter((p) => p.status === "active" && lastDone.has(p.uid) && !hasUpcoming.has(p.uid))
    .map((p) => ({ uid: p.uid, name: p.name, lastSession: lastDone.get(p.uid)!, daysSince: daysBetween(lastDone.get(p.uid)!, today) }))
    .sort((a, b) => b.daysSince - a.daysSince);
}

export function upcomingPatients(appts: AAppt[], today: string) {
  return new Set(appts.filter((a) => a.patientId && a.date >= today && (a.status === "scheduled" || a.status === "in_progress")).map((a) => a.patientId)).size;
}

// ─── Monthly series (for trends / expansion) ──────────────────────────────────

export function lastMonths(today: string, n: number): string[] {
  const out: string[] = [];
  let [y, m] = monthKey(today).split("-").map(Number);
  for (let i = 0; i < n; i++) { out.unshift(`${y}-${String(m).padStart(2, "0")}`); m--; if (m === 0) { m = 12; y--; } }
  return out;
}
export const monthRange = (ym: string, today: string): Range => {
  const end = `${ym}-${String(daysInMonth(ym)).padStart(2, "0")}`;
  return { from: `${ym}-01`, to: end > today ? today : end };
};

// ─── Inquiry funnel ───────────────────────────────────────────────────────────

export interface ALead { id: string; date: string; source: string; status: string; patientId: string; }

/** Inquiry → assessment booked → assessment attended → treatment started → continuing.
 *  Stages after "booked" are measured from the linked patient's real appointments
 *  (on/after the inquiry date), so they can't be overstated by a status click.
 *  Inquiries not linked to a patient can't be verified, so they never count as booked. */
export function leadFunnel(leads: ALead[], appts: AAppt[], r: Range) {
  const inP = leads.filter((l) => inRange(l.date, r));
  const byPatient = new Map<string, AAppt[]>();
  appts.forEach((a) => { if (a.patientId) (byPatient.get(a.patientId) ?? byPatient.set(a.patientId, []).get(a.patientId)!).push(a); });
  let booked = 0, attended = 0, started = 0, continuing = 0, linked = 0;
  for (const l of inP) {
    const own = l.patientId ? (byPatient.get(l.patientId) ?? []).filter((a) => a.date >= l.date) : [];
    if (l.patientId) linked++;
    const hasAssessBooking = own.some((a) => isAssessment(a.sessionType) && a.status !== "rescheduled");
    if (hasAssessBooking) booked++;
    if (own.some((a) => isAssessment(a.sessionType) && a.status === "completed")) attended++;
    const treat = own.filter((a) => !isAssessment(a.sessionType) && a.status === "completed").length;
    if (treat >= 1) started++;
    if (treat >= 2) continuing++;
  }
  return { inquiries: inP.length, linked, booked, attended, started, continuing, bySource: groupSum(inP, (l) => l.source || "", () => 1) };
}

/** Of patients who attended an assessment in `r`, how many went on to a completed
 *  treatment session afterwards (up to `today`). */
export function assessmentToTreatment(appts: AAppt[], r: Range) {
  const firstAssess = new Map<string, string>();
  for (const a of appts) {
    if (a.status !== "completed" || !isAssessment(a.sessionType) || !inRange(a.date, r) || !a.patientId) continue;
    if (!firstAssess.has(a.patientId) || a.date < firstAssess.get(a.patientId)!) firstAssess.set(a.patientId, a.date);
  }
  let converted = 0;
  firstAssess.forEach((d, pid) => {
    if (appts.some((a) => a.patientId === pid && a.status === "completed" && !isAssessment(a.sessionType) && a.date >= d)) converted++;
  });
  return { assessed: firstAssess.size, converted, rate: ratio(converted, firstAssess.size) };
}

// ─── Expansion readiness ──────────────────────────────────────────────────────

export function ownerShare(appts: AAppt[], managerIds: Set<string>, r: Range) {
  const done = appts.filter((a) => a.status === "completed" && inRange(a.date, r));
  return { owner: done.filter((a) => managerIds.has(a.physioId)).length, total: done.length,
    share: ratio(done.filter((a) => managerIds.has(a.physioId)).length, done.length) };
}

/** Months of cash left at the recent average monthly result. null result = can't tell. */
export function runway(cashBalance: number | null, monthlyResults: number[]): { months: number | null; burning: boolean | null } {
  if (cashBalance === null || monthlyResults.length === 0) return { months: null, burning: null };
  const avg = sum(monthlyResults) / monthlyResults.length;
  if (avg >= 0) return { months: null, burning: false };
  return { months: cashBalance / -avg, burning: true };
}

export type CriterionState = "met" | "not_met" | "missing";
export interface Criterion { key: string; label: string; state: CriterionState; evidence: string; }

export interface ExpansionInput {
  fullMonths: { ym: string; result: number | null; completed: number; capacity: number; newPatients: number; expensesRecorded: boolean }[];
  monthsAtTarget: number;
  targetMonthlyResult: number | null;
  breakEvenSessionsPerMonth: number | null;
  targetUtilization: number | null;   // 0–1
  cashBalance: number | null; minCashReserve: number | null;
  ownerShare: number | null; maxOwnerShare: number | null;  // 0–1
}

/** Each criterion reports met / not met / missing data with its evidence. The
 *  scorecard never turns this into a "ready" verdict on its own. */
export function expansionCriteria(i: ExpansionInput): Criterion[] {
  const n = Math.max(1, i.monthsAtTarget);
  const last = i.fullMonths.slice(-n);
  const enough = last.length >= n;
  const out: Criterion[] = [];
  const allExp = enough && last.every((m) => m.expensesRecorded);
  out.push({ key: "expenses", label: `Expenses recorded for the last ${n} full months`,
    state: allExp ? "met" : "missing",
    evidence: enough ? `${last.filter((m) => m.expensesRecorded).length} of ${n} months have every expense category entered` : `Only ${last.length} full month(s) of history in view` });
  out.push({ key: "result", label: `Operating result ≥ target for ${n} consecutive months`,
    state: i.targetMonthlyResult === null || !allExp ? "missing" : last.every((m) => (m.result ?? -Infinity) >= i.targetMonthlyResult!) ? "met" : "not_met",
    evidence: i.targetMonthlyResult === null ? "Target not set" : !allExp ? "Needs complete expense records" : `Results: ${last.map((m) => m.result === null ? "—" : Math.round(m.result)).join(", ")} vs target ${Math.round(i.targetMonthlyResult)}` });
  out.push({ key: "breakeven", label: `Break-even sessions reached for ${n} consecutive months`,
    state: i.breakEvenSessionsPerMonth === null || !enough ? "missing" : last.every((m) => m.completed >= i.breakEvenSessionsPerMonth!) ? "met" : "not_met",
    evidence: i.breakEvenSessionsPerMonth === null ? "Break-even not computable (see Financial)" : `Sessions: ${last.map((m) => m.completed).join(", ")} vs ${i.breakEvenSessionsPerMonth}` });
  const lastM = i.fullMonths[i.fullMonths.length - 1];
  const util = lastM ? ratio(lastM.completed, lastM.capacity) : null;
  out.push({ key: "utilization", label: "Schedule utilisation at target (demand near current capacity)",
    state: i.targetUtilization === null || util === null ? "missing" : util >= i.targetUtilization ? "met" : "not_met",
    evidence: i.targetUtilization === null ? "Target not set" : util === null ? "No capacity data" : `Last full month ${(util * 100).toFixed(0)}% vs target ${(i.targetUtilization * 100).toFixed(0)}%` });
  const np = i.fullMonths.slice(-3).map((m) => m.newPatients);
  out.push({ key: "acquisition", label: "New-patient trend not declining (last 3 full months)",
    state: np.length < 3 ? "missing" : np[2] >= np[0] ? "met" : "not_met",
    evidence: np.length < 3 ? "Needs 3 full months" : `New patients: ${np.join(" → ")}` });
  out.push({ key: "cash", label: "Cash balance above minimum reserve",
    state: i.cashBalance === null || i.minCashReserve === null ? "missing" : i.cashBalance >= i.minCashReserve ? "met" : "not_met",
    evidence: i.cashBalance === null || i.minCashReserve === null ? "Cash balance and reserve must both be entered" : `${Math.round(i.cashBalance)} vs reserve ${Math.round(i.minCashReserve)} (owner-entered)` });
  out.push({ key: "owner", label: "Clinic runs without depending on the owner",
    state: i.maxOwnerShare === null || i.ownerShare === null ? "missing" : i.ownerShare <= i.maxOwnerShare ? "met" : "not_met",
    evidence: i.ownerShare === null ? "No completed sessions" : i.maxOwnerShare === null ? `Owner treats ${(i.ownerShare * 100).toFixed(0)}% of sessions; limit not set` : `Owner treats ${(i.ownerShare * 100).toFixed(0)}% vs limit ${(i.maxOwnerShare * 100).toFixed(0)}%` });
  return out;
}
