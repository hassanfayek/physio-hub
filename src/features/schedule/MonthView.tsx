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

  // Map date → appointment count
  const countByDay = new Map<string, number>();
  for (const a of appointments) {
    countByDay.set(a.date, (countByDay.get(a.date) ?? 0) + 1);
  }

  // Max appointments in a single day (for relative busy indicator)
  const maxInDay = Math.max(1, ...Array.from(countByDay.values()));
  // Total available slots per day
  const slotsPerDay = settings.maxPatientsPerHour * (settings.closingHour - settings.openingHour);

  const cells: (number | null)[] = [
    ...Array.from({ length: offset }, () => null),
    ...Array.from({ length: totalDays }, (_, i) => i + 1),
  ];
  // Pad to full grid rows
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <>
      <style>{`
        .mv-root { font-family: 'Outfit', sans-serif; }

        .mv-day-headers {
          display: grid; grid-template-columns: repeat(7, 1fr);
          margin-bottom: 8px;
        }
        .mv-day-hdr {
          text-align: center; font-size: 11px; text-transform: uppercase;
          letter-spacing: 0.1em; color: #c0bbb4; font-weight: 600; padding: 6px 0;
        }

        .mv-grid {
          display: grid; grid-template-columns: repeat(7, 1fr);
          border: 1px solid #e5e0d8; border-radius: 16px; overflow: hidden;
          background: #e5e0d8; gap: 1px;
        }

        .mv-cell {
          background: #fff; min-height: 88px;
          padding: 10px 10px 8px;
          position: relative; cursor: pointer; transition: background 0.12s;
        }
        .mv-cell:hover { background: #fafaf8; }
        .mv-cell.empty { background: #fafaf8; cursor: default; }
        .mv-cell.today { background: #EAF5FC; }

        .mv-cell-num {
          width: 26px; height: 26px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 600; color: #1a1a1a;
          margin-bottom: 6px; transition: background 0.12s;
        }
        .mv-cell.today .mv-cell-num {
          background: #2E8BC0; color: #fff;
        }

        /* Busy bar */
        .mv-busy-bar {
          height: 3px; border-radius: 100px;
          margin-bottom: 5px; transition: width 0.3s;
        }

        /* Count badge */
        .mv-count {
          font-size: 11.5px; font-weight: 600;
          padding: 2px 7px; border-radius: 100px; display: inline-block;
        }
        .mv-count.zero  { color: #c0bbb4; background: transparent; }
        .mv-count.low   { background: #D6EEF8; color: #0C3C60; }
        .mv-count.med   { background: #fef3c7; color: #92400e; }
        .mv-count.high  { background: #fee2e2; color: #b91c1c; }

        /* Skeleton */
        .mv-cell-skel {
          height: 16px; border-radius: 6px; margin-top: 4px;
          background: linear-gradient(90deg, #f0ede8 0%, #e5e0d8 50%, #f0ede8 100%);
          background-size: 200% 100%;
          animation: mvShimmer 1.4s ease infinite;
        }
        @keyframes mvShimmer { to { background-position: -200% 0; } }
      `}</style>

      <div className="mv-root">
        {/* Day name headers */}
        <div className="mv-day-headers">
          {DAY_NAMES.map((d) => (
            <div key={d} className="mv-day-hdr">{d}</div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="mv-grid">
          {cells.map((day, idx) => {
            if (day === null) {
              return <div key={`empty-${idx}`} className="mv-cell empty" />;
            }

            const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const count   = countByDay.get(dateStr) ?? 0;
            const ratio   = count / slotsPerDay;
            const relRatio = count / maxInDay;

            const countCls =
              count === 0 ? "zero" :
              ratio < 0.5 ? "low"  :
              ratio < 0.9 ? "med"  :
              "high";

            const barColor =
              count === 0 ? "transparent" :
              ratio < 0.5 ? "#2E8BC0"     :
              ratio < 0.9 ? "#d97706"     :
              "#b91c1c";

            return (
              <div
                key={dateStr}
                className={`mv-cell ${dateStr === today ? "today" : ""}`}
                onClick={() => onDayClick(dateStr)}
                title={`${count} appointment${count !== 1 ? "s" : ""} on ${dateStr}`}
              >
                <div className="mv-cell-num">{day}</div>
                {loading ? (
                  <div className="mv-cell-skel" />
                ) : (
                  <>
                    {count > 0 && (
                      <div
                        className="mv-busy-bar"
                        style={{ width: `${Math.max(10, relRatio * 100)}%`, background: barColor }}
                      />
                    )}
                    <div className={`mv-count ${countCls}`}>
                      {count === 0 ? "—" : `${count} appt${count !== 1 ? "s" : ""}`}
                    </div>
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
