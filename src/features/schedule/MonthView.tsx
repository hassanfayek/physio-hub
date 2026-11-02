// FILE: src/features/schedule/MonthView.tsx

import { useState, useEffect } from "react";
import {
  subscribeToAppointmentsByMonth,
  toDateStr,
  type Appointment,
  type ClinicSettings,
} from "../../services/appointmentService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthViewProps {
  year:          number;
  month:         number; // 1–12
  settings:      ClinicSettings;
  physioId:      string | null; // null = manager (all)
  onDayClick:    (date: string) => void;
}

const DAY_NAMES = ["Mon","Tue","Wed","Thu","Fri","Sat","Sun"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

// 0 = Mon ... 6 = Sun  (ISO week offset)
function firstWeekdayOffset(year: number, month: number): number {
  const d = new Date(year, month - 1, 1).getDay(); // 0=Sun
  return d === 0 ? 6 : d - 1;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function MonthView({
  year,
  month,
  settings,
  physioId,
  onDayClick,
}: MonthViewProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading,      setLoading]      = useState(true);

  const yearMonth = `${year}-${String(month).padStart(2, "0")}`;

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToAppointmentsByMonth(
      yearMonth,
      physioId,
      (data) => { setAppointments(data); setLoading(false); },
      ()     => setLoading(false)
    );
    return () => unsub();
  }, [yearMonth, physioId]);

  const today    = toDateStr(new Date());
  const totalDays = daysInMonth(year, month);
  const offset    = firstWeekdayOffset(year, month);

  // Per-day counts. "Booked" excludes cancelled/rescheduled (they don't use a slot).
  type DayCount = { booked: number; done: number; upcoming: number; missed: number };
  const byDay = new Map<string, DayCount>();
  for (const a of appointments) {
    const c = byDay.get(a.date) ?? { booked: 0, done: 0, upcoming: 0, missed: 0 };
    if (a.status === "completed") c.done++;
    else if (a.status === "scheduled" || a.status === "in_progress") c.upcoming++;
    if (a.status === "cancelled" || a.status === "no_show") c.missed++;
    if (a.status !== "cancelled" && a.status !== "rescheduled") c.booked++;
    byDay.set(a.date, c);
  }
  const totals = [...byDay.values()].reduce((t, c) => ({ booked: t.booked + c.booked, done: t.done + c.done, upcoming: t.upcoming + c.upcoming, missed: t.missed + c.missed }), { booked: 0, done: 0, upcoming: 0, missed: 0 });
  const slotsPerDay = Math.max(1, settings.maxPatientsPerHour * (settings.closingHour - settings.openingHour));

  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <>
      <style>{`
        .mv-root { font-family: 'Outfit', sans-serif; }
        .mv-summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
        .mv-chip { display: inline-flex; align-items: center; gap: 7px; background: #fff; border: 1px solid #e5e0d8; border-radius: 12px; padding: 8px 12px; font-size: 12.5px; color: #5a5550; }
        .mv-chip b { font-size: 16px; color: #0C3C60; font-weight: 700; }
        .mv-chip i { width: 8px; height: 8px; border-radius: 50%; display: inline-block; }

        .mv-day-headers { display: grid; grid-template-columns: repeat(7, 1fr); margin-bottom: 6px; }
        .mv-day-hdr { text-align: center; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #9a9590; font-weight: 700; padding: 6px 0; }

        .mv-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; }
        .mv-cell {
          background: #fff; min-height: 92px; padding: 9px 9px 8px; border: 1px solid #ebe7e1; border-radius: 14px;
          position: relative; cursor: pointer; transition: border-color .15s, box-shadow .15s, transform .1s;
          display: flex; flex-direction: column; gap: 6px;
        }
        .mv-cell:hover { border-color: #B3DEF0; box-shadow: 0 6px 16px rgba(12,60,96,0.08); }
        .mv-cell:active { transform: scale(.99); }
        .mv-cell.empty { background: transparent; border: 1px dashed #ebe7e1; cursor: default; box-shadow: none; }
        .mv-cell.past { background: #fbfaf8; }
        .mv-cell.past .mv-cell-num { color: #9a9590; }
        .mv-cell.today { border: 2px solid #2E8BC0; box-shadow: 0 4px 14px rgba(46,139,192,0.18); }

        .mv-top { display: flex; justify-content: space-between; align-items: center; }
        .mv-cell-num { width: 28px; height: 28px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 13.5px; font-weight: 700; color: #1a1a1a; }
        .mv-cell.today .mv-cell-num { background: #2E8BC0; color: #fff; }
        .mv-load { font-size: 11px; font-weight: 700; color: #9a9590; font-variant-numeric: tabular-nums; }

        .mv-bar { height: 6px; border-radius: 100px; background: #f0ede8; overflow: hidden; }
        .mv-bar b { display: block; height: 100%; border-radius: 100px; }
        .mv-bar b.low { background: #5BC0BE; } .mv-bar b.med { background: #E8A93B; } .mv-bar b.high { background: #dc2626; }

        .mv-dots { display: flex; gap: 8px; flex-wrap: wrap; margin-top: auto; font-size: 11px; font-weight: 600; color: #5a5550; }
        .mv-dots span { display: inline-flex; align-items: center; gap: 4px; }
        .mv-dots i, .mv-chip i { width: 7px; height: 7px; border-radius: 50%; }
        .c-done { background: #16a34a; } .c-up { background: #2E8BC0; } .c-miss { background: #dc2626; }
        .mv-free { margin-top: auto; font-size: 11px; color: #c0bbb4; }

        .mv-cell-skel { height: 6px; border-radius: 6px; margin-top: 4px; background: linear-gradient(90deg, #f0ede8 0%, #e5e0d8 50%, #f0ede8 100%); background-size: 200% 100%; animation: mvShimmer 1.4s ease infinite; }
        @keyframes mvShimmer { to { background-position: -200% 0; } }

        @media (max-width: 640px) {
          .mv-grid { gap: 3px; }
          .mv-day-hdr { font-size: 9px; letter-spacing: 0.04em; padding: 4px 0; }
          .mv-cell { min-height: 54px; padding: 5px 4px; border-radius: 10px; gap: 4px; }
          .mv-cell-num { width: 22px; height: 22px; font-size: 11px; }
          .mv-load, .mv-dots, .mv-free { display: none; }
          .mv-bar { height: 4px; }
          .mv-chip { padding: 6px 9px; font-size: 11.5px; } .mv-chip b { font-size: 14px; }
        }
      `}</style>

      <div className="mv-root">
        <div className="mv-summary">
          <span className="mv-chip"><b>{loading ? "…" : totals.booked}</b> booked this month</span>
          <span className="mv-chip"><i className="c-done" /><b>{loading ? "…" : totals.done}</b> completed</span>
          <span className="mv-chip"><i className="c-up" /><b>{loading ? "…" : totals.upcoming}</b> upcoming</span>
          <span className="mv-chip"><i className="c-miss" /><b>{loading ? "…" : totals.missed}</b> cancelled / no-show</span>
        </div>

        <div className="mv-day-headers">
          {DAY_NAMES.map((d) => <div key={d} className="mv-day-hdr">{d}</div>)}
        </div>

        <div className="mv-grid">
          {cells.map((day, idx) => {
            if (day === null) return <div key={`empty-${idx}`} className="mv-cell empty" />;
            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const c = byDay.get(dateStr) ?? { booked: 0, done: 0, upcoming: 0, missed: 0 };
            const ratio = c.booked / slotsPerDay;
            const level = ratio < 0.5 ? "low" : ratio < 0.9 ? "med" : "high";
            return (
              <div
                key={dateStr}
                className={`mv-cell ${dateStr === today ? "today" : dateStr < today ? "past" : ""}`}
                onClick={() => onDayClick(dateStr)}
                title={`${c.booked} of ${slotsPerDay} slots booked · ${c.done} completed · ${c.upcoming} upcoming · ${c.missed} cancelled/no-show`}
              >
                <div className="mv-top">
                  <div className="mv-cell-num">{day}</div>
                  {!loading && c.booked > 0 && <span className="mv-load">{c.booked}/{slotsPerDay}</span>}
                </div>
                {loading ? <div className="mv-cell-skel" /> : (
                  <>
                    <div className="mv-bar"><b className={level} style={{ width: `${Math.min(100, ratio * 100)}%` }} /></div>
                    {c.booked + c.missed === 0 ? <div className="mv-free">{dateStr < today ? "No sessions" : "All free"}</div> : (
                      <div className="mv-dots">
                        {c.done > 0 && <span><i className="c-done" />{c.done}</span>}
                        {c.upcoming > 0 && <span><i className="c-up" />{c.upcoming}</span>}
                        {c.missed > 0 && <span><i className="c-miss" />{c.missed}</span>}
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}
