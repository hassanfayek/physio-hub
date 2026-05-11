// FILE: src/features/patient/ExplosivePowerSheet.tsx
// Explosive Power & Neuromuscular Assessment — time to peak firing, duration at peak, power tests

import { useState, useEffect } from "react";
import {
  collection, addDoc, getDocs, deleteDoc, doc,
  query, where, orderBy, serverTimestamp, type Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Plus, Trash2, ChevronDown, ChevronUp, Zap } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CMJData {
  jumpHeight:    string; // cm
  timeToPeak:    string; // ms — time to reach peak force
  durationAtPeak:string; // ms — time maintained at ≥90% peak force
  peakPower:     string; // W/kg
  rfd:           string; // N/s — rate of force development
}

interface SJData {
  jumpHeight:    string; // cm
  timeToPeak:    string; // ms
  durationAtPeak:string; // ms
  peakPower:     string; // W/kg
}

interface DJData {
  jumpHeight:    string; // cm
  contactTime:   string; // ms
  rsi:           string; // reactive strength index (auto or manual)
  timeToPeak:    string; // ms
}

interface HopData {
  distL:         string; // cm single leg hop L
  distR:         string; // cm single leg hop R
  lsi:           string; // limb symmetry index % (auto-filled)
}

interface IsometricData {
  timeToPeak:    string; // ms
  durationAtPeak:string; // ms
  peakForce:     string; // % BW or kg
  rfd:           string; // N/s
}

interface SprintData {
  m10:           string; // sec
  m20:           string; // sec
  m40:           string; // sec
}

interface PowerSession {
  id:             string;
  patientId:      string;
  date:           string;
  assessor:       string;
  cmj:            CMJData;
  sj:             SJData;
  dj:             DJData;
  hop:            HopData;
  iso:            IsometricData;
  sprint:         SprintData;
  notes:          string;
  createdAt:      Timestamp | null;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

function emptyCMJ():       CMJData       { return { jumpHeight: "", timeToPeak: "", durationAtPeak: "", peakPower: "", rfd: "" }; }
function emptySJ():        SJData        { return { jumpHeight: "", timeToPeak: "", durationAtPeak: "", peakPower: "" }; }
function emptyDJ():        DJData        { return { jumpHeight: "", contactTime: "", rsi: "", timeToPeak: "" }; }
function emptyHop():       HopData       { return { distL: "", distR: "", lsi: "" }; }
function emptyIso():       IsometricData { return { timeToPeak: "", durationAtPeak: "", peakForce: "", rfd: "" }; }
function emptySprint():    SprintData    { return { m10: "", m20: "", m40: "" }; }

function emptyForm() {
  return {
    date:     new Date().toISOString().slice(0, 10),
    assessor: "",
    cmj:      emptyCMJ(),
    sj:       emptySJ(),
    dj:       emptyDJ(),
    hop:      emptyHop(),
    iso:      emptyIso(),
    sprint:   emptySprint(),
    notes:    "",
  };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function num(s: string): number | null {
  const v = parseFloat(s);
  return isNaN(v) ? null : v;
}

function calcLSI(distL: string, distR: string): string {
  const l = num(distL), r = num(distR);
  if (!l || !r || r === 0) return "";
  return ((Math.min(l, r) / Math.max(l, r)) * 100).toFixed(1);
}

function calcRSI(jumpHeight: string, contactTime: string): string {
  const h = num(jumpHeight), c = num(contactTime);
  if (!h || !c || c === 0) return "";
  return (h / c).toFixed(3);
}

const CHART_COLORS = ["#2E8BC0", "#e8a44a", "#3aaa6c", "#e05050", "#9b59b6", "#0C3C60"];

function buildChart(
  title: string,
  dates: string[],
  series: { label: string; values: (number | null)[] }[],
  unit: string,
): string {
  const W = 520, H = 180;
  const pad = { l: 46, r: 14, t: 22, b: 64 };
  const cW = W - pad.l - pad.r, cH = H - pad.t - pad.b;
  const n = dates.length;

  const allVals = series.flatMap((s) => s.values.filter((v) => v !== null) as number[]);
  if (allVals.length === 0) return "";
  const yMin = Math.floor(Math.min(...allVals) * 0.9);
  const yMax = Math.ceil(Math.max(...allVals) * 1.1);
  const yRange = yMax - yMin || 1;

  const xPos = (i: number) => pad.l + (n <= 1 ? cW / 2 : (i / (n - 1)) * cW);
  const yPos = (v: number) => pad.t + (1 - (v - yMin) / yRange) * cH;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" style="width:100%;max-width:${W}px;font-family:Arial,sans-serif;">`;
  svg += `<rect width="${W}" height="${H}" fill="#fafaf8" rx="8" stroke="#e5e0d8" stroke-width="1"/>`;
  svg += `<text x="${pad.l}" y="15" font-size="9.5" font-weight="700" fill="#0C3C60">${title}</text>`;

  for (let i = 0; i <= 4; i++) {
    const v = yMin + yRange * i / 4;
    const y = yPos(v).toFixed(1);
    svg += `<line x1="${pad.l}" y1="${y}" x2="${pad.l + cW}" y2="${y}" stroke="#e5e0d8" stroke-width="1"/>`;
    svg += `<text x="${pad.l - 4}" y="${(yPos(v) + 3.5).toFixed(1)}" font-size="7.5" fill="#9a9590" text-anchor="end">${v.toFixed(1)}</text>`;
  }

  dates.forEach((d, i) => {
    const x = xPos(i).toFixed(1);
    const lbl = d.length === 10 ? `${d.slice(5, 7)}/${d.slice(8, 10)}` : d;
    svg += `<text x="${x}" y="${(pad.t + cH + 13).toFixed(1)}" font-size="7.5" fill="#9a9590" text-anchor="middle">${lbl}</text>`;
  });

  series.forEach(({ values }, si) => {
    const color = CHART_COLORS[si % CHART_COLORS.length];
    let pathD = "";
    values.forEach((v, i) => {
      if (v === null) return;
      const x = xPos(i).toFixed(1), y = yPos(v).toFixed(1);
      pathD += pathD ? ` L${x},${y}` : `M${x},${y}`;
    });
    if (pathD) svg += `<path d="${pathD}" fill="none" stroke="${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    values.forEach((v, i) => {
      if (v === null) return;
      const x = xPos(i), y = yPos(v);
      svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${color}" stroke="#fff" stroke-width="1.5"/>`;
      svg += `<text x="${x.toFixed(1)}" y="${(y - 6).toFixed(1)}" font-size="7.5" fill="${color}" text-anchor="middle" font-weight="700">${v}</text>`;
    });
  });

