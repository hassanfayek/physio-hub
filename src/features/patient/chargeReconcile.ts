// FILE: src/features/patient/chargeReconcile.ts
// Matches a patient's session charges (patientSessionPrices) to their
// appointments. Each completed session shows exactly one charge; every other
// charge is surfaced with a reason instead of silently inflating totals.
// Pure — shared by the price sheet and the Business Analytics data checks.

export interface RCharge {
  id: string; appointmentId: string; date: string; amount: number; paid: boolean;
  packageId: string; keptAsExtra?: boolean; createdAtMs: number;
}
export interface RAppt { id: string; date: string; status: string; }

export type ExtraReason = "duplicate" | "not_completed" | "appointment_deleted" | "no_appointment";

export interface ExtraCharge<C extends RCharge = RCharge> {
  charge: C;
  reason: ExtraReason;
  apptStatus: string;   // status of the linked appointment, "" if none
  goToDate: string;     // schedule day to open: the appointment's date, else the charge's date
}

export interface Reconciled<C extends RCharge = RCharge> {
  shownByAppt: Map<string, C>;   // completed appointment id → the one charge displayed
  extras: ExtraCharge<C>[];      // every other charge, with why it isn't a row
  totals: { billed: number; paid: number; due: number };   // rows + extras deliberately kept
}

/** When a session has several charges, show the paid one; among equals, the newest. */
const better = (a: RCharge, b: RCharge) =>
  a.paid !== b.paid ? (a.paid ? a : b) : a.createdAtMs >= b.createdAtMs ? a : b;

export function reconcileCharges<C extends RCharge>(charges: C[], appts: RAppt[]): Reconciled<C> {
  const apptById = new Map(appts.map((a) => [a.id, a] as const));
  const shownByAppt = new Map<string, C>();
  for (const c of charges) {
    const a = c.appointmentId ? apptById.get(c.appointmentId) : undefined;
    if (!a || a.status !== "completed") continue;
    const cur = shownByAppt.get(a.id);
    shownByAppt.set(a.id, cur ? (better(cur, c) as C) : c);
  }
  const shownIds = new Set([...shownByAppt.values()].map((c) => c.id));
  const extras: ExtraCharge<C>[] = [];
  for (const c of charges) {
    if (shownIds.has(c.id)) continue;
    const a = c.appointmentId ? apptById.get(c.appointmentId) : undefined;
    const reason: ExtraReason = !c.appointmentId ? "no_appointment"
      : !a ? "appointment_deleted"
      : a.status !== "completed" ? "not_completed"
      : "duplicate";
    extras.push({ charge: c, reason, apptStatus: a?.status ?? "", goToDate: a?.date || c.date });
  }
  extras.sort((x, y) => y.goToDate.localeCompare(x.goToDate));

  const counted = [...shownByAppt.values(), ...extras.filter((e) => e.charge.keptAsExtra).map((e) => e.charge)];
  const billed = counted.reduce((s, c) => s + c.amount, 0);
  const paid = counted.filter((c) => c.paid).reduce((s, c) => s + c.amount, 0);
  return { shownByAppt, extras, totals: { billed, paid, due: billed - paid } };
}

const STATUS_LABEL: Record<string, string> = {
  cancelled: "cancelled", no_show: "a no-show", scheduled: "not completed yet", in_progress: "still in progress", rescheduled: "rescheduled",
};

export function extraReasonText(e: ExtraCharge): string {
  if (e.reason === "duplicate") return "Duplicate: this session already has another charge";
  if (e.reason === "not_completed") return `Appointment was ${STATUS_LABEL[e.apptStatus] ?? e.apptStatus}`;
  if (e.reason === "appointment_deleted") return "Appointment was deleted";
  return "Not linked to any appointment";
}

// ─── Clinic-wide data checks ──────────────────────────────────────────────────

export interface IssueCharge extends RCharge { patientId: string; paidDate: string; }
export type IssueKind = ExtraReason | "paid_no_date" | "paid_zero" | "paid_future";
export interface ChargeIssue { kind: IssueKind; charge: IssueCharge; goToDate: string; apptStatus: string; }

/** Every charge needing a human look, across all patients. Charges already
 *  reviewed and kept are excluded. */
export function findChargeIssues(charges: IssueCharge[], appts: RAppt[], today: string): ChargeIssue[] {
  const byPatient = new Map<string, IssueCharge[]>();
  charges.forEach((c) => (byPatient.get(c.patientId) ?? byPatient.set(c.patientId, []).get(c.patientId)!).push(c));
  const out: ChargeIssue[] = [];
  byPatient.forEach((list) => {
    for (const e of reconcileCharges(list, appts).extras) {
      if (!e.charge.keptAsExtra) out.push({ kind: e.reason, charge: e.charge, goToDate: e.goToDate, apptStatus: e.apptStatus });
    }
  });
  const apptDate = new Map(appts.map((a) => [a.id, a.date] as const));
  for (const c of charges) {
    if (!c.paid || c.packageId) continue;
    const day = apptDate.get(c.appointmentId) || c.date;
    if (!c.paidDate) out.push({ kind: "paid_no_date", charge: c, goToDate: day, apptStatus: "" });
    else if (c.paidDate > today) out.push({ kind: "paid_future", charge: c, goToDate: day, apptStatus: "" });
    if (!(c.amount > 0)) out.push({ kind: "paid_zero", charge: c, goToDate: day, apptStatus: "" });
  }
  return out.sort((a, b) => b.goToDate.localeCompare(a.goToDate));
}

export const ISSUE_LABEL: Record<IssueKind, string> = {
  duplicate: "Duplicate charge for a session",
  not_completed: "Charge on a session that wasn't completed",
  appointment_deleted: "Charge for a deleted appointment",
  no_appointment: "Charge not linked to an appointment",
  paid_no_date: "Paid, but no paid date",
  paid_zero: "Marked paid with amount 0",
  paid_future: "Paid date is in the future",
};
