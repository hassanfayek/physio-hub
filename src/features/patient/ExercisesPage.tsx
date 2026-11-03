// FILE: src/features/patient/ExercisesPage.tsx
// Patient-facing exercise page — today's home program.
// Loads from patientExercises where patientId == currentUser.uid (realtime);
// patients only see home-program exercises (clinic ones are done with the physio).
// Marking done goes through toggleExerciseCompletion (also logs the streak day),
// then asks "How did it feel?" + optional pain, which the physio sees.
// Videos open in the shared VideoShowbox.

import { useState, useEffect, useRef, useMemo } from "react";
import { useAuth } from "../../hooks/useAuth";
import VideoShowbox, { type ShowboxItem } from "../../components/VideoShowbox";
import { FeedbackPrompt, FeedbackBadge } from "../../components/ExerciseFeedback";
import {
  subscribeToPatientExercises,
  subscribeToExerciseLibrary,
  resetDailyHomeExercises,
  toggleExerciseCompletion,
  saveExerciseFeedback,
  type PatientExercise,
  type LibraryExercise,
  type Effort,
} from "../../services/exerciseService";
import { clinicToday } from "../../services/businessService";
import { exerciseVideo } from "../../utils/youtube";
import type { PatientProfile } from "../../services/authService";
import { Check, Dumbbell, Play, AlertTriangle } from "lucide-react";

const dosage = (e: PatientExercise) => `${e.sets} sets · ${e.reps} reps${(e.holdTime ?? 0) > 0 ? ` · ${e.holdTime}s hold` : ""}`;

// ─── Exercise card ────────────────────────────────────────────────────────────

