// Regression tests for the Business Analytics data-quality warnings and the
// verified vs estimated cash split.
import { describe, it, expect } from "vitest";
import {
  cashLines, cashStats, noShowCoverage, dataQuality, presetRanges, expensesForRange, expenseGap,
  type APrice, type APackage, type APkgPayment, type AAppt, type ACategory, type AMonthlyExpense,
} from "./metrics";

const TRACK = "2026-10-27";
const price = (p: Partial<APrice>): APrice => ({ id: Math.random().toString(36), patientId: "pt", appointmentId: "", date: "2026-10-28",
  sessionType: "", amount: 400, paid: true, paidDate: "2026-10-28", packageId: "", paymentMethod: "cash", ...p });
const pkg = (p: Partial<APackage>): APackage => ({ id: "k1", patientId: "pt", packageSize: 6, pricePerSession: 250, totalAmount: 1500,
  paidAmount: 1500, startDate: "2026-09-01", sessionsUsed: 0, active: true, ...p });
const appt = (date: string, status: AAppt["status"] = "completed"): AAppt => ({ id: Math.random().toString(36), patientId: "pt", physioId: "d", physioName: "D",
  date, hour: 16, sessionType: "Physiotherapy Session", status });

const SEP = { from: "2026-09-01", to: "2026-09-30" };
const OCT = { from: "2026-10-01", to: "2026-10-31" };
const NOV = { from: "2026-11-01", to: "2026-11-30" };

describe("historical package payments", () => {
  it("money paid before the payment log is estimated; logged payments are verified", () => {
    const pays: APkgPayment[] = [{ id: "p", packageId: "k1", amount: 600, date: "2026-10-28", method: "card" }];
    const lines = cashLines([], [pkg({ paidAmount: 1500 })], pays, { k1: "2026-09-05" });
    const sep = cashStats(lines, SEP), oct = cashStats(lines, OCT);
    expect([sep.verified, sep.estimated]).toEqual([0, 900]);     // legacy 900 placed on first session (Sep 5)
    expect([oct.verified, oct.estimated]).toEqual([600, 0]);     // logged payment, real date
    expect(sep.estimatedLines.map((l) => [l.sourceId, l.date, l.amount])).toEqual([["k1", "2026-09-05", 900]]);
  });
  it("a fully logged package produces no estimate (issue resolved)", () => {
    const pays: APkgPayment[] = [{ id: "p", packageId: "k1", amount: 1500, date: "2026-10-28", method: "cash" }];
    expect(cashStats(cashLines([], [pkg({})], pays), OCT).estimated).toBe(0);
  });
  it("unpaid packages contribute nothing", () => {
    expect(cashLines([], [pkg({ paidAmount: 0 })], []).length).toBe(0);
  });
});

describe("verified vs estimated cash", () => {
  it("session charges paid without a paid date are estimated, never verified", () => {
    const s = cashStats(cashLines([price({ paidDate: "", date: "2026-10-05" }), price({ paidDate: "2026-10-06" })], [], []), OCT);
    expect([s.verified, s.estimated, s.total]).toEqual([400, 400, 800]);
    expect(s.estimatedSessions).toEqual({ amount: 400, count: 1 });
  });
  it("estimates never leak into the verified breakdown", () => {
    const s = cashStats(cashLines([price({ paidDate: "" })], [pkg({ paidAmount: 1000, startDate: "2026-10-02" })], []), OCT);
    expect([s.sessions, s.packages, s.verified]).toEqual([0, 0, 0]);
    expect(s.estimated).toBe(1400);
  });
});

