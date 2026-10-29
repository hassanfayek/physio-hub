// FILE: src/features/inquiries/shared.ts
// Small helpers shared by the inquiry components.

export interface Staff { uid: string; name: string; }

/** Same clinic-local time `days` days later ("YYYY-MM-DDTHH:MM"). */
export function addDaysTo(dt: string, days: number): string {
  const [d, t] = dt.split("T");
  const [y, m, dd] = d.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, dd + days)).toISOString().slice(0, 10);
  return `${next}T${t || "10:00"}`;
}
