// FILE: src/features/patient/ExercisesPage.tsx
// Patient-facing exercise page.
// Loads from patientExercises where patientId == currentUser.uid (realtime).
// Two tabs: Clinic Exercises | Home Program (filtered by programType field).
// Checkbox writes completed + completedAt to Firestore via toggleExerciseCompletion.

import { useState, useEffect, useRef } from "react";
import { useAuth } from "../../hooks/useAuth";
import {
  subscribeToPatientExercises,
  resetDailyHomeExercises,
  toggleExerciseCompletion,
  type PatientExercise,
} from "../../services/exerciseService";
import type { PatientProfile } from "../../services/authService";
import { Check, Dumbbell, ChevronDown, Play } from "lucide-react";

// ─── Skeleton card ────────────────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="ep-card">
      <div className="ep-card-header">
        <div className="ep-skel ep-skel-title" />
        <div className="ep-skel ep-skel-badge" />
      </div>
      <div className="ep-skel ep-skel-line" style={{ marginBottom: 8 }} />
      <div className="ep-skel ep-skel-line" style={{ width: "70%" }} />
      <div className="ep-stats-grid" style={{ marginTop: 16 }}>
        {[1, 2, 3].map((n) => (
          <div key={n} className="ep-skel ep-skel-stat" />
        ))}
      </div>
    </div>
  );
}

// ─── Exercise card ────────────────────────────────────────────────────────────

