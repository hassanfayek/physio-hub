import { describe, it, expect } from "vitest";
import { visitsByPatient, balancesByPatient, applyFilter, sortPatients, toCsv, assignedTo, type LPatient, type LAppt } from "./patientListLogic";

const TODAY = "2026-11-02";
const pt = (p: Partial<LPatient>): LPatient => ({ uid: "p", firstName: "A", lastName: "B", phone: "", email: "", status: "active", createdDate: "2026-10-01",
  physioId: "", seniorEditorId: null, juniorIds: [], traineeId: null, ...p });
const ap = (p: Partial<LAppt>): LAppt => ({ id: Math.random().toString(36), patientId: "p1", date: "2026-10-20", hour: 16, status: "completed", ...p });

describe("visits", () => {
  it("last completed and next upcoming", () => {
    const v = visitsByPatient([
      ap({ date: "2026-10-20" }), ap({ date: "2026-10-28" }), ap({ date: "2026-10-30", status: "cancelled" }),
      ap({ date: "2026-11-05", status: "scheduled", hour: 18 }), ap({ date: "2026-11-05", status: "scheduled", hour: 15 }), ap({ date: "2026-11-01", status: "scheduled" }),
    ], TODAY).get("p1")!;
    expect(v.last).toBe("2026-10-28");
    expect(v.next).toEqual({ date: "2026-11-05", hour: 15 });   // a past "scheduled" one doesn't count
  });
});

describe("balances", () => {
  it("unpaid session charges once per session, plus package balances", () => {
    const st = new Map([["a1", "completed"], ["a2", "cancelled"], ["a3", "completed"]]);
    const b = balancesByPatient([
      { id: "1", patientId: "p1", appointmentId: "a1", amount: 400, paid: false, packageId: "" },
      { id: "2", patientId: "p1", appointmentId: "a1", amount: 800, paid: false, packageId: "" },   // duplicate
      { id: "3", patientId: "p1", appointmentId: "a2", amount: 400, paid: false, packageId: "" },   // cancelled
      { id: "4", patientId: "p1", appointmentId: "a2", amount: 200, paid: false, packageId: "", keptAsExtra: true }, // kept fee
      { id: "5", patientId: "p1", appointmentId: "a3", amount: 250, paid: false, packageId: "k1" }, // package session
      { id: "6", patientId: "p2", appointmentId: "old", amount: 300, paid: false, packageId: "" },  // unknown appt → counts
    ], [{ patientId: "p1", totalAmount: 1500, paidAmount: 1000 }, { patientId: "p2", totalAmount: 900, paidAmount: 900 }], st);
    expect(b.get("p1")).toBe(400 + 200 + 500);
    expect(b.get("p2")).toBe(300);
  });
});

describe("filters and sort", () => {
  const ps = [
    pt({ uid: "a", firstName: "Zed", status: "active", seniorEditorId: "d1", acquisitionSource: "meta_ads", createdDate: "2026-09-01" }),
    pt({ uid: "b", firstName: "Amy", status: "on_hold", juniorIds: ["d1"], referredByPhysicianId: "x", createdDate: "2026-10-15" }),
    pt({ uid: "c", firstName: "Bob", status: "active", traineeId: "d2", createdDate: "2026-10-20" }),
  ];
  const visits = visitsByPatient([ap({ patientId: "a", date: "2026-11-04", status: "scheduled" }), ap({ patientId: "c", date: "2026-10-30" })], TODAY);
  const bal = new Map([["b", 300], ["c", 50]]);
  const f = { status: "" as const, doctor: "", source: "", attention: "" as const };
  it("doctor filter matches any assignment role", () => {
    expect(applyFilter(ps, { ...f, doctor: "d1" }, visits, bal).map((p) => p.uid)).toEqual(["a", "b"]);
    expect(assignedTo(ps[2], "d2")).toBe(true);
  });
  it("status, source (incl. doctor referral / unknown) and attention filters", () => {
    expect(applyFilter(ps, { ...f, status: "on_hold" }, visits, bal).map((p) => p.uid)).toEqual(["b"]);
    expect(applyFilter(ps, { ...f, source: "doctor_referral" }, visits, bal).map((p) => p.uid)).toEqual(["b"]);
    expect(applyFilter(ps, { ...f, source: "unknown" }, visits, bal).map((p) => p.uid)).toEqual(["c"]);
    expect(applyFilter(ps, { ...f, attention: "no_upcoming" }, visits, bal).map((p) => p.uid)).toEqual(["c"]);   // active only
    expect(applyFilter(ps, { ...f, attention: "owes" }, visits, bal).map((p) => p.uid)).toEqual(["b", "c"]);
    expect(applyFilter(ps, { ...f, attention: "no_senior" }, visits, bal).map((p) => p.uid)).toEqual(["b", "c"]);
  });
  it("sorts by name, newest, last visit and balance", () => {
    expect(sortPatients(ps, "name", visits, bal).map((p) => p.uid)).toEqual(["b", "c", "a"]);
    expect(sortPatients(ps, "newest", visits, bal).map((p) => p.uid)).toEqual(["c", "b", "a"]);
    expect(sortPatients(ps, "last_visit", visits, bal)[0].uid).toBe("c");
    expect(sortPatients(ps, "balance", visits, bal).map((p) => p.uid)).toEqual(["b", "c", "a"]);
  });
});

describe("csv", () => {
  it("quotes and keeps leading zeros as text", () => {
    expect(toCsv([["Name", "Phone"], ['Mona "M", Adel', "01001112223"]])).toBe('\uFEFFName,Phone\r\n"Mona ""M"", Adel",01001112223\r\n');
  });
});
