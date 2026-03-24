// FILE: src/features/schedule/DayView.tsx

import { useState, useEffect } from "react";
import { ArrowLeft, Plus, Trash2, Check } from "lucide-react";
import {
  subscribeToAppointmentsByDay,
  deleteAppointment,
  updateAppointmentStatus,
  fmtHour12,
  type Appointment,
  type ClinicSettings,
} from "../../services/appointmentService";
import type { Patient, Physiotherapist } from "../../services/patientService";
import AppointmentModal from "../../components/AppointmentModal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface DayViewProps {
  date:          string;  // "YYYY-MM-DD"
  settings:      ClinicSettings;
  patients:      Patient[];
  physios:       Physiotherapist[];
  currentPhysio: { uid: string; firstName: string; lastName: string };
  isManager:     boolean;
  onBack?:       () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function DayView({
  date,
  settings,
  patients,
  physios,
  currentPhysio,
  isManager,
  onBack,
}: DayViewProps) {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [modalSlot,    setModalSlot]    = useState<number | null>(null);
  const [deletingId,   setDeletingId]   = useState<string | null>(null);
  const [updatingId,    setUpdatingId]    = useState<string | null>(null);
  const [toast,        setToast]        = useState<string | null>(null);

  // Realtime subscription for this day
  useEffect(() => {
    setLoading(true);
    const unsub = subscribeToAppointmentsByDay(
      date,
      isManager ? null : currentPhysio.uid,
      (data) => { setAppointments(data); setLoading(false); },
      ()     => setLoading(false)
    );
    return () => unsub();
  }, [date, isManager, currentPhysio.uid]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleDelete = async (apptId: string, patientName: string) => {
    setDeletingId(apptId);
    await deleteAppointment(apptId);
    setDeletingId(null);
    showToast(`✓ Appointment for ${patientName} removed`);
  };

  const handleStatusUpdate = async (
    apptId: string,
    status: "completed" | "cancelled" | "scheduled",
    patientName: string
  ) => {
    setUpdatingId(apptId);
    await updateAppointmentStatus(apptId, status);
    setUpdatingId(null);
    showToast(`✓ ${patientName} marked as ${status}`);
  };

  const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const hours = Array.from(
    { length: settings.closingHour - settings.openingHour },
    (_, i) => settings.openingHour + i
  );

  const apptsByHour = (h: number) => appointments.filter((a) => a.hour === h);
  const totalToday  = appointments.length;

  return (
    <>
      <style>{`
        .dv-root { font-family: 'Outfit', sans-serif; }
        .dv-header {
          display: flex; align-items: flex-end; justify-content: space-between;
          margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
        }
        .dv-title {
          font-family: 'Playfair Display', serif;
          font-size: 22px; font-weight: 500; color: #1a1a1a;
          letter-spacing: -0.02em; margin-bottom: 3px;
        }
        .dv-sub { font-size: 13px; color: #9a9590; }

        .dv-back {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 9px 14px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          color: #5a5550; cursor: pointer; transition: all 0.15s; min-height: 44px;
        }
        .dv-back:hover { background: #f0ede8; }

        .dv-stats {
          display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; margin-bottom: 16px;
        }
        @media (min-width: 480px) {
          .dv-stats { display: flex; gap: 10px; flex-wrap: wrap; }
        }
        .dv-stat {
          background: #fff; border: 1px solid #e5e0d8; border-radius: 12px;
          padding: 12px 14px; min-width: 0;
        }
        .dv-stat.accent { border-top: 3px solid #2E8BC0; }
        .dv-stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #c0bbb4; font-weight: 600; margin-bottom: 3px; }
        .dv-stat-value { font-family: 'Playfair Display', serif; font-size: 26px; color: #1a1a1a; }

        /* Timeline */
        .dv-timeline { display: flex; flex-direction: column; gap: 8px; }

        .dv-slot {
          background: #fff; border: 1.5px solid #e5e0d8;
          border-radius: 14px; overflow: hidden; transition: border-color 0.15s;
        }
        .dv-slot.has-appts { border-color: #B3DEF0; }
        .dv-slot.full      { border-color: #fca5a5; }

        .dv-slot-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 11px 12px; cursor: pointer; user-select: none;
          transition: background 0.12s;
        }
        .dv-slot-header:hover { background: #fafaf8; }

        .dv-slot-time {
          font-size: 15px; font-weight: 600; color: #1a1a1a; min-width: 52px;
        }
        .dv-slot-center { display: flex; align-items: center; gap: 8px; flex: 1; padding: 0 16px; }
        .dv-slot-load {
          font-size: 12.5px; font-weight: 600; padding: 3px 10px; border-radius: 100px;
        }
        .dv-slot-load.empty  { background: #f5f3ef; color: #9a9590; }
        .dv-slot-load.low    { background: #D6EEF8; color: #0C3C60; }
        .dv-slot-load.med    { background: #fef3c7; color: #92400e; }
        .dv-slot-load.high   { background: #fee2e2; color: #b91c1c; }

        .dv-slot-progress {
          flex: 1; height: 4px; background: #f0ede8; border-radius: 100px; overflow: hidden;
          max-width: 120px;
        }
        .dv-slot-fill { height: 100%; border-radius: 100px; transition: width 0.3s; }

        .dv-book-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 8px;
          border: 1.5px solid #B3DEF0; background: #EAF5FC;
          font-family: 'Outfit', sans-serif; font-size: 12.5px; font-weight: 500;
          color: #2E8BC0; cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .dv-book-btn:hover { background: #D6EEF8; border-color: #2E8BC0; }
        .dv-book-btn.disabled {
          border-color: #e5e0d8; background: #fafaf8; color: #c0bbb4; cursor: not-allowed;
        }

        /* Appointment cards */
        .dv-appts { padding: 0 16px 12px; display: flex; flex-direction: column; gap: 6px; }
        .dv-appt-card {
          display: flex; align-items: center; justify-content: space-between;
          background: #f5f3ef; border-radius: 10px; padding: 10px 14px;
        }
        .dv-appt-left { display: flex; align-items: center; gap: 10px; }
        .dv-appt-avatar {
          width: 30px; height: 30px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 600;
        }
        .dv-appt-patient { font-size: 13.5px; font-weight: 500; color: #1a1a1a; }
        .dv-appt-physio  { font-size: 12px; color: #9a9590; }
        .dv-appt-session { font-size: 11px; color: #5BC0BE; font-weight: 500; margin-top: 1px; }
        .dv-appt-del {
          height: 28px; border-radius: 8px; padding: 0 10px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          display: inline-flex; align-items: center; gap: 5px;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500;
          cursor: pointer; color: #c0bbb4; transition: all 0.15s; flex-shrink: 0;
          white-space: nowrap;
        }
        .dv-appt-del:hover:not(:disabled) { border-color: #fca5a5; color: #b91c1c; background: #fff5f3; }
        .dv-appt-del:disabled { opacity: 0.5; cursor: not-allowed; }
        .dv-appt-status {
          font-size: 10.5px; font-weight: 600; padding: 2px 8px;
          border-radius: 100px; white-space: nowrap;
        }
        .dv-appt-status.completed { background: #d8f3dc; color: #1b4332; }
        .dv-appt-status.cancelled { background: #fee2e2; color: #991b1b; }
        .dv-appt-status.scheduled { background: #D6EEF8; color: #0C3C60; }
        .dv-status-btn {
          font-family: 'Outfit', sans-serif;
          font-size: 11px; font-weight: 600;
          padding: 4px 9px; border-radius: 7px;
          border: 1.5px solid; cursor: pointer;
          transition: all 0.15s; white-space: nowrap;
        }
        .dv-status-btn.complete { border-color: #b7e4c7; color: #1b4332; background: #f0fdf4; }
        .dv-status-btn.complete:hover { background: #d8f3dc; }
        .dv-status-btn.cancel   { border-color: #fca5a5; color: #991b1b; background: #fff5f5; }
        .dv-status-btn.cancel:hover   { background: #fee2e2; }
        .dv-status-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        .dv-skeleton {
          height: 60px; border-radius: 14px;
          background: linear-gradient(90deg, #f0ede8 0%, #e5e0d8 50%, #f0ede8 100%);
          background-size: 200% 100%;
          animation: dvShimmer 1.4s ease infinite;
        }
        @keyframes dvShimmer { to { background-position: -200% 0; } }
        @keyframes dvDelSpin { to { transform: rotate(360deg); } }

        .dv-toast {
          position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
          background: #0C3C60; color: #fff; padding: 13px 22px; border-radius: 12px;
          font-size: 14px; font-weight: 500; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          z-index: 2000; white-space: nowrap;
          animation: dvToastIn 0.3s cubic-bezier(0.16,1,0.3,1) both;
          display: flex; align-items: center; gap: 8px;
        }
        @keyframes dvToastIn {
          from { opacity:0; transform: translateX(-50%) translateY(12px); }
          to   { opacity:1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <div className="dv-root">
        <div className="dv-header">
          <div>
            <div className="dv-title">{displayDate}</div>
            <div className="dv-sub">
              {loading ? "Loading…" : `${totalToday} appointment${totalToday !== 1 ? "s" : ""} today · ${settings.openingHour}:00 – ${settings.closingHour}:00`}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            {onBack && (
              <button className="dv-back" onClick={onBack}>
                <ArrowLeft size={13} strokeWidth={2.5} />
                Back
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        {!loading && (
          <div className="dv-stats">
            <div className="dv-stat accent">
              <div className="dv-stat-label">Total</div>
              <div className="dv-stat-value">{totalToday}</div>
            </div>
            <div className="dv-stat">
              <div className="dv-stat-label">Hours</div>
              <div className="dv-stat-value">{hours.length}</div>
            </div>
            <div className="dv-stat">
              <div className="dv-stat-label">Full Slots</div>
              <div className="dv-stat-value">
                {hours.filter(h => apptsByHour(h).length >= settings.maxPatientsPerHour).length}
              </div>
            </div>
          </div>
        )}

        {/* Timeline */}
        <div className="dv-timeline">
          {loading
            ? Array.from({ length: 6 }).map((_, i) => <div key={i} className="dv-skeleton" />)
            : hours.map((h) => {
                const appts   = apptsByHour(h);
                const count   = appts.length;
                const max     = settings.maxPatientsPerHour;
                const ratio   = count / max;
                const isFull  = count >= max;
                const fillClr = ratio === 0 ? "#e5e0d8" : ratio < 0.5 ? "#2E8BC0" : ratio < 1 ? "#d97706" : "#b91c1c";
                const loadCls = count === 0 ? "empty" : ratio < 0.5 ? "low" : ratio < 1 ? "med" : "high";

                return (
                  <div key={h} className={`dv-slot ${count > 0 ? "has-appts" : ""} ${isFull ? "full" : ""}`}>
                    <div className="dv-slot-header">
                      <span className="dv-slot-time">{fmtHour12(h)}</span>
                      <div className="dv-slot-center">
                        <span className={`dv-slot-load ${loadCls}`}>
                          {count} / {max}
                        </span>
                        <div className="dv-slot-progress">
                          <div
                            className="dv-slot-fill"
                            style={{ width: `${Math.min(100, ratio * 100)}%`, background: fillClr }}
                          />
                        </div>
                      </div>
                      <button
                        className={`dv-book-btn ${isFull ? "disabled" : ""}`}
                        onClick={() => !isFull && setModalSlot(h)}
                        disabled={isFull}
                        type="button"
                      >
                        <Plus size={11} strokeWidth={2.5} />
                        {isFull ? "Full" : "Book"}
                      </button>
                    </div>

                    {/* Appointment cards */}
                    {appts.length > 0 && (
                      <div className="dv-appts">
                        {appts.map((a) => {
                          const initials = a.patientName.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase();
                          const hue      = a.patientName.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;
                          return (
                            <div key={a.id} className="dv-appt-card">
                              <div className="dv-appt-left">
                                <div
                                  className="dv-appt-avatar"
                                  style={{ background: `hsl(${hue},40%,88%)`, color: `hsl(${hue},45%,32%)` }}
                                >
                                  {initials}
                                </div>
                                <div>
                                  <div className="dv-appt-patient">{a.patientName}</div>
                                  <div className="dv-appt-physio">{a.physioName}</div>
                                  {a.sessionType && (
                                    <div className="dv-appt-session">{a.sessionType}</div>
                                  )}
                                </div>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                                <span className={`dv-appt-status ${a.status ?? "scheduled"}`}>
                                  {a.status === "completed" ? "✓ Completed"
                                    : a.status === "cancelled" ? "✗ Cancelled"
                                    : "Scheduled"}
                                </span>
                                {isManager && a.status !== "completed" && a.status !== "cancelled" && (
                                  <div style={{ display: "flex", gap: 4 }}>
                                    <button
                                      className="dv-status-btn complete"
                                      disabled={updatingId === a.id}
                                      onClick={() => handleStatusUpdate(a.id, "completed", a.patientName)}
                                    >✓ Done</button>
                                    <button
                                      className="dv-status-btn cancel"
                                      disabled={updatingId === a.id}
                                      onClick={() => handleStatusUpdate(a.id, "cancelled", a.patientName)}
                                    >✗ Cancel</button>
                                  </div>
                                )}
                                {isManager && (
                                  <button
                                    className="dv-appt-del"
                                    onClick={() => handleDelete(a.id, a.patientName)}
                                    disabled={deletingId === a.id}
                                    title="Remove appointment"
                                  >
                                    {deletingId === a.id
                                      ? <><span style={{ width: 12, height: 12, border: "2px solid #e5e0d8", borderTopColor: "#b91c1c", borderRadius: "50%", display: "block", animation: "dvDelSpin 0.7s linear infinite" }} /> Deleting…</>
                                      : <><Trash2 size={12} strokeWidth={2} /> Delete</>
                                    }
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })
          }
        </div>
      </div>

      {/* Booking modal */}
      {modalSlot !== null && (
        <AppointmentModal
          date={date}
          hour={modalSlot}
          settings={settings}
          existing={apptsByHour(modalSlot)}
          patients={patients}
          physios={physios}
          currentPhysio={currentPhysio}
          isManager={isManager}
          onClose={() => setModalSlot(null)}
          onBooked={() => {
            setModalSlot(null);
            showToast("✓ Appointment booked successfully");
          }}
        />
      )}

      {toast && (
        <div className="dv-toast">
          <Check size={14} strokeWidth={2.5} />
          {toast}
        </div>
      )}
    </>
  );
}
