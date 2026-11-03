// FILE: src/features/staff/MonthAttendance.tsx
// Staff profile → Attendance: a month summary (days present, hours, average
// arrival, late days, missing check-outs) above a calendar of day tiles.
// Tap a day to add or correct it (the parent's entry modal). Late badges need
// the arrival rule, which only the manager can read — others just don't see them.

import { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Printer, AlertTriangle } from "lucide-react";
import type { AttendanceRecord } from "../../services/attendanceService";
import { subscribeToBusinessSettings, clinicToday } from "../../services/businessService";
import { lateness, toMinutes, type PayrollRules } from "./payroll";
import { time12 } from "../../utils/time";

// Week starts on Saturday (Egyptian working week; Friday is the day off).
const WEEKDAYS = ["Sat", "Sun", "Mon", "Tue", "Wed", "Thu", "Fri"];
const hm = (m: number) => `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;

interface Props {
  month: string;                         // "YYYY-MM"
  monthOptions: string[];                // most recent first
  monthDays: string[];
  attendanceByDate: Map<string, AttendanceRecord>;
  onMonth: (m: string) => void;
  onEdit: (date: string) => void;
  onAdd: () => void;
  onPrint: () => void;
}

function monthYearLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

export default function MonthAttendance({ month, monthOptions, monthDays, attendanceByDate, onMonth, onEdit, onAdd, onPrint }: Props) {
  const [rules, setRules] = useState<PayrollRules | null>(null);
  useEffect(() => subscribeToBusinessSettings((s) => setRules(s.payrollRules ?? null), () => setRules(null)), []);
  const today = clinicToday();

  const days = useMemo(() => monthDays.map((date) => {
    const r = attendanceByDate.get(date) ?? null;
    const inM = r?.checkIn ? toMinutes(r.checkIn) : null;
    const outM = r?.checkOut ? toMinutes(r.checkOut) : null;
    const worked = inM !== null && outM !== null && outM >= inM ? outM - inM : null;
    const lt = rules && r?.checkIn ? lateness(r.checkIn, rules) : null;
    const state = !r?.checkIn && !r?.checkOut ? "none"
      : !r?.checkIn ? "noin"
      : !r.checkOut ? (date === today ? "on" : date < today ? "noout" : "on")
      : "done";
    return { date, r, inM, worked, late: lt && lt.counted > 0 ? lt.actual : 0, state };
  }), [monthDays, attendanceByDate, rules, today]);

  const present = days.filter((d) => d.r?.checkIn);
  const totalMin = days.reduce((s, d) => s + (d.worked ?? 0), 0);
  const arrivals = present.map((d) => d.inM).filter((m): m is number => m !== null);
  const avgIn = arrivals.length ? Math.round(arrivals.reduce((a, b) => a + b, 0) / arrivals.length) : null;
  const lateDays = days.filter((d) => d.late > 0).length;
  const missing = days.filter((d) => d.state === "noout" || d.state === "noin").length;

  // Leading blanks so the 1st lands under its weekday (Sat = column 0).
  const [y, m] = month.split("-").map(Number);
  const lead = (new Date(y, m - 1, 1).getDay() + 1) % 7;

  const idx = monthOptions.indexOf(month);
  const older = idx >= 0 && idx < monthOptions.length - 1 ? monthOptions[idx + 1] : null;
  const newer = idx > 0 ? monthOptions[idx - 1] : null;

  return (
    <div className="ma">
      <style>{CSS}</style>
      <div className="ma-bar">
        <div className="ma-nav">
          <button className="ma-arrow" disabled={!older} onClick={() => older && onMonth(older)} aria-label="Previous month"><ChevronLeft size={16} /></button>
          <select className="ma-month" value={month} onChange={(e) => onMonth(e.target.value)}>
            {monthOptions.map((o) => <option key={o} value={o}>{monthYearLabel(o)}</option>)}
          </select>
          <button className="ma-arrow" disabled={!newer} onClick={() => newer && onMonth(newer)} aria-label="Next month"><ChevronRight size={16} /></button>
        </div>
        <div className="ma-actions">
          <button className="ma-btn primary" onClick={onAdd}><Plus size={14} /> Add entry</button>
          <button className="ma-btn" onClick={onPrint}><Printer size={14} /> Print</button>
        </div>
      </div>

      <div className="ma-stats">
        <div className="ma-stat"><b>{present.length}</b><span>Days present</span></div>
        <div className="ma-stat"><b>{totalMin ? hm(totalMin) : "—"}</b><span>Hours worked</span></div>
        <div className="ma-stat"><b>{avgIn !== null ? time12(`${String(Math.floor(avgIn / 60)).padStart(2, "0")}:${String(avgIn % 60).padStart(2, "0")}`) : "—"}</b><span>Avg. arrival</span></div>
        {rules && <div className={`ma-stat ${lateDays ? "bad" : ""}`}><b>{lateDays}</b><span>Late days</span></div>}
        <div className={`ma-stat ${missing ? "warn" : ""}`}><b>{missing}</b><span>Missing in/out</span></div>
      </div>

      <div className="ma-cal">
        {WEEKDAYS.map((w) => <div key={w} className={`ma-wd ${w === "Fri" ? "off" : ""}`}>{w}</div>)}
        {Array.from({ length: lead }, (_, i) => <div key={`b${i}`} className="ma-blank" />)}
        {days.map((d) => {
          const future = d.date > today;
          const cls = ["ma-day", `s-${d.state}`, d.date === today ? "today" : "", future ? "future" : "", d.late ? "late" : ""].join(" ");
          return (
            <button key={d.date} className={cls} onClick={() => onEdit(d.date)} title={future ? "Upcoming day" : "Tap to add or edit"}>
              <span className="ma-num">{Number(d.date.slice(8))}
                {(d.state === "noout" || d.state === "noin") && <AlertTriangle size={12} className="ma-warn" />}
              </span>
              {d.state === "none" ? (
                !future && <span className="ma-empty"><Plus size={12} /></span>
              ) : (
                <span className="ma-times">
                  <span className="ma-in">{d.r?.checkIn ? time12(d.r.checkIn) : "No in"}</span>
                  <span className="ma-out">{d.r?.checkOut ? time12(d.r.checkOut) : d.state === "on" ? "On duty" : "No out"}</span>
                </span>
              )}
              {d.worked !== null && <span className="ma-dur">{hm(d.worked)}</span>}
              {d.late > 0 && <span className="ma-late">Late {d.late}m</span>}
            </button>
          );
        })}
      </div>

      <div className="ma-legend">
        <span><i className="l-done" />Complete</span>
        <span><i className="l-on" />On duty</span>
        <span><i className="l-warn" />Missing check-in/out</span>
        {rules && <span><i className="l-late" />Late</span>}
        <span><i className="l-none" />No record</span>
      </div>
    </div>
  );
}

const CSS = `
.ma { background: #fff; border: 1.5px solid #e5e0d8; border-radius: 16px; padding: 16px; }
.ma-bar { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
.ma-nav { display: flex; align-items: center; gap: 6px; }
.ma-arrow { width: 34px; height: 34px; border-radius: 10px; border: 1.5px solid #e5e0d8; background: #fff; color: #0C3C60; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
.ma-arrow:disabled { opacity: .35; cursor: default; }
.ma-month { height: 34px; padding: 0 10px; border-radius: 10px; border: 1.5px solid #e5e0d8; font-family: inherit; font-size: 13.5px; font-weight: 700; color: #0C3C60; background: #fff; }
.ma-actions { display: flex; gap: 6px; }
.ma-btn { display: inline-flex; align-items: center; gap: 6px; height: 34px; padding: 0 13px; border-radius: 10px; border: 1.5px solid #e5e0d8; background: #fff; color: #5a5550; font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
.ma-btn.primary { background: #2E8BC0; border-color: #2E8BC0; color: #fff; }
.ma-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 8px; margin-bottom: 14px; }
.ma-stat { background: #fafaf8; border: 1px solid #f0ede8; border-radius: 12px; padding: 10px 12px; display: flex; flex-direction: column; gap: 2px; }
.ma-stat b { font-size: 18px; font-weight: 800; color: #0C3C60; line-height: 1.15; }
.ma-stat span { font-size: 11.5px; color: #9a9590; }
.ma-stat.bad { background: #fef2f2; border-color: #fecaca; } .ma-stat.bad b { color: #b91c1c; }
.ma-stat.warn { background: #fffbeb; border-color: #fde68a; } .ma-stat.warn b { color: #b45309; }
.ma-cal { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 6px; }
.ma-wd { text-align: center; font-size: 11px; font-weight: 700; color: #9a9590; text-transform: uppercase; letter-spacing: .04em; padding-bottom: 2px; }
.ma-wd.off { color: #c0bbb4; }
.ma-day { position: relative; min-height: 88px; display: flex; flex-direction: column; align-items: flex-start; gap: 3px; padding: 7px 8px; border-radius: 12px; border: 1.5px solid #f0ede8; background: #fafaf8; font-family: inherit; text-align: left; cursor: pointer; transition: border-color .15s, box-shadow .15s; min-width: 0; }
.ma-day:hover { border-color: #B3DEF0; box-shadow: 0 4px 12px rgba(12,60,96,.07); }
.ma-num { display: flex; align-items: center; gap: 4px; font-size: 12.5px; font-weight: 700; color: #5a5550; }
.ma-day.today { border-color: #2E8BC0; box-shadow: 0 0 0 2px rgba(46,139,192,.15); }
.ma-day.today .ma-num { color: #2E8BC0; }
.ma-day.future { opacity: .45; }
.ma-day.s-done { background: #EAF5FC; border-color: #B3DEF0; }
.ma-day.s-on { background: #f0fdf4; border-color: #86efac; }
.ma-day.s-noout, .ma-day.s-noin { background: #fffbeb; border-color: #fcd34d; }
.ma-day.late { border-left: 4px solid #dc2626; }
.ma-warn { color: #d97706; }
.ma-empty { margin: auto; color: #c0bbb4; opacity: 0; transition: opacity .15s; }
.ma-day:hover .ma-empty { opacity: 1; }
.ma-times { display: flex; flex-direction: column; font-size: 11.5px; line-height: 1.35; min-width: 0; }
.ma-in { color: #1a1a1a; font-weight: 600; white-space: nowrap; }
.ma-out { color: #5a5550; white-space: nowrap; }
.s-on .ma-out { color: #16a34a; font-weight: 600; }
.s-noout .ma-out, .s-noin .ma-in { color: #b45309; font-weight: 600; }
.ma-dur { font-size: 10.5px; color: #0C3C60; font-weight: 700; margin-top: auto; }
.ma-late { font-size: 10px; font-weight: 700; padding: 1px 6px; border-radius: 100px; background: #fee2e2; color: #991b1b; white-space: nowrap; }
.ma-legend { display: flex; flex-wrap: wrap; gap: 6px 14px; margin-top: 12px; font-size: 11.5px; color: #7a7570; }
.ma-legend span { display: inline-flex; align-items: center; gap: 5px; }
.ma-legend i { width: 10px; height: 10px; border-radius: 3px; border: 1.5px solid; }
.l-done { background: #EAF5FC; border-color: #B3DEF0 !important; } .l-on { background: #f0fdf4; border-color: #86efac !important; }
.l-warn { background: #fffbeb; border-color: #fcd34d !important; } .l-late { background: #fee2e2; border-color: #dc2626 !important; }
.l-none { background: #fafaf8; border-color: #e5e0d8 !important; }
@media (max-width: 640px) {
  .ma { padding: 12px; }
  .ma-stats { grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .ma-stat { padding: 7px 8px; } .ma-stat b { font-size: 14.5px; } .ma-stat span { font-size: 10.5px; }
  .ma-cal { gap: 4px; }
  .ma-day { min-height: 58px; padding: 5px; border-radius: 9px; }
  .ma-out, .ma-dur, .ma-late, .ma-empty { display: none; }
  .ma-in { font-size: 9.5px; }
  .ma-wd { font-size: 9.5px; }
  .ma-actions { width: 100%; } .ma-btn { flex: 1; justify-content: center; }
}
@media print { .ma { display: none; } }
`;
