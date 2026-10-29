// FILE: src/features/staff/payroll.ts
// Attendance-based salary calculation (pure; unit-tested in payroll.test.ts).
//
//   dailyRate  = monthlySalary / expectedWorkingDays
//   hourlyRate = dailyRate / shiftHours
//   minuteRate = hourlyRate / 60
//   per day:  actual  = max(0, checkIn − requiredArrival)
//             counted = max(0, actual − grace)   (grace applies to each day on its own;
//                                                 arriving early never offsets another day)
//             lateness deduction = counted × minuteRate
//   confirmed unexcused absence = one dailyRate each (kept separate from lateness)
//   net = salary − lateness deductions − absence deductions
// Full precision internally; round only for display.

export interface PayrollRules {
  requiredArrival: string;   // "HH:MM", clinic-local (default "15:00")
  graceMinutes:    number;   // default 15
  shiftHours:      number;   // default 7
}
export const DEFAULT_PAYROLL_RULES: PayrollRules = { requiredArrival: "15:00", graceMinutes: 15, shiftHours: 7 };

/** Admin-confirmed status for a date. Missing attendance is never assumed absent. */
export type DayMark = "absent" | "leave" | "off";

export type DayStatus =
  | "present"          // has a check-in
  | "checkin_missing"  // attendance record exists but no check-in → needs review, no deduction
  | "absent"           // confirmed unexcused absence → absence deduction
  | "leave"            // approved leave → no deduction
  | "off"              // scheduled day off → not a working day
  | "conflict";        // check-in recorded AND marked absent/leave/off → needs review, lateness still counted

export interface DayRow {
  date: string; checkIn: string; status: DayStatus; mark: DayMark | null;
  actualLateness: number; countedLateness: number; deduction: number;
}

export interface MonthResult {
  valid: boolean;               // salary and expected days set (> 0)
  reason: string | null;        // why it can't be computed
  dailyRate: number; hourlyRate: number; minuteRate: number;
  days: DayRow[];
  recordedDays: number;         // days with a check-in
  incompleteRecords: number;    // records without a check-in
  confirmedAbsences: number; leaveDays: number; daysOff: number; conflicts: number;
  unaccounted: number;          // expected working days with no record or mark at all → review
  totalActualLateness: number; totalCountedLateness: number;
  latenessDeduction: number; absenceDeduction: number; net: number;
}

export const toMinutes = (hhmm: string): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  return h < 24 && mi < 60 ? h * 60 + mi : null;
};

export function lateness(checkIn: string, rules: PayrollRules): { actual: number; counted: number } {
  const c = toMinutes(checkIn), r = toMinutes(rules.requiredArrival);
  if (c === null || r === null) return { actual: 0, counted: 0 };
  const actual = Math.max(0, c - r);
  return { actual, counted: Math.max(0, actual - Math.max(0, rules.graceMinutes)) };
}

export function computeMonth(input: {
  monthlySalary: number | null;
  expectedWorkingDays: number | null;
  rules: PayrollRules;
  attendance: { date: string; checkIn: string }[];   // this month's records
  marks: Record<string, DayMark>;                    // admin-confirmed statuses
}): MonthResult {
  const { monthlySalary: salary, expectedWorkingDays: expected, rules } = input;
  const reason =
    salary === null || !(salary >= 0) ? "Set the monthly salary." :
    expected === null || !(expected > 0) ? "Set the expected working days for this month." :
    !(rules.shiftHours > 0) ? "Shift duration must be more than 0 hours." :
    toMinutes(rules.requiredArrival) === null ? "Required arrival time is invalid." : null;
  const valid = reason === null;
  const dailyRate = valid ? salary! / expected! : 0;
  const hourlyRate = valid ? dailyRate / rules.shiftHours : 0;
  const minuteRate = valid ? hourlyRate / 60 : 0;

  const byDate = new Map(input.attendance.map((a) => [a.date, a] as const));
  const dates = [...new Set([...byDate.keys(), ...Object.keys(input.marks)])].sort();
  const days: DayRow[] = dates.map((date) => {
    const rec = byDate.get(date);
    const mark = input.marks[date] ?? null;
    const checkIn = rec?.checkIn ?? "";
    const hasCheckIn = toMinutes(checkIn) !== null;
    const status: DayStatus = hasCheckIn ? (mark ? "conflict" : "present") : mark ?? "checkin_missing";
    const { actual, counted } = hasCheckIn ? lateness(checkIn, rules) : { actual: 0, counted: 0 };
    return { date, checkIn, status, mark, actualLateness: actual, countedLateness: counted, deduction: counted * minuteRate };
  });

  const n = (s: DayStatus) => days.filter((d) => d.status === s).length;
  const recordedDays = n("present") + n("conflict");
  const confirmedAbsences = n("absent");
  const leaveDays = n("leave");
  const incompleteRecords = n("checkin_missing");
  const totalCountedLateness = days.reduce((s, d) => s + d.countedLateness, 0);
  const latenessDeduction = totalCountedLateness * minuteRate;
  const absenceDeduction = confirmedAbsences * dailyRate;
  return {
    valid, reason, dailyRate, hourlyRate, minuteRate, days,
    recordedDays, incompleteRecords, confirmedAbsences, leaveDays, daysOff: n("off"), conflicts: n("conflict"),
    unaccounted: Math.max(0, (expected ?? 0) - recordedDays - confirmedAbsences - leaveDays - incompleteRecords),
    totalActualLateness: days.reduce((s, d) => s + d.actualLateness, 0),
    totalCountedLateness, latenessDeduction, absenceDeduction,
    net: valid ? salary! - latenessDeduction - absenceDeduction : 0,
  };
}

/** Money for display: 2 decimals, thousands separators. */
export const money = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
