// FILE: src/features/patient/PatientHomePage.tsx
// Patient home — redesigned with week calendar strip + exercise card feed.

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../hooks/useAuth";
import { VideoEmbed } from "../../components/VideoEmbed";
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
import { Calendar, FileText, Check, ChevronRight } from "lucide-react";
import {
  collection, doc, query, where, orderBy, limit,
  onSnapshot, setDoc, updateDoc, serverTimestamp,
} from "firebase/firestore";
import { db } from "../../firebase";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientHomePageProps {
  onNavigate: (tab: string) => void;
}

interface PainEntry {
  date: string;
  pain: number;
}

interface CheckIn {
  mood: number;
  date: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const DAY_LABELS  = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

const MOODS = [
  { value: 1, emoji: "😫", label: "Struggling" },
  { value: 2, emoji: "😟", label: "Rough"      },
  { value: 3, emoji: "😐", label: "Okay"       },
  { value: 4, emoji: "😊", label: "Good"       },
  { value: 5, emoji: "😄", label: "Great"      },
];

// Time-of-day buckets — we split exercises into Morning / Afternoon / Evening
// based on a `timeOfDay` field; if absent, default to "Morning".
const TIME_BUCKETS = ["Morning", "Afternoon", "Evening"] as const;
type TimeBucket = typeof TIME_BUCKETS[number];

const BUCKET_ICON: Record<TimeBucket, string> = {
  Morning:   "🌅",
  Afternoon: "☀️",
  Evening:   "🌙",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isoDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  return d.toISOString().slice(0, 10);
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatApptShort(dateStr: string, hour: number): string {
  const [, m, d] = dateStr.split("-");
  return `${parseInt(d, 10)} ${MONTH_NAMES[parseInt(m, 10) - 1] ?? ""} · ${fmtHour(hour)}`;
}

function bucketFor(ex: PatientExercise): TimeBucket {
  if (ex.timeOfDay === "Afternoon") return "Afternoon";
  if (ex.timeOfDay === "Evening")   return "Evening";
  return "Morning";
}

const PAIN_COLORS = ["#22c55e","#4ade80","#86efac","#fde047","#facc15","#fb923c","#f97316","#ef4444","#dc2626","#b91c1c","#7f1d1d"];
function painColor(v: number) { return PAIN_COLORS[Math.max(0, Math.min(10, Math.round(v)))] ?? "#ef4444"; }

function calcStreak(logDates: string[]): { current: number; best: number; last7: boolean[] } {
  const dateSet = new Set(logDates);
  const last7: boolean[] = [];
  for (let i = 6; i >= 0; i--) last7.push(dateSet.has(isoDate(i)));
  let current = 0;
  for (let i = 0; i < 365; i++) {
    if (dateSet.has(isoDate(i))) current++;
    else break;
  }
  const sorted = [...logDates].sort();
  let best = current, run = 0, prev = "";
  for (const d of sorted) {
    if (prev) {
      const next = new Date(prev + "T00:00:00");
      next.setDate(next.getDate() + 1);
      run = next.toISOString().slice(0, 10) === d ? run + 1 : 1;
    } else { run = 1; }
    if (run > best) best = run;
    prev = d;
  }
  return { current, best, last7 };
}

// ─── Week calendar strip ──────────────────────────────────────────────────────

function buildWeek(centerDate: string): { iso: string; dow: number; day: number }[] {
  const center = new Date(centerDate + "T00:00:00");
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(center);
    d.setDate(center.getDate() - 3 + i);
    return {
      iso: d.toISOString().slice(0, 10),
      dow: d.getDay(),
      day: d.getDate(),
    };
  });
}

// ─── Exercise card component ──────────────────────────────────────────────────