  const legY = pad.t + cH + 26;
  series.forEach(({ label }, si) => {
    const color = CHART_COLORS[si % CHART_COLORS.length];
    const lx = pad.l + si * 110, ly = legY;
    svg += `<rect x="${lx}" y="${ly - 6}" width="10" height="7" rx="2" fill="${color}"/>`;
    svg += `<text x="${lx + 14}" y="${ly}" font-size="7.5" fill="#5a5550">${label} (${unit})</text>`;
  });

  svg += `</svg>`;
  return svg;
}

// ─── Sub-section field component ──────────────────────────────────────────────

function Field({
  label, unit, value, onChange, canEdit, hint,
}: {
  label: string; unit: string; value: string;
  onChange: (v: string) => void; canEdit: boolean; hint?: string;
}) {
  return (
    <div className="eps-field">
      <label className="eps-field-label">{label}</label>
      {hint && <div className="eps-field-hint">{hint}</div>}
      {canEdit ? (
        <div className="eps-field-input-wrap">
          <input
            className="eps-field-input"
            type="number"
            step="any"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="—"
          />
          {unit && <span className="eps-field-unit">{unit}</span>}
        </div>
      ) : (
        <div className="eps-field-static">
          {value ? <><strong>{value}</strong> <span className="eps-field-unit">{unit}</span></> : <span style={{ color: "#c0bbb5" }}>—</span>}
        </div>
      )}
    </div>
  );
}

// ─── Section wrapper ──────────────────────────────────────────────────────────

