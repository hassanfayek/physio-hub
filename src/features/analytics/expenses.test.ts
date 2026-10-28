import { describe, it, expect } from "vitest";
import { expensesForRange, expenseGap, monthCoverage, isWholeMonths, monthsInRange, recordedFixedCosts, type ACategory, type AMonthlyExpense } from "./metrics";
import { buildTemplate, parseCsv, parseMonth, parseAmount, validateImport } from "./expenseCsv";

const cats: ACategory[] = [
  { id: "rent", label: "Rent", kind: "operating", active: true },
  { id: "marketing", label: "Marketing and advertising", kind: "operating", active: true },
  { id: "equipment_purchase", label: "Equipment purchases", kind: "capital", active: true },
  { id: "old", label: "Old category", kind: "operating", active: false },
];
const e = (month: string, categoryId: string, amount: number): AMonthlyExpense => ({ month, categoryId, amount });
const SEP = { from: "2026-09-01", to: "2026-09-30" };

describe("monthly expense coverage", () => {
  it("a month is complete only when every active category is entered; 0 counts as entered", () => {
    expect(monthCoverage([e("2026-09", "rent", 10000), e("2026-09", "marketing", 0)], cats, "2026-09"))
      .toMatchObject({ entered: 2, required: 3, complete: false, missing: ["equipment_purchase"] });
    expect(monthCoverage([e("2026-09", "rent", 1), e("2026-09", "marketing", 0), e("2026-09", "equipment_purchase", 0)], cats, "2026-09").complete).toBe(true);
  });
  it("inactive categories aren't required but still count in totals", () => {
    const p = expensesForRange([e("2026-09", "rent", 1000), e("2026-09", "marketing", 0), e("2026-09", "equipment_purchase", 0), e("2026-09", "old", 50)], cats, SEP);
    expect(p.complete).toBe(true);
    expect(p.total).toBe(1050);
  });
  it("capital is kept out of operating", () => {
    const p = expensesForRange([e("2026-09", "rent", 10000), e("2026-09", "marketing", 2000), e("2026-09", "equipment_purchase", 30000)], cats, SEP);
    expect([p.operating, p.capital, p.total, p.marketing]).toEqual([12000, 30000, 42000, 2000]);
  });
});

describe("period policy (no prorating)", () => {
  it("whole months only", () => {
    expect(isWholeMonths(SEP)).toBe(true);
    expect(isWholeMonths({ from: "2026-10-01", to: "2026-10-28" })).toBe(false);
    expect(isWholeMonths({ from: "2026-09-01", to: "2026-10-31" })).toBe(true);
    expect(monthsInRange({ from: "2026-11-20", to: "2027-01-05" })).toEqual(["2026-11", "2026-12", "2027-01"]);
  });
  it("partial periods and missing months explain themselves instead of showing 0", () => {
    const full = [e("2026-09", "rent", 1), e("2026-09", "marketing", 1), e("2026-09", "equipment_purchase", 0)];
    expect(expenseGap(expensesForRange(full, cats, SEP))).toBeNull();
    expect(expenseGap(expensesForRange(full, cats, { from: "2026-10-01", to: "2026-10-28" }))).toMatch(/whole month/);
    expect(expenseGap(expensesForRange([], cats, SEP))).toMatch(/not entered/);
    expect(expenseGap(expensesForRange([e("2026-09", "rent", 1)], cats, SEP))).toMatch(/1 of 3/);
  });
  it("recorded fixed costs average only complete months before the given month", () => {
    const all = [
      ...["rent", "marketing", "equipment_purchase"].map((c) => e("2026-08", c, c === "rent" ? 10000 : c === "equipment_purchase" ? 50000 : 2000)),
      ...["rent", "marketing", "equipment_purchase"].map((c) => e("2026-09", c, c === "rent" ? 12000 : 0)),
      e("2026-07", "rent", 99999),                                   // incomplete → ignored
      ...["rent", "marketing", "equipment_purchase"].map((c) => e("2026-10", c, 1)), // current month → ignored
    ];
    const r = recordedFixedCosts(all, cats, "2026-10");
    expect(r.months).toEqual(["2026-09", "2026-08"]);
    expect(r.average).toBe((12000 + 12000) / 2);   // capital excluded
  });
});

describe("CSV", () => {
  it("template has a BOM, a header and one row per active category per month", () => {
    const t = buildTemplate(cats, ["2026-09"]);
    expect(t.startsWith("\uFEFF")).toBe(true);
    expect(t.slice(1).trim().split("\r\n")).toEqual(["month,category,amount,notes", "2026-09,Rent,,", "2026-09,Marketing and advertising,,", "2026-09,Equipment purchases,,"]);
  });
  it("parses quotes, CRLF and semicolon-separated Excel exports", () => {
    expect(parseCsv('month,category,amount,notes\r\n2026-09,"Rent, main",10000,"a ""b"""\r\n')).toEqual([["month", "category", "amount", "notes"], ["2026-09", "Rent, main", "10000", 'a "b"']]);
    expect(parseCsv("month;category;amount\n2026-09;Rent;1 000")).toEqual([["month", "category", "amount"], ["2026-09", "Rent", "1 000"]]);
  });
  it("month and amount formats", () => {
    expect(["2026-09", "2026/9", "09/2026", "2026-09-01", "Sep 2026", "September 2026", "Sep-26"].map(parseMonth)).toEqual(Array(7).fill("2026-09"));
    expect(parseMonth("13/2026")).toBeNull();
    expect([parseAmount("12,500"), parseAmount("12500 EGP"), parseAmount("0"), parseAmount("-5"), parseAmount("abc")]).toEqual([12500, 12500, 0, null, null]);
  });
  it("validation: new, same, conflict (never auto-overwritten), invalid, duplicate, blank", () => {
    const rows = parseCsv([
      "month,category,amount,notes",
      "2026-09,Rent,10000,",
      "2026-09,rent,11000,",               // duplicate in file
      "2026-09,Marketing and advertising,2000,",
      "2026-08,Rent,9000,",
      "2026-09,Unknown,5,",
      "2026-09,Equipment purchases,abc,",
      "2027-01,Rent,1,",
      "2026-07,Rent,,",
    ].join("\n"));
    const v = validateImport(rows, cats, [e("2026-09", "marketing", 2000), e("2026-08", "rent", 8000)], "2026-10");
    expect(v.map((r) => r.status)).toEqual(["new", "duplicate_in_file", "same", "conflict", "invalid", "invalid", "invalid", "blank"]);
    expect(v[3].existingAmount).toBe(8000);
    expect(v[0].line).toBe(2);
  });
});
