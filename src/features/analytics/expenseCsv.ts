// FILE: src/features/analytics/expenseCsv.ts
// Excel-compatible CSV template + import validation for monthly expenses.
// Pure: parsing and validation never write anything; the UI shows the preview
// and saves only the rows the owner confirms.

import type { ACategory, AMonthlyExpense } from "./metrics";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/** Template with one row per active category for each given month (amounts blank). */
export function buildTemplate(cats: ACategory[], months: string[]): string {
  const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const rows = ["month,category,amount,notes"];
  for (const m of months) for (const c of cats.filter((x) => x.active)) rows.push(`${m},${esc(c.label)},,`);
  return "\uFEFF" + rows.join("\r\n") + "\r\n";   // BOM so Excel opens it as UTF-8
}

/** Minimal RFC-4180 parser; auto-detects comma / semicolon / tab (Excel locale exports). */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, "");
  const firstLine = src.split(/\r?\n/, 1)[0] ?? "";
  const delim = [",", ";", "\t"].sort((a, b) => firstLine.split(b).length - firstLine.split(a).length)[0];
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (q) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === delim) { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); rows.push(row); row = []; cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/** Accepts 2026-10, 2026/10, 10/2026, 2026-10-01, "Oct 2026", "October 2026", "Oct-26". */
export function parseMonth(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  let m: RegExpMatchArray | null;
  const mk = (y: number, mo: number) => (mo >= 1 && mo <= 12 && y >= 2000 && y <= 2100 ? `${y}-${String(mo).padStart(2, "0")}` : null);
  if ((m = v.match(/^(\d{4})[-/.](\d{1,2})(?:[-/.]\d{1,2})?$/))) return mk(+m[1], +m[2]);
  if ((m = v.match(/^(\d{1,2})[-/.](\d{4})$/))) return mk(+m[2], +m[1]);
  if ((m = v.match(/^([a-z]{3})[a-z]*[\s\-/.,]+(\d{2}|\d{4})$/))) {
    const mo = MONTHS.indexOf(m[1]) + 1;
    const y = m[2].length === 2 ? 2000 + +m[2] : +m[2];
    return mo ? mk(y, mo) : null;
  }
  return null;
}

/** "12,500", "12500 EGP", "EGP 1,200.50" → number; null if not a valid amount. */
export function parseAmount(raw: string): number | null {
  const v = raw.replace(/egp|le|ج\.م/gi, "").replace(/[,\s]/g, "").trim();
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export type ImportStatus = "new" | "same" | "conflict" | "invalid" | "duplicate_in_file" | "blank";
export interface ImportRow {
  line: number;                 // 1-based line in the file (header = 1)
  raw: string[];
  month: string | null; categoryId: string | null; amount: number | null; notes: string;
  status: ImportStatus;
  message: string;
  existingAmount?: number;
}

/** Validates parsed rows against categories and what's already saved. Nothing is
 *  overwritten by default: rows that differ from a saved value are "conflict". */
export function validateImport(rows: string[][], cats: ACategory[], existing: AMonthlyExpense[], currentMonth: string): ImportRow[] {
  if (!rows.length) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const hasHeader = col("month") >= 0 && col("category") >= 0 && col("amount") >= 0;
  const idx = hasHeader ? { month: col("month"), category: col("category"), amount: col("amount"), notes: col("notes") } : { month: 0, category: 1, amount: 2, notes: 3 };
  const body = hasHeader ? rows.slice(1) : rows;
  const byKey = new Map<string, AMonthlyExpense>(existing.map((e) => [`${e.month}__${e.categoryId}`, e]));
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const findCat = (v: string) => cats.find((c) => norm(c.id) === norm(v) || norm(c.label) === norm(v));
  const seen = new Set<string>();

  return body.map((r, i) => {
    const line = i + (hasHeader ? 2 : 1);
    const get = (k: number) => (k >= 0 ? (r[k] ?? "").trim() : "");
    const [mRaw, cRaw, aRaw, notes] = [get(idx.month), get(idx.category), get(idx.amount), get(idx.notes)];
    const base = { line, raw: r, notes, month: null as string | null, categoryId: null as string | null, amount: null as number | null };
    if (!aRaw && !notes) return { ...base, status: "blank" as const, message: "Blank amount, skipped" };
    const month = parseMonth(mRaw);
    if (!month) return { ...base, status: "invalid" as const, message: `Unrecognised month "${mRaw}" (use YYYY-MM)` };
    if (month > currentMonth) return { ...base, month, status: "invalid" as const, message: "Month is in the future" };
    const cat = findCat(cRaw);
    if (!cat) return { ...base, month, status: "invalid" as const, message: `Unknown category "${cRaw}"` };
    const amount = parseAmount(aRaw);
    if (amount === null) return { ...base, month, categoryId: cat.id, status: "invalid" as const, message: aRaw ? `Invalid amount "${aRaw}"` : "Missing amount" };
    const key = `${month}__${cat.id}`;
    if (seen.has(key)) return { ...base, month, categoryId: cat.id, amount, status: "duplicate_in_file" as const, message: "Same month and category appears earlier in the file" };
    seen.add(key);
    const ex = byKey.get(key);
    if (ex && ex.amount === amount) return { ...base, month, categoryId: cat.id, amount, status: "same" as const, message: "Already saved with this amount", existingAmount: ex.amount };
    if (ex) return { ...base, month, categoryId: cat.id, amount, status: "conflict" as const, message: "Already saved with a different amount", existingAmount: ex.amount };
    return { ...base, month, categoryId: cat.id, amount, status: "new" as const, message: "Ready to import" };
  });
}