function TestSection({
  title, icon, children, defaultOpen = true,
}: {
  title: string; icon: string; children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="eps-test-section">
      <button className="eps-section-header" onClick={() => setOpen(!open)}>
        <span className="eps-section-icon">{icon}</span>
        <span className="eps-section-title">{title}</span>
        {open ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
      </button>
      {open && <div className="eps-section-body">{children}</div>}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface Props {
  patientId:    string;
  patientName?: string;
  canEdit:      boolean;
}

export default function ExplosivePowerSheet({ patientId, patientName, canEdit }: Props) {
  const [sessions,     setSessions]    = useState<PowerSession[]>([]);
  const [loading,      setLoading]     = useState(true);
  const [showForm,     setShowForm]    = useState(false);
  const [form,         setForm]        = useState(emptyForm());
  const [saving,       setSaving]      = useState(false);
  const [expandedId,   setExpandedId]  = useState<string | null>(null);
  const [deletingId,   setDeletingId]  = useState<string | null>(null);
  const [showCharts,   setShowCharts]  = useState(true);

  // ── Load sessions ──────────────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    getDocs(
      query(
        collection(db, "explosivePowerSessions"),
        where("patientId", "==", patientId),
        orderBy("date", "asc"),
      )
    ).then((snap) => {
      const list: PowerSession[] = snap.docs.map((d) => {
        const data = d.data();
        return {
          id:        d.id,
          patientId: data.patientId ?? patientId,
          date:      data.date      ?? "",
          assessor:  data.assessor  ?? "",
          cmj:       data.cmj       ?? emptyCMJ(),
          sj:        data.sj        ?? emptySJ(),
          dj:        data.dj        ?? emptyDJ(),
          hop:       data.hop       ?? emptyHop(),
          iso:       data.iso       ?? emptyIso(),
          sprint:    data.sprint    ?? emptySprint(),
          notes:     data.notes     ?? "",
          createdAt: data.createdAt ?? null,
        };
      });
      setSessions(list);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [patientId]);

  // ── Auto-fill computed fields ──────────────────────────────────────────────
  const setDJField = (field: keyof DJData, val: string) => {
    const updated = { ...form.dj, [field]: val };
    if (field === "jumpHeight" || field === "contactTime") {
      updated.rsi = calcRSI(
        field === "jumpHeight"   ? val : form.dj.jumpHeight,
        field === "contactTime"  ? val : form.dj.contactTime,
      );
    }
    setForm({ ...form, dj: updated });
  };

  const setHopField = (field: keyof HopData, val: string) => {
    const updated = { ...form.hop, [field]: val };
    if (field === "distL" || field === "distR") {
      updated.lsi = calcLSI(
        field === "distL" ? val : form.hop.distL,
        field === "distR" ? val : form.hop.distR,
      );
    }
    setForm({ ...form, hop: updated });
  };

  // ── Save ──────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!form.date) return;
    setSaving(true);
    try {
      const payload = {
        patientId,
        date:      form.date,
        assessor:  form.assessor,
        cmj:       form.cmj,
        sj:        form.sj,
        dj:        form.dj,
        hop:       form.hop,
        iso:       form.iso,
        sprint:    form.sprint,
        notes:     form.notes,
        createdAt: serverTimestamp(),
      };
      const ref = await addDoc(collection(db, "explosivePowerSessions"), payload);
      const newSession: PowerSession = { id: ref.id, ...payload, createdAt: null };
      setSessions((prev) => [...prev, newSession].sort((a, b) => a.date.localeCompare(b.date)));
      setForm(emptyForm());
      setShowForm(false);
    } catch (e) {
      console.error("[ExplosivePowerSheet] save error", e);
    }
    setSaving(false);
  };

  // ── Delete ────────────────────────────────────────────────────────────────
  const handleDelete = async (id: string) => {
    if (!window.confirm("Delete this assessment session?")) return;
    setDeletingId(id);
    await deleteDoc(doc(db, "explosivePowerSessions", id));
    setSessions((prev) => prev.filter((s) => s.id !== id));
    setDeletingId(null);
  };

  // ── Trend charts ──────────────────────────────────────────────────────────
  const chartSessions = sessions.filter((s) => s.date);
  const chartDates = chartSessions.map((s) => s.date);
  const hasCharts = chartSessions.length >= 2;

  const trendCharts = hasCharts ? [
    buildChart(
      "CMJ — Jump Height",
      chartDates,
      [{ label: "CMJ", values: chartSessions.map((s) => num(s.cmj.jumpHeight)) }],
      "cm",
    ),
    buildChart(
      "Time to Peak Force",
      chartDates,
      [
        { label: "CMJ",  values: chartSessions.map((s) => num(s.cmj.timeToPeak)) },
        { label: "SJ",   values: chartSessions.map((s) => num(s.sj.timeToPeak))  },
        { label: "ISO",  values: chartSessions.map((s) => num(s.iso.timeToPeak)) },
      ],
      "ms",
    ),
    buildChart(
      "Duration at Peak Force",
      chartDates,
      [
        { label: "CMJ",  values: chartSessions.map((s) => num(s.cmj.durationAtPeak)) },
        { label: "SJ",   values: chartSessions.map((s) => num(s.sj.durationAtPeak))  },
        { label: "ISO",  values: chartSessions.map((s) => num(s.iso.durationAtPeak)) },
      ],
      "ms",
    ),
    buildChart(
      "Peak Power",
      chartDates,
      [
        { label: "CMJ", values: chartSessions.map((s) => num(s.cmj.peakPower)) },
        { label: "SJ",  values: chartSessions.map((s) => num(s.sj.peakPower))  },
      ],
      "W/kg",
    ),
    buildChart(
      "Rate of Force Development (RFD)",
      chartDates,
      [
        { label: "CMJ", values: chartSessions.map((s) => num(s.cmj.rfd)) },
        { label: "ISO", values: chartSessions.map((s) => num(s.iso.rfd)) },
      ],
      "N/s",
    ),
    buildChart(
      "Drop Jump — RSI",
      chartDates,
      [{ label: "RSI", values: chartSessions.map((s) => num(s.dj.rsi)) }],
      "m/s",
    ),
    buildChart(
      "Sprint Times",
      chartDates,
      [
        { label: "10m", values: chartSessions.map((s) => num(s.sprint.m10)) },
        { label: "20m", values: chartSessions.map((s) => num(s.sprint.m20)) },
        { label: "40m", values: chartSessions.map((s) => num(s.sprint.m40)) },
      ],
      "s",
    ),
  ].filter((c) => c.length > 0) : [];

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="eps-root">
      <style>{`
        .eps-root { font-family: 'Outfit', sans-serif; color: #1a1a1a; }

        /* ── Header ── */
        .eps-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 20px; flex-wrap: wrap; gap: 12px;
        }
        .eps-header-left { display: flex; align-items: center; gap: 10px; }
        .eps-header-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: linear-gradient(135deg, #0C3C60, #2E8BC0);
          display: flex; align-items: center; justify-content: center;
          color: #fff;
        }
        .eps-title { font-size: 17px; font-weight: 700; color: #0C3C60; }
        .eps-subtitle { font-size: 12px; color: #9a9590; margin-top: 2px; }
        .eps-add-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 9px 16px; border-radius: 9px; border: none;
          background: #0C3C60; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: all 0.15s;
        }
        .eps-add-btn:hover { background: #2E8BC0; }

        /* ── Charts toggle ── */
        .eps-charts-toggle {
          display: flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 8px;
          border: 1.5px solid #d0dae8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          color: #2E8BC0; cursor: pointer; transition: all 0.15s;
        }
        .eps-charts-toggle:hover { border-color: #2E8BC0; background: #f0f8ff; }

        /* ── Charts grid ── */
        .eps-charts-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
          gap: 16px; margin-bottom: 24px;
        }
        .eps-chart-card {
          background: #fff; border: 1px solid #e8e3dc; border-radius: 12px;
          padding: 12px; overflow: hidden;
        }

        /* ── Form card ── */
        .eps-form-card {
          background: #fff; border: 1.5px solid #2E8BC0; border-radius: 16px;
          padding: 24px; margin-bottom: 20px;
        }
        .eps-form-title { font-size: 15px; font-weight: 700; color: #0C3C60; margin-bottom: 16px; }
        .eps-form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 16px; }
        .eps-form-label { font-size: 11px; font-weight: 600; color: #9a9590; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
        .eps-form-input {
          width: 100%; padding: 8px 10px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; font-family: 'Outfit', sans-serif;
          font-size: 14px; background: #fafaf8; transition: border-color 0.15s;
          box-sizing: border-box;
        }
        .eps-form-input:focus { outline: none; border-color: #2E8BC0; background: #fff; }
        .eps-form-actions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 16px; }
        .eps-btn-cancel {
          padding: 9px 18px; border-radius: 9px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          color: #5a5550; cursor: pointer;
        }
        .eps-btn-save {
          padding: 9px 20px; border-radius: 9px; border: none;
          background: #0C3C60; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: all 0.15s;
        }
        .eps-btn-save:hover:not(:disabled) { background: #2E8BC0; }
        .eps-btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

        /* ── Test sections inside form ── */
        .eps-test-section {
          border: 1px solid #e8e3dc; border-radius: 12px;
          overflow: hidden; margin-bottom: 12px;
        }
        .eps-section-header {
          width: 100%; display: flex; align-items: center; gap: 8px;
          padding: 10px 14px; background: #f5f5f2; border: none;
          cursor: pointer; font-family: 'Outfit', sans-serif; text-align: left;
          transition: background 0.15s;
        }
        .eps-section-header:hover { background: #eeede8; }
        .eps-section-icon { font-size: 16px; }
        .eps-section-title { flex: 1; font-size: 13px; font-weight: 700; color: #0C3C60; }
        .eps-section-body { padding: 14px; display: grid; grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }

        /* ── Field ── */
        .eps-field {}
        .eps-field-label { font-size: 11px; font-weight: 600; color: #5a5550; margin-bottom: 3px; display: block; }
        .eps-field-hint  { font-size: 10px; color: #b0aaa5; margin-bottom: 4px; }
        .eps-field-input-wrap { display: flex; align-items: center; gap: 4px; }
        .eps-field-input {
          flex: 1; padding: 6px 8px; border-radius: 7px;
          border: 1.5px solid #e5e0d8; font-family: 'Outfit', sans-serif;
          font-size: 13px; background: #fafaf8; min-width: 0;
          transition: border-color 0.15s;
        }
        .eps-field-input:focus { outline: none; border-color: #2E8BC0; background: #fff; }
        .eps-field-unit  { font-size: 11px; color: #9a9590; white-space: nowrap; }
        .eps-field-static { font-size: 13px; color: #1a1a1a; }
        .eps-computed-badge {
          display: inline-block; padding: 2px 8px; border-radius: 100px;
          background: #D6EEF8; color: #0C3C60; font-size: 11px; font-weight: 700; margin-top: 4px;
        }

        /* ── History sessions ── */
        .eps-history-label {
          font-size: 11px; font-weight: 700; color: #9a9590;
          text-transform: uppercase; letter-spacing: 0.1em;
          margin: 24px 0 12px;
        }
        .eps-session-card {
          background: #fff; border: 1px solid #e8e3dc; border-radius: 14px;
          margin-bottom: 10px; overflow: hidden;
        }
        .eps-session-header {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 16px; cursor: pointer;
          transition: background 0.12s;
        }
        .eps-session-header:hover { background: #fafaf8; }
        .eps-session-date { font-size: 14px; font-weight: 700; color: #0C3C60; min-width: 100px; }
        .eps-session-assessor { font-size: 12px; color: #9a9590; }
        .eps-session-pills { display: flex; gap: 6px; flex-wrap: wrap; flex: 1; }
        .eps-pill {
          padding: 2px 10px; border-radius: 100px; font-size: 11px; font-weight: 700;
          background: #D6EEF8; color: #0C3C60;
        }
        .eps-pill.amber { background: #fef3c7; color: #92400e; }
        .eps-pill.green { background: #dcfce7; color: #166534; }
        .eps-session-del {
          padding: 5px 8px; border-radius: 7px;
          border: 1px solid #fca5a5; background: #fff;
          color: #e05050; cursor: pointer; transition: all 0.15s; font-size: 12px;
        }
        .eps-session-del:hover { background: #fee2e2; }
        .eps-session-body { padding: 14px 16px; border-top: 1px solid #f0ede8; }
        .eps-snapshot-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
          gap: 10px;
        }
        .eps-snapshot-group { }
        .eps-snapshot-title { font-size: 11px; font-weight: 700; color: #9a9590; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px; }
        .eps-snapshot-row { display: flex; justify-content: space-between; font-size: 12px; color: #5a5550; padding: 2px 0; }
        .eps-snapshot-val { font-weight: 700; color: #1a1a1a; }
        .eps-session-notes { margin-top: 10px; font-size: 12px; color: #5a5550; padding: 8px 10px; background: #fafaf8; border-radius: 8px; }

        .eps-empty { text-align: center; padding: 40px 20px; color: #9a9590; font-size: 14px; }

        @media (max-width: 640px) {
          .eps-header { flex-direction: column; align-items: flex-start; gap: 10px; }
          .eps-header > div:last-child { width: 100%; display: flex; gap: 8px; }
          .eps-add-btn { flex: 1; justify-content: center; }
          .eps-charts-toggle { flex: 1; justify-content: center; }

          .eps-form-row { grid-template-columns: 1fr; }
          .eps-section-body { grid-template-columns: 1fr 1fr; }
          .eps-charts-grid { grid-template-columns: 1fr; }
          .eps-form-card { padding: 16px; }

          .eps-session-header { flex-wrap: wrap; gap: 8px; }
          .eps-session-date { min-width: unset; font-size: 13px; }
          .eps-session-pills { order: 3; width: 100%; }
          .eps-session-del { order: 2; }

          .eps-snapshot-grid { grid-template-columns: 1fr 1fr; }
          .eps-snapshot-group { min-width: 0; }
        }
      `}</style>

      {/* Header */}
      <div className="eps-header">
        <div className="eps-header-left">
          <div className="eps-header-icon"><Zap size={18} /></div>
          <div>
            <div className="eps-title">Explosive Power Assessment</div>
            <div className="eps-subtitle">Neuromuscular performance · Time to peak · Power output</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {hasCharts && (
            <button className="eps-charts-toggle" onClick={() => setShowCharts(!showCharts)}>
              {showCharts ? "Hide" : "Show"} Progress Charts
            </button>
          )}
          {canEdit && !showForm && (
            <button className="eps-add-btn" onClick={() => setShowForm(true)}>
              <Plus size={14} /> New Assessment
            </button>
          )}
        </div>
      </div>

      {/* Trend charts */}
      {hasCharts && showCharts && (
        <div className="eps-charts-grid">
          {trendCharts.map((svg, i) => (
            <div key={i} className="eps-chart-card" dangerouslySetInnerHTML={{ __html: svg }} />
          ))}
        </div>
      )}

      {/* New assessment form */}
      {showForm && (
        <div className="eps-form-card">
          <div className="eps-form-title">New Assessment — {patientName ?? "Patient"}</div>

          <div className="eps-form-row">
            <div>
              <div className="eps-form-label">Assessment Date</div>
              <input className="eps-form-input" type="date" value={form.date}
                onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <div className="eps-form-label">Assessed By</div>
              <input className="eps-form-input" type="text" value={form.assessor}
                onChange={(e) => setForm({ ...form, assessor: e.target.value })} placeholder="Physio name" />
            </div>
          </div>

          {/* CMJ */}
          <TestSection title="Countermovement Jump (CMJ)" icon="⬆️">
            <Field label="Jump Height" unit="cm"   value={form.cmj.jumpHeight}     onChange={(v) => setForm({ ...form, cmj: { ...form.cmj, jumpHeight: v } })}     canEdit />
            <Field label="Time to Peak Force" unit="ms" value={form.cmj.timeToPeak} onChange={(v) => setForm({ ...form, cmj: { ...form.cmj, timeToPeak: v } })}     canEdit hint="Time from start of movement to peak force" />
            <Field label="Duration at Peak"   unit="ms" value={form.cmj.durationAtPeak} onChange={(v) => setForm({ ...form, cmj: { ...form.cmj, durationAtPeak: v } })} canEdit hint="Time maintained ≥90% of peak force" />
            <Field label="Peak Power"  unit="W/kg" value={form.cmj.peakPower}      onChange={(v) => setForm({ ...form, cmj: { ...form.cmj, peakPower: v } })}      canEdit />
            <Field label="RFD"         unit="N/s"  value={form.cmj.rfd}            onChange={(v) => setForm({ ...form, cmj: { ...form.cmj, rfd: v } })}            canEdit hint="Rate of Force Development" />
          </TestSection>

          {/* SJ */}
          <TestSection title="Squat Jump (SJ)" icon="🦵" defaultOpen={false}>
            <Field label="Jump Height" unit="cm"   value={form.sj.jumpHeight}     onChange={(v) => setForm({ ...form, sj: { ...form.sj, jumpHeight: v } })}     canEdit />
            <Field label="Time to Peak Force" unit="ms" value={form.sj.timeToPeak} onChange={(v) => setForm({ ...form, sj: { ...form.sj, timeToPeak: v } })}     canEdit hint="Time from start of push to peak force" />
            <Field label="Duration at Peak"   unit="ms" value={form.sj.durationAtPeak} onChange={(v) => setForm({ ...form, sj: { ...form.sj, durationAtPeak: v } })} canEdit hint="Time maintained ≥90% of peak force" />
            <Field label="Peak Power"  unit="W/kg" value={form.sj.peakPower}      onChange={(v) => setForm({ ...form, sj: { ...form.sj, peakPower: v } })}      canEdit />
          </TestSection>

          {/* DJ */}
          <TestSection title="Drop Jump (DJ)" icon="⬇️" defaultOpen={false}>
            <Field label="Jump Height"   unit="cm" value={form.dj.jumpHeight}   onChange={(v) => setDJField("jumpHeight",  v)} canEdit />
            <Field label="Contact Time"  unit="ms" value={form.dj.contactTime}  onChange={(v) => setDJField("contactTime", v)} canEdit hint="Ground contact time" />
            <Field label="Time to Peak"  unit="ms" value={form.dj.timeToPeak}   onChange={(v) => setDJField("timeToPeak",  v)} canEdit />
            <div className="eps-field">
              <label className="eps-field-label">RSI (auto)</label>
              <div className="eps-field-hint">Jump height ÷ contact time</div>
              {form.dj.rsi
                ? <span className="eps-computed-badge">RSI = {form.dj.rsi}</span>
                : <span style={{ color: "#c0bbb5", fontSize: 12 }}>Enter height & contact time</span>}
            </div>
          </TestSection>

          {/* Hop */}
          <TestSection title="Single Leg Hop Tests" icon="🏃" defaultOpen={false}>
            <Field label="Hop Distance (Left)"  unit="cm" value={form.hop.distL} onChange={(v) => setHopField("distL", v)} canEdit />
            <Field label="Hop Distance (Right)" unit="cm" value={form.hop.distR} onChange={(v) => setHopField("distR", v)} canEdit />
            <div className="eps-field">
              <label className="eps-field-label">LSI (auto)</label>
              <div className="eps-field-hint">Limb Symmetry Index</div>
              {form.hop.lsi
                ? <span className="eps-computed-badge">LSI = {form.hop.lsi}%</span>
                : <span style={{ color: "#c0bbb5", fontSize: 12 }}>Enter both distances</span>}
            </div>
          </TestSection>

          {/* Isometric */}
          <TestSection title="Isometric Hold Test" icon="💪" defaultOpen={false}>
            <Field label="Time to Peak Force" unit="ms"   value={form.iso.timeToPeak}     onChange={(v) => setForm({ ...form, iso: { ...form.iso, timeToPeak: v } })}     canEdit hint="Time from contraction onset to peak force" />
            <Field label="Duration at Peak"   unit="ms"   value={form.iso.durationAtPeak} onChange={(v) => setForm({ ...form, iso: { ...form.iso, durationAtPeak: v } })} canEdit hint="Time maintained ≥90% of peak force" />
            <Field label="Peak Force"         unit="% BW" value={form.iso.peakForce}      onChange={(v) => setForm({ ...form, iso: { ...form.iso, peakForce: v } })}      canEdit />
            <Field label="RFD"                unit="N/s"  value={form.iso.rfd}            onChange={(v) => setForm({ ...form, iso: { ...form.iso, rfd: v } })}            canEdit hint="Rate of Force Development" />
          </TestSection>

          {/* Sprint */}
          <TestSection title="Sprint Tests" icon="⚡" defaultOpen={false}>
            <Field label="10m Sprint" unit="s" value={form.sprint.m10} onChange={(v) => setForm({ ...form, sprint: { ...form.sprint, m10: v } })} canEdit />
            <Field label="20m Sprint" unit="s" value={form.sprint.m20} onChange={(v) => setForm({ ...form, sprint: { ...form.sprint, m20: v } })} canEdit />
            <Field label="40m Sprint" unit="s" value={form.sprint.m40} onChange={(v) => setForm({ ...form, sprint: { ...form.sprint, m40: v } })} canEdit />
          </TestSection>

          {/* Notes */}
          <div style={{ marginTop: 12 }}>
            <div className="eps-form-label">Assessment Notes</div>
            <textarea
              className="eps-form-input"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Overall findings, observations, clinical notes…"
              style={{ resize: "vertical" }}
            />
          </div>

          <div className="eps-form-actions">
            <button className="eps-btn-cancel" onClick={() => { setShowForm(false); setForm(emptyForm()); }}>Cancel</button>
            <button className="eps-btn-save" disabled={saving || !form.date} onClick={handleSave}>
              {saving ? "Saving…" : "Save Assessment"}
            </button>
          </div>
        </div>
      )}

      {/* History */}
      {loading ? (
        <div className="eps-empty">Loading…</div>
      ) : sessions.length === 0 && !showForm ? (
        <div className="eps-empty">
          No explosive power assessments recorded yet.
          {canEdit && <div style={{ marginTop: 8, fontSize: 13, color: "#b0aaa5" }}>Click "New Assessment" to start tracking.</div>}
        </div>
      ) : sessions.length > 0 && (
        <>
          <div className="eps-history-label">{sessions.length} session{sessions.length !== 1 ? "s" : ""} recorded</div>
          {[...sessions].reverse().map((s) => {
            const isExpanded = expandedId === s.id;
            const pills: { label: string; cls?: string }[] = [];
            if (s.cmj.jumpHeight)     pills.push({ label: `CMJ ${s.cmj.jumpHeight} cm` });
            if (s.cmj.timeToPeak)     pills.push({ label: `TtP ${s.cmj.timeToPeak} ms`, cls: "amber" });
            if (s.cmj.durationAtPeak) pills.push({ label: `Peak ${s.cmj.durationAtPeak} ms`, cls: "green" });
            if (s.dj.rsi)             pills.push({ label: `RSI ${s.dj.rsi}` });
            if (s.hop.lsi)            pills.push({ label: `LSI ${s.hop.lsi}%`, cls: "green" });
            if (s.sprint.m10)         pills.push({ label: `10m ${s.sprint.m10}s` });

            return (
              <div key={s.id} className="eps-session-card">
                <div className="eps-session-header" onClick={() => setExpandedId(isExpanded ? null : s.id)}>
                  <div>
                    <div className="eps-session-date">{s.date}</div>
                    {s.assessor && <div className="eps-session-assessor">{s.assessor}</div>}
                  </div>
                  <div className="eps-session-pills">
                    {pills.map((p, i) => (
                      <span key={i} className={`eps-pill ${p.cls ?? ""}`}>{p.label}</span>
                    ))}
                  </div>
                  {canEdit && (
                    <button
                      className="eps-session-del"
                      disabled={deletingId === s.id}
                      onClick={(e) => { e.stopPropagation(); handleDelete(s.id); }}
                    >
                      {deletingId === s.id ? "…" : <Trash2 size={12} />}
                    </button>
                  )}
                  {isExpanded ? <ChevronUp size={15} color="#9a9590" /> : <ChevronDown size={15} color="#9a9590" />}
                </div>

                {isExpanded && (
                  <div className="eps-session-body">
                    <div className="eps-snapshot-grid">
                      {/* CMJ */}
                      <div className="eps-snapshot-group">
                        <div className="eps-snapshot-title">⬆️ CMJ</div>
                        {[
                          ["Jump Height",     s.cmj.jumpHeight,     "cm"],
                          ["Time to Peak",    s.cmj.timeToPeak,     "ms"],
                          ["Duration at Peak",s.cmj.durationAtPeak, "ms"],
                          ["Peak Power",      s.cmj.peakPower,      "W/kg"],
                          ["RFD",             s.cmj.rfd,            "N/s"],
                        ].map(([l, v, u]) => v ? (
                          <div key={l} className="eps-snapshot-row">
                            <span>{l}</span>
                            <span className="eps-snapshot-val">{v} <span style={{ fontWeight: 400, color: "#9a9590" }}>{u}</span></span>
                          </div>
                        ) : null)}
                      </div>
                      {/* SJ */}
                      <div className="eps-snapshot-group">
                        <div className="eps-snapshot-title">🦵 SJ</div>
                        {[
                          ["Jump Height",     s.sj.jumpHeight,     "cm"],
                          ["Time to Peak",    s.sj.timeToPeak,     "ms"],
                          ["Duration at Peak",s.sj.durationAtPeak, "ms"],
                          ["Peak Power",      s.sj.peakPower,      "W/kg"],
                        ].map(([l, v, u]) => v ? (
                          <div key={l} className="eps-snapshot-row">
                            <span>{l}</span>
                            <span className="eps-snapshot-val">{v} <span style={{ fontWeight: 400, color: "#9a9590" }}>{u}</span></span>
                          </div>
                        ) : null)}
                      </div>
                      {/* DJ */}
                      <div className="eps-snapshot-group">
                        <div className="eps-snapshot-title">⬇️ Drop Jump</div>
                        {[
                          ["Jump Height",  s.dj.jumpHeight,  "cm"],
                          ["Contact Time", s.dj.contactTime, "ms"],
                          ["RSI",          s.dj.rsi,         ""],
                          ["Time to Peak", s.dj.timeToPeak,  "ms"],
                        ].map(([l, v, u]) => v ? (
                          <div key={l} className="eps-snapshot-row">
                            <span>{l}</span>
                            <span className="eps-snapshot-val">{v} <span style={{ fontWeight: 400, color: "#9a9590" }}>{u}</span></span>
                          </div>
                        ) : null)}
                      </div>
                      {/* Hop */}
                      <div className="eps-snapshot-group">
                        <div className="eps-snapshot-title">🏃 Single Leg Hop</div>
                        {[
                          ["Left",  s.hop.distL, "cm"],
                          ["Right", s.hop.distR, "cm"],
                          ["LSI",   s.hop.lsi,   "%"],
                        ].map(([l, v, u]) => v ? (
                          <div key={l} className="eps-snapshot-row">
                            <span>{l}</span>
                            <span className="eps-snapshot-val">{v} <span style={{ fontWeight: 400, color: "#9a9590" }}>{u}</span></span>
                          </div>
                        ) : null)}
                      </div>
                      {/* Isometric */}
                      <div className="eps-snapshot-group">
                        <div className="eps-snapshot-title">💪 Isometric</div>
                        {[
                          ["Time to Peak",    s.iso.timeToPeak,     "ms"],
                          ["Duration at Peak",s.iso.durationAtPeak, "ms"],
                          ["Peak Force",      s.iso.peakForce,      "% BW"],
                          ["RFD",             s.iso.rfd,            "N/s"],
                        ].map(([l, v, u]) => v ? (
                          <div key={l} className="eps-snapshot-row">
                            <span>{l}</span>
                            <span className="eps-snapshot-val">{v} <span style={{ fontWeight: 400, color: "#9a9590" }}>{u}</span></span>
                          </div>
                        ) : null)}
                      </div>
                      {/* Sprint */}
                      <div className="eps-snapshot-group">
                        <div className="eps-snapshot-title">⚡ Sprint</div>
                        {[
                          ["10m", s.sprint.m10, "s"],
                          ["20m", s.sprint.m20, "s"],
                          ["40m", s.sprint.m40, "s"],
                        ].map(([l, v, u]) => v ? (
                          <div key={l} className="eps-snapshot-row">
                            <span>{l}</span>
                            <span className="eps-snapshot-val">{v} <span style={{ fontWeight: 400, color: "#9a9590" }}>{u}</span></span>
                          </div>
                        ) : null)}
                      </div>
                    </div>
                    {s.notes && <div className="eps-session-notes">📝 {s.notes}</div>}
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
    </div>
  );
}
