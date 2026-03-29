// FILE: src/components/AppointmentModal.tsx

import { useState, useEffect, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  createAppointment,
  fmtHour,
  type ClinicSettings,
  type Appointment,
} from "../services/appointmentService";
import type { Patient, Physiotherapist } from "../services/patientService";
import { Calendar, X, AlertCircle, AlertTriangle, Check } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AppointmentModalProps {
  date:          string;           // "YYYY-MM-DD"
  hour:          number;
  settings:      ClinicSettings;
  existing:      Appointment[];    // appointments already in this slot
  patients:      Patient[];
  physios:       Physiotherapist[];
  currentPhysio: { uid: string; firstName: string; lastName: string };
  isManager:     boolean;
  onClose:       () => void;
  onBooked:      () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppointmentModal({
  date,
  hour,
  settings,
  existing,
  patients,
  physios,
  currentPhysio,
  isManager,
  onClose,
  onBooked,
}: AppointmentModalProps) {
  const isFull  = existing.length >= settings.maxPatientsPerHour;

  // Physio sees only their own patients
  const availablePatients = isManager
    ? patients
    : patients.filter((p) => p.physioId === currentPhysio.uid);

  // Pre-select current physio for non-managers
  const [walkIn,      setWalkIn]      = useState(false);
  const [walkInName,  setWalkInName]  = useState("");
  const [patientId,   setPatientId]   = useState("");
  const [physioId,    setPhysioId]    = useState(isManager ? "" : currentPhysio.uid);
  const [sessionType, setSessionType] = useState("");
  const [loading,     setLoading]     = useState(false);
  const [error,       setError]       = useState<string | null>(null);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const selectedPatient = availablePatients.find((p) => p.uid === patientId);

  // Check if this patient is already booked in this slot
  const alreadyBooked = !walkIn && patientId
    ? existing.some((a) => a.patientId === patientId)
    : false;

  const canSubmit = walkIn
    ? walkInName.trim() && physioId && sessionType && !isFull && !loading
    : patientId && physioId && sessionType && !isFull && !alreadyBooked && !loading;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setError(null);

    const physioForName = physios.find((p) => p.uid === physioId) ?? currentPhysio as unknown as Physiotherapist;

    const result = await createAppointment({
      patientId:   walkIn ? "" : patientId,
      patientName: walkIn
        ? walkInName.trim()
        : selectedPatient
          ? `${selectedPatient.firstName} ${selectedPatient.lastName}`
          : "",
      physioId,
      physioName: `Dr. ${physioForName.firstName} ${physioForName.lastName}`,
      date,
      hour,
      sessionType,
    });

    setLoading(false);

    if ("error" in result) {
      setError(result.error ?? null);
      return;
    }

    onBooked();
  };

  // Format date for display
  const displayDate = new Date(date + "T00:00:00").toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long", year: "numeric",
  });

  const slotLoad = existing.length / settings.maxPatientsPerHour;
  const loadColor =
    slotLoad >= 1    ? "#b91c1c" :
    slotLoad >= 0.75 ? "#d97706" :
    "#0C3C60";

  return createPortal(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Outfit:wght@300;400;500;600&display=swap');

        .am-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(10,15,10,0.55); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 24px; animation: amOverlayIn 0.2s ease both;
        }
        @keyframes amOverlayIn { from { opacity:0; } to { opacity:1; } }

        .am-modal {
          background: #fff; border-radius: 24px; width: 100%; max-width: 460px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04);
          animation: amModalIn 0.25s cubic-bezier(0.16,1,0.3,1) both;
          overflow: hidden; font-family: 'Outfit', sans-serif;
        }
        @keyframes amModalIn {
          from { opacity:0; transform: scale(0.94) translateY(16px); }
          to   { opacity:1; transform: scale(1) translateY(0); }
        }

        .am-header {
          padding: 24px 28px 0;
          display: flex; align-items: flex-start; justify-content: space-between;
          margin-bottom: 20px;
        }
        .am-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 3px 10px; border-radius: 100px;
          background: #dbeafe; color: #1e40af;
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 8px;
        }
        .am-title {
          font-family: 'Playfair Display', serif;
          font-size: 22px; font-weight: 500; color: #1a1a1a;
          letter-spacing: -0.02em; margin-bottom: 2px;
        }
        .am-subtitle { font-size: 13px; color: #9a9590; }

        .am-close {
          width: 34px; height: 34px; border-radius: 50%;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #9a9590; transition: all 0.15s; flex-shrink: 0;
        }
        .am-close:hover { background: #f0ede8; color: #1a1a1a; border-color: #c0bbb4; }

        .am-body { padding: 0 28px; display: flex; flex-direction: column; gap: 14px; }

        /* Walk-in toggle */
        .am-toggle-row {
          display: flex; gap: 6px; padding: 4px;
          background: #f5f3ef; border-radius: 10px;
        }
        .am-toggle-btn {
          flex: 1; padding: 8px 10px; border-radius: 7px; border: none;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; background: transparent; color: #9a9590;
        }
        .am-toggle-btn.active {
          background: #fff; color: #1a1a1a;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08); font-weight: 600;
        }
        .am-walkin-badge {
          display: inline-flex; align-items: center; gap: 5px;
          background: #fef3c7; color: #92400e; border-radius: 100px;
          font-size: 11px; font-weight: 600; padding: 3px 10px;
          letter-spacing: 0.04em; text-transform: uppercase;
        }

        /* Slot capacity bar */
        .am-capacity {
          background: #f5f3ef; border-radius: 12px; padding: 14px 16px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
        }
        .am-cap-label { font-size: 12px; color: #9a9590; font-weight: 500; margin-bottom: 6px; }
        .am-cap-track {
          height: 6px; border-radius: 100px; background: #e5e0d8; overflow: hidden; margin-bottom: 4px;
        }
        .am-cap-fill { height: 100%; border-radius: 100px; transition: width 0.3s; }
        .am-cap-text { font-size: 13px; font-weight: 600; }
        .am-cap-full {
          font-size: 12.5px; font-weight: 600; color: #b91c1c;
          background: #fee2e2; padding: 3px 10px; border-radius: 100px;
        }

        /* Existing bookings list */
        .am-booked-list {
          display: flex; flex-direction: column; gap: 6px;
          max-height: 120px; overflow-y: auto;
        }
        .am-booked-item {
          display: flex; align-items: center; justify-content: space-between;
          background: #f5f3ef; border-radius: 10px; padding: 8px 12px; font-size: 13px;
        }
        .am-booked-patient { font-weight: 500; color: #1a1a1a; }
        .am-booked-physio  { font-size: 12px; color: #9a9590; }

        .am-divider { height: 1px; background: #f0ede8; }

        .am-error {
          display: flex; align-items: flex-start; gap: 8px;
          background: #fff5f3; border: 1px solid #fecaca;
          border-radius: 10px; padding: 12px 14px; font-size: 13.5px; color: #b91c1c;
        }
        .am-warn {
          display: flex; align-items: center; gap: 8px;
          background: #fffbeb; border: 1px solid #fde68a;
          border-radius: 10px; padding: 10px 12px; font-size: 13px; color: #92400e;
        }

        .am-field { display: flex; flex-direction: column; gap: 6px; }
        .am-label {
          font-size: 12px; font-weight: 600; color: #5a5550;
          text-transform: uppercase; letter-spacing: 0.07em;
        }
        .am-select-wrap { position: relative; }
        .am-select {
          font-family: 'Outfit', sans-serif;
          width: 100%; padding: 10px 14px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-size: 14px; color: #1a1a1a; outline: none;
          appearance: none; -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239a9590' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center;
          cursor: pointer; transition: border-color 0.15s;
        }
        .am-select:focus { border-color: #2E8BC0; background: #fff; box-shadow: 0 0 0 3px rgba(46,139,192,0.08); }
        .am-select:disabled { opacity: 0.55; cursor: not-allowed; }

        .am-footer {
          padding: 20px 28px 24px; display: flex; align-items: center; gap: 10px;
          border-top: 1px solid #f5f3ef; margin-top: 20px;
        }
        .am-cancel {
          padding: 11px 16px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          color: #5a5550; cursor: pointer; transition: all 0.15s;
        }
        .am-cancel:hover { background: #f0ede8; }
        .am-submit {
          flex: 1; padding: 12px; border-radius: 10px; border: none;
          background: #2E8BC0; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14.5px; font-weight: 500;
          cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .am-submit:hover:not(:disabled) { background: #0C3C60; box-shadow: 0 4px 16px rgba(46,139,192,0.25); }
        .am-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .am-spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;
          border-radius: 50%; animation: amSpin 0.7s linear infinite;
        }
        @keyframes amSpin { to { transform: rotate(360deg); } }

        .am-select { min-height: 44px; }
        .am-cancel { min-height: 48px; }
        .am-submit { min-height: 48px; }

        @media (max-width: 520px) {
          .am-overlay { padding: 0; align-items: flex-end; }
          .am-modal {
            border-radius: 22px 22px 0 0; max-width: 100%;
            max-height: 92vh; overflow-y: auto;
          }
          @keyframes amModalIn {
            from { opacity:0; transform: translateY(100%); }
            to   { opacity:1; transform: translateY(0); }
          }
          .am-header { padding: 20px 20px 0; }
          .am-body { padding: 0 20px; }
          .am-footer { padding: 16px 20px 24px; }
          .am-select { font-size: 15px; }
        }
      `}</style>

      <div className="am-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="am-modal" role="dialog" aria-modal="true">

          <div className="am-header">
            <div>
              <div className="am-badge">
                <Calendar size={11} strokeWidth={2.5} />
                Book Appointment
              </div>
              <div className="am-title">{fmtHour(hour)}</div>
              <div className="am-subtitle">{displayDate}</div>
            </div>
            <button className="am-close" onClick={onClose} aria-label="Close">
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="am-body">

              {/* Slot capacity */}
              <div className="am-capacity">
                <div style={{ flex: 1 }}>
                  <div className="am-cap-label">Slot Capacity</div>
                  <div className="am-cap-track">
                    <div
                      className="am-cap-fill"
                      style={{
                        width: `${Math.min(100, (existing.length / settings.maxPatientsPerHour) * 100)}%`,
                        background: loadColor,
                      }}
                    />
                  </div>
                  <div className="am-cap-text" style={{ color: loadColor }}>
                    {existing.length} / {settings.maxPatientsPerHour} booked
                  </div>
                </div>
                {isFull && <div className="am-cap-full">Full</div>}
              </div>

              {/* Existing bookings */}
              {existing.length > 0 && (
                <>
                  <div className="am-booked-list">
                    {existing.map((a) => (
                      <div key={a.id} className="am-booked-item">
                        <span className="am-booked-patient">{a.patientName}</span>
                        <span className="am-booked-physio">{a.physioName}{a.sessionType ? ` · ${a.sessionType}` : ""}</span>
                      </div>
                    ))}
                  </div>
                  <div className="am-divider" />
                </>
              )}

              {error && (
                <div className="am-error">
                  <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
                  {error}
                </div>
              )}

              {alreadyBooked && patientId && (
                <div className="am-warn">
                  <AlertTriangle size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
                  This patient is already booked in this time slot.
                </div>
              )}

              {!isFull && (
                <>
                  {/* Registered / Walk-in toggle */}
                  <div className="am-field">
                    <label className="am-label">Patient Type</label>
                    <div className="am-toggle-row">
                      <button
                        type="button"
                        className={`am-toggle-btn ${!walkIn ? "active" : ""}`}
                        onClick={() => { setWalkIn(false); setError(null); }}
                      >
                        Registered Patient
                      </button>
                      <button
                        type="button"
                        className={`am-toggle-btn ${walkIn ? "active" : ""}`}
                        onClick={() => { setWalkIn(true); setPatientId(""); setError(null); }}
                      >
                        Walk-in / Unregistered
                      </button>
                    </div>
                  </div>

                  {/* Patient selector OR walk-in name */}
                  {walkIn ? (
                    <div className="am-field">
                      <label className="am-label">Patient Name</label>
                      <input
                        className="am-select"
                        style={{ backgroundImage: "none" }}
                        type="text"
                        placeholder="e.g. John Doe (or leave as Walk-in)"
                        value={walkInName}
                        onChange={(e) => { setWalkInName(e.target.value); setError(null); }}
                        autoFocus
                      />
                      <span style={{ fontSize: 12, color: "#92400e", marginTop: 4, display: "block" }}>
                        ⚠ This appointment can be assigned to a registered patient later from the schedule.
                      </span>
                    </div>
                  ) : (
                    <div className="am-field">
                      <label className="am-label">Select Patient</label>
                      <div className="am-select-wrap">
                        <select
                          className="am-select"
                          value={patientId}
                          onChange={(e) => { setPatientId(e.target.value); setError(null); }}
                          required
                        >
                          <option value="">— Choose a patient —</option>
                          {availablePatients.map((p) => (
                            <option key={p.uid} value={p.uid}>
                              {p.firstName} {p.lastName}
                            </option>
                          ))}
                        </select>
                      </div>
                      {availablePatients.length === 0 && (
                        <span style={{ fontSize: 12, color: "#9a9590" }}>
                          {isManager ? "No patients in the system." : "You have no assigned patients."}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Physio selector — manager only */}
                  {isManager && (
                    <div className="am-field">
                      <label className="am-label">Assign Physiotherapist</label>
                      <div className="am-select-wrap">
                        <select
                          className="am-select"
                          value={physioId}
                          onChange={(e) => { setPhysioId(e.target.value); setError(null); }}
                          required
                        >
                          <option value="">— Choose a physiotherapist —</option>
                          {physios.map((p) => (
                            <option key={p.uid} value={p.uid}>
                              Dr. {p.firstName} {p.lastName}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* For non-managers: show locked physio */}
                  {!isManager && (
                    <div className="am-field">
                      <label className="am-label">Physiotherapist</label>
                      <div style={{
                        padding: "10px 14px", borderRadius: 10,
                        border: "1.5px solid #e5e0d8", background: "#f5f3ef",
                        fontSize: 14, color: "#5a5550", fontWeight: 500,
                      }}>
                        Dr. {currentPhysio.firstName} {currentPhysio.lastName}
                      </div>
                    </div>
                  )}

                  {/* Session type */}
                  <div className="am-field">
                    <label className="am-label">Session Type</label>
                    <div className="am-select-wrap">
                      <select
                        className="am-select"
                        value={sessionType}
                        onChange={(e) => { setSessionType(e.target.value); setError(null); }}
                        required
                      >
                        <option value="">— Choose session type —</option>
                        <option value="Physiotherapy Session">Physiotherapy Session</option>
                        <option value="Recovery Session">Recovery Session</option>
                        <option value="Assessment Session">Assessment Session</option>
                        <option value="Rehabilitation Session">Rehabilitation Session</option>
                        <option value="Online Assessment Session">Online Assessment Session</option>
                      </select>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div className="am-footer">
              <button type="button" className="am-cancel" onClick={onClose}>Cancel</button>
              {!isFull && (
                <button className="am-submit" type="submit" disabled={!canSubmit}>
                  {loading
                    ? <><div className="am-spinner" /> Booking…</>
                    : <>
                        <Check size={13} strokeWidth={2.5} />
                        Confirm Booking
                      </>
                  }
                </button>
              )}
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body
  );
}
