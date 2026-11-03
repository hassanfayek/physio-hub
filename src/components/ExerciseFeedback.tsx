// FILE: src/components/ExerciseFeedback.tsx
// After a patient finishes an exercise: "How did it feel?" (Easy / OK / Hard)
// and an optional pain score 0–10. FeedbackBadge shows the latest answer to
// the physio on the patient's program.

import { useState } from "react";
import type { Effort, ExerciseFeedback } from "../services/exerciseService";

const EFFORTS: { v: Effort; emoji: string; label: string }[] = [
  { v: "easy", emoji: "😊", label: "Easy" },
  { v: "ok",   emoji: "🙂", label: "OK" },
  { v: "hard", emoji: "😣", label: "Hard" },
];
const painColor = (n: number) => (n <= 3 ? "#16a34a" : n <= 6 ? "#d97706" : "#dc2626");

export function FeedbackPrompt({ onSubmit, onSkip, saving }: {
  onSubmit: (effort: Effort, pain: number | null) => void;
  onSkip:   () => void;
  saving?:  boolean;
}) {
  const [effort, setEffort] = useState<Effort | null>(null);
  const [pain, setPain] = useState<number | null>(null);
  return (
    <div className="xfb">
      <style>{CSS}</style>
      <div className="xfb-q">Nice work! How did it feel?</div>
      <div className="xfb-efforts">
        {EFFORTS.map((e) => (
          <button key={e.v} type="button" className={`xfb-effort ${effort === e.v ? `on ${e.v}` : ""}`} onClick={() => setEffort(e.v)}>
            <span>{e.emoji}</span>{e.label}
          </button>
        ))}
      </div>
      <div className="xfb-q sm">Any pain? <i>(optional)</i></div>
      <div className="xfb-pain">
        {Array.from({ length: 11 }, (_, n) => (
          <button key={n} type="button" className={`xfb-p ${pain === n ? "on" : ""}`}
            style={pain === n ? { background: painColor(n), borderColor: painColor(n) } : undefined}
            onClick={() => setPain(pain === n ? null : n)}>{n}</button>
        ))}
      </div>
      <div className="xfb-scale"><span>No pain</span><span>Worst</span></div>
      <div className="xfb-actions">
        <button type="button" className="xfb-skip" onClick={onSkip} disabled={saving}>Skip</button>
        <button type="button" className="xfb-send" disabled={!effort || saving} onClick={() => effort && onSubmit(effort, pain)}>
          {saving ? "Saving…" : "Send to my physio"}
        </button>
      </div>
    </div>
  );
}

export function FeedbackBadge({ fb }: { fb?: ExerciseFeedback }) {
  if (!fb) return null;
  const e = EFFORTS.find((x) => x.v === fb.effort);
  const [, m, d] = fb.date.split("-").map(Number);
  return (
    <span className={`xfb-badge ${fb.effort}`} title={`Patient feedback on ${fb.date}`}>
      <style>{CSS}</style>
      {e?.emoji} {e?.label ?? fb.effort}
      {fb.pain !== null && fb.pain !== undefined && <b style={{ color: painColor(fb.pain) }}>· pain {fb.pain}/10</b>}
      <small>{d}/{m}</small>
    </span>
  );
}

const CSS = `
.xfb { background: #f5fbff; border: 1.5px solid #D6EEF8; border-radius: 14px; padding: 14px; display: flex; flex-direction: column; gap: 10px; font-family: 'Outfit', sans-serif; }
.xfb-q { font-size: 14px; font-weight: 700; color: #0C3C60; }
.xfb-q.sm { font-size: 12.5px; color: #5a5550; } .xfb-q i { font-weight: 500; color: #9a9590; }
.xfb-efforts { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.xfb-effort { display: flex; flex-direction: column; align-items: center; gap: 2px; padding: 10px 6px; border-radius: 12px; border: 1.5px solid #e5e0d8; background: #fff; font-family: inherit; font-size: 13px; font-weight: 600; color: #5a5550; cursor: pointer; transition: all .15s; }
.xfb-effort span { font-size: 22px; }
.xfb-effort.on.easy { border-color: #16a34a; background: #f0fdf4; color: #166534; }
.xfb-effort.on.ok { border-color: #2E8BC0; background: #EAF5FC; color: #0C3C60; }
.xfb-effort.on.hard { border-color: #dc2626; background: #fef2f2; color: #991b1b; }
.xfb-pain { display: grid; grid-template-columns: repeat(11, 1fr); gap: 4px; }
.xfb-p { height: 32px; border-radius: 8px; border: 1.5px solid #e5e0d8; background: #fff; font-family: inherit; font-size: 12.5px; font-weight: 700; color: #5a5550; cursor: pointer; padding: 0; }
.xfb-p.on { color: #fff; }
.xfb-scale { display: flex; justify-content: space-between; font-size: 10.5px; color: #9a9590; margin-top: -6px; }
.xfb-actions { display: flex; gap: 8px; }
.xfb-skip { flex: 0 0 auto; padding: 10px 16px; border-radius: 10px; border: 1.5px solid #e5e0d8; background: #fff; font-family: inherit; font-size: 13.5px; font-weight: 600; color: #9a9590; cursor: pointer; }
.xfb-send { flex: 1; padding: 10px 16px; border-radius: 10px; border: none; background: #2E8BC0; font-family: inherit; font-size: 13.5px; font-weight: 700; color: #fff; cursor: pointer; }
.xfb-send:disabled { opacity: .5; cursor: not-allowed; }
.xfb-badge { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 100px; background: #f3f4f6; color: #374151; white-space: nowrap; }
.xfb-badge.easy { background: #dcfce7; color: #166534; } .xfb-badge.hard { background: #fee2e2; color: #991b1b; } .xfb-badge.ok { background: #EAF5FC; color: #0C3C60; }
.xfb-badge b { font-weight: 700; } .xfb-badge small { font-size: 10px; opacity: .65; margin-left: 2px; }
`;
