// FILE: src/components/TimeInput12.tsx
// 12-hour time picker (hour · minute · AM/PM) that reads and writes the same
// 24-hour "HH:MM" string a native <input type="time"> would. Native time inputs
// follow the device's clock setting, so they can show 24-hour; this never does.

import { split12, join24 } from "../utils/time";

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1);
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

interface Props {
  value: string;                       // "HH:MM" (24h) or ""
  onChange: (v: string) => void;
  allowEmpty?: boolean;                // show a "—" choice that clears the value
  disabled?: boolean;
  className?: string;
}

export default function TimeInput12({ value, onChange, allowEmpty = false, disabled, className }: Props) {
  const p = split12(value);
  const set = (hour: number | null, minute: string, period: "AM" | "PM") => onChange(hour === null ? "" : join24(hour, minute, period));
  const sel = { border: "1.5px solid #e5e0d8", borderRadius: 8, padding: "6px 4px", fontFamily: "inherit", fontSize: 13, background: "#fff" };
  return (
    <span className={className} style={{ display: "inline-flex", gap: 4, alignItems: "center" }}>
      <select style={sel} disabled={disabled} value={p ? p.hour : ""} aria-label="Hour"
        onChange={(e) => set(e.target.value === "" ? null : Number(e.target.value), p?.minute ?? "00", p?.period ?? "PM")}>
        {(allowEmpty || !p) && <option value="">{allowEmpty ? "—" : "Hour"}</option>}
        {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
      </select>
      <span>:</span>
      <select style={sel} disabled={disabled || !p} value={p ? p.minute : "00"} aria-label="Minute"
        onChange={(e) => p && set(p.hour, e.target.value, p.period)}>
        {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
      </select>
      <select style={sel} disabled={disabled || !p} value={p ? p.period : "PM"} aria-label="AM or PM"
        onChange={(e) => p && set(p.hour, p.minute, e.target.value as "AM" | "PM")}>
        <option value="AM">AM</option><option value="PM">PM</option>
      </select>
    </span>
  );
}