function ExCard({
  ex,
  onComplete,
}: {
  ex: PatientExercise;
  onComplete: (id: string, val: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const done = ex.completed ?? false;

  return (
    <div className={`pth-ex-card${done ? " pth-ex-card-done" : ""}`}>
      <div className="pth-ex-card-row" onClick={() => setExpanded((v) => !v)}>
        {/* Checkbox */}
        <button
          className={`pth-ex-check${done ? " pth-ex-check-done" : ""}`}
          onClick={(e) => { e.stopPropagation(); onComplete(ex.id, !done); }}
          title={done ? "Mark incomplete" : "Mark complete"}
        >
          {done && <Check size={13} strokeWidth={3} color="#fff" />}
        </button>

        {/* Info */}
        <div className="pth-ex-info">
          <div className="pth-ex-name">{ex.name}</div>
          <div className="pth-ex-meta">
            {[
              ex.sets  && `${ex.sets} sets`,
              ex.reps  && `${ex.reps} reps`,
              ex.holdTime && `${ex.holdTime}s hold`,
            ].filter(Boolean).join(" · ")}
            {ex.programType === "home" && (
              <span className="pth-ex-badge-home">Home</span>
            )}
          </div>
        </div>

        {/* Expand chevron */}
        <svg
          width="14" height="14" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ color: "#c0bbb4", flexShrink: 0, transition: "transform 0.2s", transform: expanded ? "rotate(180deg)" : "none" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {expanded && (
        <div className="pth-ex-expanded">
          {ex.notes && (
            <div className="pth-ex-notes">{ex.notes}</div>
          )}
          {ex.videoId && (
            <VideoEmbed videoId={ex.videoId} wrapperStyle={{ marginTop: 10 }} />
          )}
          {!ex.videoId && !ex.notes && (
            <div style={{ fontSize: 12, color: "#b0aca6" }}>No additional details.</div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Pain chart (unchanged, kept compact) ────────────────────────────────────

function MiniPainChart({ data }: { data: PainEntry[] }) {
  if (data.length === 0) return (
    <div style={{ textAlign: "center", color: "#9a9590", padding: "16px 0", fontSize: 13 }}>
      No session feedback yet.
    </div>
  );
  const W = 300, H = 80, padL = 18, padR = 6, padT = 8, padB = 20;
  const plotW = W - padL - padR, plotH = H - padT - padB, n = data.length;
  const pts = data.map((d, i) => ({
    x: padL + (n > 1 ? (i / (n - 1)) * plotW : plotW / 2),
    y: padT + plotH - (d.pain / 10) * plotH,
    pain: d.pain, date: d.date,
  }));
  const linePts = pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const latest  = data[n - 1]?.pain ?? 0;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: painColor(latest), background: painColor(latest) + "22", padding: "2px 8px", borderRadius: 100 }}>
          Latest: {latest}/10
        </span>
        <span style={{ fontSize: 12, color: "#9a9590" }}>{n} session{n !== 1 ? "s" : ""}</span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
        {n > 1 && <polyline points={linePts} fill="none" stroke="#2E8BC0" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
        {pts.map((p, i) => (
          <g key={i}>
            <circle cx={p.x} cy={p.y} r="4" fill={painColor(p.pain)} stroke="#fff" strokeWidth="1.5" />
          </g>
        ))}
        {[0, 5, 10].map((v) => {
          const gy = padT + plotH - (v / 10) * plotH;
          return <text key={v} x={padL - 4} y={gy + 3.5} textAnchor="end" fontSize="7" fill="#c0bbb4">{v}</text>;
        })}
      </svg>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Skel({ w = "100%", h = 16 }: { w?: string; h?: number }) {
  return (
    <div style={{ width: w, height: h, borderRadius: 6, background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)", backgroundSize: "200% 100%", animation: "pthShimmer 1.4s ease infinite" }} />
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PatientHomePage({ onNavigate }: PatientHomePageProps) {
  const { user } = useAuth();
  const patient  = user as PatientProfile | null;

  const today = isoDate();
  const [selectedDate, setSelectedDate] = useState(today);
  const weekDays = buildWeek(selectedDate);

  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [exercises,    setExercises]    = useState<PatientExercise[]>([]);
  const [feedback,     setFeedback]     = useState<PainEntry[]>([]);
  const [checkIn,      setCheckIn]      = useState<CheckIn | null>(null);
  const [streakDates,  setStreakDates]  = useState<string[]>([]);
  const [checkInMood,  setCheckInMood]  = useState<number | null>(null);
  const [savingCheckIn,setSavingCheckIn]= useState(false);
  const [apptLoading,  setApptLoading]  = useState(true);
  const [exLoading,    setExLoading]    = useState(true);
  const [fbLoading,    setFbLoading]    = useState(true);
  const [checkInLoading, setCheckInLoading] = useState(true);
  const [streakLoading,  setStreakLoading]  = useState(true);

  const calRef = useRef<HTMLDivElement>(null);

  // Scroll today into center on mount
  useEffect(() => {
    setTimeout(() => {
      const el = calRef.current?.querySelector("[data-today]") as HTMLElement | null;
      el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
    }, 100);
  }, []);

  useEffect(() => {
    if (!patient?.uid) return;
    setApptLoading(true);
    return subscribeToPatientAppointments(patient.uid, (data) => { setAppointments(data); setApptLoading(false); }, () => setApptLoading(false));
  }, [patient?.uid]);

  useEffect(() => {
    if (!patient?.uid) return;
    setExLoading(true);
    return subscribeToPatientExercises(patient.uid, (data) => { setExercises(data); setExLoading(false); }, () => setExLoading(false));
  }, [patient?.uid]);

  useEffect(() => {
    if (!patient?.uid) return;
    setFbLoading(true);
    const q = query(collection(db, "sessionFeedback"), where("patientId", "==", patient.uid), orderBy("sessionDate", "asc"), limit(12));
    return onSnapshot(q, (snap) => {
      setFeedback(snap.docs.map((d) => ({ date: d.data().sessionDate as string, pain: (d.data().painLevel as number) ?? 0 })));
      setFbLoading(false);
    }, () => setFbLoading(false));
  }, [patient?.uid]);

  useEffect(() => {
    if (!patient?.uid) return;
    const docRef = doc(db, "dailyCheckIns", `${patient.uid}_${today}`);
    return onSnapshot(docRef, (snap) => {
      setCheckIn(snap.exists() ? { mood: snap.data().mood as number, date: snap.data().date as string } : null);
      setCheckInLoading(false);
    }, () => setCheckInLoading(false));
  }, [patient?.uid]);

  useEffect(() => {
    if (!patient?.uid) return;
    const q = query(collection(db, "exerciseStreakLog"), where("patientId", "==", patient.uid), where("date", ">=", isoDate(30)), orderBy("date", "asc"));
    return onSnapshot(q, (snap) => {
      setStreakDates(snap.docs.map((d) => d.data().date as string));
      setStreakLoading(false);
    }, () => setStreakLoading(false));
  }, [patient?.uid]);

  const handleCheckIn = async () => {
    if (!patient?.uid || checkInMood === null) return;
    setSavingCheckIn(true);
    await setDoc(doc(db, "dailyCheckIns", `${patient.uid}_${today}`), { patientId: patient.uid, date: today, mood: checkInMood, createdAt: serverTimestamp() });
    setSavingCheckIn(false);
    setCheckInMood(null);
  };

  const handleComplete = async (id: string, val: boolean) => {
    await updateDoc(doc(db, "patientExercises", id), { completed: val, skipped: false });
  };


  // Derive
  const nextAppt      = appointments[0] ?? null;
  const completedEx   = exercises.filter((e) => e.completed ?? false);
  const completionPct = exercises.length > 0 ? Math.round((completedEx.length / exercises.length) * 100) : 0;

  // Group exercises by time bucket
  const byBucket: Record<TimeBucket, PatientExercise[]> = { Morning: [], Afternoon: [], Evening: [] };
  exercises.forEach((ex) => { byBucket[bucketFor(ex)].push(ex); });

  const { current: streak, best: bestStreak, last7 } = calcStreak(streakDates);

  const firstName = patient?.firstName ?? "";
  const greeting  = getGreeting();

  // ──────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes pthShimmer { to { background-position: -200% 0; } }
        @keyframes pthFadeUp  { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:none; } }

        .pth-root { font-family:'Outfit',sans-serif; display:flex; flex-direction:column; gap:0; animation:pthFadeUp 0.3s ease; }

        /* ── Week calendar ── */
        .pth-cal-wrap  { background:#fff; border-radius:18px; border:1.5px solid #e5e0d8; padding:16px 10px 14px; margin-bottom:18px; }
        .pth-cal-header { display:flex; justify-content:space-between; align-items:center; margin-bottom:14px; padding:0 6px; }
        .pth-cal-title  { font-family:'Playfair Display',serif; font-size:22px; font-weight:500; color:#1a1a1a; letter-spacing:-0.02em; }
        .pth-cal-sub    { font-size:12px; color:#9a9590; }
        .pth-cal-strip  { display:flex; gap:6px; overflow-x:auto; scroll-snap-type:x mandatory; padding:2px 4px; scrollbar-width:none; }
        .pth-cal-strip::-webkit-scrollbar { display:none; }
        .pth-cal-day {
          flex-shrink:0; width:52px; height:64px; border-radius:14px;
          display:flex; flex-direction:column; align-items:center; justify-content:center; gap:4px;
          cursor:pointer; scroll-snap-align:center; transition:all 0.18s;
          border:1.5px solid transparent; background:transparent;
          font-family:'Outfit',sans-serif;
        }
        .pth-cal-day:hover:not(.active) { background:#f5f3ef; }
        .pth-cal-day.active { background:linear-gradient(135deg,#2E8BC0,#0C3C60); border-color:transparent; box-shadow:0 4px 14px rgba(46,139,192,0.35); }
        .pth-cal-day.is-today:not(.active) { border-color:#2E8BC0; }
        .pth-cal-dow { font-size:10px; font-weight:600; color:#9a9590; text-transform:uppercase; letter-spacing:0.05em; }
        .pth-cal-day.active .pth-cal-dow { color:rgba(255,255,255,0.7); }
        .pth-cal-num {
          width:32px; height:32px; border-radius:50%;
          display:flex; align-items:center; justify-content:center;
          font-size:16px; font-weight:700; color:#1a1a1a; transition:all 0.18s;
        }
        .pth-cal-day.active .pth-cal-num { color:#fff; }
        .pth-cal-day.is-today:not(.active) .pth-cal-num { color:#2E8BC0; }

        /* ── Next appointment banner ── */
        .pth-appt-banner {
          background:linear-gradient(135deg,#2E8BC0 0%,#0C3C60 100%);
          border-radius:16px; padding:16px 18px; margin-bottom:18px;
          display:flex; align-items:center; gap:14px;
          cursor:pointer; transition:opacity 0.15s;
        }
        .pth-appt-banner:hover { opacity:0.92; }
        .pth-appt-badge {
          width:46px; height:50px; border-radius:12px;
          background:rgba(255,255,255,0.15); border:1px solid rgba(255,255,255,0.25);
          display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; flex-shrink:0;
        }
        .pth-appt-badge-day   { font-size:20px; font-weight:700; color:#fff; line-height:1; }
        .pth-appt-badge-month { font-size:9px; text-transform:uppercase; color:rgba(255,255,255,0.7); letter-spacing:0.05em; }
        .pth-appt-info { flex:1; }
        .pth-appt-lbl  { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:rgba(255,255,255,0.55); margin-bottom:3px; }
        .pth-appt-time { font-size:16px; font-weight:600; color:#fff; margin-bottom:2px; }
        .pth-appt-type { font-size:13px; color:rgba(255,255,255,0.8); }
        .pth-appt-arrow { color:rgba(255,255,255,0.55); flex-shrink:0; }

        /* ── Exercise section ── */
        .pth-ex-section { margin-bottom:22px; }
        .pth-ex-section-hd {
          display:flex; align-items:center; gap:8px; margin-bottom:10px;
        }
        .pth-ex-section-icon {
          width:30px; height:30px; border-radius:8px; font-size:14px;
          display:flex; align-items:center; justify-content:center;
          background:#f0ede8; flex-shrink:0;
        }
        .pth-ex-section-name { font-size:15px; font-weight:700; color:#1a1a1a; }
        .pth-ex-section-count {
          font-size:11px; font-weight:600; color:#9a9590;
          background:#f0ede8; padding:2px 8px; border-radius:100px; margin-left:auto;
        }
        .pth-ex-section-count.complete { background:#d1fae5; color:#065f46; }
        .pth-ex-list { display:flex; flex-direction:column; gap:8px; }

        /* Exercise card */
        .pth-ex-card {
          background:#fff; border:1.5px solid #e5e0d8; border-radius:14px;
          overflow:hidden; transition:border-color 0.15s;
        }
        .pth-ex-card-done { background:#fafaf8; border-color:#e5e0d8; }
        .pth-ex-card:hover { border-color:#B3DEF0; }
        .pth-ex-card-row {
          display:flex; align-items:center; gap:12px;
          padding:13px 14px; cursor:pointer;
        }
        .pth-ex-check {
          width:26px; height:26px; border-radius:50%; flex-shrink:0;
          border:2px solid #e5e0d8; background:#fff;
          display:flex; align-items:center; justify-content:center;
          cursor:pointer; transition:all 0.15s;
        }
        .pth-ex-check:hover { border-color:#2E8BC0; }
        .pth-ex-check-done { background:#2E8BC0; border-color:#2E8BC0; }
        .pth-ex-info { flex:1; min-width:0; }
        .pth-ex-name {
          font-size:14px; font-weight:600; color:#1a1a1a; margin-bottom:2px;
          white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
        }
        .pth-ex-card-done .pth-ex-name { color:#9a9590; text-decoration:line-through; }
        .pth-ex-meta { font-size:12px; color:#9a9590; display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
        .pth-ex-badge-home {
          font-size:10px; font-weight:700; padding:1px 7px; border-radius:100px;
          background:#d1fae5; color:#065f46; text-transform:uppercase; letter-spacing:0.04em;
        }
        .pth-ex-expanded {
          padding:0 14px 14px 52px;
        }
        .pth-ex-notes {
          font-size:13px; color:#5a5550; line-height:1.5;
        }

        /* ── Stats row ── */
        .pth-stats-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:18px; }
        .pth-stat-card { background:#fff; border:1.5px solid #e5e0d8; border-radius:14px; padding:14px 16px; }
        .pth-stat-card-lbl { font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:0.1em; color:#c0bbb4; margin-bottom:6px; }
        .pth-stat-card-val { font-family:'Playfair Display',serif; font-size:28px; color:#1a1a1a; line-height:1; margin-bottom:2px; }
        .pth-stat-card-sub { font-size:12px; color:#9a9590; }

        /* ── Progress bar ── */
        .pth-prog-card { background:#fff; border:1.5px solid #e5e0d8; border-radius:14px; padding:16px; margin-bottom:18px; }
        .pth-prog-hd   { display:flex; justify-content:space-between; align-items:center; margin-bottom:10px; }
        .pth-prog-title { font-size:14px; font-weight:600; color:#1a1a1a; }
        .pth-prog-pct   { font-family:'Playfair Display',serif; font-size:22px; font-weight:600; color:#2E8BC0; }
        .pth-prog-track { height:8px; border-radius:100px; background:#f0ede8; overflow:hidden; }
        .pth-prog-fill  { height:100%; border-radius:100px; background:linear-gradient(90deg,#2E8BC0,#5BC0BE); transition:width 0.6s cubic-bezier(0.34,1.2,0.64,1); }

        /* ── Check-in ── */
        .pth-checkin-card { background:#fff; border:1.5px solid #e5e0d8; border-radius:14px; padding:16px; margin-bottom:18px; }
        .pth-checkin-title { font-size:14px; font-weight:700; color:#1a1a1a; margin-bottom:2px; }
        .pth-checkin-sub   { font-size:12px; color:#9a9590; margin-bottom:12px; }
        .pth-moods { display:flex; gap:6px; margin-bottom:10px; }
        .pth-mood-btn {
          flex:1; display:flex; flex-direction:column; align-items:center; gap:3px;
          padding:8px 4px; border-radius:10px; border:1.5px solid #e5e0d8;
          background:#fafaf8; cursor:pointer; transition:all 0.15s; font-family:'Outfit',sans-serif;
        }
        .pth-mood-btn.sel { border-color:#2E8BC0; background:#EAF5FC; box-shadow:0 0 0 3px rgba(46,139,192,0.1); }
        .pth-mood-emoji { font-size:20px; line-height:1; }
        .pth-mood-lbl   { font-size:9px; font-weight:600; color:#5a5550; }
        .pth-checkin-btn {
          width:100%; padding:11px; border-radius:10px; border:none;
          background:#2E8BC0; color:#fff; font-family:'Outfit',sans-serif;
          font-size:14px; font-weight:600; cursor:pointer; transition:background 0.15s;
        }
        .pth-checkin-btn:hover:not(:disabled) { background:#0C3C60; }
        .pth-checkin-btn:disabled { opacity:0.4; cursor:not-allowed; }
        .pth-checkin-done {
          display:flex; align-items:center; gap:10px; padding:12px 14px;
          border-radius:10px; background:#f0fdf4; border:1.5px solid #bbf7d0;
        }
        .pth-checkin-done-emoji { font-size:28px; }
        .pth-checkin-done-text  { font-size:13px; font-weight:600; color:#166534; }
        .pth-checkin-done-sub   { font-size:12px; color:#4ade80; }

        /* ── Streak ── */
        .pth-streak-card { background:#fff; border:1.5px solid #e5e0d8; border-radius:14px; padding:16px; margin-bottom:18px; }
        .pth-streak-hd   { display:flex; align-items:center; gap:10px; margin-bottom:10px; }
        .pth-streak-num  { font-family:'Playfair Display',serif; font-size:36px; font-weight:600; color:#f97316; line-height:1; }
        .pth-streak-lbl  { font-size:13px; color:#9a9590; }
        .pth-streak-dots { display:flex; gap:5px; margin-bottom:6px; }
        .pth-streak-dot  { flex:1; height:8px; border-radius:100px; }
        .pth-streak-dot.on  { background:#f97316; }
        .pth-streak-dot.off { background:#f0ede8; }
        .pth-streak-day-lbl { flex:1; text-align:center; font-size:9px; color:#b0aca6; }
        .pth-streak-days    { display:flex; gap:5px; margin-bottom:4px; }

        /* ── Pain chart card ── */
        .pth-pain-card { background:#fff; border:1.5px solid #e5e0d8; border-radius:14px; padding:16px; margin-bottom:18px; }
        .pth-pain-title { font-size:14px; font-weight:700; color:#1a1a1a; margin-bottom:12px; }

        /* ── Quick actions ── */
        .pth-actions-card { display:flex; gap:8px; margin-bottom:24px; }
        .pth-act-btn {
          flex:1; display:flex; flex-direction:column; align-items:center; gap:5px;
          padding:12px 6px; border-radius:12px; border:1.5px solid #e5e0d8;
          background:#fff; font-family:'Outfit',sans-serif; font-size:11px; font-weight:600;
          color:#5a5550; cursor:pointer; transition:all 0.15s;
        }
        .pth-act-btn:hover { border-color:#2E8BC0; color:#2E8BC0; background:#EAF5FC; }
      `}</style>

      <div className="pth-root">

        {/* ── Week calendar ── */}
        <div className="pth-cal-wrap">
          <div className="pth-cal-header">
            <div>
              <div className="pth-cal-title">
                {greeting}{firstName ? `, ${firstName}` : ""} 👋
              </div>
              <div className="pth-cal-sub">
                {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
              </div>
            </div>
          </div>
          <div className="pth-cal-strip" ref={calRef}>
            {weekDays.map(({ iso, dow, day }) => {
              const isActive = iso === selectedDate;
              const isToday  = iso === today;
              return (
                <button
                  key={iso}
                  className={`pth-cal-day${isActive ? " active" : ""}${isToday ? " is-today" : ""}`}
                  onClick={() => setSelectedDate(iso)}
                  {...(isToday ? { "data-today": "1" } : {})}
                >
                  <div className="pth-cal-dow">{DAY_LABELS[dow]}</div>
                  <div className="pth-cal-num">{day}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Next appointment ── */}
        {!apptLoading && nextAppt && (() => {
          const [, m, d] = nextAppt.date.split("-");
          return (
            <div className="pth-appt-banner" onClick={() => onNavigate("appointments")}>
              <div className="pth-appt-badge">
                <div className="pth-appt-badge-day">{parseInt(d, 10)}</div>
                <div className="pth-appt-badge-month">{MONTH_NAMES[parseInt(m, 10) - 1] ?? ""}</div>
              </div>
              <div className="pth-appt-info">
                <div className="pth-appt-lbl">Next Appointment</div>
                <div className="pth-appt-time">{formatApptShort(nextAppt.date, nextAppt.hour)}</div>
                <div className="pth-appt-type">{nextAppt.sessionType}{nextAppt.physioName ? ` · ${nextAppt.physioName}` : ""}</div>
              </div>
              <ChevronRight size={18} className="pth-appt-arrow" />
            </div>
          );
        })()}

        {/* ── Exercise sections by time of day ── */}
        {exLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 22 }}>
            {[1,2,3].map((n) => (
              <div key={n} style={{ height: 64, borderRadius: 14, background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)", backgroundSize: "200% 100%", animation: "pthShimmer 1.4s ease infinite" }} />
            ))}
          </div>
        ) : exercises.length === 0 ? (
          <div style={{ textAlign: "center", padding: "28px 0 22px", color: "#b0aca6", fontSize: 14 }}>
            No exercises assigned yet.
          </div>
        ) : (
          TIME_BUCKETS.map((bucket) => {
            const exs = byBucket[bucket];
            if (exs.length === 0) return null;
            const doneCount = exs.filter((e) => e.completed).length;
            const allDone   = doneCount === exs.length;
            return (
              <div key={bucket} className="pth-ex-section">
                <div className="pth-ex-section-hd">
                  <div className="pth-ex-section-icon">{BUCKET_ICON[bucket]}</div>
                  <span className="pth-ex-section-name">{bucket}</span>
                  <span className={`pth-ex-section-count${allDone ? " complete" : ""}`}>
                    {allDone ? "✓ All done" : `${doneCount}/${exs.length}`}
                  </span>
                </div>
                <div className="pth-ex-list">
                  {exs.map((ex) => (
                    <ExCard key={ex.id} ex={ex} onComplete={handleComplete} />
                  ))}
                </div>
              </div>
            );
          })
        )}

        {/* ── Stats row ── */}
        <div className="pth-stats-row">
          <div className="pth-stat-card">
            <div className="pth-stat-card-lbl">Total Exercises</div>
            <div className="pth-stat-card-val">{exLoading ? "—" : exercises.length}</div>
            <div className="pth-stat-card-sub">{exLoading ? "" : `${completedEx.length} completed`}</div>
          </div>
          <div className="pth-stat-card">
            <div className="pth-stat-card-lbl">Streak</div>
            <div className="pth-stat-card-val" style={{ color: "#f97316" }}>{streakLoading ? "—" : `🔥 ${streak}`}</div>
            <div className="pth-stat-card-sub">{streakLoading ? "" : `Best: ${bestStreak} day${bestStreak !== 1 ? "s" : ""}`}</div>
          </div>
        </div>

        {/* ── Progress bar ── */}
        {!exLoading && exercises.length > 0 && (
          <div className="pth-prog-card">
            <div className="pth-prog-hd">
              <div className="pth-prog-title">Overall Completion</div>
              <div className="pth-prog-pct">{completionPct}%</div>
            </div>
            <div className="pth-prog-track">
              <div className="pth-prog-fill" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
        )}

        {/* ── 7-day streak dots ── */}
        {!streakLoading && (
          <div className="pth-streak-card">
            <div className="pth-streak-hd">
              <div className="pth-streak-num">{streak > 0 ? "🔥" : "💪"} {streak}</div>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>
                  {streak === 0 ? "Start your streak!" : streak === 1 ? "1 day streak" : `${streak} day streak`}
                </div>
                <div className="pth-streak-lbl">Best: {bestStreak} day{bestStreak !== 1 ? "s" : ""}</div>
              </div>
            </div>
            {(() => {
              const todayDow = new Date().getDay();
              const labels   = Array.from({ length: 7 }, (_, i) => {
                const dow = (todayDow - 6 + i + 7) % 7;
                return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][dow];
              });
              return (
                <>
                  <div className="pth-streak-days">
                    {labels.map((l) => <div key={l} className="pth-streak-day-lbl">{l}</div>)}
                  </div>
                  <div className="pth-streak-dots">
                    {last7.map((on, i) => <div key={i} className={`pth-streak-dot ${on ? "on" : "off"}`} />)}
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* ── Daily check-in ── */}
        <div className="pth-checkin-card">
          {checkInLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <Skel h={14} w="50%" /><Skel h={60} />
            </div>
          ) : checkIn ? (
            <>
              <div className="pth-checkin-title">Today's Check-in</div>
              <div className="pth-checkin-done" style={{ marginTop: 10 }}>
                <div className="pth-checkin-done-emoji">{MOODS.find((m) => m.value === checkIn.mood)?.emoji ?? "😐"}</div>
                <div>
                  <div className="pth-checkin-done-text">Feeling {MOODS.find((m) => m.value === checkIn.mood)?.label ?? ""}</div>
                  <div className="pth-checkin-done-sub">Check back in tomorrow!</div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="pth-checkin-title">How are you feeling today?</div>
              <div className="pth-checkin-sub">Tap to record your daily wellbeing</div>
              <div className="pth-moods">
                {MOODS.map((m) => (
                  <button key={m.value} className={`pth-mood-btn${checkInMood === m.value ? " sel" : ""}`} onClick={() => setCheckInMood(m.value)}>
                    <span className="pth-mood-emoji">{m.emoji}</span>
                    <span className="pth-mood-lbl">{m.label}</span>
                  </button>
                ))}
              </div>
              <button className="pth-checkin-btn" disabled={checkInMood === null || savingCheckIn} onClick={handleCheckIn}>
                {savingCheckIn ? "Saving…" : "Submit Check-in"}
              </button>
            </>
          )}
        </div>

        {/* ── Pain chart ── */}
        {!fbLoading && feedback.length > 0 && (
          <div className="pth-pain-card">
            <div className="pth-pain-title">Pain Level Trend</div>
            <MiniPainChart data={feedback} />
          </div>
        )}

        {/* ── Quick actions ── */}
        <div className="pth-actions-card">
          <button className="pth-act-btn" onClick={() => onNavigate("exercises")}>
            <Calendar size={18} strokeWidth={1.8} color="#2E8BC0" />
            Exercises
          </button>
          <button className="pth-act-btn" onClick={() => onNavigate("appointments")}>
            <Calendar size={18} strokeWidth={1.8} color="#7c3aed" />
            Appointments
          </button>
          <button className="pth-act-btn" onClick={() => onNavigate("sheet")}>
            <FileText size={18} strokeWidth={1.8} color="#065f46" />
            My Sheet
          </button>
        </div>

      </div>
    </>
  );
}
