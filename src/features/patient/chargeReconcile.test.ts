import { describe, it, expect } from "vitest";
import { reconcileCharges, type RCharge, type RAppt } from "./chargeReconcile";

let n = 0;
const ch = (p: Partial<RCharge>): RCharge => ({ id: `c${n++}`, appointmentId: "", date: "2026-10-01", amount: 400, paid: true, packageId: "", createdAtMs: n, ...p });

describe("reconcileCharges", () => {
  it("Eslam-style case: totals follow the visible rows, hidden charges are listed", () => {
    const appts: RAppt[] = [
      { id: "a1", date: "2026-09-15", status: "completed" },
      { id: "a2", date: "2026-10-13", status: "completed" },
      { id: "a3", date: "2026-10-18", status: "completed" },
      { id: "a4", date: "2026-10-20", status: "cancelled" },
    ];
    const charges = [
      ch({ appointmentId: "a1" }), ch({ appointmentId: "a2" }), ch({ appointmentId: "a3" }),
      ch({ appointmentId: "a2", amount: 800, paid: false }),   // duplicate, unpaid full price
      ch({ appointmentId: "a4", amount: 800, paid: true }),    // cancelled appointment
      ch({ appointmentId: "gone", amount: 800, paid: false }), // deleted appointment
    ];
    const r = reconcileCharges(charges, appts);
    expect(r.totals).toEqual({ billed: 1200, paid: 1200, due: 0 });
    expect(r.extras.map((e) => e.reason).sort()).toEqual(["appointment_deleted", "duplicate", "not_completed"]);
    expect(r.extras.find((e) => e.reason === "not_completed")!.goToDate).toBe("2026-10-20");
    expect(r.extras.find((e) => e.reason === "duplicate")!.goToDate).toBe("2026-10-13");
  });

  it("for duplicates, shows the paid charge over an unpaid one, else the newest", () => {
    const appts: RAppt[] = [{ id: "a", date: "2026-10-01", status: "completed" }, { id: "b", date: "2026-10-02", status: "completed" }];
    const r = reconcileCharges([
      ch({ id: "unpaid", appointmentId: "a", paid: false, createdAtMs: 100 }), ch({ id: "paid", appointmentId: "a", paid: true, createdAtMs: 1 }),
      ch({ id: "old", appointmentId: "b", createdAtMs: 1 }), ch({ id: "new", appointmentId: "b", createdAtMs: 2 }),
    ], appts);
    expect(r.shownByAppt.get("a")!.id).toBe("paid");
    expect(r.shownByAppt.get("b")!.id).toBe("new");
  });

  it("charges deliberately kept (e.g. a cancellation fee) count in totals", () => {
    const r = reconcileCharges(
      [ch({ appointmentId: "a" }), ch({ appointmentId: "x", amount: 200, paid: false, keptAsExtra: true })],
      [{ id: "a", date: "2026-10-01", status: "completed" }, { id: "x", date: "2026-10-02", status: "cancelled" }],
    );
    expect(r.totals).toEqual({ billed: 600, paid: 400, due: 200 });
    expect(r.extras).toHaveLength(1);
  });

  it("charges with no appointment id are surfaced, not merged", () => {
    const r = reconcileCharges([ch({ appointmentId: "" }), ch({ appointmentId: "" })], []);
    expect(r.extras.map((e) => e.reason)).toEqual(["no_appointment", "no_appointment"]);
    expect(r.totals.billed).toBe(0);
  });
});

import { findChargeIssues, type IssueCharge } from "./chargeReconcile";

describe("findChargeIssues", () => {
  const ic = (p: Partial<IssueCharge>): IssueCharge => ({ ...ch({}), patientId: "p1", paidDate: "2026-10-01", ...p });
  it("finds hidden charges per patient plus paid-date problems, skipping kept ones", () => {
    const appts: RAppt[] = [{ id: "a", date: "2026-10-01", status: "completed" }, { id: "b", date: "2026-10-02", status: "cancelled" }];
    const issues = findChargeIssues([
      ic({ appointmentId: "a" }), ic({ appointmentId: "a", paid: false }),             // duplicate
      ic({ appointmentId: "b", keptAsExtra: true }),                                   // kept → ignored
      ic({ patientId: "p2", appointmentId: "a2", paidDate: "" }),                      // deleted appt + no paid date
      ic({ patientId: "p3", appointmentId: "", paidDate: "2027-01-01" }),              // no appt + future
    ], appts, "2026-10-27");
    expect(issues.map((i) => i.kind).sort()).toEqual(["appointment_deleted", "duplicate", "no_appointment", "paid_future", "paid_no_date"]);
  });
});
