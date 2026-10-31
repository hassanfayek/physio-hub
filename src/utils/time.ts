// FILE: src/utils/time.ts
// 12-hour display helpers. Data stays in 24-hour "HH:MM" (and hours 0–24) so
// storage, sorting and calculations are unchanged; only what people see is 12-hour.

/** 0 → 12:00 AM, 12 → 12:00 PM, 15 → 3:00 PM, 24 (midnight close) → 12:00 AM */
export function hour12Label(h: number): string {
  const hh = ((h % 24) + 24) % 24;
  return `${hh % 12 === 0 ? 12 : hh % 12}:00 ${hh < 12 ? "AM" : "PM"}`;
}

/** "15:05" → "3:05 PM"; "" or invalid → "" */
export function time12(hhmm: string): string {
  const p = split12(hhmm);
  return p ? `${p.hour}:${p.minute} ${p.period}` : "";
}

/** "15:05" → { hour: 3, minute: "05", period: "PM" } */
export function split12(hhmm: string): { hour: number; minute: string; period: "AM" | "PM" } | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2]);
  if (h > 23 || mi > 59) return null;
  return { hour: h % 12 === 0 ? 12 : h % 12, minute: m[2], period: h < 12 ? "AM" : "PM" };
}

/** (3, "05", "PM") → "15:05" */
export function join24(hour: number, minute: string, period: "AM" | "PM"): string {
  const h = (hour % 12) + (period === "PM" ? 12 : 0);
  return `${String(h).padStart(2, "0")}:${minute.padStart(2, "0")}`;
}

/** "2026-10-29T15:05" → "29 Oct 3:05 PM" (date part only if no time) */
export function dateTime12(dt: string): string {
  if (!dt) return "";
  const [y, m, d] = dt.slice(0, 10).split("-").map(Number);
  if (!y) return dt;
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const t = dt.length > 10 ? time12(dt.slice(11, 16)) : "";
  return `${d} ${months[m - 1]}${t ? ` ${t}` : ""}`;
}
