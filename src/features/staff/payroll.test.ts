import { describe, it, expect } from "vitest";
import { lateness, computeMonth, DEFAULT_PAYROLL_RULES as R } from "./payroll";

const round2 = (n: number) => Math.round(n * 100) / 100;

describe("lateness with a 3:00 PM start and 15-minute grace", () => {
  it.each([
    ["14:50", 0, 0], ["15:00", 0, 0], ["15:08", 8, 0], ["15:15", 15, 0],
    ["15:25", 25, 10], ["15:35", 35, 20], ["16:00", 60, 45], ["18:00", 180, 165],
  ])("check-in %s → actual %i, counted %i", (t, actual, counted) => {
    expect(lateness(t as string, R)).toEqual({ actual, counted });
  });
  it("grace applies per day; an early day never offsets a late one", () => {
    const m = computeMonth({ monthlySalary: 6000, expectedWorkingDays: 10, rules: R, marks: {},
      attendance: [{ date: "2026-10-01", checkIn: "14:00" }, { date: "2026-10-02", checkIn: "15:45" }] });
    expect(m.totalCountedLateness).toBe(30);
  });
});

describe("worked example (5,000 EGP, 12 days, 7 h, 3:00 PM, 15 min grace)", () => {
  const m = computeMonth({
    monthlySalary: 5000, expectedWorkingDays: 12, rules: R, marks: {},
    attendance: [
      { date: "2026-10-05", checkIn: "15:35" }, { date: "2026-10-07", checkIn: "15:06" }, { date: "2026-10-12", checkIn: "15:25" },
      { date: "2026-10-21", checkIn: "18:56" }, { date: "2026-10-24", checkIn: "16:47" },
    ],
  });
  it("counted lateness per day and total", () => {
    expect(m.days.map((d) => d.countedLateness)).toEqual([20, 0, 10, 221, 92]);
    expect(m.totalCountedLateness).toBe(343);
  });
  it("deduction follows the formula 343 × 5000 / 12 / 7 / 60 exactly", () => {
    expect(m.latenessDeduction).toBeCloseTo((343 * 5000) / 12 / 7 / 60, 10);
    // 343 × 5000 / 12 / 7 / 60 = 1,715,000 / 5,040 = 340.2777… — NOT 408.73 as written in the request.
    expect(round2(m.latenessDeduction)).toBe(340.28);
    expect(round2(m.net)).toBe(4659.72);
  });
});

describe("missing attendance and absences", () => {
  it("missing attendance is never deducted; only confirmed absences are, at one daily rate each", () => {
    const base = { monthlySalary: 6000, expectedWorkingDays: 12, rules: R, attendance: [{ date: "2026-10-01", checkIn: "15:00" }] };
    const noMarks = computeMonth({ ...base, marks: {} });
    expect([noMarks.unaccounted, noMarks.absenceDeduction, noMarks.net]).toEqual([11, 0, 6000]);
    const marked = computeMonth({ ...base, marks: { "2026-10-02": "absent", "2026-10-03": "leave", "2026-10-04": "off" } });
    expect([marked.confirmedAbsences, marked.leaveDays, marked.daysOff]).toEqual([1, 1, 1]);
    expect(marked.absenceDeduction).toBe(500);           // 6000 / 12
    expect(marked.unaccounted).toBe(9);                  // 12 − 1 present − 1 absent − 1 leave
    expect(marked.net).toBe(5500);
  });
  it("a record without a check-in needs review and is not deducted", () => {
    const m = computeMonth({ monthlySalary: 6000, expectedWorkingDays: 12, rules: R, marks: {}, attendance: [{ date: "2026-10-01", checkIn: "" }] });
    expect([m.days[0].status, m.incompleteRecords, m.net]).toEqual(["checkin_missing", 1, 6000]);
  });
  it("a check-in on a day marked absent is flagged as a conflict and not charged as an absence", () => {
    const m = computeMonth({ monthlySalary: 6000, expectedWorkingDays: 12, rules: R, marks: { "2026-10-01": "absent" }, attendance: [{ date: "2026-10-01", checkIn: "15:20" }] });
    expect([m.days[0].status, m.confirmedAbsences, m.totalCountedLateness]).toEqual(["conflict", 0, 5]);
  });
});

describe("different doctors and settings", () => {
  const att = [{ date: "2026-10-01", checkIn: "15:45" }];   // 30 counted minutes
  it("each doctor's own salary and expected days set the rate", () => {
    const a = computeMonth({ monthlySalary: 8400, expectedWorkingDays: 20, rules: R, marks: {}, attendance: att });
    const b = computeMonth({ monthlySalary: 4200, expectedWorkingDays: 10, rules: R, marks: {}, attendance: att });
    expect(round2(a.latenessDeduction)).toBe(30);     // 8400/20/7/60 = 1 EGP/min
    expect(round2(b.latenessDeduction)).toBe(30);     // 4200/10/7/60 = 1 EGP/min
    const c = computeMonth({ monthlySalary: 12600, expectedWorkingDays: 15, rules: R, marks: {}, attendance: att });
    expect(round2(c.latenessDeduction)).toBe(60);     // 2 EGP/min
  });
  it("changing grace, start time or shift length changes the result", () => {
    expect(computeMonth({ monthlySalary: 8400, expectedWorkingDays: 20, rules: { ...R, graceMinutes: 0 }, marks: {}, attendance: att }).totalCountedLateness).toBe(45);
    expect(computeMonth({ monthlySalary: 8400, expectedWorkingDays: 20, rules: { ...R, requiredArrival: "16:00" }, marks: {}, attendance: att }).totalCountedLateness).toBe(0);
    expect(round2(computeMonth({ monthlySalary: 8400, expectedWorkingDays: 20, rules: { ...R, shiftHours: 6 }, marks: {}, attendance: att }).latenessDeduction)).toBe(35);
  });
  it("missing salary or expected days can't be computed (no guessed numbers)", () => {
    expect(computeMonth({ monthlySalary: null, expectedWorkingDays: 12, rules: R, marks: {}, attendance: att }).valid).toBe(false);
    expect(computeMonth({ monthlySalary: 5000, expectedWorkingDays: 0, rules: R, marks: {}, attendance: att }).reason).toMatch(/expected working days/);
  });
});
