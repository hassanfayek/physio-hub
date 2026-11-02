// FILE: src/features/physio/patientListLogic.ts
// Pure helpers for the Patients list (People tab): last/next visit, balance
// owed, filters, sorting and CSV export. Unit-tested in patientListLogic.test.ts.

export interface LAppt { id: string; patientId: string; date: string; hour: number; status: string; }
export interface LCharge { id: string; patientId: string; appointmentId: string; amount: number; paid: boolean; packageId: string; keptAsExtra?: boolean; }
export interface LPackage { patientId: string; totalAmount: number; paidAmount: number; }
export interface LPatient {
  uid: string; firstName: string; lastName: string; phone: string; email: string; status: string;
  createdDate: string; physioId: string; seniorEditorId: string | null; juniorIds: string[]; traineeId: string | null;
  acquisitionSource?: string; referredByPhysicianId?: string;
}

export interface Visit { last: string | null; next: { date: string; hour: number } | null; }

/** Last completed visit and next booked (scheduled / in progress, today or later) per patient. */
export function visitsByPatient(appts: LAppt[], today: string): Map<string, Visit> {
  const out = new Map<string, Visit>();
  for (const a of appts) {
    if (!a.patientId) continue;
    const v = out.get(a.patientId) ?? { last: null, next: null };
    if (a.status === "completed" && (!v.last || a.date > v.last)) v.last = a.date;
    if ((a.status === "scheduled" || a.status === "in_progress") && a.date >= today &&
        (!v.next || a.date < v.next.date || (a.date === v.next.date && a.hour < v.next.hour))) v.next = { date: a.date, hour: a.hour };
    out.set(a.patientId, v);
  }
  return out;
}

/** Money owed per patient: unpaid pay-per-session charges (one per session — duplicates
 *  and charges on cancelled / no-show sessions don't count unless deliberately kept)
 *  + unpaid package balances. `apptStatus` covers the appointments we know about. */
export function balancesByPatient(unpaid: LCharge[], pkgs: LPackage[], apptStatus: Map<string, string>): Map<string, number> {
  const out = new Map<string, number>();
  const add = (pid: string, n: number) => { if (pid && n > 0) out.set(pid, (out.get(pid) ?? 0) + n); };
  const seen = new Set<string>();
  for (const c of unpaid) {
    if (c.paid || c.packageId || !(c.amount > 0)) continue;
    const st = c.appointmentId ? apptStatus.get(c.appointmentId) : undefined;
    if (st && st !== "completed" && !c.keptAsExtra) continue;          // not a delivered session
    if (c.appointmentId && seen.has(c.appointmentId) && !c.keptAsExtra) continue;   // duplicate charge
    if (c.appointmentId) seen.add(c.appointmentId);
    add(c.patientId, c.amount);
  }
  for (const k of pkgs) add(k.patientId, Math.max(0, (k.totalAmount || 0) - (k.paidAmount || 0)));
  return out;
}

export const assignedTo = (p: LPatient, uid: string) =>
  p.physioId === uid || p.seniorEditorId === uid || (p.juniorIds ?? []).includes(uid) || p.traineeId === uid;

export const sourceOf = (p: LPatient) => p.acquisitionSource || (p.referredByPhysicianId ? "doctor_referral" : "");

export type Attention = "" | "no_upcoming" | "owes" | "no_senior";
export interface ListFilter {
  status: "" | "active" | "on_hold" | "discharged";
  doctor: string;      // uid or ""
  source: string;      // acquisition source value, "unknown", or ""
  attention: Attention;
}

export function applyFilter(ps: LPatient[], f: ListFilter, visits: Map<string, Visit>, balances: Map<string, number>): LPatient[] {
  return ps.filter((p) => {
    if (f.status && (p.status || "active") !== f.status) return false;
    if (f.doctor && !assignedTo(p, f.doctor)) return false;
    if (f.source && (f.source === "unknown" ? sourceOf(p) !== "" : sourceOf(p) !== f.source)) return false;
    if (f.attention === "no_upcoming" && ((p.status || "active") !== "active" || visits.get(p.uid)?.next)) return false;
    if (f.attention === "owes" && !((balances.get(p.uid) ?? 0) > 0)) return false;
    if (f.attention === "no_senior" && p.seniorEditorId) return false;
    return true;
  });
}

export type SortKey = "name" | "newest" | "last_visit" | "balance";
export function sortPatients(ps: LPatient[], key: SortKey, visits: Map<string, Visit>, balances: Map<string, number>): LPatient[] {
  const name = (p: LPatient) => `${p.firstName} ${p.lastName}`.toLowerCase();
  return [...ps].sort((a, b) => {
    if (key === "newest") return b.createdDate.localeCompare(a.createdDate) || name(a).localeCompare(name(b));
    if (key === "last_visit") return (visits.get(b.uid)?.last ?? "").localeCompare(visits.get(a.uid)?.last ?? "") || name(a).localeCompare(name(b));
    if (key === "balance") return (balances.get(b.uid) ?? 0) - (balances.get(a.uid) ?? 0) || name(a).localeCompare(name(b));
    return name(a).localeCompare(name(b));
  });
}

/** Excel-friendly CSV (BOM, quoted fields, phone kept as text). */
export function toCsv(rows: (string | number)[][]): string {
  const esc = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "\uFEFF" + rows.map((r) => r.map(esc).join(",")).join("\r\n") + "\r\n";
}