function ExerciseCard({
  exercise,
  onToggle,
  toggling,
}: {
  exercise: PatientExercise;
  onToggle: (rec: PatientExercise) => void;
  toggling: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  // Issue 4 fix: always default completed to false
  const completed = exercise.completed ?? false;

  return (
    <div className={`ep-card ${completed ? "ep-card-done" : ""}`}>
      <div className="ep-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="ep-card-left">
          <div className="ep-card-icon">
            {completed
              ? <Check size={18} strokeWidth={2.5} color="#2E8BC0" />
              : <Dumbbell size={18} strokeWidth={1.8} color="#9a9590" />
            }
          </div>
          <div>
            {/* Issue 1: show exerciseName directly from patientExercises doc */}
            <div className="ep-card-name">{exercise.exerciseName}</div>
            <div className="ep-card-cat">
              {exercise.sets} sets · {exercise.reps} reps
              {(exercise.holdTime ?? 0) > 0 ? ` · ${exercise.holdTime}s hold` : ""}
            </div>
          </div>
        </div>
        <div className="ep-card-right">
          {completed && (
            <span className="ep-diff-badge" style={{ background: "#D6EEF8", color: "#0C3C60" }}>Done</span>
          )}
          <ChevronDown
            size={14} strokeWidth={2} color="#9a9590"
            style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", flexShrink: 0 }}
          />
        </div>
      </div>

      {/* Expanded content */}
      {expanded && (
        <div className="ep-card-body">

          <div className="ep-stats-grid">
            {[
              { label: "Sets",     value: exercise.sets },
              { label: "Reps",     value: exercise.reps },
              { label: "Hold (s)", value: (exercise.holdTime ?? 0) > 0 ? exercise.holdTime : "—" },
            ].map((s) => (
              <div key={s.label} className="ep-stat-box">
                <div className="ep-stat-val">{s.value}</div>
                <div className="ep-stat-label">{s.label}</div>
              </div>
            ))}
          </div>

          {exercise.notes && (
            <div className="ep-notes">
              <div className="ep-notes-label">Physio Notes</div>
              <div className="ep-notes-text">{exercise.notes}</div>
            </div>
          )}

          {exercise.mediaUrl && (
            <button
              className="ep-media-link"
              onClick={(e) => {
                e.stopPropagation();
                // Ensure URL has a protocol prefix
                const url = exercise.mediaUrl.startsWith("http")
                  ? exercise.mediaUrl
                  : `https://${exercise.mediaUrl}`;
                window.open(url, "_blank", "noopener,noreferrer");
              }}
            >
              <Play size={13} strokeWidth={2} />
              Watch Video
            </button>
          )}

          {/* Issue 3: checkbox writes to Firestore */}
          <button
            className={`ep-complete-btn ${completed ? "ep-complete-btn-done" : ""} ${toggling ? "ep-complete-btn-busy" : ""}`}
            disabled={toggling}
            onClick={(e) => { e.stopPropagation(); onToggle(exercise); }}
          >
            {toggling
              ? <><span className="ep-btn-spin" /> Saving…</>
              : completed
                ? <><Check size={14} strokeWidth={2.5} /> Completed — tap to undo</>
                : "☐ Mark as Complete"
            }
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function ExercisesPage() {
  const { user } = useAuth();
  const patient = user as PatientProfile | null;

  const [exercises,  setExercises]  = useState<PatientExercise[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  // Issue 2: Clinic / Home tab state
  const [activeTab,  setActiveTab]  = useState<"clinic" | "home">("clinic");
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const resetDoneRef = useRef(false);  // ensure daily reset only runs once per session

  // ── Issue 1: Realtime query on patientExercises collection ────────────────
  useEffect(() => {
    if (!patient?.uid) return;
    setLoading(true);
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

  // ── Issue 3 + 4: Toggle with safe null, writes to Firestore ──────────────
  const handleToggle = async (rec: PatientExercise) => {
    const currentCompleted = rec.completed ?? false;
    setTogglingId(rec.id);
    await toggleExerciseCompletion(rec.id, !currentCompleted);
    setTogglingId(null);
  };

  // ── Derived ───────────────────────────────────────────────────────────────
  // Issue 2: filter by programType (default "clinic" when field absent)
  const clinicExercises = exercises.filter((e) => (e.programType ?? "clinic") === "clinic");
  const homeExercises   = exercises.filter((e) => (e.programType ?? "clinic") === "home");
  const tabExercises    = activeTab === "clinic" ? clinicExercises : homeExercises;
  const completedCount  = exercises.filter((e) => e.completed ?? false).length;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Outfit:wght@300;400;500;600&display=swap');

        .ep-root { font-family: 'Outfit', sans-serif; }

        /* Header */
        .ep-header { margin-bottom: 16px; }
        .ep-title {
          font-family: 'Playfair Display', serif;
          font-size: 22px; font-weight: 500; color: #1a1a1a;
          letter-spacing: -0.02em; margin-bottom: 3px;
        }
        .ep-sub { font-size: 13px; color: #9a9590; }

        /* Progress ring row */
        .ep-progress-row {
          display: flex; align-items: center; gap: 14px;
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 14px; padding: 14px 16px;
          margin-bottom: 14px;
        }
        .ep-ring-wrap { position: relative; width: 64px; height: 64px; flex-shrink: 0; }
        .ep-ring-wrap svg { transform: rotate(-90deg); }
        .ep-ring-text {
          position: absolute; inset: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; font-weight: 700; color: #2E8BC0;
        }
        .ep-progress-info {}
        .ep-progress-label { font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 2px; }
        .ep-progress-sub   { font-size: 12.5px; color: #9a9590; }

        /* ── Program tabs (Issue 2) ── */
        .ep-prog-tabs {
          display: flex; gap: 4px;
          background: #f5f3ef; border-radius: 12px; padding: 4px;
          width: 100%; margin-bottom: 14px;
          border: 1px solid #e5e0d8;
        }
        .ep-prog-tab {
          flex: 1; padding: 10px 12px; border-radius: 9px; border: none;
          background: transparent; font-size: 13.5px; font-weight: 500;
          color: #9a9590; cursor: pointer; transition: all 0.15s;
          font-family: 'Outfit', sans-serif; display: flex; align-items: center; justify-content: center; gap: 5px;
          min-height: 44px;
        }
        .ep-prog-tab.active {
          background: #fff; color: #2E8BC0;
          box-shadow: 0 1px 6px rgba(0,0,0,0.07);
        }
        .ep-prog-tab-count {
          display: inline-flex; align-items: center; justify-content: center;
          min-width: 18px; height: 18px; border-radius: 9px; padding: 0 4px;
          font-size: 10px; font-weight: 700;
          background: #e5e0d8; color: #5a5550;
        }
        .ep-prog-tab.active .ep-prog-tab-count { background: #D6EEF8; color: #0C3C60; }

        /* Cards */
        .ep-list { display: flex; flex-direction: column; gap: 10px; }

        .ep-card {
          background: #fff; border: 1.5px solid #e5e0d8;
          border-radius: 14px; overflow: hidden;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .ep-card:hover { border-color: #B3DEF0; box-shadow: 0 2px 12px rgba(0,0,0,0.05); }
        .ep-card-done { border-color: #B3DEF0; background: #fafffe; }

        .ep-card-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 16px; cursor: pointer; gap: 12px;
        }
        .ep-card-left  { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; }
        .ep-card-icon  {
          width: 38px; height: 38px; border-radius: 10px;
          background: #f5f3ef; display: flex; align-items: center;
          justify-content: center; flex-shrink: 0;
        }
        .ep-card-name  { font-size: 15px; font-weight: 600; color: #1a1a1a; }
        .ep-card-cat   { font-size: 12px; color: #9a9590; margin-top: 1px; }
        .ep-card-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }

        .ep-diff-badge {
          padding: 3px 10px; border-radius: 100px;
          font-size: 12px; font-weight: 500; white-space: nowrap;
        }

        /* Expanded body */
        .ep-card-body { padding: 0 14px 14px; border-top: 1px solid #f5f3ef; }

        .ep-stats-grid {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 8px; margin: 12px 0;
        }
        .ep-stat-box {
          background: #f5f3ef; border-radius: 10px;
          padding: 12px; text-align: center;
        }
        .ep-stat-val   { font-size: 22px; font-weight: 700; color: #1a1a1a; line-height: 1; }
        .ep-stat-label { font-size: 11px; color: #9a9590; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.06em; }

        .ep-notes {
          background: #fffbeb; border: 1px solid #fde68a;
          border-radius: 10px; padding: 12px 14px; margin-bottom: 14px;
        }
        .ep-notes-label { font-size: 11px; font-weight: 600; color: #92400e; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 4px; }
        .ep-notes-text  { font-size: 13.5px; color: #78350f; line-height: 1.5; }

        .ep-media-link {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 13px; font-weight: 500; color: #5BC0BE;
          margin-bottom: 14px; text-decoration: none; transition: color 0.15s;
          background: none; border: none; cursor: pointer; padding: 0;
          font-family: 'Outfit', sans-serif;
        }
        .ep-media-link:hover { color: #2E8BC0; }

        /* Checkbox / complete button */
        .ep-complete-btn {
          width: 100%; padding: 13px;
          border-radius: 10px; border: 1.5px solid #e5e0d8;
          background: #fff; font-family: 'Outfit', sans-serif;
          font-size: 14px; font-weight: 500; color: #5a5550;
          cursor: pointer; transition: all 0.15s; min-height: 48px;
          display: flex; align-items: center; justify-content: center; gap: 7px;
        }
        .ep-complete-btn:hover:not(:disabled) { border-color: #5BC0BE; color: #2E8BC0; }
        .ep-complete-btn-done  { background: #D6EEF8; border-color: #B3DEF0; color: #0C3C60; }
        .ep-complete-btn-busy  { opacity: 0.7; cursor: not-allowed; }
        .ep-btn-spin {
          width: 13px; height: 13px; flex-shrink: 0;
          border: 2px solid rgba(46,139,192,0.3); border-top-color: #2E8BC0;
          border-radius: 50%; animation: epSpin 0.7s linear infinite; display: inline-block;
        }
        @keyframes epSpin { to { transform: rotate(360deg); } }

        /* Skeleton */
        .ep-skel {
          border-radius: 6px;
          background: linear-gradient(90deg, #f0ede8 0%, #e5e0d8 50%, #f0ede8 100%);
          background-size: 200% 100%; animation: epShimmer 1.4s ease infinite;
        }
        @keyframes epShimmer { to { background-position: -200% 0; } }
        .ep-skel-title { height: 18px; width: 180px; }
        .ep-skel-badge { height: 22px; width: 80px; border-radius: 100px; }
        .ep-skel-line  { height: 13px; width: 100%; }
        .ep-skel-stat  { height: 60px; border-radius: 10px; }

        /* Error */
        .ep-error {
          padding: 16px; background: #fff5f3;
          border: 1px solid #fecaca; border-radius: 12px;
          font-size: 13.5px; color: #b91c1c; margin-bottom: 16px;
        }

        /* Empty */
        .ep-empty { text-align: center; padding: 60px 24px; }
        .ep-empty-icon  { font-size: 40px; margin-bottom: 12px; }
        .ep-empty-title { font-family: 'Playfair Display', serif; font-size: 20px; color: #1a1a1a; margin-bottom: 6px; }
        .ep-empty-sub   { font-size: 13.5px; color: #9a9590; }
      `}</style>

      <div className="ep-root">

        {/* Header */}
        <div className="ep-header">
          <div className="ep-title">My Exercises</div>
          <div className="ep-sub">
            {loading
              ? "Loading your exercise programme…"
              : `${exercises.length} exercise${exercises.length !== 1 ? "s" : ""} assigned · ${completedCount} completed`}
          </div>
        </div>

        {/* Progress ring */}
        {!loading && exercises.length > 0 && (() => {
          const pct  = Math.round((completedCount / exercises.length) * 100);
          const r    = 26;
          const circ = 2 * Math.PI * r;
          const dash = (pct / 100) * circ;
          return (
            <div className="ep-progress-row">
              <div className="ep-ring-wrap">
                <svg width="64" height="64" viewBox="0 0 64 64">
                  <circle cx="32" cy="32" r={r} fill="none" stroke="#e5e0d8" strokeWidth="5" />
                  <circle cx="32" cy="32" r={r} fill="none" stroke="#2E8BC0" strokeWidth="5"
                    strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
                    style={{ transition: "stroke-dasharray 0.5s ease" }}
                  />
                </svg>
                <div className="ep-ring-text">{pct}%</div>
              </div>
              <div className="ep-progress-info">
                <div className="ep-progress-label">Today's Progress</div>
                <div className="ep-progress-sub">{completedCount} of {exercises.length} exercises completed</div>
              </div>
            </div>
          );
        })()}

        {/* Issue 2: Clinic / Home tabs */}
        {!loading && (
          <div className="ep-prog-tabs">
            <button
              className={`ep-prog-tab ${activeTab === "clinic" ? "active" : ""}`}
              onClick={() => setActiveTab("clinic")}
            >
              Clinic Exercises
              <span className="ep-prog-tab-count">{clinicExercises.length}</span>
            </button>
            <button
              className={`ep-prog-tab ${activeTab === "home" ? "active" : ""}`}
              onClick={() => setActiveTab("home")}
            >
              Home Program
              <span className="ep-prog-tab-count">{homeExercises.length}</span>
            </button>
          </div>
        )}

        {/* Error */}
        {error && <div className="ep-error">{error}</div>}

        {/* Content */}
        {loading ? (
          <div className="ep-list">
            {[1,2,3,4].map((n) => <SkeletonCard key={n} />)}
          </div>
        ) : tabExercises.length === 0 ? (
          <div className="ep-empty">
            <div className="ep-empty-icon">{exercises.length === 0 ? "🏋️" : activeTab === "home" ? "🏠" : "🏥"}</div>
            <div className="ep-empty-title">
              {exercises.length === 0
                ? "No exercises assigned yet"
                : activeTab === "home"
                  ? "No home program yet"
                  : "No clinic exercises yet"
              }
            </div>
            <div className="ep-empty-sub">
              {exercises.length === 0
                ? "Your physiotherapist hasn't assigned any exercises yet. Check back after your next session."
                : activeTab === "home"
                  ? "Your physiotherapist hasn't assigned any home exercises yet."
                  : "No exercises assigned for clinic sessions yet."
              }
            </div>
          </div>
        ) : (
          <div className="ep-list">
            {tabExercises.map((ex) => (
              <ExerciseCard
                key={ex.id}
                exercise={ex}
                onToggle={handleToggle}
                toggling={togglingId === ex.id}
              />
            ))}
          </div>
        )}

      </div>
    </>
  );
}
