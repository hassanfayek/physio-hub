// FILE: src/utils/navEvents.ts
// Tiny app-wide navigation signals, so deep components (e.g. a patient's price
// sheet) can jump the staff dashboard to a schedule day or a patient section
// without threading callbacks through every layer. PhysioDashboard listens.

const OPEN_DAY     = "physio:open-schedule-day";
const OPEN_PATIENT = "physio:open-patient";

export function openScheduleDay(date: string) {
  window.dispatchEvent(new CustomEvent(OPEN_DAY, { detail: date }));
}

export function onOpenScheduleDay(cb: (date: string) => void): () => void {
  const h = (e: Event) => cb((e as CustomEvent<string>).detail);
  window.addEventListener(OPEN_DAY, h);
  return () => window.removeEventListener(OPEN_DAY, h);
}

export function openPatientSection(patientId: string, section: string) {
  window.dispatchEvent(new CustomEvent(OPEN_PATIENT, { detail: { patientId, section } }));
}

export function onOpenPatientSection(cb: (patientId: string, section: string) => void): () => void {
  const h = (e: Event) => { const d = (e as CustomEvent<{ patientId: string; section: string }>).detail; cb(d.patientId, d.section); };
  window.addEventListener(OPEN_PATIENT, h);
  return () => window.removeEventListener(OPEN_PATIENT, h);
}
