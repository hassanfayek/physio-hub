// FILE: src/features/schedule/WeekView.tsx

import React, { useState, useEffect } from "react";
import { Check } from "lucide-react";
import {
  subscribeToAppointmentsByWeek,
  fmtHour12,
  toDateStr,
  getWeekStart,
  type Appointment,
  type ClinicSettings,
} from "../../services/appointmentService";
import type { Patient, Physiotherapist } from "../../services/patientService";
import AppointmentModal from "../../components/AppointmentModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface WeekViewProps {
  referenceDate: Date;
  settings:      ClinicSettings;
  patients:      Patient[];
  physios:       Physiotherapist[];
  currentPhysio: { uid: string; firstName: string; lastName: string };
  isManager:     boolean;   // manager or secretary: book for any patient / physio
  showAll?:      boolean;   // see every physio's bookings
  canBook?:      boolean;   // false for juniors: no booking from empty slots
  onDayClick:    (date: string) => void;
}

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ─── Component ────────────────────────────────────────────────────────────────

export default function WeekView({
  referenceDate,
  settings,
  patients,
  physios,
  currentPhysio,
  isManager,
  showAll = isManager,
  canBook = true,
  onDayClick,
}: WeekViewProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [modalSlot,    setModalSlot]    = useState<{ date: string; hour: number } | null>(null);
  const [toast,        setToast]        = useState<string | null>(null);

  const monday = getWeekStart(referenceDate);
  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
  const weekStart = toDateStr(weekDays[0]);
  const weekEnd   = toDateStr(weekDays[6]);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToAppointmentsByWeek(
      weekStart,
      weekEnd,
      showAll ? null : currentPhysio.uid,
      (data) => { setAppointments(data); setLoading(false); },
      ()     => setLoading(false)
    );
    return () => unsub();
  }, [weekStart, weekEnd, showAll, currentPhysio.uid]);

  const hours = Array.from(
    { length: settings.closingHour - settings.openingHour },
    (_, i) => settings.openingHour + i
  );

  const appts = (date: string, hour: number) =>
    appointments.filter((a) => a.date === date && a.hour === hour);

  const today = toDateStr(new Date());
  const [now, setNow] = useState(() => new Date());
  useEffect(() => { const t = setInterval(() => setNow(new Date()), 60_000); return () => clearInterval(t); }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <>
      <style>{`
        .wv-root { font-family: 'Outfit', sans-serif; }
        .wv-card { background: #fff; border: 1px solid #e5e0d8; border-radius: 18px; overflow: hidden; box-shadow: 0 1px 3px rgba(12,60,96,0.04); }
        .wv-scroll { overflow-x: auto; -webkit-overflow-scrolling: touch; }
        .wv-grid { display: grid; grid-template-columns: 64px repeat(7, minmax(128px, 1fr)); min-width: 760px; }

        .wv-th { padding: 10px 6px 9px; text-align: center; border-bottom: 1px solid #ebe7e1; position: sticky; top: 0; background: #fff; z-index: 2; }
        .wv-th.today { background: #EAF5FC; }
        .wv-th-day { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #9a9590; font-weight: 700; }
        .wv-th-num { width: 34px; height: 34px; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 3px auto 2px; font-size: 15px; font-weight: 700; color: #1a1a1a; cursor: pointer; transition: background 0.15s; }
        .wv-th-num:hover { background: #f0ede8; }
        .wv-th-num.today { background: #2E8BC0; color: #fff; }
        .wv-th-count { font-size: 10.5px; color: #9a9590; font-weight: 600; }

        .wv-time-cell { padding: 8px 8px 0 0; text-align: right; font-size: 11px; color: #9a9590; font-weight: 600; border-right: 1px solid #ebe7e1; border-bottom: 1px solid #f3f1ed; white-space: nowrap; }

        .wv-cell { border-bottom: 1px solid #f3f1ed; border-left: 1px solid #f3f1ed; padding: 5px; min-height: 60px; position: relative; transition: background 0.1s; cursor: pointer; display: flex; flex-direction: column; gap: 3px; }
        .wv-cell.today { background: #f7fbfe; }
        .wv-cell.past { background: #fcfbf9; }
        .wv-cell:hover { background: #f0f7fc; }
        .wv-cell.full { background: repeating-linear-gradient(135deg, #fff, #fff 8px, #fdf3f3 8px, #fdf3f3 16px); cursor: not-allowed; }

        .wv-pill { border-radius: 8px; padding: 4px 7px 4px 8px; font-size: 11.5px; font-weight: 600; line-height: 1.25; border-left: 3px solid #2E8BC0; background: #EAF5FC; color: #0C3C60; overflow: hidden; cursor: pointer; transition: transform .1s, box-shadow .15s; }
        .wv-pill:hover { box-shadow: 0 3px 10px rgba(12,60,96,0.12); transform: translateY(-1px); }
        .wv-pill-name { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wv-pill-physio { font-size: 10.5px; font-weight: 500; opacity: .75; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .wv-pill.s-in_progress { background: #fef3c7; border-color: #d97706; color: #78350f; }
        .wv-pill.s-completed { background: #ecfdf3; border-color: #16a34a; color: #14532d; }
        .wv-pill.s-no_show { background: #fff7ed; border-color: #ea580c; color: #9a3412; }
        .wv-pill.s-cancelled, .wv-pill.s-rescheduled { background: #f5f5f4; border-color: #c0bbb4; color: #9a9590; }
        .wv-pill.s-cancelled .wv-pill-name { text-decoration: line-through; }

        .wv-cell-load { position: absolute; top: 4px; right: 5px; font-size: 9.5px; font-weight: 700; color: #9a9590; background: #fff; border-radius: 100px; padding: 0 5px; border: 1px solid #ebe7e1; }
        .wv-cell-load.full { color: #b91c1c; border-color: #fecaca; }
        .wv-add-hint { display: none; position: absolute; inset: 0; align-items: center; justify-content: center; font-size: 18px; color: #2E8BC0; pointer-events: none; }
        .wv-cell:not(.full):hover .wv-add-hint { display: flex; }
        .wv-cell:has(.wv-pill):hover .wv-add-hint { display: none; }

        .wv-now { position: absolute; left: 0; right: 0; height: 2px; background: #dc2626; z-index: 1; pointer-events: none; }
        .wv-now::before { content: ""; position: absolute; left: -4px; top: -3px; width: 8px; height: 8px; border-radius: 50%; background: #dc2626; }

        .wv-legend { display: flex; flex-wrap: wrap; gap: 12px; padding: 10px 14px; border-top: 1px solid #f0ede8; font-size: 11.5px; color: #5a5550; }
        .wv-legend span { display: inline-flex; align-items: center; gap: 5px; }
        .wv-legend i { width: 10px; height: 10px; border-radius: 3px; display: inline-block; }

        .wv-skel { height: 44px; border-radius: 8px; margin: 4px; background: linear-gradient(90deg, #f0ede8 0%, #e5e0d8 50%, #f0ede8 100%); background-size: 200% 100%; animation: wvShimmer 1.4s ease infinite; }
        @keyframes wvShimmer { to { background-position: -200% 0; } }

        .wv-toast {
          position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
          background: #0C3C60; color: #fff; padding: 13px 22px; border-radius: 12px;
          font-size: 14px; font-weight: 500; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          z-index: 2000; white-space: nowrap;
          animation: wvToastIn 0.3s cubic-bezier(0.16,1,0.3,1) both;
          display: flex; align-items: center; gap: 8px;
        }
        @keyframes wvToastIn {
          from { opacity:0; transform: translateX(-50%) translateY(12px); }
          to   { opacity:1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <div className="wv-root">
        <div className="wv-card">
        <div className="wv-scroll">
          <div className="wv-grid" role="grid">

            {/* Header: time column */}
            <div className="wv-th" />

            {/* Header: day columns */}
            {weekDays.map((d, i) => {
              const dateStr = toDateStr(d);
              const dayCount = appointments.filter((a) => a.date === dateStr && a.status !== "cancelled" && a.status !== "rescheduled").length;
              return (
                <div key={i} className={`wv-th ${dateStr === today ? "today" : ""}`}>
                  <div className="wv-th-day">{DAY_NAMES[i]}</div>
                  <div
                    className={`wv-th-num ${dateStr === today ? "today" : ""}`}
                    onClick={() => onDayClick(dateStr)}
                    title={`Open day view for ${dateStr}`}
                  >
                    {d.getDate()}
                  </div>
                  <div className="wv-th-count">{loading ? "" : dayCount ? `${dayCount} booked` : "—"}</div>
                </div>
              );
            })}

            {/* Hour rows */}
            {loading
              ? Array.from({ length: 5 }).map((_, rowIdx) => (
                  <React.Fragment key={rowIdx}>
                    <div className="wv-time-cell" />
                    {Array.from({ length: 7 }).map((_, colIdx) => (
                      <div key={colIdx} style={{ borderBottom: "1px solid #f0ede8", borderLeft: "1px solid #f0ede8" }}>
                        <div className="wv-skel" />
                      </div>
                    ))}
                  </React.Fragment>
                ))
              : hours.map((h) => (
                  <React.Fragment key={h}>
                    <div className="wv-time-cell">{fmtHour12(h)}</div>
                    {weekDays.map((d, di) => {
                      const dateStr  = toDateStr(d);
                      const slotAppt = appts(dateStr, h);
                      const count    = slotAppt.length;
                      const max      = settings.maxPatientsPerHour;
                      const isFull   = count >= max;

                      return (
                        <div
                          key={di}
                          className={`wv-cell ${isFull ? "full" : ""} ${dateStr === today ? "today" : dateStr < today ? "past" : ""}`}
                          onClick={() => canBook && !isFull && setModalSlot({ date: dateStr, hour: h })}
                          title={isFull ? "Slot full" : canBook ? `Book at ${fmtHour12(h)}` : undefined}
                          style={canBook ? undefined : { cursor: "default" }}
                        >
                          {dateStr === today && h === now.getHours() && (
                            <div className="wv-now" style={{ top: `${(now.getMinutes() / 60) * 100}%` }} />
                          )}
                          {slotAppt.map((a) => (
                            <div key={a.id} className={`wv-pill s-${a.status ?? "scheduled"}`}
                              title={`${a.patientName} · ${a.physioName}${a.sessionType ? ` · ${a.sessionType}` : ""} · open day`}
                              onClick={(e) => { e.stopPropagation(); onDayClick(dateStr); }}>
                              <div className="wv-pill-name">{a.patientName || "Walk-in"}</div>
                              <div className="wv-pill-physio">{a.physioName}</div>
                            </div>
                          ))}
                          {count > 0 && (
                            <div className={`wv-cell-load ${isFull ? "full" : ""}`}>
                              {count}/{max}
                            </div>
                          )}
                          {!isFull && <span className="wv-add-hint">+</span>}
                        </div>
                      );
                    })}
                  </React.Fragment>
                ))
            }
          </div>
        </div>
        <div className="wv-legend">
          <span><i style={{ background: "#2E8BC0" }} />Upcoming</span>
          <span><i style={{ background: "#d97706" }} />In progress</span>
          <span><i style={{ background: "#16a34a" }} />Completed</span>
          <span><i style={{ background: "#ea580c" }} />No-show</span>
          <span><i style={{ background: "#c0bbb4" }} />Cancelled</span>
          {canBook && <span style={{ marginLeft: "auto", color: "#9a9590" }}>Click an empty slot to book</span>}
        </div>
        </div>
      </div>

      {modalSlot && (
        <AppointmentModal
          date={modalSlot.date}
          hour={modalSlot.hour}
          settings={settings}
          existing={appts(modalSlot.date, modalSlot.hour)}
          patients={patients}
          physios={physios}
          currentPhysio={currentPhysio}
          isManager={isManager}
          onClose={() => setModalSlot(null)}
          onBooked={() => {
            setModalSlot(null);
            showToast("✓ Appointment booked");
          }}
        />
      )}

      {toast && (
        <div className="wv-toast">
          <Check size={14} strokeWidth={2.5} />
          {toast}
        </div>
      )}
    </>
  );
}

