// FILE: src/features/patient/PatientHomePage.tsx
// Patient home screen — shown as the default landing tab after login.
// CSS prefix: pth- (patient home — no collision with pd2-, ep-, ap-, ps-, el-, ph-ov-)
//
// Sections:
//   1. Greeting          — patient first name from auth context
//   2. Next Appointment  — realtime from appointments collection
//   3. Today's Exercises — clinic programType exercises count
//   4. Home Program      — home programType exercises count
//   5. Quick Actions     — navigate to other tabs
//   6. Recovery Progress — completion % from patientExercises

import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import {
  subscribeToPatientAppointments,
  fmtHour,
  type Appointment,
} from "../../services/appointmentService";
import {
  subscribeToPatientExercises,
  type PatientExercise,
} from "../../services/exerciseService";
import type { PatientProfile } from "../../services/authService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientHomePageProps {
  onNavigate: (tab: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

function formatAppointmentDate(dateStr: string, hour: number): string {
  const [, m, d] = dateStr.split("-");
  const month = MONTH_NAMES[parseInt(m, 10) - 1] ?? "";
  const day   = parseInt(d, 10);
  return `${month} ${day} — ${fmtHour(hour)}`;
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

function Skel({ w = "100%", h = 16 }: { w?: string; h?: number }) {
  return (
    <div style={{
      width: w, height: h, borderRadius: 6,
      background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)",
      backgroundSize: "200% 100%", animation: "pthShimmer 1.4s ease infinite",
    }} />
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function PatientHomePage({ onNavigate }: PatientHomePageProps) {
  const { user } = useAuth();
  const patient = user as PatientProfile | null;

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [exercises,    setExercises]    = useState<PatientExercise[]>([]);
  const [apptLoading,  setApptLoading]  = useState(true);
  const [exLoading,    setExLoading]    = useState(true);

  // ── Realtime: upcoming appointments ─────────────────────────────────────
  useEffect(() => {
    if (!patient?.uid) return;
    setApptLoading(true);
    return subscribeToPatientAppointments(
      patient.uid,
      (data) => { setAppointments(data); setApptLoading(false); },
      ()     => setApptLoading(false)
    );
  }, [patient?.uid]);

  // ── Realtime: patient exercises ──────────────────────────────────────────
  useEffect(() => {
    if (!patient?.uid) return;
    setExLoading(true);
    return subscribeToPatientExercises(
      patient.uid,
      (data) => { setExercises(data); setExLoading(false); },
      ()     => setExLoading(false)
    );
  }, [patient?.uid]);

  // ── Derived values ────────────────────────────────────────────────────────
  const nextAppt      = appointments[0] ?? null;
  const clinicEx      = exercises.filter((e) => (e.programType ?? "clinic") === "clinic");
  const homeEx        = exercises.filter((e) => (e.programType ?? "clinic") === "home");
  const completedEx   = exercises.filter((e) => e.completed ?? false);
  const completionPct = exercises.length > 0
    ? Math.round((completedEx.length / exercises.length) * 100)
    : 0;

  const firstName     = patient?.firstName ?? "";
  const greeting      = getGreeting();

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes pthShimmer { to { background-position: -200% 0; } }
        @keyframes pthFadeUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .pth-root {
          font-family: 'Outfit', sans-serif;
          display: flex; flex-direction: column; gap: 14px;
        }

        /* ── Greeting ── */
        .pth-greeting {
          animation: pthFadeUp 0.35s ease both;
        }
        .pth-greeting-sub {
          font-size: 13px; color: #9a9590; margin-top: 2px;
        }
        .pth-greeting-name {
          font-family: 'Playfair Display', serif;
          font-size: 22px; font-weight: 500; color: #1a1a1a;
          letter-spacing: -0.02em; line-height: 1.2;
        }

        /* ── Cards grid ── */
        .pth-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
        }
        @media (max-width: 480px) {
          .pth-grid { grid-template-columns: 1fr; }
        }

        /* ── Base card ── */
        .pth-card {
          background: #fff;
          border: 1.5px solid #e5e0d8;
          border-radius: 14px;
          padding: 14px;
          transition: box-shadow 0.15s, border-color 0.15s;
        }
        .pth-card:hover {
          border-color: #B3DEF0;
          box-shadow: 0 4px 20px rgba(46,139,192,0.07);
        }

        /* Next appointment — full width with accent */
        .pth-card-appt {
          grid-column: 1 / -1;
          background: linear-gradient(135deg, #2E8BC0 0%, #0C3C60 100%);
          border: none;
          color: #fff;
        }
        .pth-card-appt:hover {
          box-shadow: 0 6px 28px rgba(46,139,192,0.3);
          border-color: transparent;
        }

        .pth-card-label {
          font-size: 10px; font-weight: 700;
          text-transform: uppercase; letter-spacing: 0.1em;
          color: #9a9590; margin-bottom: 8px;
        }
        .pth-card-appt .pth-card-label {
          color: rgba(255,255,255,0.6);
        }

        /* ── Next appointment content ── */
        .pth-appt-row {
          display: flex; align-items: center; gap: 16px;
        }
        .pth-appt-badge {
          width: 52px; height: 56px; flex-shrink: 0;
          background: rgba(255,255,255,0.12);
          border: 1px solid rgba(255,255,255,0.2);
          border-radius: 12px;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center; gap: 1px;
        }
        .pth-appt-badge-day   { font-size: 22px; font-weight: 700; line-height: 1; }
        .pth-appt-badge-month {
          font-size: 10px; text-transform: uppercase;
          opacity: 0.7; letter-spacing: 0.05em;
        }
        .pth-appt-info { flex: 1; }
        .pth-appt-time {
          font-size: 16px; font-weight: 600; margin-bottom: 3px;
        }
        .pth-appt-type { font-size: 13px; opacity: 0.85; margin-bottom: 2px; }
        .pth-appt-physio { font-size: 12px; opacity: 0.65; }

        .pth-appt-empty {
          font-size: 14px; opacity: 0.7; padding: 4px 0;
        }

        /* ── Stat card (exercises / home program) ── */
        .pth-stat-icon {
          width: 40px; height: 40px; border-radius: 11px;
          background: #EAF5FC;
          display: flex; align-items: center; justify-content: center;
          color: #2E8BC0; margin-bottom: 12px;
        }
        .pth-stat-number {
          font-family: 'Playfair Display', serif;
          font-size: 32px; font-weight: 500; color: #1a1a1a;
          line-height: 1; margin-bottom: 4px;
        }
        .pth-stat-desc { font-size: 13px; color: #9a9590; }
        .pth-stat-link {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 12.5px; font-weight: 600; color: #2E8BC0;
          margin-top: 10px; cursor: pointer;
          background: none; border: none; padding: 0;
          font-family: 'Outfit', sans-serif; transition: opacity 0.15s;
        }
        .pth-stat-link:hover { opacity: 0.75; }

        /* ── Progress card — full width ── */
        .pth-card-progress { grid-column: 1 / -1; }
        .pth-progress-header {
          display: flex; justify-content: space-between;
          align-items: center; margin-bottom: 14px;
        }
        .pth-progress-pct {
          font-size: 26px; font-weight: 700; color: #2E8BC0;
          font-family: 'Playfair Display', serif;
        }
        .pth-progress-track {
          height: 8px; border-radius: 100px;
          background: #f0ede8; overflow: hidden; margin-bottom: 10px;
        }
        .pth-progress-fill {
          height: 100%; border-radius: 100px;
          background: linear-gradient(90deg, #2E8BC0, #5BC0BE);
          transition: width 0.6s cubic-bezier(0.34, 1.2, 0.64, 1);
        }
        .pth-progress-desc { font-size: 13px; color: #5a5550; }
        .pth-progress-desc strong { color: #2E8BC0; }

        /* ── Quick actions — full width ── */
        .pth-card-actions { grid-column: 1 / -1; }
        .pth-actions-row {
          display: flex; gap: 8px; flex-direction: column;
        }
        .pth-action-btn {
          width: 100%;
          display: flex; align-items: center; justify-content: center; gap: 7px;
          padding: 13px 16px; border-radius: 12px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 14px;
          font-weight: 500; color: #1a1a1a; cursor: pointer;
          transition: all 0.15s; min-height: 48px;
        }
        .pth-action-btn:hover {
          border-color: #2E8BC0; color: #2E8BC0; background: #EAF5FC;
        }
        .pth-action-btn.primary {
          background: #2E8BC0; border-color: #2E8BC0;
          color: #fff;
        }
        .pth-action-btn.primary:hover {
          background: #0C3C60; border-color: #0C3C60; color: #fff;
        }
      `}</style>

      <div className="pth-root">

        {/* ── Section 1: Greeting ── */}
        <div className="pth-greeting">
          <div className="pth-greeting-name">
            {greeting}{firstName ? `, ${firstName}` : ""} 👋
          </div>
          <div className="pth-greeting-sub">
            Here's your health summary for today.
          </div>
        </div>

        <div className="pth-grid">

          {/* ── Section 2: Next Appointment ── */}
          <div className="pth-card pth-card-appt">
            <div className="pth-card-label">Next Appointment</div>
            {apptLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Skel h={14} w="60%" />
                <Skel h={18} w="80%" />
                <Skel h={12} w="50%" />
              </div>
            ) : nextAppt ? (
              <div className="pth-appt-row">
                <div className="pth-appt-badge">
                  {(() => {
                    const [, m, d] = nextAppt.date.split("-");
                    return (
                      <>
                        <div className="pth-appt-badge-day">{parseInt(d, 10)}</div>
                        <div className="pth-appt-badge-month">
                          {MONTH_NAMES[parseInt(m, 10) - 1] ?? ""}
                        </div>
                      </>
                    );
                  })()}
                </div>
                <div className="pth-appt-info">
                  <div className="pth-appt-time">
                    {formatAppointmentDate(nextAppt.date, nextAppt.hour)}
                  </div>
                  <div className="pth-appt-type">{nextAppt.sessionType}</div>
                  <div className="pth-appt-physio">{nextAppt.physioName}</div>
                </div>
              </div>
            ) : (
              <div className="pth-appt-empty">No upcoming appointments scheduled.</div>
            )}
          </div>

          {/* ── Section 3: Today's Exercises (clinic) ── */}
          <div className="pth-card">
            <div className="pth-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6.5 6.5h.01M17.5 6.5h.01M6.5 17.5h.01M17.5 17.5h.01"/>
                <path d="M3 6.5h3.5M17.5 6.5H21M3 17.5h3.5M17.5 17.5H21"/>
                <path d="M6.5 3v3.5M6.5 17.5V21M17.5 3v3.5M17.5 17.5V21"/>
                <rect x="6.5" y="6.5" width="11" height="11" rx="2"/>
              </svg>
            </div>
            <div className="pth-card-label">Today's Exercises</div>
            {exLoading ? (
              <><Skel h={32} w="40%" /><div style={{ marginTop: 6 }}><Skel h={13} w="70%" /></div></>
            ) : (
              <>
                <div className="pth-stat-number">{clinicEx.length}</div>
                <div className="pth-stat-desc">
                  {clinicEx.length === 1 ? "exercise" : "exercises"} assigned
                </div>
                <button className="pth-stat-link" onClick={() => onNavigate("exercises")}>
                  View Exercises
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              </>
            )}
          </div>

          {/* ── Section 4: Home Program ── */}
          <div className="pth-card">
            <div className="pth-stat-icon">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                <polyline points="9 22 9 12 15 12 15 22"/>
              </svg>
            </div>
            <div className="pth-card-label">Home Program</div>
            {exLoading ? (
              <><Skel h={32} w="40%" /><div style={{ marginTop: 6 }}><Skel h={13} w="70%" /></div></>
            ) : (
              <>
                <div className="pth-stat-number">{homeEx.length}</div>
                <div className="pth-stat-desc">
                  {homeEx.length === 1 ? "exercise" : "exercises"} assigned
                </div>
                <button className="pth-stat-link" onClick={() => onNavigate("exercises")}>
                  View Program
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </button>
              </>
            )}
          </div>

          {/* ── Section 6: Recovery Progress ── */}
          <div className="pth-card pth-card-progress">
            <div className="pth-card-label">Recovery Progress</div>
            <div className="pth-progress-header">
              <div>
                <div style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", marginBottom: 2 }}>
                  Exercise Completion
                </div>
                <div style={{ fontSize: 13, color: "#9a9590" }}>
                  {exLoading ? "Loading…" : `${completedEx.length} of ${exercises.length} completed`}
                </div>
              </div>
              <div className="pth-progress-pct">
                {exLoading ? "—" : `${completionPct}%`}
              </div>
            </div>
            <div className="pth-progress-track">
              <div
                className="pth-progress-fill"
                style={{ width: exLoading ? "0%" : `${completionPct}%` }}
              />
            </div>
            <div className="pth-progress-desc">
              {exLoading ? (
                <Skel h={13} w="75%" />
              ) : exercises.length === 0 ? (
                "No exercises assigned yet."
              ) : completionPct === 100 ? (
                <><strong>Great work!</strong> You completed all your exercises.</>
              ) : completionPct >= 50 ? (
                <>You completed <strong>{completionPct}%</strong> of your exercises. Keep it up!</>
              ) : (
                <>You completed <strong>{completionPct}%</strong> of your exercises this week.</>
              )}
            </div>
          </div>

          {/* ── Section 5: Quick Actions ── */}
          <div className="pth-card pth-card-actions">
            <div className="pth-card-label">Quick Actions</div>
            <div className="pth-actions-row">
              <button className="pth-action-btn primary" onClick={() => onNavigate("exercises")}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M6.5 6.5h.01M17.5 6.5h.01M6.5 17.5h.01M17.5 17.5h.01"/>
                  <path d="M3 6.5h3.5M17.5 6.5H21M3 17.5h3.5M17.5 17.5H21"/>
                  <path d="M6.5 3v3.5M6.5 17.5V21M17.5 3v3.5M17.5 17.5V21"/>
                  <rect x="6.5" y="6.5" width="11" height="11" rx="2"/>
                </svg>
                View Exercises
              </button>
              <button className="pth-action-btn" onClick={() => onNavigate("appointments")}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4" width="18" height="18" rx="2"/>
                  <path d="M16 2v4M8 2v4M3 10h18"/>
                </svg>
                Book Appointment
              </button>
              <button className="pth-action-btn" onClick={() => onNavigate("sheet")}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
                Patient Sheet
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
