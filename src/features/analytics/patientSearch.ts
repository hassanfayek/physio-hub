// FILE: src/features/analytics/patientSearch.ts
// Patient search used by PatientPicker (name words in any order, or phone digits).

import type { Patient } from "../../services/patientService";

const digits = (s: string) => (s ?? "").replace(/\D/g, "");
/** Last 9 digits, so +2010…, 0020 10… and 010… all compare equal. */
export const phoneKey = (s: string) => digits(s).slice(-9);
const norm = (s: string) => (s ?? "").toLowerCase().replace(/\s+/g, " ").trim();
export const fullName = (p: Pick<Patient, "firstName" | "lastName">) => `${p.firstName} ${p.lastName}`.trim();

/** Patients matching `q` (name words in any order, or phone digits), best first. */
export function searchPatients<P extends Pick<Patient, "uid" | "firstName" | "lastName" | "phone">>(patients: P[], q: string, limit = 8): P[] {
  const nq = norm(q);
  if (!nq) return [];
  const words = nq.split(" ");
  const qDigits = digits(q);
  const scored: { p: P; score: number }[] = [];
  for (const p of patients) {
    const name = norm(fullName(p));
    let score = 0;
    if (qDigits.length >= 3 && digits(p.phone).includes(qDigits)) score = 3;
    else if (name.startsWith(nq)) score = 2;
    else if (words.every((w) => name.includes(w))) score = 1;
    if (score) scored.push({ p, score });
  }
  return scored.sort((a, b) => b.score - a.score || fullName(a.p).localeCompare(fullName(b.p))).slice(0, limit).map((x) => x.p);
}

/** Suggestions from the inquiry itself: same phone first, then name matches. */
export function suggestPatients<P extends Pick<Patient, "uid" | "firstName" | "lastName" | "phone">>(patients: P[], name: string, phone: string, limit = 5): P[] {
  const pk = phoneKey(phone);
  const byPhone = pk.length >= 7 ? patients.filter((p) => phoneKey(p.phone) === pk) : [];
  const byName = name.trim() ? searchPatients(patients, name, limit) : [];
  const seen = new Set<string>();
  return [...byPhone, ...byName].filter((p) => (seen.has(p.uid) ? false : (seen.add(p.uid), true))).slice(0, limit);
}
