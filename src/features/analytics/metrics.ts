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
export interface AExpense { id: string; date: string; category: string; amount: number; marketingSource: string; }
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

export interface CashLine { date: string; amount: number; method: string; kind: "session" | "package"; approximate: boolean; }

/** Cash actually received.
 *  - Pay-per-session: paid, non-package price records, on their paid date.
 *    (Package-linked price records are excluded — that money arrives via the package.)
 *  - Packages: each logged payment on its date. Money paid before the log existed
 *    (paidAmount − Σ logged) is attributed to the date of the package's first session,
 *    or its start date if no session is recorded yet, and flagged approximate. */
export function cashLines(prices: APrice[], pkgs: APackage[], pkgPayments: APkgPayment[], firstSessionByPkg: Record<string, string> = {}): CashLine[] {
  const lines: CashLine[] = [];
  for (const p of prices) {
    if (p.packageId || !p.paid || !(p.amount > 0)) continue;
    lines.push({ date: p.paidDate || p.date, amount: p.amount, method: p.paymentMethod, kind: "session", approximate: !p.paidDate });
  }
  const logged = groupSum(pkgPayments, (x) => x.packageId, (x) => x.amount);
  for (const x of pkgPayments) lines.push({ date: x.date, amount: x.amount, method: x.method, kind: "package", approximate: false });
  for (const k of pkgs) {
    const legacy = (k.paidAmount || 0) - (logged[k.id] ?? 0);
    if (legacy > 0.0001) lines.push({ date: firstSessionByPkg[k.id] || k.startDate, amount: legacy, method: "", kind: "package", approximate: true });
  }
  return lines;
}

/** Date of each package's first recorded session (earliest linked price record). */
export function firstSessionByPackage(pkgPrices: APrice[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const p of pkgPrices) if (p.packageId && p.date && (!out[p.packageId] || p.date < out[p.packageId])) out[p.packageId] = p.date;
  return out;
}

export interface CashStats { total: number; sessions: number; packages: number; approximate: number; byMethod: Record<string, number>; }
export function cashStats(lines: CashLine[], r: Range): CashStats {
  const inP = lines.filter((l) => inRange(l.date, r));
  return {
    total: sum(inP.map((l) => l.amount)),
    sessions: sum(inP.filter((l) => l.kind === "session").map((l) => l.amount)),
    packages: sum(inP.filter((l) => l.kind === "package").map((l) => l.amount)),
    approximate: sum(inP.filter((l) => l.approximate).map((l) => l.amount)),
    byMethod: groupSum(inP, (l) => l.method || "", (l) => l.amount),
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

export interface ExpenseStats { total: number; byCategory: Record<string, number>; marketingBySource: Record<string, number>; marketingTotal: number; }
export function expenseStats(expenses: AExpense[], r: Range): ExpenseStats {
  const inP = expenses.filter((e) => inRange(e.date, r));
  const mk = inP.filter((e) => e.category === "marketing");
  return {
    total: sum(inP.map((e) => e.amount)),
    byCategory: groupSum(inP, (e) => e.category, (e) => e.amount),
    marketingBySource: groupSum(mk, (e) => e.marketingSource || "", (e) => e.amount),
    marketingTotal: sum(mk.map((e) => e.amount)),
  };
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
 *  (on/after the inquiry date), so they can't be overstated by a status click. */
export function leadFunnel(leads: ALead[], appts: AAppt[], r: Range) {
  const inP = leads.filter((l) => inRange(l.date, r));
  const byPatient = new Map<string, AAppt[]>();
  appts.forEach((a) => { if (a.patientId) (byPatient.get(a.patientId) ?? byPatient.set(a.patientId, []).get(a.patientId)!).push(a); });
  let booked = 0, attended = 0, started = 0, continuing = 0, linked = 0;
  for (const l of inP) {
    const own = l.patientId ? (byPatient.get(l.patientId) ?? []).filter((a) => a.date >= l.date) : [];
    if (l.patientId) linked++;
    const hasAssessBooking = own.some((a) => isAssessment(a.sessionType) && a.status !== "rescheduled");
    if (hasAssessBooking || l.status === "assessment_booked" || l.status === "converted") booked++;
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
  fullMonths: { ym: string; result: number; completed: number; capacity: number; newPatients: number; expensesRecorded: boolean }[];
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
    evidence: enough ? `${last.filter((m) => m.expensesRecorded).length} of ${n} months have expenses logged` : `Only ${last.length} full month(s) of history in view` });
  out.push({ key: "result", label: `Operating result ≥ target for ${n} consecutive months`,
    state: i.targetMonthlyResult === null || !allExp ? "missing" : last.every((m) => m.result >= i.targetMonthlyResult!) ? "met" : "not_met",
    evidence: i.targetMonthlyResult === null ? "Target not set" : !allExp ? "Needs complete expense records" : `Results: ${last.map((m) => Math.round(m.result)).join(", ")} vs target ${Math.round(i.targetMonthlyResult)}` });
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
