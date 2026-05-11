// FILE: src/features/patient/FifaRefereeSheet.tsx
// FIFA International Referee Physical Fitness Assessment
// Based on FIFA's official fitness test protocol for international referees (World Cup cycle)

import React, { useState, useEffect } from "react";
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, where, serverTimestamp, type Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Plus, Trash2, ChevronDown, ChevronUp, ShieldCheck } from "lucide-react";

// ─── FIFA thresholds ──────────────────────────────────────────────────────────

const FIFA_THRESHOLDS = {
  male: {
    sprintBest: 6.0,   // seconds — 40m sprint
    intervalTime: 30.0, // seconds — each 150m interval
    bmi: 28,
    bodyFat: 20,        // %
  },
  female: {
    sprintBest: 6.6,
    intervalTime: 35.0,
    bmi: 28,
    bodyFat: 28,
  },
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────

type Gender = "male" | "female";

interface AnthroData {
  height:   string; // cm
  weight:   string; // kg
  bodyFat:  string; // %
}

interface CardioData {
  restingHR: string; // bpm
  bpSys:     string; // mmHg
  bpDia:     string; // mmHg
  vo2max:    string; // ml/kg/min
}

interface SprintData {
  sprint1: string; // seconds
  sprint2: string; // seconds
}

// 10 interval times
type IntervalTimes = [string,string,string,string,string,string,string,string,string,string];

interface FlexData {
  slrL:    string; // degrees
  slrR:    string; // degrees
  ankleL:  string; // cm (weight-bearing lunge test)
  ankleR:  string; // cm
  hipIntL: string; // degrees
  hipIntR: string; // degrees
}

interface FunctionalData {
  balanceL:  string; // single-leg balance L (s)
  balanceR:  string; // single-leg balance R (s)
  yBalanceL: string; // Y-Balance composite %
  yBalanceR: string; // Y-Balance composite %
}

interface RecoveryData {
  hrPost1:  string; // HR at 1min post-interval test (bpm)
  hrPost3:  string; // HR at 3min post-interval test (bpm)
}

interface FifaSession {
  id:        string;
  createdAt: Timestamp | null;
  gender:    Gender;
  anthro:    AnthroData;
  cardio:    CardioData;
  sprint:    SprintData;
  intervals: IntervalTimes;
  flex:      FlexData;
  functional:FunctionalData;
  recovery:  RecoveryData;
  notes:     string;
  verdict:   "pass" | "borderline" | "fail" | "";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bmi(h: string, w: string): string {
  const hm = parseFloat(h) / 100;
  const kg = parseFloat(w);
  if (!hm || !kg) return "";
  return (kg / (hm * hm)).toFixed(1);
}

function sprintBest(s: SprintData): number | null {
  const a = parseFloat(s.sprint1);
  const b = parseFloat(s.sprint2);
  if (isNaN(a) && isNaN(b)) return null;
  if (isNaN(a)) return b;
  if (isNaN(b)) return a;
  return Math.min(a, b);
}

function sprintAvg(s: SprintData): string {
  const a = parseFloat(s.sprint1);
  const b = parseFloat(s.sprint2);
  if (isNaN(a) || isNaN(b)) return "";
  return ((a + b) / 2).toFixed(2);
}

function intervalStats(intervals: IntervalTimes, threshold: number) {
  const filled = intervals.map(v => parseFloat(v)).filter(v => !isNaN(v));
  if (filled.length === 0) return { avg: "", passed: 0, total: 0 };
  const avg = (filled.reduce((a, b) => a + b, 0) / filled.length).toFixed(2);
  const passed = filled.filter(v => v <= threshold).length;
  return { avg, passed, total: filled.length };
}

function passLabel(pass: boolean): React.ReactElement {
  return pass
    ? <span style={PASS_STYLE}>✓ PASS</span>
    : <span style={FAIL_STYLE}>✗ FAIL</span>;
}

function fmtDate(ts: Timestamp | null): string {
  if (!ts) return "—";
  return ts.toDate().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

// ─── Style constants ──────────────────────────────────────────────────────────

const PASS_STYLE: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", padding: "2px 8px",
  background: "#dcfce7", color: "#166534", borderRadius: 6,
  fontSize: 11, fontWeight: 700, letterSpacing: "0.02em",
};
const FAIL_STYLE: React.CSSProperties = {
  display: "inline-flex", alignItems: "center", padding: "2px 8px",
  background: "#fee2e2", color: "#991b1b", borderRadius: 6,
  fontSize: 11, fontWeight: 700, letterSpacing: "0.02em",
};

// ─── Defaults ─────────────────────────────────────────────────────────────────

const EMPTY_INTERVALS: IntervalTimes = ["","","","","","","","","",""];

function emptyForm(): Omit<FifaSession, "id" | "createdAt"> {
  return {
    gender:    "male",
    anthro:    { height: "", weight: "", bodyFat: "" },
    cardio:    { restingHR: "", bpSys: "", bpDia: "", vo2max: "" },
    sprint:    { sprint1: "", sprint2: "" },
    intervals: [...EMPTY_INTERVALS] as IntervalTimes,
    flex:      { slrL: "", slrR: "", ankleL: "", ankleR: "", hipIntL: "", hipIntR: "" },
    functional:{ balanceL: "", balanceR: "", yBalanceL: "", yBalanceR: "" },
    recovery:  { hrPost1: "", hrPost3: "" },
    notes:     "",
    verdict:   "",
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Section({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="fifa-section">
      <button className="fifa-section-header" onClick={() => setOpen(o => !o)}>
        <span className="fifa-section-icon">{icon}</span>
        <span className="fifa-section-title">{title}</span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && <div className="fifa-section-body">{children}</div>}
    </div>
  );
}

function Field({
  label, value, onChange, unit, type = "number", readonly = false, hint,
}: {
  label: string; value: string; onChange?: (v: string) => void;
  unit?: string; type?: string; readonly?: boolean; hint?: string;
}) {
  return (
    <div className="fifa-field">
      <label>{label}{unit && <span className="fifa-unit"> ({unit})</span>}</label>
      <input
        type={type}
        min={type === "number" ? 0 : undefined}
        value={value}
        readOnly={readonly}
        onChange={e => onChange?.(e.target.value)}
        placeholder="—"
        style={readonly ? { background: "#f5f3ef", color: "#6b7280" } : undefined}
      />
      {hint && <div className="fifa-field-hint">{hint}</div>}
    </div>
  );
}

// ─── Trend SVG chart ──────────────────────────────────────────────────────────

function TrendChart({ label, values, lower = false, threshold }: {
  label: string; values: number[]; lower?: boolean; threshold?: number;
}) {
  if (values.length < 2) return null;
  const W = 260, H = 90, PAD = 10;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pts = values.map((v, i) => {
    const x = PAD + (i / (values.length - 1)) * (W - PAD * 2);
    const y = PAD + ((lower ? v - min : max - v) / range) * (H - PAD * 2);
    return `${x},${y}`;
  });
  const last = values[values.length - 1];
  const isGood = lower ? last <= (threshold ?? Infinity) : last >= (threshold ?? -Infinity);
  const lineColor = threshold !== undefined ? (isGood ? "#16a34a" : "#dc2626") : "#2E8BC0";

  return (
    <div className="fifa-chart-card">
      <div className="fifa-chart-label">{label}</div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: H }}>
        {threshold !== undefined && (() => {
          const ty = PAD + ((lower ? threshold - min : max - threshold) / range) * (H - PAD * 2);
          return ty >= PAD && ty <= H - PAD
            ? <line x1={PAD} y1={ty} x2={W - PAD} y2={ty} stroke="#fbbf24" strokeWidth={1} strokeDasharray="4 3" />
            : null;
        })()}
        <polyline
          points={pts.join(" ")}
          fill="none"
          stroke={lineColor}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {values.map((v, i) => {
          const [x, y] = pts[i].split(",").map(Number);
          return (
            <g key={i}>
              <circle cx={x} cy={y} r={3.5} fill={lineColor} />
              <text x={x} y={y - 6} textAnchor="middle" fontSize={9} fill="#6b7280">{v}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  patientId:   string;
  patientName?: string;
  canEdit:     boolean;
}

export default function FifaRefereeSheet({ patientId, patientName, canEdit }: Props) {
  const [sessions,   setSessions]   = useState<FifaSession[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [showForm,   setShowForm]   = useState(false);
  const [showCharts, setShowCharts] = useState(false);
  const [saving,     setSaving]     = useState(false);
  const [form,       setForm]       = useState(emptyForm());
  const [expanded,   setExpanded]   = useState<Record<string, boolean>>({});
  const [deleting,   setDeleting]   = useState<string | null>(null);

  // ── Load sessions ──────────────────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    const q = query(
      collection(db, "fifaRefereeAssessments"),
      where("patientId", "==", patientId),
    );
    getDocs(q).then(snap => {
      const rows: FifaSession[] = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as Omit<FifaSession, "id">) }))
        .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
      setSessions(rows);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [patientId]);

  // ── Computed fields ────────────────────────────────────────────────────────

  const bmiVal  = bmi(form.anthro.height, form.anthro.weight);
  const bestSpr = sprintBest(form.sprint);
  const avgSpr  = sprintAvg(form.sprint);
  const thresh  = FIFA_THRESHOLDS[form.gender];
  const intStats = intervalStats(form.intervals, thresh.intervalTime);

  // ── Handlers ───────────────────────────────────────────────────────────────

  function updateAnthro(key: keyof AnthroData, val: string) {
    setForm(f => ({ ...f, anthro: { ...f.anthro, [key]: val } }));
  }
  function updateCardio(key: keyof CardioData, val: string) {
    setForm(f => ({ ...f, cardio: { ...f.cardio, [key]: val } }));
  }
  function updateSprint(key: keyof SprintData, val: string) {
    setForm(f => ({ ...f, sprint: { ...f.sprint, [key]: val } }));
  }
  function updateInterval(idx: number, val: string) {
    setForm(f => {
      const next = [...f.intervals] as IntervalTimes;
      next[idx] = val;
      return { ...f, intervals: next };
    });
  }
  function updateFlex(key: keyof FlexData, val: string) {
    setForm(f => ({ ...f, flex: { ...f.flex, [key]: val } }));
  }
  function updateFunctional(key: keyof FunctionalData, val: string) {
    setForm(f => ({ ...f, functional: { ...f.functional, [key]: val } }));
  }
  function updateRecovery(key: keyof RecoveryData, val: string) {
    setForm(f => ({ ...f, recovery: { ...f.recovery, [key]: val } }));
  }

  async function handleSave() {
    setSaving(true);
    try {
      const payload = {
        patientId,
        patientName: patientName ?? "",
        createdAt: serverTimestamp(),
        ...form,
      };
      const ref = await addDoc(collection(db, "fifaRefereeAssessments"), payload);
      const newSession: FifaSession = {
        id: ref.id,
        createdAt: null,
        ...form,
      };
      setSessions(s => [newSession, ...s]);
      setForm(emptyForm());
      setShowForm(false);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setDeleting(id);
    try {
      await deleteDoc(doc(db, "fifaRefereeAssessments", id));
      setSessions(s => s.filter(x => x.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  // ── Trend data ─────────────────────────────────────────────────────────────

  const chronological = [...sessions].reverse();
  const sprintTrend  = chronological.map(s => sprintBest(s.sprint)).filter((v): v is number => v !== null);
  const bmiTrend     = chronological.map(s => parseFloat(bmi(s.anthro.height, s.anthro.weight))).filter(v => !isNaN(v));
  const vo2Trend     = chronological.map(s => parseFloat(s.cardio.vo2max)).filter(v => !isNaN(v));
  const intAvgTrend  = chronological.map(s => {
    const { avg } = intervalStats(s.intervals, FIFA_THRESHOLDS[s.gender].intervalTime);
    return avg ? parseFloat(avg) : NaN;
  }).filter(v => !isNaN(v));

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <style>{`
        .fifa-root { font-family: 'Outfit', sans-serif; color: #1a1a1a; }

        /* ── Header ── */
        .fifa-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 20px; flex-wrap: wrap; gap: 12px;
        }
        .fifa-header-left { display: flex; align-items: center; gap: 10px; }
        .fifa-header-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: linear-gradient(135deg, #065f46, #059669);
          display: flex; align-items: center; justify-content: center; color: #fff;
          flex-shrink: 0;
        }
        .fifa-title { font-size: 15px; font-weight: 700; color: #0C3C60; }
        .fifa-subtitle { font-size: 12px; color: #9a9590; margin-top: 1px; }

        .fifa-add-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 10px;
          background: linear-gradient(135deg, #065f46, #059669);
          color: #fff; font-size: 13px; font-weight: 600;
          border: none; cursor: pointer; transition: opacity 0.15s;
        }
        .fifa-add-btn:hover { opacity: 0.88; }
        .fifa-charts-toggle {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 10px;
          background: #f0fdf4; color: #065f46;
          font-size: 13px; font-weight: 600;
          border: 1.5px solid #a7f3d0; cursor: pointer;
        }

        /* ── Form card ── */
        .fifa-form-card {
          background: #fff; border: 1.5px solid #e5e0d8;
          border-radius: 14px; padding: 20px; margin-bottom: 20px;
        }
        .fifa-form-title {
          font-size: 14px; font-weight: 700; color: #0C3C60;
          margin-bottom: 16px; padding-bottom: 12px;
          border-bottom: 1.5px solid #f0ede8;
          display: flex; align-items: center; gap: 8px;
        }
        .fifa-gender-row {
          display: flex; gap: 10px; margin-bottom: 16px;
        }
        .fifa-gender-btn {
          flex: 1; padding: 8px 12px; border-radius: 8px;
          font-size: 13px; font-weight: 600; cursor: pointer;
          border: 1.5px solid #e5e0d8; background: #fafaf9; color: #6b7280;
          transition: all 0.15s;
        }
        .fifa-gender-btn.active {
          border-color: #059669; background: #ecfdf5; color: #065f46;
        }

        /* ── Sections inside form ── */
        .fifa-section {
          border: 1px solid #e8e4de; border-radius: 10px;
          margin-bottom: 10px; overflow: hidden;
        }
        .fifa-section-header {
          display: flex; align-items: center; gap: 8px;
          width: 100%; background: #f7f5f1; border: none; cursor: pointer;
          padding: 10px 14px; font-family: 'Outfit', sans-serif; text-align: left;
        }
        .fifa-section-header:hover { background: #eeede8; }
        .fifa-section-icon { font-size: 16px; }
        .fifa-section-title { flex: 1; font-size: 13px; font-weight: 700; color: #0C3C60; }
        .fifa-section-body {
          padding: 14px;
          display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px;
        }

        /* ── Interval grid (10 cells) ── */
        .fifa-interval-grid {
          padding: 14px;
          display: grid; grid-template-columns: repeat(5, 1fr);
          gap: 10px;
        }
        .fifa-interval-cell { display: flex; flex-direction: column; gap: 4px; }
        .fifa-interval-cell label { font-size: 11px; font-weight: 600; color: #6b7280; }
        .fifa-interval-cell input {
          width: 100%; padding: 6px 8px; border-radius: 6px;
          border: 1px solid #e5e0d8; font-size: 13px; font-family: 'Outfit', sans-serif;
        }
        .fifa-interval-cell .pass-dot { font-size: 10px; }

        /* ── Field ── */
        .fifa-field { display: flex; flex-direction: column; gap: 4px; }
        .fifa-field label { font-size: 12px; font-weight: 600; color: #374151; }
        .fifa-unit { font-size: 11px; color: #9a9590; font-weight: 400; }
        .fifa-field input {
          width: 100%; padding: 7px 10px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; font-size: 13px;
          font-family: 'Outfit', sans-serif; color: #1a1a1a;
          box-sizing: border-box;
        }
        .fifa-field input:focus { outline: none; border-color: #059669; }
        .fifa-field-hint { font-size: 10px; color: #9a9590; }
        .fifa-readonly-grid {
          padding: 14px; display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px;
        }
        .fifa-derived {
          background: #f7f5f1; border: 1.5px solid #e5e0d8;
          border-radius: 10px; padding: 10px 14px;
        }
        .fifa-derived-label { font-size: 11px; font-weight: 600; color: #9a9590; margin-bottom: 2px; }
        .fifa-derived-val   { font-size: 15px; font-weight: 700; color: #0C3C60; }

        /* ── Notes ── */
        .fifa-notes-area {
          width: 100%; min-height: 72px; padding: 10px 12px;
          border: 1.5px solid #e5e0d8; border-radius: 10px;
          font-family: 'Outfit', sans-serif; font-size: 13px; color: #1a1a1a;
          resize: vertical; box-sizing: border-box;
        }
        .fifa-notes-area:focus { outline: none; border-color: #059669; }

        /* ── Verdict ── */
        .fifa-verdict-row { display: flex; gap: 8px; flex-wrap: wrap; }
        .fifa-verdict-btn {
          flex: 1; min-width: 80px; padding: 8px 10px; border-radius: 8px;
          font-size: 12px; font-weight: 700; cursor: pointer; border: 1.5px solid;
          transition: all 0.15s;
        }
        .fifa-verdict-btn.pass     { border-color: #059669; color: #065f46; background: #f0fdf4; }
        .fifa-verdict-btn.pass.sel { background: #059669; color: #fff; }
        .fifa-verdict-btn.border   { border-color: #d97706; color: #92400e; background: #fffbeb; }
        .fifa-verdict-btn.border.sel { background: #d97706; color: #fff; }
        .fifa-verdict-btn.fail     { border-color: #dc2626; color: #991b1b; background: #fff5f5; }
        .fifa-verdict-btn.fail.sel { background: #dc2626; color: #fff; }

        /* ── Save ── */
        .fifa-save-row { display: flex; justify-content: flex-end; gap: 10px; margin-top: 16px; }
        .fifa-save-btn {
          padding: 10px 24px; border-radius: 10px;
          background: linear-gradient(135deg, #065f46, #059669);
          color: #fff; font-size: 14px; font-weight: 700; border: none; cursor: pointer;
          font-family: 'Outfit', sans-serif;
        }
        .fifa-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .fifa-cancel-btn {
          padding: 10px 20px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fff;
          color: #6b7280; font-size: 14px; font-weight: 600; cursor: pointer;
          font-family: 'Outfit', sans-serif;
        }

        /* ── Charts ── */
        .fifa-charts-grid {
          display: grid; grid-template-columns: 1fr 1fr;
          gap: 12px; margin-bottom: 20px;
        }
        .fifa-chart-card {
          background: #fff; border: 1.5px solid #e5e0d8;
          border-radius: 12px; padding: 12px 14px;
        }
        .fifa-chart-label { font-size: 12px; font-weight: 700; color: #0C3C60; margin-bottom: 6px; }

        /* ── History sessions ── */
        .fifa-session-card {
          background: #fff; border: 1.5px solid #e5e0d8;
          border-radius: 12px; margin-bottom: 10px; overflow: hidden;
        }
        .fifa-session-header {
          display: flex; align-items: center; gap: 8px;
          padding: 12px 16px; cursor: pointer; user-select: none;
        }
        .fifa-session-header:hover { background: #fafaf9; }
        .fifa-session-date {
          font-size: 13px; font-weight: 700; color: #0C3C60; min-width: 110px;
        }
        .fifa-session-pills { display: flex; flex-wrap: wrap; gap: 6px; flex: 1; }
        .fifa-pill {
          display: inline-flex; align-items: center; padding: 3px 8px;
          background: #f0fdf4; color: #065f46;
          border-radius: 20px; font-size: 11px; font-weight: 600;
          border: 1px solid #a7f3d0;
        }
        .fifa-pill.warn { background: #fef3c7; color: #92400e; border-color: #fde68a; }
        .fifa-pill.fail { background: #fee2e2; color: #991b1b; border-color: #fca5a5; }
        .fifa-pill.neutral { background: #f0f9ff; color: #0369a1; border-color: #bae6fd; }

        .fifa-session-del {
          margin-left: auto; padding: 4px 8px; border-radius: 6px;
          background: transparent; border: none; cursor: pointer;
          color: #9a9590; transition: background 0.15s;
        }
        .fifa-session-del:hover { background: #fee2e2; color: #dc2626; }

        .fifa-session-body {
          padding: 14px 16px; border-top: 1px solid #f0ede8;
        }
        .fifa-snap-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 10px;
        }
        .fifa-snap-group {
          background: #fafaf9; border: 1px solid #e8e4de;
          border-radius: 10px; padding: 10px 12px;
        }
        .fifa-snap-title { font-size: 11px; font-weight: 700; color: #0C3C60; margin-bottom: 6px; }
        .fifa-snap-row   { display: flex; justify-content: space-between; align-items: center; margin-bottom: 3px; }
        .fifa-snap-key   { font-size: 11px; color: #6b7280; }
        .fifa-snap-val   { font-size: 12px; font-weight: 600; color: #1a1a1a; }

        .fifa-empty { text-align: center; padding: 40px 20px; color: #9a9590; font-size: 14px; }

        /* ── Standard box ── */
        .fifa-standard-box {
          background: #ecfdf5; border: 1px solid #a7f3d0;
          border-radius: 8px; padding: 8px 12px; margin: 0 14px 14px;
          font-size: 12px; color: #065f46;
        }

        /* ── Mobile ── */
        @media (max-width: 640px) {
          .fifa-header { flex-direction: column; align-items: flex-start; gap: 10px; }
          .fifa-header > div:last-child { width: 100%; display: flex; gap: 8px; }
          .fifa-add-btn, .fifa-charts-toggle { flex: 1; justify-content: center; }
          .fifa-section-body { grid-template-columns: 1fr 1fr; }
          .fifa-interval-grid { grid-template-columns: repeat(5, 1fr); }
          .fifa-charts-grid { grid-template-columns: 1fr; }
          .fifa-session-header { flex-wrap: wrap; gap: 8px; }
          .fifa-session-date { min-width: unset; font-size: 12px; }
          .fifa-session-pills { order: 3; width: 100%; }
          .fifa-session-del { order: 2; }
          .fifa-snap-grid { grid-template-columns: 1fr 1fr; }
        }
        @media (max-width: 480px) {
          .fifa-section-body { grid-template-columns: 1fr; }
          .fifa-interval-grid { grid-template-columns: repeat(2, 1fr); }
          .fifa-snap-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="fifa-root">
        {/* Header */}
        <div className="fifa-header">
          <div className="fifa-header-left">
            <div className="fifa-header-icon"><ShieldCheck size={18} /></div>
            <div>
              <div className="fifa-title">FIFA Referee Fitness Assessment</div>
              <div className="fifa-subtitle">
                International referee · World Cup acceptance protocol
              </div>
            </div>
          </div>
          {canEdit && (
            <div style={{ display: "flex", gap: 8 }}>
              {sessions.length >= 2 && (
                <button className="fifa-charts-toggle" onClick={() => setShowCharts(v => !v)}>
                  {showCharts ? "Hide Trends" : "📈 Show Trends"}
                </button>
              )}
              {!showForm && (
                <button className="fifa-add-btn" onClick={() => setShowForm(true)}>
                  <Plus size={14} /> New Assessment
                </button>
              )}
            </div>
          )}
        </div>

        {/* Trend charts */}
        {showCharts && sessions.length >= 2 && (
          <div className="fifa-charts-grid">
            <TrendChart label="🏃 40m Sprint Best (s)" values={sprintTrend} lower threshold={FIFA_THRESHOLDS.male.sprintBest} />
            <TrendChart label="🔄 Interval Avg (s)" values={intAvgTrend} lower threshold={FIFA_THRESHOLDS.male.intervalTime} />
            <TrendChart label="⚖️ BMI" values={bmiTrend} lower threshold={28} />
            <TrendChart label="💨 VO₂max (ml/kg/min)" values={vo2Trend} />
          </div>
        )}

        {/* Assessment Form */}
        {showForm && canEdit && (
          <div className="fifa-form-card">
            <div className="fifa-form-title">
              🏟️ New FIFA Referee Assessment
              {patientName && <span style={{ fontWeight: 400, color: "#6b7280", fontSize: 13 }}>— {patientName}</span>}
            </div>

            {/* Gender selector */}
            <div className="fifa-gender-row">
              {(["male", "female"] as Gender[]).map(g => (
                <button
                  key={g}
                  className={`fifa-gender-btn${form.gender === g ? " active" : ""}`}
                  onClick={() => setForm(f => ({ ...f, gender: g }))}
                >
                  {g === "male" ? "👨 Male" : "👩 Female"}
                </button>
              ))}
            </div>

            {/* ── Anthropometrics ── */}
            <Section title="Anthropometric Profile" icon="📏">
              <Field label="Height" unit="cm" value={form.anthro.height} onChange={v => updateAnthro("height", v)} />
              <Field label="Weight" unit="kg" value={form.anthro.weight} onChange={v => updateAnthro("weight", v)} />
              <Field
                label="BMI (auto)"
                unit="kg/m²"
                value={bmiVal}
                readonly
                hint={`FIFA std: ≤ ${thresh.bmi}`}
              />
              <Field
                label="Body Fat"
                unit="%"
                value={form.anthro.bodyFat}
                onChange={v => updateAnthro("bodyFat", v)}
                hint={`FIFA std: ≤ ${thresh.bodyFat}%`}
              />
            </Section>

            {/* ── Cardiovascular baseline ── */}
            <Section title="Cardiovascular Baseline" icon="❤️">
              <Field label="Resting HR" unit="bpm" value={form.cardio.restingHR} onChange={v => updateCardio("restingHR", v)} />
              <Field label="Blood Pressure Sys." unit="mmHg" value={form.cardio.bpSys} onChange={v => updateCardio("bpSys", v)} />
              <Field label="Blood Pressure Dia." unit="mmHg" value={form.cardio.bpDia} onChange={v => updateCardio("bpDia", v)} />
              <Field label="VO₂max" unit="ml/kg/min" value={form.cardio.vo2max} onChange={v => updateCardio("vo2max", v)} hint="Field test / lab estimate" />
            </Section>

            {/* ── Test 1: Sprint ── */}
            <Section title="Test 1 — Sprint Test (2 × 40m standing start)" icon="🏃">
              <Field
                label="Sprint 1"
                unit="sec"
                value={form.sprint.sprint1}
                onChange={v => updateSprint("sprint1", v)}
                hint={`FIFA std: ≤ ${thresh.sprintBest}s`}
              />
              <Field
                label="Sprint 2"
                unit="sec"
                value={form.sprint.sprint2}
                onChange={v => updateSprint("sprint2", v)}
              />
              <Field
                label="Best time (auto)"
                unit="sec"
                value={bestSpr !== null ? bestSpr.toFixed(2) : ""}
                readonly
              />
              <Field
                label="Average (auto)"
                unit="sec"
                value={avgSpr}
                readonly
              />
            </Section>
            {bestSpr !== null && (
              <div className="fifa-standard-box">
                Sprint result: <strong>{bestSpr.toFixed(2)}s</strong> — FIFA standard ≤ {thresh.sprintBest}s &nbsp;
                {passLabel(bestSpr <= thresh.sprintBest)}
              </div>
            )}

            {/* ── Test 2: Interval ── */}
            <Section title="Test 2 — Interval Running Test (10 × 150m)" icon="🔄">
              <div style={{ gridColumn: "1 / -1" }}>
                <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 10 }}>
                  Enter time for each 150m interval. Recovery: 50m walk between reps.<br />
                  FIFA standard: each interval ≤ <strong>{thresh.intervalTime}s</strong>
                </div>
                <div className="fifa-interval-grid">
                  {EMPTY_INTERVALS.map((_, i) => {
                    const val = form.intervals[i];
                    const t = parseFloat(val);
                    const done = !isNaN(t);
                    const ok = done && t <= thresh.intervalTime;
                    return (
                      <div key={i} className="fifa-interval-cell">
                        <label>Rep {i + 1} {done && <span className="pass-dot">{ok ? "🟢" : "🔴"}</span>}</label>
                        <input
                          type="number"
                          min={0}
                          step={0.01}
                          value={val}
                          onChange={e => updateInterval(i, e.target.value)}
                          placeholder="—"
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </Section>
            {intStats.total > 0 && (
              <div className="fifa-standard-box">
                Interval result: <strong>{intStats.passed}/{intStats.total}</strong> reps within standard
                &nbsp;(avg {intStats.avg}s) &nbsp;
                {passLabel(intStats.passed === 10 && intStats.total === 10)}
              </div>
            )}

            {/* ── Flexibility & Mobility ── */}
            <Section title="Flexibility & Mobility" icon="🦵">
              <Field label="SLR Left" unit="°" value={form.flex.slrL} onChange={v => updateFlex("slrL", v)} hint="Hamstring — Straight Leg Raise" />
              <Field label="SLR Right" unit="°" value={form.flex.slrR} onChange={v => updateFlex("slrR", v)} hint="Hamstring" />
              <Field label="Ankle Dorsi. Left" unit="cm" value={form.flex.ankleL} onChange={v => updateFlex("ankleL", v)} hint="Weight-bearing lunge" />
              <Field label="Ankle Dorsi. Right" unit="cm" value={form.flex.ankleR} onChange={v => updateFlex("ankleR", v)} hint="Weight-bearing lunge" />
              <Field label="Hip Int. Rot. Left" unit="°" value={form.flex.hipIntL} onChange={v => updateFlex("hipIntL", v)} />
              <Field label="Hip Int. Rot. Right" unit="°" value={form.flex.hipIntR} onChange={v => updateFlex("hipIntR", v)} />
            </Section>

            {/* ── Functional Assessment ── */}
            <Section title="Functional Assessment" icon="⚖️">
              <Field label="Single-leg Balance L" unit="sec" value={form.functional.balanceL} onChange={v => updateFunctional("balanceL", v)} hint="Eyes closed, 30s max" />
              <Field label="Single-leg Balance R" unit="sec" value={form.functional.balanceR} onChange={v => updateFunctional("balanceR", v)} />
              <Field label="Y-Balance Composite L" unit="%" value={form.functional.yBalanceL} onChange={v => updateFunctional("yBalanceL", v)} hint="(ANT+PM+PL)÷(limb×3)×100" />
              <Field label="Y-Balance Composite R" unit="%" value={form.functional.yBalanceR} onChange={v => updateFunctional("yBalanceR", v)} />
            </Section>

            {/* ── Recovery Heart Rate ── */}
            <Section title="Post-Test Recovery HR" icon="📉">
              <Field
                label="HR at 1 min"
                unit="bpm"
                value={form.recovery.hrPost1}
                onChange={v => updateRecovery("hrPost1", v)}
                hint="Taken 1 min after interval test ends"
              />
              <Field
                label="HR at 3 min"
                unit="bpm"
                value={form.recovery.hrPost3}
                onChange={v => updateRecovery("hrPost3", v)}
                hint="Taken 3 min after interval test ends"
              />
              {form.recovery.hrPost1 && form.recovery.hrPost3 && (
                <div className="fifa-derived">
                  <div className="fifa-derived-label">HR Recovery Drop</div>
                  <div className="fifa-derived-val">
                    {(parseFloat(form.recovery.hrPost1) - parseFloat(form.recovery.hrPost3)).toFixed(0)} bpm
                  </div>
                </div>
              )}
            </Section>

            {/* ── Overall Verdict ── */}
            <div style={{ marginTop: 12, marginBottom: 4, fontSize: 13, fontWeight: 700, color: "#374151" }}>
              Overall Assessment Verdict
            </div>
            <div className="fifa-verdict-row">
              {(["pass", "borderline", "fail"] as const).map(v => (
                <button
                  key={v}
                  className={`fifa-verdict-btn ${v === "borderline" ? "border" : v}${form.verdict === v ? " sel" : ""}`}
                  onClick={() => setForm(f => ({ ...f, verdict: v }))}
                >
                  {v === "pass" ? "✓ Pass" : v === "borderline" ? "~ Borderline" : "✗ Fail"}
                </button>
              ))}
            </div>

            {/* ── Notes ── */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#374151", marginBottom: 6 }}>Clinician Notes</div>
              <textarea
                className="fifa-notes-area"
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="Observations, injury flags, recommendations…"
              />
            </div>

            <div className="fifa-save-row">
              <button className="fifa-cancel-btn" onClick={() => { setShowForm(false); setForm(emptyForm()); }}>
                Cancel
              </button>
              <button className="fifa-save-btn" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : "Save Assessment"}
              </button>
            </div>
          </div>
        )}

        {/* History */}
        {loading ? (
          <div className="fifa-empty" style={{ color: "#c0bbb4" }}>Loading…</div>
        ) : sessions.length === 0 && !showForm ? (
          <div className="fifa-empty">
            <div style={{ fontSize: 32, marginBottom: 8 }}>🏟️</div>
            No FIFA assessments recorded yet
            {canEdit && <div style={{ fontSize: 12, marginTop: 4 }}>Click "New Assessment" to add one</div>}
          </div>
        ) : (
          sessions.map(s => {
            const isOpen = expanded[s.id];
            const thr    = FIFA_THRESHOLDS[s.gender];
            const best   = sprintBest(s.sprint);
            const sprintOk = best !== null && best <= thr.sprintBest;
            const ist    = intervalStats(s.intervals, thr.intervalTime);
            const intOk  = ist.passed === 10 && ist.total === 10;
            const bmiNum = parseFloat(bmi(s.anthro.height, s.anthro.weight));
            const bmiOk  = !isNaN(bmiNum) && bmiNum <= thr.bmi;
            const verdictColor = s.verdict === "pass" ? "fifa-pill" : s.verdict === "fail" ? "fifa-pill fail" : "fifa-pill warn";

            return (
              <div key={s.id} className="fifa-session-card">
                <div
                  className="fifa-session-header"
                  onClick={() => setExpanded(e => ({ ...e, [s.id]: !isOpen }))}
                >
                  <div className="fifa-session-date">{fmtDate(s.createdAt)}</div>
                  <div className="fifa-session-pills">
                    {best !== null && (
                      <span className={`fifa-pill${sprintOk ? "" : " fail"}`}>
                        🏃 {best.toFixed(2)}s {sprintOk ? "✓" : "✗"}
                      </span>
                    )}
                    {ist.total > 0 && (
                      <span className={`fifa-pill${intOk ? "" : " fail"}`}>
                        🔄 {ist.passed}/10 {intOk ? "✓" : "✗"}
                      </span>
                    )}
                    {!isNaN(bmiNum) && (
                      <span className={`fifa-pill${bmiOk ? "" : " warn"}`}>
                        BMI {bmiNum}
                      </span>
                    )}
                    {s.cardio.vo2max && (
                      <span className="fifa-pill neutral">VO₂ {s.cardio.vo2max}</span>
                    )}
                    {s.verdict && (
                      <span className={verdictColor}>
                        {s.verdict === "pass" ? "✓ PASS" : s.verdict === "fail" ? "✗ FAIL" : "~ BORDERLINE"}
                      </span>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      className="fifa-session-del"
                      onClick={e => { e.stopPropagation(); handleDelete(s.id); }}
                      disabled={deleting === s.id}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  {isOpen ? <ChevronUp size={14} color="#9a9590" /> : <ChevronDown size={14} color="#9a9590" />}
                </div>

                {isOpen && (
                  <div className="fifa-session-body">
                    <div className="fifa-snap-grid">
                      {/* Anthro */}
                      <div className="fifa-snap-group">
                        <div className="fifa-snap-title">📏 Anthropometrics</div>
                        {s.anthro.height && <div className="fifa-snap-row"><span className="fifa-snap-key">Height</span><span className="fifa-snap-val">{s.anthro.height} cm</span></div>}
                        {s.anthro.weight && <div className="fifa-snap-row"><span className="fifa-snap-key">Weight</span><span className="fifa-snap-val">{s.anthro.weight} kg</span></div>}
                        {bmi(s.anthro.height, s.anthro.weight) && (
                          <div className="fifa-snap-row">
                            <span className="fifa-snap-key">BMI</span>
                            <span className="fifa-snap-val">{bmi(s.anthro.height, s.anthro.weight)} {bmiOk ? "✓" : "⚠️"}</span>
                          </div>
                        )}
                        {s.anthro.bodyFat && <div className="fifa-snap-row"><span className="fifa-snap-key">Body Fat</span><span className="fifa-snap-val">{s.anthro.bodyFat}%</span></div>}
                      </div>

                      {/* Cardio */}
                      <div className="fifa-snap-group">
                        <div className="fifa-snap-title">❤️ Cardiovascular</div>
                        {s.cardio.restingHR && <div className="fifa-snap-row"><span className="fifa-snap-key">Resting HR</span><span className="fifa-snap-val">{s.cardio.restingHR} bpm</span></div>}
                        {s.cardio.bpSys && <div className="fifa-snap-row"><span className="fifa-snap-key">Blood Pressure</span><span className="fifa-snap-val">{s.cardio.bpSys}/{s.cardio.bpDia} mmHg</span></div>}
                        {s.cardio.vo2max && <div className="fifa-snap-row"><span className="fifa-snap-key">VO₂max</span><span className="fifa-snap-val">{s.cardio.vo2max} ml/kg/min</span></div>}
                      </div>

                      {/* Sprint test */}
                      <div className="fifa-snap-group">
                        <div className="fifa-snap-title">🏃 Sprint Test (40m)</div>
                        {s.sprint.sprint1 && <div className="fifa-snap-row"><span className="fifa-snap-key">Sprint 1</span><span className="fifa-snap-val">{s.sprint.sprint1}s</span></div>}
                        {s.sprint.sprint2 && <div className="fifa-snap-row"><span className="fifa-snap-key">Sprint 2</span><span className="fifa-snap-val">{s.sprint.sprint2}s</span></div>}
                        {best !== null && (
                          <div className="fifa-snap-row">
                            <span className="fifa-snap-key">Best</span>
                            <span className="fifa-snap-val">{best.toFixed(2)}s {sprintOk ? "🟢" : "🔴"}</span>
                          </div>
                        )}
                        <div className="fifa-snap-row"><span className="fifa-snap-key">Standard</span><span className="fifa-snap-val">≤ {thr.sprintBest}s ({s.gender})</span></div>
                      </div>

                      {/* Interval test */}
                      <div className="fifa-snap-group">
                        <div className="fifa-snap-title">🔄 Interval Test (10×150m)</div>
                        {ist.total > 0 && (
                          <>
                            <div className="fifa-snap-row"><span className="fifa-snap-key">Passed</span><span className="fifa-snap-val">{ist.passed}/{ist.total} {intOk ? "🟢" : "🔴"}</span></div>
                            <div className="fifa-snap-row"><span className="fifa-snap-key">Avg time</span><span className="fifa-snap-val">{ist.avg}s</span></div>
                          </>
                        )}
                        <div className="fifa-snap-row"><span className="fifa-snap-key">Standard</span><span className="fifa-snap-val">≤ {thr.intervalTime}s each</span></div>
                      </div>

                      {/* Flexibility */}
                      {(s.flex.slrL || s.flex.slrR || s.flex.ankleL || s.flex.ankleR) && (
                        <div className="fifa-snap-group">
                          <div className="fifa-snap-title">🦵 Flexibility</div>
                          {s.flex.slrL && <div className="fifa-snap-row"><span className="fifa-snap-key">SLR L</span><span className="fifa-snap-val">{s.flex.slrL}°</span></div>}
                          {s.flex.slrR && <div className="fifa-snap-row"><span className="fifa-snap-key">SLR R</span><span className="fifa-snap-val">{s.flex.slrR}°</span></div>}
                          {s.flex.ankleL && <div className="fifa-snap-row"><span className="fifa-snap-key">Ankle L</span><span className="fifa-snap-val">{s.flex.ankleL} cm</span></div>}
                          {s.flex.ankleR && <div className="fifa-snap-row"><span className="fifa-snap-key">Ankle R</span><span className="fifa-snap-val">{s.flex.ankleR} cm</span></div>}
                          {s.flex.hipIntL && <div className="fifa-snap-row"><span className="fifa-snap-key">Hip Int. L</span><span className="fifa-snap-val">{s.flex.hipIntL}°</span></div>}
                          {s.flex.hipIntR && <div className="fifa-snap-row"><span className="fifa-snap-key">Hip Int. R</span><span className="fifa-snap-val">{s.flex.hipIntR}°</span></div>}
                        </div>
                      )}

                      {/* Functional */}
                      {(s.functional.balanceL || s.functional.yBalanceL) && (
                        <div className="fifa-snap-group">
                          <div className="fifa-snap-title">⚖️ Functional</div>
                          {s.functional.balanceL && <div className="fifa-snap-row"><span className="fifa-snap-key">Balance L</span><span className="fifa-snap-val">{s.functional.balanceL}s</span></div>}
                          {s.functional.balanceR && <div className="fifa-snap-row"><span className="fifa-snap-key">Balance R</span><span className="fifa-snap-val">{s.functional.balanceR}s</span></div>}
                          {s.functional.yBalanceL && <div className="fifa-snap-row"><span className="fifa-snap-key">Y-Bal L</span><span className="fifa-snap-val">{s.functional.yBalanceL}%</span></div>}
                          {s.functional.yBalanceR && <div className="fifa-snap-row"><span className="fifa-snap-key">Y-Bal R</span><span className="fifa-snap-val">{s.functional.yBalanceR}%</span></div>}
                        </div>
                      )}

                      {/* Recovery */}
                      {(s.recovery.hrPost1 || s.recovery.hrPost3) && (
                        <div className="fifa-snap-group">
                          <div className="fifa-snap-title">📉 HR Recovery</div>
                          {s.recovery.hrPost1 && <div className="fifa-snap-row"><span className="fifa-snap-key">1 min</span><span className="fifa-snap-val">{s.recovery.hrPost1} bpm</span></div>}
                          {s.recovery.hrPost3 && <div className="fifa-snap-row"><span className="fifa-snap-key">3 min</span><span className="fifa-snap-val">{s.recovery.hrPost3} bpm</span></div>}
                          {s.recovery.hrPost1 && s.recovery.hrPost3 && (
                            <div className="fifa-snap-row">
                              <span className="fifa-snap-key">Drop</span>
                              <span className="fifa-snap-val">
                                {(parseFloat(s.recovery.hrPost1) - parseFloat(s.recovery.hrPost3)).toFixed(0)} bpm
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {s.notes && (
                      <div style={{
                        marginTop: 12, padding: "10px 12px",
                        background: "#f7f5f1", borderRadius: 8,
                        fontSize: 13, color: "#374151", lineHeight: 1.5,
                      }}>
                        📝 {s.notes}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
