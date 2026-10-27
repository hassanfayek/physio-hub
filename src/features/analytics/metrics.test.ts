import { describe, it, expect } from "vitest";
import {
  presetRanges, previousRange, operatingDays, apptStats, cashLines, cashStats, earnedStats,
  breakEven, slotCapacity, shiftStats, morningDemandSplit, followUpCandidates, sourceOf,
  outstanding, packageObligations, pctChange, ratio, retention, dedupeById,
  type AAppt, type APrice, type APackage, type APkgPayment, type APatient, type Capacity,
} from "./metrics";

const appt = (p: Partial<AAppt>): AAppt => ({ id: Math.random().toString(36), patientId: "p1", physioId: "ph1", physioName: "Dr A",
  date: "2026-10-05", hour: 16, sessionType: "Physiotherapy Session", status: "completed", ...p });
const price = (p: Partial<APrice>): APrice => ({ id: Math.random().toString(36), patientId: "p1", appointmentId: "", date: "2026-10-05",
  sessionType: "", amount: 300, paid: true, paidDate: "2026-10-05", packageId: "", paymentMethod: "", ...p });
const pkg = (p: Partial<APackage>): APackage => ({ id: "k1", patientId: "p1", packageSize: 6, pricePerSession: 250, totalAmount: 1500,
  paidAmount: 0, startDate: "2026-10-01", sessionsUsed: 0, active: true, ...p });
const cap: Capacity = { openingHour: 15, closingHour: 22, maxPerHour: 4, closedWeekdays: [5] };
const OCT = { from: "2026-10-01", to: "2026-10-31" };

describe("date ranges", () => {
  it("previous period has the same length and ends the day before", () => {
    expect(previousRange({ from: "2026-10-01", to: "2026-10-10" })).toEqual({ from: "2026-09-21", to: "2026-09-30" });
  });
  it("this month is month-to-date vs the same days of last month, clamped", () => {
    expect(presetRanges("month", "2026-03-31")).toEqual({ cur: { from: "2026-03-01", to: "2026-03-31" }, prev: { from: "2026-02-01", to: "2026-02-28" } });
  });
  it("previous month crosses the year boundary", () => {
    expect(presetRanges("prevMonth", "2026-01-15").cur).toEqual({ from: "2025-12-01", to: "2025-12-31" });
  });
  it("this week starts Monday (Sunday belongs to the week before)", () => {
    expect(presetRanges("week", "2026-10-25").cur.from).toBe("2026-10-19"); // Sunday → Monday 19th
  });
  it("operating days skip closed weekdays", () => {
    expect(operatingDays({ from: "2026-10-01", to: "2026-10-07" }, [5])).toBe(6); // one Friday
  });
});

describe("appointment stats", () => {
  it("only completed counts as a session; rescheduled is excluded from booked", () => {
    const s = apptStats([
      appt({ status: "completed" }), appt({ status: "cancelled" }), appt({ status: "rescheduled" }),
      appt({ status: "in_progress" }), appt({ status: "no_show" }),
    ], OCT, "2026-10-01");
    expect(s.booked).toBe(4);
    expect(s.completed).toBe(1);
    expect(s.cancellationRate).toBe(0.25);
    expect(s.noShowRate).toBe(0.25);
  });
  it("no-show rate only uses appointments since tracking began", () => {
    const s = apptStats([appt({ date: "2026-10-02", status: "cancelled" }), appt({ date: "2026-10-20", status: "no_show" })], OCT, "2026-10-15");
    expect(s.noShowRate).toBe(1);
    expect(s.noShowTrackedFully).toBe(false);
  });
  it("empty period gives null rates, not 0%", () => {
    expect(apptStats([], OCT, "2026-10-01").cancellationRate).toBeNull();
  });
  it("assessments are detected by session type", () => {
    const s = apptStats([appt({ sessionType: "Assessment Session" }), appt({ sessionType: "Online Assessment Session", status: "cancelled" })], OCT, "2026-01-01");
    expect([s.assessmentsBooked, s.assessmentsAttended]).toEqual([2, 1]);
  });
});

describe("cash vs earned revenue", () => {
  it("excludes package-linked price records from cash and uses paid date", () => {
    const lines = cashLines([price({ amount: 300, paidDate: "2026-10-03" }), price({ packageId: "k1", amount: 250 }), price({ paid: false })], [], []);
    expect(cashStats(lines, OCT).total).toBe(300);
    expect(cashStats(lines, { from: "2026-10-04", to: "2026-10-31" }).total).toBe(0);
  });
  it("package cash = logged payments + legacy remainder on start date, no double count", () => {
    const pays: APkgPayment[] = [{ id: "1", packageId: "k1", amount: 500, date: "2026-10-20", method: "cash" }];
    const lines = cashLines([], [pkg({ paidAmount: 1500, startDate: "2026-09-10" })], pays);
    expect(cashStats(lines, OCT).packages).toBe(500);
    const sep = cashStats(lines, { from: "2026-09-01", to: "2026-09-30" });
    expect(sep.packages).toBe(1000);
    expect(sep.approximate).toBe(1000);
  });
  it("corrections (negative log entries) reconcile", () => {
    const pays: APkgPayment[] = [
      { id: "1", packageId: "k1", amount: 1000, date: "2026-10-02", method: "cash" },
      { id: "2", packageId: "k1", amount: -200, date: "2026-10-03", method: "" },
    ];
    expect(cashStats(cashLines([], [pkg({ paidAmount: 800 })], pays), OCT).total).toBe(800);
  });
  it("earned revenue counts completed sessions only; unpriced are flagged not zeroed", () => {
    const a1 = appt({ id: "a1" }), a2 = appt({ id: "a2" }), a3 = appt({ id: "a3", status: "cancelled" });
    const e = earnedStats([a1, a2, a3], [price({ appointmentId: "a1", amount: 300 }), price({ appointmentId: "a3", amount: 300 })], OCT);
    expect(e.total).toBe(300);
    expect(e.pricedSessions).toBe(1);
    expect(e.unpricedSessions).toBe(1);
    expect(e.avgPerSession).toBe(300);
  });
  it("package redemptions are earned at the per-session price", () => {
    const e = earnedStats([appt({ id: "a1" })], [price({ appointmentId: "a1", amount: 250, packageId: "k1" })], OCT);
    expect([e.packageRedemptions, e.packageRedemptionValue]).toEqual([1, 250]);
  });
  it("outstanding and obligations", () => {
    expect(outstanding([price({ paid: false, amount: 200 }), price({ paid: false, packageId: "k1" })], [pkg({ totalAmount: 1500, paidAmount: 1000 })]).total).toBe(700);
    const o = packageObligations([pkg({ sessionsUsed: 2 }), pkg({ active: false })]);
    expect([o.remainingSessions, o.remainingValue]).toEqual([4, 1000]);
  });
});

