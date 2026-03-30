// FILE: src/features/schedule/DayView.tsx

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Plus, Trash2, Check, UserCheck } from "lucide-react";
import {
  subscribeToAppointmentsByDay,
  deleteAppointment,
  updateAppointmentStatus,
  assignAppointmentToPatient,
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
  const [appointments,  setAppointments]  = useState<Appointment[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [modalSlot,     setModalSlot]     = useState<number | null>(null);
  const [deletingId,    setDeletingId]    = useState<string | null>(null);
  const [updatingId,    setUpdatingId]    = useState<string | null>(null);
  const [toast,         setToast]         = useState<string | null>(null);
  // Assign-patient flow
  const [assignAppt,    setAssignAppt]    = useState<Appointment | null>(null);
  const [assignPtId,    setAssignPtId]    = useState("");
  const [assignSaving,  setAssignSaving]  = useState(false);
  const [assignError,   setAssignError]   = useState<string | null>(null);

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
    showToast(`✓ Appointment for ${patientName || "Walk-in"} removed`);
  };

  const handleStatusUpdate = async (
    apptId: string,
    status: Appointment["status"],
    patientName: string
  ) => {
    setUpdatingId(apptId);
    await updateAppointmentStatus(apptId, status);
    setUpdatingId(null);
    const label = status === "completed" ? "Completed"
                : status === "cancelled" ? "Cancelled"
                : status === "rescheduled" ? "Rescheduled"
                : status === "in_progress" ? "In Progress"
                : "Scheduled";
    showToast(`✓ ${patientName || "Walk-in"} marked as ${label}`);
  };

  const handleAssignSave = async () => {
    if (!assignAppt || !assignPtId) return;
    setAssignSaving(true);
    setAssignError(null);
    const pt = patients.find((p) => p.uid === assignPtId);
    if (!pt) { setAssignError("Patient not found."); setAssignSaving(false); return; }
    const { error } = await assignAppointmentToPatient(
      assignAppt.id,
      pt.uid,
      `${pt.firstName} ${pt.lastName}`
    );
    setAssignSaving(false);
    if (error) { setAssignError(error); return; }
    setAssignAppt(null);
    setAssignPtId("");
    showToast(`✓ Appointment assigned to ${pt.firstName} ${pt.lastName}`);
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
        .dv-appt-status.completed   { background: #d8f3dc; color: #1b4332; }
        .dv-appt-status.cancelled   { background: #fee2e2; color: #991b1b; }
        .dv-appt-status.scheduled   { background: #D6EEF8; color: #0C3C60; }
        .dv-appt-status.in_progress { background: #fef3c7; color: #92400e; }
        .dv-appt-status.rescheduled { background: #ede9fe; color: #4c1d95; }

        .dv-status-select {
          font-family: 'Outfit', sans-serif;
          font-size: 12px; font-weight: 500;
          padding: 5px 28px 5px 10px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          color: #1a1a1a; cursor: pointer; outline: none;
          appearance: none; min-height: 30px;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239a9590' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 8px center;
          transition: border-color 0.15s;
        }
        .dv-status-select:hover:not(:disabled) { border-color: #2E8BC0; }
        .dv-status-select:focus { border-color: #2E8BC0; box-shadow: 0 0 0 3px rgba(46,139,192,0.1); }
        .dv-status-select:disabled { opacity: 0.5; cursor: not-allowed; }
        .dv-status-select.completed   { border-color: #b7e4c7; background-color: #f0fdf4; color: #1b4332; }
        .dv-status-select.cancelled   { border-color: #fca5a5; background-color: #fff5f5; color: #991b1b; }
        .dv-status-select.rescheduled { border-color: #c4b5fd; background-color: #f5f3ff; color: #4c1d95; }
        .dv-status-select.in_progress { border-color: #fcd34d; background-color: #fffbeb; color: #92400e; }

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

        .dv-unassigned-badge {
          font-size: 10.5px; font-weight: 700; padding: 2px 8px;
          border-radius: 100px; background: #fef3c7; color: #92400e;
          white-space: nowrap; letter-spacing: 0.04em; text-transform: uppercase;
        }
        .dv-assign-btn {
          display: inline-flex; align-items: center; gap: 5px;
          height: 28px; border-radius: 8px; padding: 0 10px;
          border: 1.5px solid #fbbf24; background: #fffbeb;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500;
          cursor: pointer; color: #92400e; transition: all 0.15s; white-space: nowrap;
        }
        .dv-assign-btn:hover { background: #fef3c7; }

        /* Assign modal */
        .dv-assign-overlay {
          position: fixed; inset: 0; z-index: 1001;
          background: rgba(10,15,10,0.45); backdrop-filter: blur(3px);
          display: flex; align-items: center; justify-content: center; padding: 24px;
          animation: dvOverlayIn 0.15s ease both;
        }
        @keyframes dvOverlayIn { from { opacity:0; } to { opacity:1; } }
        .dv-assign-modal {
          background: #fff; border-radius: 20px; padding: 28px;
          width: min(400px, 100%);
          box-shadow: 0 24px 80px rgba(0,0,0,0.18);
          animation: dvModalIn 0.2s cubic-bezier(0.16,1,0.3,1) both;
          font-family: 'Outfit', sans-serif;
        }
        @keyframes dvModalIn {
          from { opacity:0; transform: scale(0.95) translateY(10px); }
          to   { opacity:1; transform: scale(1) translateY(0); }
        }
        .dv-assign-title { font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 5px; }
        .dv-assign-sub   { font-size: 13px; color: #9a9590; margin-bottom: 20px; }
        .dv-assign-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #5a5550; margin-bottom: 6px; display: block; }
        .dv-assign-select {
          width: 100%; padding: 11px 14px; border-radius: 10px; box-sizing: border-box;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
          outline: none; appearance: none; cursor: pointer; min-height: 44px;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239a9590' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px;
        }
        .dv-assign-select:focus { border-color: #2E8BC0; box-shadow: 0 0 0 3px rgba(46,139,192,0.1); }
        .dv-assign-error { font-size: 13px; color: #b91c1c; margin-top: 10px; }
        .dv-assign-actions { display: flex; gap: 8px; margin-top: 20px; }
        .dv-assign-cancel {
          padding: 11px 18px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          color: #5a5550; cursor: pointer;
        }
        .dv-assign-cancel:hover { background: #f5f3ef; }
        .dv-assign-save {
          flex: 1; padding: 11px; border-radius: 10px; border: none;
          background: #2E8BC0; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: background 0.15s;
          display: flex; align-items: center; justify-content: center;
        }
        .dv-assign-save:hover:not(:disabled) { background: #0C3C60; }
        .dv-assign-save:disabled { opacity: 0.55; cursor: not-allowed; }
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
                                  <div className="dv-appt-patient">{a.patientName || "Walk-in"}</div>
                                  {a.patientPhone && (
                                    <div className="dv-appt-physio" style={{ color: "#5BC0BE" }}>{a.patientPhone}</div>
                                  )}
                                  <div className="dv-appt-physio">{a.physioName}</div>
                                  {a.sessionType && (
                                    <div className="dv-appt-session">{a.sessionType}</div>
                                  )}
                                </div>
                              </div>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }}>
                                {!a.patientId && (
                                  <span className="dv-unassigned-badge">Unassigned</span>
                                )}
                                <span className={`dv-appt-status ${a.status ?? "scheduled"}`}>
                                  {a.status === "completed"   ? "✓ Completed"
                                    : a.status === "cancelled"   ? "✗ Cancelled"
                                    : a.status === "rescheduled" ? "↺ Rescheduled"
                                    : a.status === "in_progress" ? "● In Progress"
                                    : "Scheduled"}
                                </span>
                                {isManager && !a.patientId && (
                                  <button
                                    className="dv-assign-btn"
                                    onClick={() => { setAssignAppt(a); setAssignPtId(""); setAssignError(null); }}
                                    type="button"
                                  >
                                    <UserCheck size={12} strokeWidth={2.5} /> Assign Patient
                                  </button>
                                )}
                                {(isManager || a.physioId === currentPhysio.uid) && (
                                  <select
                                    className={`dv-status-select ${a.status ?? "scheduled"}`}
                                    value={a.status ?? "scheduled"}
                                    disabled={updatingId === a.id}
                                    onChange={(e) =>
                                      handleStatusUpdate(
                                        a.id,
                                        e.target.value as Appointment["status"],
                                        a.patientName
                                      )
                                    }
                                  >
                                    <option value="scheduled">Scheduled</option>
                                    <option value="in_progress">In Progress</option>
                                    <option value="completed">Completed</option>
                                    <option value="cancelled">Cancelled</option>
                                    <option value="rescheduled">Rescheduled</option>
                                  </select>
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

      {/* Assign-patient modal */}
      {assignAppt && createPortal(
        <div className="dv-assign-overlay" onClick={(e) => { if (e.target === e.currentTarget) setAssignAppt(null); }}>
          <div className="dv-assign-modal">
            <div className="dv-assign-title">Assign to Patient</div>
            <div className="dv-assign-sub">
              Link this appointment ({assignAppt.patientName || "Walk-in"} · {fmtHour12(assignAppt.hour)}) to a registered patient profile.
            </div>
            <label className="dv-assign-label">Select Patient</label>
            <select
              className="dv-assign-select"
              value={assignPtId}
              onChange={(e) => { setAssignPtId(e.target.value); setAssignError(null); }}
            >
              <option value="">— Choose a patient —</option>
              {patients.map((p) => (
                <option key={p.uid} value={p.uid}>
                  {p.firstName} {p.lastName}
                </option>
              ))}
            </select>
            {assignError && <div className="dv-assign-error">{assignError}</div>}
            <div className="dv-assign-actions">
              <button className="dv-assign-cancel" onClick={() => setAssignAppt(null)}>Cancel</button>
              <button
                className="dv-assign-save"
                disabled={!assignPtId || assignSaving}
                onClick={handleAssignSave}
              >
                {assignSaving ? "Saving…" : "Assign Patient"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
