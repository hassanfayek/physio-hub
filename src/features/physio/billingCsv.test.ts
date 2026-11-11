import { describe, it, expect } from "vitest";
import { billingCsv } from "./billingCsv";

const names: Record<string, string> = { p1: "Mona Adel", p2: "Omar, Ali" };
const name = (id: string) => names[id] ?? "";

describe("billing CSV", () => {
  const csv = billingCsv(
    [
      { id: "s2", patientId: "p1", date: "2026-10-05", sessionType: "Physiotherapy Session", physioName: "Dr. A", amount: 400, paid: false, paidDate: "", packageId: "", notes: "" },
      { id: "s1", patientId: "p1", date: "2026-10-02", sessionType: "", physioName: "Dr. A", amount: 400, paid: true, paidDate: "2026-10-03", packageId: "", notes: "cash" },
      { id: "s3", patientId: "p2", date: "2026-10-05", sessionType: "Recovery Session", physioName: "", amount: 250, paid: true, paidDate: "2026-10-05", packageId: "k1", notes: "" },
    ],
    [{ id: "k1", patientId: "p2", startDate: "2026-10-01", packageSize: 12, totalAmount: 3000, paidAmount: 1000, sessionsUsed: 3, active: true, notes: "" }],
    name,
    (id) => (id === "k1" ? 1000 : 0),
  );
  const lines = csv.replace("﻿", "").trim().split("\r\n");

  it("one row per record, sorted by date, with a header", () => {
    expect(lines).toHaveLength(5);
    expect(lines[0].startsWith("Type,Record ID,Date,Patient")).toBe(true);
    expect(lines.slice(1).map((l) => l.split(",")[1])).toEqual(["k1", "s1", "s2", "s3"]);
  });
  it("session paid/balance and package balance", () => {
    expect(lines[2]).toBe("Session charge,s1,2026-10-02,Mona Adel,Session,Dr. A,400,Yes,2026-10-03,400,0,No,,,,400,cash");
    expect(lines[3]).toContain(",400,No,,0,400,No,");
    expect(lines[1]).toBe('Package,k1,2026-10-01,"Omar, Ali",12-session package,,3000,Partly,,1000,2000,,12,3,Active,1000,');
  });
  it("package-covered sessions carry no balance of their own", () => {
    expect(lines[4]).toBe('Session charge,s3,2026-10-05,"Omar, Ali",Recovery Session,,250,Yes,2026-10-05,,,Yes,,,,,');
  });
});