function ExerciseCard({ exercise, lib, today, toggling, askFeedback, savingFb, onToggle, onView, onFeedback, onSkipFeedback }: {
  exercise:   PatientExercise;
  lib?:       LibraryExercise;
  today:      string;
  toggling:   boolean;
  askFeedback: boolean;
  savingFb:   boolean;
  onToggle:   (rec: PatientExercise) => void;
  onView:     (rec: PatientExercise) => void;
  onFeedback: (rec: PatientExercise, effort: Effort, pain: number | null) => void;
  onSkipFeedback: () => void;
}) {
  const done = exercise.completed ?? false;
  const video = exerciseVideo(exercise);
  const fbToday = exercise.lastFeedback?.date === today ? exercise.lastFeedback : undefined;

  return (
    <div className={`xp-card ${done ? "done" : ""}`}>
      <div className="xp-row">
        <button className="xp-media" onClick={() => onView(exercise)} disabled={!video} aria-label="Watch video">
          {video ? <img src={video.thumb} alt="" loading="lazy" /> : <Dumbbell size={22} />}
          {video && <span className="xp-play"><Play size={14} fill="currentColor" /></span>}
        </button>
        <div className="xp-info">
          <div className="xp-name">{exercise.exerciseName}</div>
          <div className="xp-dose">{dosage(exercise)}</div>
          {lib?.precautions && <div className="xp-caution"><AlertTriangle size={11} /> Read the precautions</div>}
          {fbToday && <div style={{ marginTop: 4 }}><FeedbackBadge fb={fbToday} /></div>}
        </div>
        <button className={`xp-check ${done ? "on" : ""}`} disabled={toggling} onClick={() => onToggle(exercise)}
          title={done ? "Undo" : "Mark as done"} aria-label={done ? "Undo" : "Mark as done"}>
          {toggling ? <span className="xp-spin" /> : <Check size={18} strokeWidth={3} />}
        </button>
      </div>
      {exercise.notes && <div className="xp-note"><b>Physio note</b>{exercise.notes}</div>}
      {askFeedback && (
        <div style={{ marginTop: 10 }}>
          <FeedbackPrompt saving={savingFb} onSkip={onSkipFeedback} onSubmit={(e, p) => onFeedback(exercise, e, p)} />
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExercisesPage() {
  const { user } = useAuth();
  const patient = user as PatientProfile | null;
  const today = clinicToday();

  const [exercises,  setExercises]  = useState<PatientExercise[]>([]);
  const [library,    setLibrary]    = useState<Map<string, LibraryExercise>>(new Map());
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [askFbId,    setAskFbId]    = useState<string | null>(null);
  const [savingFb,   setSavingFb]   = useState(false);
  const [viewing,    setViewing]    = useState<number | null>(null);
  const resetDoneRef = useRef(false);  // ensure daily reset only runs once per session

  useEffect(() => {
    if (!patient?.uid) return;
    const unsub = subscribeToPatientExercises(
      patient.uid,
      (data) => {
        setExercises(data);
        setLoading(false);
        setError(null);
        // Reset completed exercises once per session (not on every snapshot)
        if (!resetDoneRef.current && data.length > 0) {
          resetDoneRef.current = true;
          resetDailyHomeExercises(data).catch(() => {/* silent — reset is best-effort */});
        }
      },
      (err) => {
        // Only surface the error if no exercises loaded yet (cached data is usable)
        setLoading(false);
        setExercises((prev) => {
          if (prev.length === 0) setError(err.message ?? "Failed to load exercises.");
          return prev;
        });
      }
    );
    return () => unsub();
  }, [patient?.uid]);

  // How-to text and precautions live on the library exercise.
  useEffect(() => subscribeToExerciseLibrary((d) => setLibrary(new Map(d.map((e) => [e.id, e]))), () => {}), []);

  const handleToggle = async (rec: PatientExercise) => {
    if ((rec.programType ?? "clinic") === "clinic") return;
    const nowDone = !(rec.completed ?? false);
    setTogglingId(rec.id);
    await toggleExerciseCompletion(rec.id, nowDone, rec.patientId);
    setTogglingId(null);
    setAskFbId(nowDone && rec.lastFeedback?.date !== today ? rec.id : null);
  };

  const handleFeedback = async (rec: PatientExercise, effort: Effort, pain: number | null) => {
    setSavingFb(true);
    await saveExerciseFeedback(rec, effort, pain, today);
    setSavingFb(false);
    setAskFbId(null);
  };

  // Patients see only home program exercises
  const tabExercises   = exercises.filter((e) => (e.programType ?? "clinic") === "home");
  const completedCount = tabExercises.filter((e) => e.completed ?? false).length;
  const total = tabExercises.length;
  const pct   = total ? Math.round((completedCount / total) * 100) : 0;
  const withVideo = useMemo(() => exercises.filter((e) => (e.programType ?? "clinic") === "home" && exerciseVideo(e)), [exercises]);

  const items = useMemo<ShowboxItem[]>(() => withVideo.map((r) => {
    const lib = library.get(r.exerciseId);
    return {
      key: r.id, title: r.exerciseName, video: exerciseVideo(r), dosage: dosage(r),
      tags: [lib?.category ?? "", lib?.equipment ?? ""], difficulty: lib?.difficulty,
      description: lib?.description, precautions: lib?.precautions, notes: r.notes,
    };
  }), [withVideo, library]);

  const R = 34, C = 2 * Math.PI * R;
  const message = total === 0 ? "" : pct === 100 ? "All done for today — great job! 🎉" : completedCount === 0 ? "Let's get moving. Tap a video to see how." : "Keep going, you're doing great.";

  return (
    <>
      <style>{CSS}</style>
      <div className="xp-root">

        {/* Hero with progress ring */}
        <div className="xp-hero">
          <div className="xp-ring">
            <svg width="84" height="84" viewBox="0 0 84 84">
              <circle cx="42" cy="42" r={R} fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="7" />
              <circle cx="42" cy="42" r={R} fill="none" stroke="#fff" strokeWidth="7" strokeLinecap="round"
                strokeDasharray={`${(pct / 100) * C} ${C}`} style={{ transition: "stroke-dasharray .5s ease" }} />
            </svg>
            <span>{loading ? "—" : `${pct}%`}</span>
          </div>
          <div>
            <div className="xp-title">My Home Program</div>
            <div className="xp-sub">{loading ? "Loading your exercises…" : total === 0 ? "No exercises yet" : `${completedCount} of ${total} done today`}</div>
            {message && <div className="xp-msg">{message}</div>}
          </div>
        </div>

        {error && <div className="xp-error">{error}</div>}

        {loading ? (
          <div className="xp-list">{[1, 2, 3].map((n) => <div key={n} className="xp-skel" />)}</div>
        ) : total === 0 ? (
          <div className="xp-empty">
            <div style={{ fontSize: 40, marginBottom: 10 }}>🏠</div>
            <div className="xp-empty-title">No home program yet</div>
            <div className="xp-empty-sub">Your physiotherapist hasn't assigned any home exercises yet. Check back after your next session.</div>
          </div>
        ) : (
          <div className="xp-list">
            {tabExercises.map((ex) => (
              <ExerciseCard key={ex.id} exercise={ex} lib={library.get(ex.exerciseId)} today={today}
                toggling={togglingId === ex.id} askFeedback={askFbId === ex.id} savingFb={savingFb}
                onToggle={handleToggle} onView={(r) => { const i = withVideo.findIndex((w) => w.id === r.id); if (i >= 0) setViewing(i); }}
                onFeedback={handleFeedback} onSkipFeedback={() => setAskFbId(null)} />
            ))}
          </div>
        )}
      </div>

      {viewing !== null && items[viewing] && (
        <VideoShowbox items={items} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)}
          footer={(item) => {
            const rec = withVideo.find((w) => w.id === item.key);
            if (!rec) return null;
            const done = rec.completed ?? false;
            return (
              <button className={`xp-sb-done ${done ? "on" : ""}`} disabled={togglingId === rec.id}
                onClick={() => { handleToggle(rec); if (!done) setViewing(null); }}>
                <Check size={16} strokeWidth={3} /> {done ? "Done — tap to undo" : "Mark as done"}
              </button>
            );
          }} />
      )}
    </>
  );
}

const CSS = `
.xp-root { font-family: 'Outfit', sans-serif; }
.xp-hero { display: flex; align-items: center; gap: 18px; padding: 20px; border-radius: 22px; background: linear-gradient(135deg, #0C3C60 0%, #2E8BC0 70%, #5BC0BE 100%); color: #fff; margin-bottom: 16px; box-shadow: 0 12px 30px rgba(12,60,96,.18); }
.xp-ring { position: relative; width: 84px; height: 84px; flex-shrink: 0; }
.xp-ring svg { transform: rotate(-90deg); }
.xp-ring span { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 19px; font-weight: 800; }
.xp-title { font-family: 'Playfair Display', serif; font-size: 22px; letter-spacing: -.01em; }
.xp-sub { font-size: 13.5px; opacity: .85; margin-top: 2px; }
.xp-msg { font-size: 13px; font-weight: 600; margin-top: 8px; background: rgba(255,255,255,.16); padding: 5px 10px; border-radius: 100px; display: inline-block; }
.xp-list { display: flex; flex-direction: column; gap: 10px; }
.xp-card { background: #fff; border: 1.5px solid #e5e0d8; border-radius: 18px; padding: 12px; transition: border-color .15s, background .15s; }
.xp-card.done { border-color: #86efac; background: #f6fef8; }
.xp-row { display: flex; align-items: center; gap: 12px; }
.xp-media { position: relative; width: 104px; aspect-ratio: 16 / 10; flex-shrink: 0; border: none; padding: 0; border-radius: 12px; overflow: hidden; background: linear-gradient(135deg, #D6EEF8, #EAF5FC); color: #2E8BC0; display: flex; align-items: center; justify-content: center; cursor: pointer; }
.xp-media:disabled { cursor: default; }
.xp-media img { width: 100%; height: 100%; object-fit: cover; }
.xp-play { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: 32px; height: 32px; border-radius: 50%; background: rgba(255,255,255,.94); color: #0C3C60; display: flex; align-items: center; justify-content: center; padding-left: 2px; box-shadow: 0 3px 10px rgba(0,0,0,.3); }
.xp-info { flex: 1; min-width: 0; }
.xp-name { font-size: 15px; font-weight: 700; color: #1a1a1a; line-height: 1.25; }
.done .xp-name { color: #166534; }
.xp-dose { font-size: 12.5px; color: #0C3C60; font-weight: 600; margin-top: 3px; }
.xp-caution { display: inline-flex; align-items: center; gap: 4px; font-size: 11px; font-weight: 600; color: #dc2626; margin-top: 4px; }
.xp-check { width: 46px; height: 46px; flex-shrink: 0; border-radius: 50%; border: 2px solid #d6d1ca; background: #fff; color: #d6d1ca; display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all .15s; }
.xp-check:hover { border-color: #16a34a; color: #16a34a; }
.xp-check.on { background: #16a34a; border-color: #16a34a; color: #fff; }
.xp-spin { width: 16px; height: 16px; border: 2px solid #d6d1ca; border-top-color: #2E8BC0; border-radius: 50%; animation: xpSpin .7s linear infinite; }
@keyframes xpSpin { to { transform: rotate(360deg); } }
.xp-note { margin-top: 10px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 12px; padding: 8px 12px; font-size: 13px; color: #78350f; line-height: 1.45; }
.xp-note b { display: block; font-size: 10.5px; text-transform: uppercase; letter-spacing: .08em; color: #92400e; margin-bottom: 2px; }
.xp-sb-done { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 13px; border-radius: 12px; border: none; background: #16a34a; color: #fff; font-family: inherit; font-size: 15px; font-weight: 700; cursor: pointer; }
.xp-sb-done.on { background: #f0fdf4; color: #166534; border: 1.5px solid #86efac; }
.xp-error { padding: 14px; background: #fff5f3; border: 1px solid #fecaca; border-radius: 12px; font-size: 13.5px; color: #b91c1c; margin-bottom: 14px; }
.xp-empty { text-align: center; padding: 50px 24px; }
.xp-empty-title { font-family: 'Playfair Display', serif; font-size: 20px; color: #1a1a1a; margin-bottom: 6px; }
.xp-empty-sub { font-size: 13.5px; color: #9a9590; }
.xp-skel { height: 94px; border-radius: 18px; background: linear-gradient(90deg, #f0ede8 0%, #e5e0d8 50%, #f0ede8 100%); background-size: 200% 100%; animation: xpShim 1.4s ease infinite; }
@keyframes xpShim { to { background-position: -200% 0; } }
@media (max-width: 420px) { .xp-media { width: 84px; } .xp-hero { padding: 16px; gap: 14px; } }
`;
