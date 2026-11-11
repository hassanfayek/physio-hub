// FILE: src/features/physio/billingCsv.ts
// Billing tab → Export CSV: every session charge and package in the selected
// period, one row each, with the record ID so two exports can be matched line
// by line in a spreadsheet. Amounts are plain numbers (no separators) so they
// can be compared or summed. Unit-tested in billingCsv.test.ts.

import { toCsv } from "./patientListLogic";

export interface CsvSession {
  id: string; patientId: string; date: string; sessionType: string; physioName: string;
  amount: number; paid: boolean; paidDate: string; packageId: string; notes: string;
}
export interface CsvPackage {
  id: string; patientId: string; startDate: string; packageSize: number; totalAmount: number;
  paidAmount: number; sessionsUsed: number; active: boolean; notes: string;
}

export const BILLING_CSV_HEADER = [
  "Type", "Record ID", "Date", "Patient", "Session / package", "Physiotherapist",
  "Amount (EGP)", "Paid", "Paid date", "Paid amount (EGP)", "Balance (EGP)",
  "Covered by package", "Package sessions", "Sessions used", "Package status", "Notes",
];

const n = (v: number) => Math.round((Number(v) || 0) * 100) / 100;

export function billingCsv(sessions: CsvSession[], packages: CsvPackage[], patientName: (id: string) => string): string {
  const rows: (string | number)[][] = [
    ...sessions.map((s) => [
      "Session charge", s.id, s.date, patientName(s.patientId), s.sessionType || "Session", s.physioName || "",
      n(s.amount), s.paid ? "Yes" : "No", s.paid ? s.paidDate || "" : "",
      // Package-covered sessions are paid through the package, so they carry no balance of their own.
      s.packageId ? "" : s.paid ? n(s.amount) : 0, s.packageId ? "" : s.paid ? 0 : n(s.amount),
      s.packageId ? "Yes" : "No", "", "", "", s.notes || "",
    ]),
    ...packages.map((p) => [
      "Package", p.id, p.startDate, patientName(p.patientId), `${p.packageSize}-session package`, "",
      n(p.totalAmount), p.paidAmount >= p.totalAmount ? "Yes" : p.paidAmount > 0 ? "Partly" : "No", "",
      n(p.paidAmount), n(Math.max(0, p.totalAmount - p.paidAmount)),
      "", p.packageSize, p.sessionsUsed, p.active ? "Active" : "Completed", p.notes || "",
    ]),
  ].sort((a, b) => String(a[2]).localeCompare(String(b[2])) || String(a[0]).localeCompare(String(b[0])) || String(a[3]).localeCompare(String(b[3])));
  return toCsv([BILLING_CSV_HEADER, ...rows]);
}