describe("date-range changes", () => {
  const lines = cashLines(
    [price({ paidDate: "2026-10-28" }), price({ paidDate: "", date: "2026-11-03" })],
    [pkg({ id: "a", paidAmount: 1500 }), pkg({ id: "b", paidAmount: 800, startDate: "2026-10-10" })],
    [], { a: "2026-09-12" });
  it("each estimate counts only in the period containing its stand-in date", () => {
    expect(cashStats(lines, SEP).estimated).toBe(1500);
    expect(cashStats(lines, OCT).estimated).toBe(800);
    expect(cashStats(lines, NOV).estimated).toBe(400);
    expect(cashStats(lines, { from: "2026-09-01", to: "2026-11-30" }).estimated).toBe(2700);
  });
  it("the warning follows the selected AND comparison period, and disappears when neither has estimates", () => {
    const noNS = { untracked: 0, tracked: 1 };
    const { cur, prev } = presetRanges("prevMonth", "2026-11-15");      // Oct vs Sep
    const dq = dataQuality(cashStats(lines, cur), cashStats(lines, prev), noNS, noNS);
    expect(dq.paymentDates?.cur.estimated).toBe(800);
    expect(dq.paymentDates?.prev.estimated).toBe(1500);
    const clean = cashLines([price({})], [], []);
    expect(dataQuality(cashStats(clean, OCT), cashStats(clean, SEP), noNS, noNS).paymentDates).toBeNull();
  });
});

describe("incomplete payment methods", () => {
  it("counts payments with no method, including older package money", () => {
    const s = cashStats(cashLines([price({ paymentMethod: "" }), price({ paymentMethod: "cash" })], [pkg({ startDate: "2026-10-02" })], []), OCT);
    expect(s.methodMissing).toEqual({ amount: 1900, count: 2 });
  });
  it("no warning once every payment in the period has a method", () => {
    const s = cashStats(cashLines([price({ paymentMethod: "card" })], [], []), OCT);
    expect(dataQuality(s, s, { untracked: 0, tracked: 0 }, { untracked: 0, tracked: 0 }).paymentMethods).toBeNull();
  });
});

describe("no-show tracking", () => {
  it("counts appointments before and after tracking began, ignoring rescheduled", () => {
    const appts = [appt("2026-10-20"), appt("2026-10-26", "cancelled"), appt("2026-10-27"), appt("2026-10-28", "no_show"), appt("2026-10-21", "rescheduled")];
    expect(noShowCoverage(appts, OCT, TRACK)).toEqual({ untracked: 2, tracked: 2 });
  });
  it("periods entirely after tracking began raise no warning", () => {
    const appts = [appt("2026-11-02"), appt("2026-11-03", "no_show")];
    const ns = noShowCoverage(appts, NOV, TRACK);
    const s = cashStats([], NOV);
    expect(dataQuality(s, s, ns, noShowCoverage(appts, { from: "2026-10-28", to: "2026-10-31" }, TRACK)).noShow).toBeNull();
  });
  it("a comparison period before tracking still raises it", () => {
    const appts = [appt("2026-09-10"), appt("2026-11-02")];
    const s = cashStats([], NOV);
    expect(dataQuality(s, s, noShowCoverage(appts, NOV, TRACK), noShowCoverage(appts, SEP, TRACK)).noShow?.prev.untracked).toBe(1);
  });
});

describe("monthly expenses are independent of these warnings", () => {
  const cats: ACategory[] = [{ id: "rent", label: "Rent", kind: "operating", active: true }, { id: "salaries", label: "Salaries", kind: "operating", active: true }];
  const saved: AMonthlyExpense[] = [
    { month: "2026-08", categoryId: "rent", amount: 12000 }, { month: "2026-08", categoryId: "salaries", amount: 18000 },
    { month: "2026-09", categoryId: "rent", amount: 12000 }, { month: "2026-09", categoryId: "salaries", amount: 19000 },
    { month: "2026-10", categoryId: "rent", amount: 12500 }, { month: "2026-10", categoryId: "salaries", amount: 19000 },
  ];
  it("totals come straight from the saved records for each whole month", () => {
    expect(expensesForRange(saved, cats, SEP).operating).toBe(31000);
    expect(expensesForRange(saved, cats, OCT).operating).toBe(31500);
    expect(expensesForRange(saved, cats, { from: "2026-08-01", to: "2026-10-31" }).operating).toBe(92500);
    expect(expenseGap(expensesForRange(saved, cats, OCT))).toBeNull();
  });
});
