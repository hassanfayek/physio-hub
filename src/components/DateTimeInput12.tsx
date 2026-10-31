// FILE: src/components/DateTimeInput12.tsx
// Date + 12-hour time picker reading/writing "YYYY-MM-DDTHH:MM" (24h) or "".
// Replaces <input type="datetime-local">, whose time part follows the device
// clock setting and can show 24-hour.

import TimeInput12 from "./TimeInput12";

interface Props {
  value: string;
  onChange: (v: string) => void;
  maxDate?: string;          // YYYY-MM-DD
  defaultTime?: string;      // used when a date is picked before a time (HH:MM)
}

export default function DateTimeInput12({ value, onChange, maxDate, defaultTime = "10:00" }: Props) {
  const date = value ? value.slice(0, 10) : "";
  const time = value ? value.slice(11, 16) : "";
  return (
    <span style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <input type="date" value={date} max={maxDate}
        style={{ border: "1.5px solid #e5e0d8", borderRadius: 9, padding: "7px 9px", fontFamily: "inherit", fontSize: 13, minWidth: 0 }}
        onChange={(e) => onChange(e.target.value ? `${e.target.value}T${time || defaultTime}` : "")} />
      <TimeInput12 value={time} disabled={!date} onChange={(t) => onChange(date && t ? `${date}T${t}` : date ? `${date}T${defaultTime}` : "")} />
    </span>
  );
}