describe("break-even", () => {
  const base = { fixedMonthlyCosts: 30000, variableCostPerSession: 50, variableIncludedInExpenses: false, avgRevenuePerSession: 350, operatingDaysInMonth: 26 };
  it("computes sessions per month and per day", () => {
    const b = breakEven(base);
    expect(b.ok && b.contribution).toBe(300);
    expect(b.ok && b.sessionsPerMonth).toBe(100);
    expect(b.ok && b.sessionsPerDay).toBeCloseTo(3.846, 2);
  });
  it("does not subtract variable cost twice when it's already in expenses", () => {
    const b = breakEven({ ...base, variableIncludedInExpenses: true, variableCostPerSession: null });
    expect(b.ok && b.contribution).toBe(350);
  });
  it("zero or negative contribution cannot break even", () => {
    expect(breakEven({ ...base, variableCostPerSession: 350 }).ok).toBe(false);
  });
  it("missing inputs are reported, never assumed", () => {
    expect(breakEven({ ...base, fixedMonthlyCosts: null }).ok).toBe(false);
    expect(breakEven({ ...base, avgRevenuePerSession: null }).ok).toBe(false);
    expect(breakEven({ ...base, variableCostPerSession: null }).ok).toBe(false);
  });
});

describe("capacity & shifts", () => {
  it("capacity uses open hours only", () => {
    const wk = { from: "2026-10-05", to: "2026-10-11" }; // Mon–Sun, Friday closed → 6 days
    expect(slotCapacity(wk, cap)).toBe(6 * 7 * 4);
    expect(slotCapacity(wk, cap, 9, 13)).toBe(0); // closed in the morning → no capacity
  });
  it("shift stats bucket by hour window", () => {
    const s = shiftStats("Evening", 15, 22, [appt({ id: "x", hour: 18 }), appt({ hour: 10 })], [price({ appointmentId: "x", amount: 400 })], OCT, cap);
    expect([s.completed, s.earned]).toEqual([1, 400]);
  });
  it("morning demand split detects patients moved from evenings", () => {
    const r = morningDemandSplit(
      [appt({ patientId: "a", hour: 10, date: "2026-10-20" }), appt({ patientId: "a", hour: 18, date: "2026-09-20" }), appt({ patientId: "b", hour: 10, date: "2026-10-21" })],
      OCT, { from: "2026-09-01", to: "2026-09-30" }, [9, 13], [15, 22]);
    expect(r).toEqual({ morningPatients: 2, shiftedFromEvening: 1, newToSchedule: 1 });
  });
});

describe("patients", () => {
  const pt = (p: Partial<APatient>): APatient => ({ uid: "p1", name: "X", createdDate: "2026-01-01", status: "active", acquisitionSource: "", referredByPhysicianId: "", ...p });
  it("source: recorded > doctor referral > unknown (never inferred from free text)", () => {
    expect(sourceOf(pt({ acquisitionSource: "google" }))).toBe("google");
    expect(sourceOf(pt({ referredByPhysicianId: "d1" }))).toBe("doctor_referral");
    expect(sourceOf(pt({}))).toBe("");
  });
  it("follow-up list excludes patients with something booked and inactive patients", () => {
    const appts = [
      appt({ patientId: "p1", date: "2026-10-01" }),
      appt({ patientId: "p2", date: "2026-10-01" }), appt({ patientId: "p2", date: "2026-10-30", status: "scheduled" }),
      appt({ patientId: "p3", date: "2026-10-01" }),
    ];
    const list = followUpCandidates(appts, [pt({ uid: "p1" }), pt({ uid: "p2" }), pt({ uid: "p3", status: "discharged" })], "2026-10-27");
    expect(list.map((x) => x.uid)).toEqual(["p1"]);
  });
  it("retention splits new vs returning by record creation date", () => {
    const r = retention([appt({ patientId: "p1" }), appt({ patientId: "p2" })], [pt({ uid: "p1", createdDate: "2026-10-02" }), pt({ uid: "p2" })], OCT);
    expect([r.newTreated, r.returningTreated]).toEqual([1, 1]);
  });
});

describe("utils", () => {
  it("pctChange / ratio guard against zero", () => {
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(15, 10)).toBe(0.5);
    expect(ratio(1, 0)).toBeNull();
  });
  it("dedupes merged query results", () => {
    expect(dedupeById([{ id: "a" }, { id: "a" }, { id: "b" }])).toHaveLength(2);
  });
});
