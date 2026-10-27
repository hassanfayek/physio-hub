// FILE: src/features/analytics/analyticsData.ts
// Loads exactly the window Business Analytics needs (selected + comparison
// period, 6-month trend, follow-up lookback, and future bookings) and maps it
// to the normalised shapes in metrics.ts. Single-field range/equality queries
// only — no composite indexes required.

import { collection, getDocs, query, where, type QueryConstraint } from "firebase/firestore";
import { db } from "../../firebase";
import { docToAppointment } from "../../services/appointmentService";
import { docToSessionPrice, docToPackage } from "../../services/priceService";
import { CLINIC_TIMEZONE } from "../../services/businessService";
import { dedupeById, firstSessionByPackage, type AAppt, type APrice, type APackage, type APkgPayment, type AExpense, type APatient, type ALead } from "./metrics";

export interface AnalyticsData {
  appts: AAppt[]; prices: APrice[]; unpaidPrices: APrice[]; pkgs: APackage[];
  pkgPayments: APkgPayment[]; expenses: AExpense[]; patients: APatient[]; managerIds: Set<string>; leads: ALead[];
  firstSessionByPkg: Record<string, string>;
}

const tsToLocalDate = (ts: unknown): string => {
  const t = ts as { toDate?: () => Date } | null;
  if (!t?.toDate) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: CLINIC_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" }).format(t.toDate());
};

const fetchAll = async (col: string, ...c: QueryConstraint[]) => (await getDocs(query(collection(db, col), ...c))).docs;

const toPrice = (id: string, d: Record<string, unknown>): APrice => {
  const p = docToSessionPrice(id, d);
  return { id, patientId: p.patientId, appointmentId: p.appointmentId, date: p.date, sessionType: p.sessionType,
    amount: Number(p.amount) || 0, paid: !!p.paid, paidDate: p.paidDate, packageId: p.packageId, paymentMethod: p.paymentMethod ?? "" };
};

export async function loadAnalyticsData(loadFrom: string): Promise<AnalyticsData> {
  const [apptDocs, priceByDate, priceByPaid, unpaidDocs, pkgDocs, payDocs, expDocs, patientDocs, physioDocs, leadDocs, pkgPriceDocs] = await Promise.all([
    fetchAll("appointments", where("date", ">=", loadFrom)),          // includes all future bookings
    fetchAll("patientSessionPrices", where("date", ">=", loadFrom)),
    fetchAll("patientSessionPrices", where("paidDate", ">=", loadFrom)),
    fetchAll("patientSessionPrices", where("paid", "==", false)),      // all-time outstanding
    fetchAll("patientPackages"),
    fetchAll("packagePayments"),
    fetchAll("clinicExpenses", where("date", ">=", loadFrom)),
    fetchAll("patients"),
    fetchAll("physiotherapists"),
    fetchAll("leads", where("date", ">=", loadFrom)),
    fetchAll("patientSessionPrices", where("packageId", ">", "")),   // all package sessions, for first-session dates
  ]);

  const appts: AAppt[] = apptDocs.map((d) => {
    const a = docToAppointment(d.id, d.data());
    return { id: a.id, patientId: a.patientId, physioId: a.physioId, physioName: a.physioName, date: a.date,
      hour: Number(a.hour), sessionType: a.sessionType, status: a.status };
  });

  const prices = dedupeById([...priceByDate, ...priceByPaid].map((d) => toPrice(d.id, d.data())));
  const unpaidPrices = unpaidDocs.map((d) => toPrice(d.id, d.data()));

  const pkgs: APackage[] = pkgDocs.map((d) => {
    const k = docToPackage(d.id, d.data());
    return { id: k.id, patientId: k.patientId, packageSize: Number(k.packageSize) || 0, pricePerSession: Number(k.pricePerSession) || 0,
      totalAmount: Number(k.totalAmount) || 0, paidAmount: Number(k.paidAmount) || 0,
      startDate: k.startDate || tsToLocalDate(k.createdAt), sessionsUsed: Number(k.sessionsUsed) || 0, active: !!k.active };
  });

  const pkgPayments: APkgPayment[] = payDocs.map((d) => {
    const x = d.data();
    return { id: d.id, packageId: (x.packageId as string) ?? "", amount: Number(x.amount) || 0, date: (x.date as string) ?? "", method: (x.method as string) ?? "" };
  });

  const expenses: AExpense[] = expDocs.map((d) => {
    const x = d.data();
    return { id: d.id, date: (x.date as string) ?? "", category: (x.category as string) ?? "other", amount: Number(x.amount) || 0, marketingSource: (x.marketingSource as string) ?? "" };
  });

  const patients: APatient[] = patientDocs.map((d) => {
    const x = d.data();
    return { uid: d.id, name: `${x.firstName ?? ""} ${x.lastName ?? ""}`.trim() || "Unnamed",
      createdDate: tsToLocalDate(x.createdAt), status: (x.status as string) ?? "active",
      acquisitionSource: (x.acquisitionSource as string) ?? "", referredByPhysicianId: (x.referredByPhysicianId as string) ?? "",
      followUpReviewedFor: ((x.followUp as { reviewedFor?: string } | undefined)?.reviewedFor) ?? "" };
  });

  const managerIds = new Set(physioDocs.filter((d) => d.data().rank === "manager").map((d) => d.id));

  const leads: ALead[] = leadDocs.map((d) => {
    const x = d.data();
    return { id: d.id, date: (x.date as string) ?? "", source: (x.source as string) ?? "", status: (x.status as string) ?? "new", patientId: (x.patientId as string) ?? "" };
  });

  const firstSessionByPkg = firstSessionByPackage(pkgPriceDocs.map((d) => toPrice(d.id, d.data())));

  return { appts, prices, unpaidPrices, pkgs, pkgPayments, expenses, patients, managerIds, leads, firstSessionByPkg };
}
