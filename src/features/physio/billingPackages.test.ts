import { describe, it, expect } from "vitest";
import { packagesForPeriod, packagesWithBalance, packagePaymentDates } from "./billingPackages";

const pkg = (id: string, startDate: string, totalAmount: number, paidAmount: number) =>
  ({ id, patientId: "p", packageSize: 6, totalAmount, paidAmount, startDate, sessionsUsed: 0, active: true });

describe("billing packages by period", () => {
  // Ayman-style: started in October, 3000 of 6000 paid via the log in November.
  const ayman = pkg("k1", "2026-10-20", 6000, 3000);
  const pays = [{ packageId: "k1", amount: 3000, date: "2026-11-03" }];

  it("shows a package in the month it was paid, not only the month it started", () => {
    const nov = packagesForPeriod([ayman], pays, [], "2026-11-01", "2026-11-30");
    expect(nov).toHaveLength(1);
    expect(nov[0]).toMatchObject({ startedIn: false, receivedIn: 3000, balance: 3000 });
    const oct = packagesForPeriod([ayman], pays, [], "2026-10-01", "2026-10-31");
    expect(oct[0]).toMatchObject({ startedIn: true, receivedIn: 0 });
  });

  it("shows a package in a period where its sessions were used", () => {
    const res = packagesForPeriod([ayman], pays, [{ packageId: "k1", date: "2026-12-02" }], "2026-12-01", "2026-12-31");
    expect(res[0]).toMatchObject({ sessionsIn: 1, receivedIn: 0 });
  });

  it("hides packages with no activity in the period", () => {
    expect(packagesForPeriod([ayman], pays, [], "2027-01-01", "2027-01-31")).toHaveLength(0);
  });

  it("places money paid before the payment log on the first session, else the start date", () => {
    const old = pkg("k2", "2026-08-10", 4000, 2500);
    expect(packagePaymentDates([old], [], [])).toEqual([{ packageId: "k2", amount: 2500, date: "2026-08-10" }]);
    expect(packagePaymentDates([old], [], [{ packageId: "k2", date: "2026-08-14" }, { packageId: "k2", date: "2026-08-12" }]))
      .toEqual([{ packageId: "k2", amount: 2500, date: "2026-08-12" }]);
    // 1000 logged later + 1500 from before the log
    expect(packagePaymentDates([old], [{ packageId: "k2", amount: 1000, date: "2026-11-01" }], []))
      .toEqual([{ packageId: "k2", amount: 1000, date: "2026-11-01" }, { packageId: "k2", amount: 1500, date: "2026-08-10" }]);
  });

  it("lists every package still owed, largest balance first", () => {
    const list = packagesWithBalance([pkg("a", "2026-01-01", 1000, 1000), pkg("b", "2026-01-01", 2000, 1500), ayman]);
    expect(list.map((p) => p.id)).toEqual(["k1", "b"]);
  });
});
