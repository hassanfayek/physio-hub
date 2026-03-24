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
  isManager:     boolean;
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
      isManager ? null : currentPhysio.uid,
      (data) => { setAppointments(data); setLoading(false); },
      ()     => setLoading(false)
    );
    return () => unsub();
  }, [weekStart, weekEnd, isManager, currentPhysio.uid]);

  const hours = Array.from(
    { length: settings.closingHour - settings.openingHour },
    (_, i) => settings.openingHour + i
  );

  const appts = (date: string, hour: number) =>
    appointments.filter((a) => a.date === date && a.hour === hour);

  const today = toDateStr(new Date());

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <>
      <style>{`
        .wv-root { font-family: 'Outfit', sans-serif; }

        .wv-scroll { overflow-x: auto; padding-bottom: 8px; -webkit-overflow-scrolling: touch; }

        .wv-grid {
          display: grid;
          grid-template-columns: 52px repeat(7, minmax(130px, 1fr));
          min-width: 700px;
        }

        /* Header row */
        .wv-th {
          padding: 10px 8px; text-align: center;
          border-bottom: 2px solid #e5e0d8;
          position: sticky; top: 0; background: #f5f3ef; z-index: 2;
        }
        .wv-th:first-child { background: #f5f3ef; }
        .wv-th-day { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #c0bbb4; font-weight: 600; }
        .wv-th-num {
          width: 32px; height: 32px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          margin: 4px auto 0;
          font-size: 14px; font-weight: 600; color: #1a1a1a;
          transition: background 0.15s;
          cursor: pointer;
        }
        .wv-th-num:hover { background: #e5e0d8; }
        .wv-th-num.today { background: #2E8BC0; color: #fff; }

        /* Hour rows */
        .wv-time-cell {
          padding: 8px 6px 8px 0; text-align: right;
          font-size: 11.5px; color: #c0bbb4; font-weight: 500;
          border-right: 1px solid #e5e0d8;
          vertical-align: top; padding-top: 10px;
        }

        .wv-cell {
          border-bottom: 1px solid #f0ede8;
          border-left: 1px solid #f0ede8;
          padding: 4px; min-height: 52px;
          vertical-align: top; position: relative;
          transition: background 0.1s;
          cursor: pointer;
        }
        .wv-cell:hover { background: #fafaf8; }
        .wv-cell.full  { background: #fff5f5; cursor: not-allowed; }
        .wv-cell.full:hover { background: #fff5f5; }

        /* Appointment pill */
        .wv-pill {
          border-radius: 6px; padding: 3px 7px;
          margin-bottom: 3px; font-size: 11.5px; font-weight: 500;
          background: #D6EEF8; color: #0C3C60; line-height: 1.3;
          overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
        }
        .wv-pill-physio { font-size: 10.5px; color: #5BC0BE; }

        /* Load badge in bottom-right of cell */
        .wv-cell-load {
          position: absolute; bottom: 3px; right: 4px;
          font-size: 10px; color: #c0bbb4; font-weight: 600;
        }
        .wv-cell-load.full { color: #b91c1c; }

        /* Add hint */
        .wv-add-hint {
          display: none; position: absolute; top: 50%; left: 50%;
          transform: translate(-50%, -50%);
          font-size: 18px; color: #c0bbb4; pointer-events: none;
        }
        .wv-cell:not(.full):hover .wv-add-hint { display: block; }

        .wv-skel {
          height: 44px; border-radius: 8px; margin: 4px;
          background: linear-gradient(90deg, #f0ede8 0%, #e5e0d8 50%, #f0ede8 100%);
          background-size: 200% 100%; animation: wvShimmer 1.4s ease infinite;
        }
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
        <div className="wv-scroll">
          <div className="wv-grid" role="grid">

            {/* Header: time column */}
            <div className="wv-th" />

            {/* Header: day columns */}
            {weekDays.map((d, i) => {
              const dateStr = toDateStr(d);
              return (
                <div key={i} className="wv-th">
                  <div className="wv-th-day">{DAY_NAMES[i]}</div>
                  <div
                    className={`wv-th-num ${dateStr === today ? "today" : ""}`}
                    onClick={() => onDayClick(dateStr)}
                    title={`Open day view for ${dateStr}`}
                  >
                    {d.getDate()}
                  </div>
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
                          className={`wv-cell ${isFull ? "full" : ""}`}
                          onClick={() => !isFull && setModalSlot({ date: dateStr, hour: h })}
                          title={isFull ? "Slot full" : `Book at ${fmtHour12(h)}`}
                        >
                          {slotAppt.map((a) => (
                            <div key={a.id} className="wv-pill">
                              {a.patientName}
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

