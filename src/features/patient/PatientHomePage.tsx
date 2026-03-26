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
import { Dumbbell, Home, ChevronRight, Calendar, FileText } from "lucide-react";
import {
  collection, query, where, orderBy, limit, onSnapshot,
} from "firebase/firestore";
import { db } from "../../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientHomePageProps {
  onNavigate: (tab: string) => void;
}

interface PainEntry {
  date:  string;   // YYYY-MM-DD
  pain:  number;   // 0–10
}

// ─── Pain chart (pure SVG, no library) ───────────────────────────────────────

const PAIN_COLORS_SCALE = [
  "#22c55e","#4ade80","#86efac","#fde047","#facc15",
  "#fb923c","#f97316","#ef4444","#dc2626","#b91c1c","#7f1d1d",
];
const SHORT_MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function painColor(v: number): string {
  const i = Math.max(0, Math.min(10, Math.round(v)));
  return PAIN_COLORS_SCALE[i] ?? "#ef4444";
}

function PainChart({ data }: { data: PainEntry[] }) {
  if (data.length === 0) {
    return (
      <div style={{ textAlign: "center", color: "#9a9590", padding: "20px 0", fontSize: 13 }}>
        No session feedback recorded yet.<br />
        <span style={{ fontSize: 12 }}>Submit feedback after your sessions to track progress.</span>
      </div>
    );
  }

  const W = 300, H = 100;
  const padL = 22, padR = 8, padT = 10, padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n     = data.length;

  const pts = data.map((d, i) => ({
    x:    padL + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2),
    y:    padT + plotH - (d.pain / 10) * plotH,
    pain: d.pain,
    date: d.date,
  }));

  const linePts  = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const areaPath = n > 1
    ? `M${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} ` +
      pts.slice(1).map((p) => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") +
      ` L${pts[n-1].x.toFixed(1)},${(padT+plotH).toFixed(1)} L${pts[0].x.toFixed(1)},${(padT+plotH).toFixed(1)} Z`
    : "";

  const latestPain = data[n - 1]?.pain ?? 0;

  return (
    <div>
      {/* Latest pain level pill */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 6,
          padding: "4px 10px", borderRadius: 100,
          background: painColor(latestPain) + "22",
          border: `1px solid ${painColor(latestPain)}55`,
        }}>
          <div style={{
            width: 8, height: 8, borderRadius: "50%",
            background: painColor(latestPain),
          }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: painColor(latestPain) }}>
            Latest: {latestPain}/10
          </span>
        </div>
        <span style={{ fontSize: 12, color: "#9a9590" }}>
          {n} session{n !== 1 ? "s" : ""} recorded
        </span>
      </div>

      {/* SVG chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        style={{ width: "100%", height: "auto", display: "block", overflow: "visible" }}
        aria-label="Pain level over time"
      >
        <defs>
          <linearGradient id="pthPainGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%"   stopColor="#ef4444" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#22c55e" stopOpacity="0.03" />
          </linearGradient>
        </defs>

        {/* Y-axis grid + labels */}
        {[0, 5, 10].map((v) => {
          const gy = padT + plotH - (v / 10) * plotH;
          return (
            <g key={v}>
              <line
                x1={padL} y1={gy} x2={W - padR} y2={gy}
                stroke="#f0ede8" strokeWidth="1"
              />
              <text
                x={padL - 5} y={gy + 3.5}
                textAnchor="end" fontSize="8" fill="#b0aca6"
              >{v}</text>
            </g>
          );
        })}

        {/* Area fill */}
        {n > 1 && (
          <path d={areaPath} fill="url(#pthPainGrad)" />
        )}

        {/* Line */}
        {n > 1 && (
          <polyline
            points={linePts}
            fill="none"
            stroke="#2E8BC0"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}

        {/* Dots + X labels */}
        {pts.map((p, i) => {
          const [, m, d] = p.date.split("-");
          const label = `${parseInt(d, 10)} ${SHORT_MONTHS[parseInt(m, 10) - 1] ?? ""}`;
          const showLabel = n <= 6 || i === 0 || i === n - 1 || i % Math.ceil(n / 5) === 0;
          return (
            <g key={i}>
              {/* Shadow halo */}
              <circle cx={p.x} cy={p.y} r="5.5" fill={painColor(p.pain)} opacity="0.15" />
              {/* Dot */}
              <circle
                cx={p.x} cy={p.y} r="3.8"
                fill={painColor(p.pain)}
                stroke="#fff" strokeWidth="1.5"
              />
              {/* X-axis date label */}
              {showLabel && (
                <text
                  x={p.x} y={padT + plotH + 16}
                  textAnchor="middle" fontSize="7.5" fill="#b0aca6"
                >{label}</text>
              )}
            </g>
          );
        })}
      </svg>

      {/* Legend */}
      <div style={{ display: "flex", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
        {[{ label: "Low (0–3)", color: "#22c55e" }, { label: "Moderate (4–6)", color: "#fb923c" }, { label: "High (7–10)", color: "#ef4444" }].map((l) => (
          <div key={l.label} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#9a9590" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: l.color }} />
            {l.label}
          </div>
        ))}
      </div>
    </div>
  );
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
  const [feedback,     setFeedback]     = useState<PainEntry[]>([]);
  const [apptLoading,  setApptLoading]  = useState(true);
  const [exLoading,    setExLoading]    = useState(true);
  const [fbLoading,    setFbLoading]    = useState(true);

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

  // ── Realtime: session feedback pain levels ────────────────────────────────
  useEffect(() => {
    if (!patient?.uid) return;
    setFbLoading(true);
    const q = query(
      collection(db, "sessionFeedback"),
      where("patientId", "==", patient.uid),
      orderBy("sessionDate", "asc"),
      limit(12)
    );
    return onSnapshot(
      q,
      (snap) => {
        const entries: PainEntry[] = snap.docs.map((d) => ({
          date: d.data().sessionDate as string,
          pain: (d.data().painLevel as number) ?? 0,
        }));
        setFeedback(entries);
        setFbLoading(false);
      },
      () => setFbLoading(false)
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

        /* ── Pain chart card — full width ── */
        .pth-card-pain { grid-column: 1 / -1; }
        .pth-pain-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 4px;
        }
        .pth-pain-title {
          font-size: 15px; font-weight: 600; color: #1a1a1a;
        }
        .pth-pain-sub {
          font-size: 12px; color: #9a9590; margin-bottom: 12px;
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
              <Dumbbell size={20} strokeWidth={1.8} />
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
                  <ChevronRight size={12} strokeWidth={2.5} />
                </button>
              </>
            )}
          </div>

          {/* ── Section 4: Home Program ── */}
          <div className="pth-card">
            <div className="pth-stat-icon">
              <Home size={20} strokeWidth={1.8} />
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
                  <ChevronRight size={12} strokeWidth={2.5} />
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

          {/* ── Pain Level Chart ── */}
          <div className="pth-card pth-card-pain">
            <div className="pth-card-label">Pain Level Tracking</div>
            <div className="pth-pain-header">
              <div className="pth-pain-title">Pain Level Over Time</div>
            </div>
            <div className="pth-pain-sub">
              Based on your post-session feedback · last {Math.min(feedback.length, 12)} sessions
            </div>
            {fbLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <Skel h={12} w="40%" />
                <Skel h={80} w="100%" />
              </div>
            ) : (
              <PainChart data={feedback} />
            )}
          </div>

          {/* ── Section 5: Quick Actions ── */}
          <div className="pth-card pth-card-actions">
            <div className="pth-card-label">Quick Actions</div>
            <div className="pth-actions-row">
              <button className="pth-action-btn primary" onClick={() => onNavigate("exercises")}>
                <Dumbbell size={15} strokeWidth={2} />
                View Exercises
              </button>
              <button className="pth-action-btn" onClick={() => onNavigate("appointments")}>
                <Calendar size={15} strokeWidth={2} />
                Book Appointment
              </button>
              <button className="pth-action-btn" onClick={() => onNavigate("sheet")}>
                <FileText size={15} strokeWidth={2} />
                Patient Sheet
              </button>
            </div>
          </div>

        </div>
      </div>
    </>
  );
}
