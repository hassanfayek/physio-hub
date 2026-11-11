// FILE: src/features/physio/billingPackages.ts
// Which packages the Billing tab shows for a period, and how much package money
// actually came in during it. A package belongs to a period when it started in
// it, received a payment in it, or had sessions used in it — not only by start
// date (which hid packages paid in instalments or started in an earlier month).
//
// Payment dates come from the packagePayments log. Money paid before that log
// existed (paidAmount − Σ logged) has no recorded date, so — exactly like the
// Business Analytics cash view — it is placed on the package's first session,
// or its start date when no session exists yet. Unit-tested in billingPackages.test.ts.

export interface BPackage {
  id: string; patientId: string; packageSize: number; totalAmount: number; paidAmount: number;
  startDate: string; sessionsUsed: number; active: boolean;
}
export interface BPayment { packageId: string; amount: number; date: string; }
export interface BSession { packageId: string; date: string; }

export interface PackageActivity<P extends BPackage = BPackage> {
  pkg:             P;
  startedIn:       boolean;   // start date falls in the period
  receivedIn:      number;    // package money received during the period (EGP)
  sessionsIn:      number;    // package sessions used during the period
  balance:         number;    // still owed on the package today
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Every package payment with the date it counts on (logged, or the legacy stand-in). */
export function packagePaymentDates(pkgs: BPackage[], payments: BPayment[], sessions: BSession[]): BPayment[] {
  const firstSession: Record<string, string> = {};
  for (const s of sessions) if (s.packageId && s.date && (!firstSession[s.packageId] || s.date < firstSession[s.packageId])) firstSession[s.packageId] = s.date;
  const logged: Record<string, number> = {};
  for (const p of payments) logged[p.packageId] = (logged[p.packageId] ?? 0) + (Number(p.amount) || 0);
  const out = payments.filter((p) => p.packageId && p.date).map((p) => ({ packageId: p.packageId, amount: Number(p.amount) || 0, date: p.date }));
  for (const k of pkgs) {
    const legacy = (Number(k.paidAmount) || 0) - (logged[k.id] ?? 0);
    const date = firstSession[k.id] || k.startDate;
    if (legacy > 0.0001 && date) out.push({ packageId: k.id, amount: legacy, date });
  }
  return out;
}

export function packagesForPeriod<P extends BPackage>(
  pkgs: P[], payments: BPayment[], sessions: BSession[], from: string, to: string,
): PackageActivity<P>[] {
  const inP = (d: string) => !!d && d >= from && d <= to;
  const received: Record<string, number> = {};
  for (const p of packagePaymentDates(pkgs, payments, sessions)) if (inP(p.date)) received[p.packageId] = (received[p.packageId] ?? 0) + p.amount;
  const used: Record<string, number> = {};
  for (const s of sessions) if (s.packageId && inP(s.date)) used[s.packageId] = (used[s.packageId] ?? 0) + 1;

  return pkgs
    .map((pkg) => ({
      pkg,
      startedIn:  inP(pkg.startDate),
      receivedIn: r2(received[pkg.id] ?? 0),
      sessionsIn: used[pkg.id] ?? 0,
      balance:    r2(Math.max(0, (Number(pkg.totalAmount) || 0) - (Number(pkg.paidAmount) || 0))),
    }))
    .filter((a) => a.startedIn || Math.abs(a.receivedIn) > 0.0001 || a.sessionsIn > 0)
    .sort((a, b) => (b.pkg.startDate || "").localeCompare(a.pkg.startDate || ""));
}

/** All packages that still have money owed, whatever their dates — largest balance first. */
export function packagesWithBalance<P extends BPackage>(pkgs: P[]): P[] {
  return pkgs
    .filter((p) => (Number(p.totalAmount) || 0) - (Number(p.paidAmount) || 0) > 0.0001)
    .sort((a, b) => (b.totalAmount - b.paidAmount) - (a.totalAmount - a.paidAmount));
}
