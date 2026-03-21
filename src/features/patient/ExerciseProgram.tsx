// FILE: src/features/patient/ExerciseProgram.tsx
// Rendered as a tab section inside PatientSheetPage.
// Shows all exercises assigned to a patient, with:
//   - Checklist (any physio can complete; completion saved to Firestore)
//   - "Add Exercise" button (manager + senior physio only)
//   - "Remove" button (manager + senior physio only)
//   - Media link per exercise
// CSS prefix: ep-  (exercise program — no collision with ps- classes)

import { useState, useEffect } from "react";
import {
  subscribeToPatientExercises,
  subscribeToExerciseLibrary,
  assignExerciseToPatient,
  toggleExerciseCompletion,
  removePatientExercise,
  updatePatientExercise,
  type PatientExercise,
  type LibraryExercise,
} from "../../services/exerciseService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExerciseProgramProps {
  patientId:   string;
  /** uid of the currently logged-in user (physio/manager/patient) */
  viewerUid:   string;
  /** role of the viewer */
  viewerRole:  "clinic_manager" | "physiotherapist" | "patient";
  /** true when this physio is the patient's assigned senior editor */
  isSenior:    boolean;
}

// ─── Permission helpers ───────────────────────────────────────────────────────
//   clinic_manager   → full control: can add, edit, remove
//   senior physio    → can add, remove  (isSenior flag set by parent)
//   any physio       → can toggle completion
//   patient          → view only

function canEditProgram(role: string, isSenior: boolean) {
  return role === "clinic_manager" || (role === "physiotherapist" && isSenior);
}
function canComplete(role: string) {
  return role === "clinic_manager" || role === "physiotherapist" || role === "patient";
}

// ─── Library picker modal ─────────────────────────────────────────────────────

interface LibraryPickerProps {
  patientId:  string;
  viewerUid:  string;
  onClose:    () => void;
  onAdded:    (name: string) => void;
}

function LibraryPicker({ patientId, viewerUid, onClose, onAdded }: LibraryPickerProps) {
  const [exercises,    setExercises]    = useState<LibraryExercise[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [search,       setSearch]       = useState("");
  const [adding,       setAdding]       = useState<string | null>(null);
  const [error,        setError]        = useState<string | null>(null);
  const [programType,  setProgramType]  = useState<"clinic" | "home">("clinic");

  useEffect(() => {
    setLoading(true);
    return subscribeToExerciseLibrary(
      (data) => { setExercises(data); setLoading(false); },
      ()     => setLoading(false)
    );
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const filtered = exercises.filter((ex) =>
    ex.name.toLowerCase().includes(search.toLowerCase()) ||
    ex.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async (ex: LibraryExercise) => {
    setAdding(ex.id);
    setError(null);
    const result = await assignExerciseToPatient({
      patientId,
      exerciseId:   ex.id,
      exerciseName: ex.name,
      sets:         ex.defaultSets,
      reps:         ex.defaultReps,
      holdTime:     ex.defaultHoldTime,
      notes:        ex.notes,
      createdBy:    viewerUid,
      mediaUrl:     ex.mediaUrl,
      programType,
    });
    setAdding(null);
    if ("error" in result && result.error) { setError(result.error); return; }
    onAdded(ex.name);
  };

  return (
    <div className="ep-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="ep-picker-modal" role="dialog" aria-modal="true">

        <div className="ep-picker-hd">
          <div>
            <div className="ep-picker-badge">
              {programType === "home" ? "Home Program" : "Clinic Program"}
            </div>
            <div className="ep-picker-title">Select an Exercise</div>
          </div>
          <button className="ep-close-btn" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        {/* Program type selector */}
        <div className="ep-prog-toggle-wrap">
          <button
            className={`ep-prog-toggle-btn${programType === "clinic" ? " active" : ""}`}
            onClick={() => setProgramType("clinic")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            Clinic Program
          </button>
          <button
            className={`ep-prog-toggle-btn home${programType === "home" ? " active home" : ""}`}
            onClick={() => setProgramType("home")}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
            </svg>
            Home Program
          </button>
        </div>

        <div className="ep-picker-search-wrap">
          <input
            className="ep-picker-search"
            placeholder="Search exercises…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            autoFocus
          />
        </div>

        {error && <div className="ep-error-box" style={{ margin: "0 20px" }}>{error}</div>}

        <div className="ep-picker-list">
          {loading && Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="ep-picker-skel" />
          ))}

          {!loading && filtered.length === 0 && (
            <div className="ep-picker-empty">
              {exercises.length === 0
                ? "Exercise library is empty. Add exercises from the Exercise Library tab first."
                : `No exercises match "${search}"`
              }
            </div>
          )}

          {!loading && filtered.map((ex) => (
            <div key={ex.id} className="ep-picker-row">
              <div className="ep-picker-info">
                <div className="ep-picker-name">{ex.name}</div>
                <div className="ep-picker-meta">
                  {ex.category && <span className="ep-picker-cat">{ex.category}</span>}
                  <span>{ex.defaultSets} sets · {ex.defaultReps} reps{ex.defaultHoldTime > 0 ? ` · ${ex.defaultHoldTime}s hold` : ""}</span>
                </div>
              </div>
              <button
                className="ep-picker-add-btn"
                disabled={adding === ex.id}
                onClick={() => handleAdd(ex)}
                title={`Add to ${programType === "home" ? "Home" : "Clinic"} Program`}
              >
                {adding === ex.id
                  ? <span className="ep-mini-spin" />
                  : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                }
                {adding === ex.id ? "Adding…" : "Add"}
              </button>
            </div>
          ))}
        </div>

        <div className="ep-picker-ft">
          <button className="ep-btn-cancel" onClick={onClose}>Done</button>
        </div>

      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function ExerciseProgram({
  patientId,
  viewerUid,
  viewerRole,
  isSenior,
}: ExerciseProgramProps) {
  const [exercises,    setExercises]    = useState<PatientExercise[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [showPicker,   setShowPicker]   = useState(false);
  const [togglingId,   setTogglingId]   = useState<string | null>(null);
  const [removingId,   setRemovingId]   = useState<string | null>(null);
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [editVals,     setEditVals]     = useState<{ sets: string; reps: string; holdTime: string; notes: string }>({ sets: "", reps: "", holdTime: "", notes: "" });
  const [editSaving,   setEditSaving]   = useState(false);
  const [editError,    setEditError]    = useState<string | null>(null);
  const [toast,        setToast]        = useState<string | null>(null);

  const canEdit     = canEditProgram(viewerRole, isSenior);
  const canComplete_ = canComplete(viewerRole);

  // Realtime subscription
  useEffect(() => {
    setLoading(true);
    return subscribeToPatientExercises(
      patientId,
      (data) => { setExercises(data); setLoading(false); },
      ()     => setLoading(false)
    );
  }, [patientId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const handleToggle = async (rec: PatientExercise) => {
    if (!canComplete_) return;
    const currentCompleted = rec.completed ?? false;
    setTogglingId(rec.id);
    await toggleExerciseCompletion(rec.id, !currentCompleted);
    setTogglingId(null);
  };

  const handleEditOpen = (rec: PatientExercise) => {
    setEditingId(rec.id);
    setEditVals({
      sets:     String(rec.sets),
      reps:     String(rec.reps),
      holdTime: String(rec.holdTime ?? 0),
      notes:    rec.notes ?? "",
    });
    setEditError(null);
  };

  const handleSaveEdit = async (rec: PatientExercise) => {
    setEditSaving(true); setEditError(null);
    const result = await updatePatientExercise(rec.id, {
      sets:     Math.max(1, parseInt(editVals.sets)     || rec.sets),
      reps:     Math.max(1, parseInt(editVals.reps)     || rec.reps),
      holdTime: Math.max(0, parseInt(editVals.holdTime) || 0),
      notes:    editVals.notes.trim(),
    });
    setEditSaving(false);
    if (result.error) { setEditError(result.error); return; }
    setEditingId(null);
  };

  const handleRemove = async (rec: PatientExercise) => {
    if (!canEdit) return;
    if (!window.confirm(`Remove "${rec.exerciseName}" from this patient's program?`)) return;
    setRemovingId(rec.id);
    const result = await removePatientExercise(rec.id);
    setRemovingId(null);
    if (result.error) { showToast("Error: " + result.error); return; }
    showToast(`"${rec.exerciseName}" removed`);
  };

  const completedCount = exercises.filter((e) => e.completed).length;
  const totalCount     = exercises.length;

  return (
    <>
      <style>{`
        .ep-root { font-family: 'Outfit', sans-serif; }

        /* ── Section header ── */
        .ep-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 16px; flex-wrap: wrap; gap: 10px;
        }
        .ep-header-left {}
        .ep-prog-title { font-size: 15px; font-weight: 600; color: #1a1a1a; }
        .ep-prog-sub {
          font-size: 12.5px; color: #9a9590; margin-top: 2px;
        }
        .ep-add-ex-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 9px;
          border: 1.5px solid #B3DEF0; background: #EAF5FC;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          color: #2E8BC0; cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .ep-add-ex-btn:hover { background: #D6EEF8; border-color: #2E8BC0; }

        /* ── Progress bar ── */
        .ep-progress-wrap { margin-bottom: 18px; }
        .ep-progress-label {
          display: flex; justify-content: space-between;
          font-size: 12px; color: #9a9590; margin-bottom: 6px;
        }
        .ep-progress-track {
          height: 6px; background: #f0ede8; border-radius: 100px; overflow: hidden;
        }
        .ep-progress-fill {
          height: 100%; background: linear-gradient(90deg, #2E8BC0, #5BC0BE);
          border-radius: 100px; transition: width 0.4s;
        }

        /* ── Exercise cards ── */
        .ep-list { display: flex; flex-direction: column; gap: 10px; }

        .ep-ex-card {
          background: #fff; border: 1.5px solid #e5e0d8; border-radius: 14px;
          padding: 14px 16px; display: flex; align-items: flex-start; gap: 12px;
          transition: border-color 0.15s;
        }
        .ep-ex-card.completed { border-color: #B3DEF0; background: #EAF5FC; }

        /* Checkbox */
        .ep-checkbox-wrap { padding-top: 2px; flex-shrink: 0; }
        .ep-checkbox {
          width: 20px; height: 20px; border-radius: 6px;
          border: 2px solid #e5e0d8; background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.15s; flex-shrink: 0;
        }
        .ep-checkbox.checked { background: #2E8BC0; border-color: #2E8BC0; }
        .ep-checkbox.disabled { cursor: not-allowed; opacity: 0.5; }
        .ep-checkbox.toggling { opacity: 0.6; cursor: wait; }

        /* Card body */
        .ep-ex-body { flex: 1; min-width: 0; }
        .ep-ex-name {
          font-size: 14.5px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px;
        }
        .ep-ex-card.completed .ep-ex-name {
          text-decoration: line-through; color: #9a9590;
        }
        .ep-ex-params {
          display: flex; gap: 12px; flex-wrap: wrap;
          font-size: 12.5px; color: #9a9590; margin-bottom: 6px;
        }
        .ep-ex-param-val { font-weight: 600; color: #1a1a1a; }
        .ep-ex-notes {
          font-size: 13px; color: #5a5550;
          background: #fafaf8; border-radius: 8px; padding: 6px 10px;
          margin-top: 4px; margin-bottom: 4px;
        }

        /* Media + actions row */
        .ep-ex-footer {
          display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 6px;
        }
        .ep-watch-btn {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 12px; font-weight: 500; color: #5BC0BE;
          background: none; border: none; cursor: pointer;
          font-family: 'Outfit', sans-serif; padding: 0;
          transition: color 0.15s;
        }
        .ep-watch-btn:hover { color: #2E8BC0; }
        .ep-completed-tag {
          display: inline-flex; align-items: center; gap: 4px;
          font-size: 11.5px; font-weight: 600; color: #2E8BC0;
          background: #D6EEF8; padding: 2px 8px; border-radius: 100px;
        }
        .ep-edit-btn {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px; border-radius: 7px; border: 1.5px solid #B3DEF0;
          background: #EAF5FC; font-size: 11.5px; font-weight: 500;
          color: #2E8BC0; cursor: pointer; transition: all 0.15s;
          font-family: 'Outfit', sans-serif;
        }
        .ep-edit-btn:hover { background: #D6EEF8; }
        .ep-inline-edit {
          margin-top: 10px; padding: 12px;
          background: #f5f3ef; border-radius: 10px;
          display: flex; flex-direction: column; gap: 8px;
        }
        .ep-edit-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; }
        .ep-edit-field { display: flex; flex-direction: column; gap: 3px; }
        .ep-edit-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #9a9590; }
        .ep-edit-input {
          padding: 6px 9px; border-radius: 7px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 13px; color: #1a1a1a;
          outline: none; width: 100%;
        }
        .ep-edit-input:focus { border-color: #2E8BC0; }
        .ep-edit-actions { display: flex; gap: 7px; }
        .ep-edit-save {
          padding: 6px 14px; border-radius: 8px; border: none;
          background: #2E8BC0; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 12.5px; font-weight: 500;
          cursor: pointer; transition: background 0.15s;
          display: flex; align-items: center; gap: 5px;
        }
        .ep-edit-save:hover:not(:disabled) { background: #0C3C60; }
        .ep-edit-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .ep-edit-cancel {
          padding: 6px 12px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 12.5px;
          color: #5a5550; cursor: pointer;
        }
        .ep-remove-btn {
          margin-left: auto;
          display: inline-flex; align-items: center; gap: 4px;
          padding: 4px 10px; border-radius: 7px;
          border: 1.5px solid #e5e0d8; background: transparent;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500;
          color: #c0bbb4; cursor: pointer; transition: all 0.15s;
        }
        .ep-remove-btn:hover:not(:disabled) { border-color: #fca5a5; color: #b91c1c; }
        .ep-remove-btn:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Empty state */
        .ep-empty {
          text-align: center; padding: 44px 24px;
          background: #fafaf8; border-radius: 14px;
          border: 1.5px dashed #e5e0d8;
        }
        .ep-empty-icon { font-size: 28px; margin-bottom: 8px; }
        .ep-empty-title { font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 4px; }
        .ep-empty-sub { font-size: 13px; color: #9a9590; }

        /* Skeleton */
        .ep-skel {
          height: 70px; border-radius: 14px;
          background: linear-gradient(90deg, #f0ede8 0%, #e5e0d8 50%, #f0ede8 100%);
          background-size: 200% 100%;
          animation: epShimmer 1.4s ease infinite;
        }
        @keyframes epShimmer { to { background-position: -200% 0; } }

        /* ── Library picker overlay ── */
        .ep-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(10,15,10,0.55); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 24px; animation: epFadeIn 0.2s ease both;
        }
        @keyframes epFadeIn { from { opacity:0; } to { opacity:1; } }

        .ep-picker-modal {
          background: #fff; border-radius: 22px;
          width: 100%; max-width: 480px; max-height: 85vh;
          overflow: hidden; display: flex; flex-direction: column;
          box-shadow: 0 24px 80px rgba(0,0,0,0.18);
          animation: epModalIn 0.25s cubic-bezier(0.16,1,0.3,1) both;
          font-family: 'Outfit', sans-serif;
        }
        @keyframes epModalIn {
          from { opacity:0; transform: scale(0.94) translateY(14px); }
          to   { opacity:1; transform: scale(1)    translateY(0); }
        }

        .ep-picker-hd {
          padding: 20px 20px 0;
          display: flex; align-items: flex-start; justify-content: space-between;
          flex-shrink: 0;
        }
        .ep-picker-badge {
          font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.07em; color: #2E8BC0; margin-bottom: 3px;
        }
        .ep-picker-title {
          font-family: 'Playfair Display', serif;
          font-size: 20px; font-weight: 500; color: #1a1a1a; letter-spacing: -0.02em;
        }
        .ep-close-btn {
          width: 30px; height: 30px; border-radius: 50%;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #9a9590; transition: all 0.15s; flex-shrink: 0;
        }
        .ep-close-btn:hover { background: #f0ede8; color: #1a1a1a; }

        /* Program type toggle inside picker */
        .ep-prog-toggle-wrap {
          padding: 10px 20px 0; flex-shrink: 0;
          display: flex; gap: 6px;
        }
        .ep-prog-toggle-btn {
          flex: 1; padding: 8px 10px; border-radius: 9px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          color: #9a9590; cursor: pointer; transition: all 0.15s;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .ep-prog-toggle-btn:hover { border-color: #B3DEF0; color: #2E8BC0; background: #EAF5FC; }
        .ep-prog-toggle-btn.active { background: #2E8BC0; border-color: #2E8BC0; color: #fff; }
        .ep-prog-toggle-btn.active.home { background: #5BC0BE; border-color: #5BC0BE; }

        .ep-picker-search-wrap { padding: 10px 20px 8px; flex-shrink: 0; }
        .ep-picker-search {
          font-family: 'Outfit', sans-serif;
          width: 100%; padding: 9px 12px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-size: 14px; color: #1a1a1a; outline: none; transition: border-color 0.15s;
        }
        .ep-picker-search:focus { border-color: #2E8BC0; background: #fff; box-shadow: 0 0 0 3px rgba(46,139,192,0.08); }

        .ep-picker-list {
          flex: 1; overflow-y: auto; padding: 6px 20px;
          display: flex; flex-direction: column; gap: 6px;
        }
        .ep-picker-skel {
          height: 56px; border-radius: 10px;
          background: linear-gradient(90deg, #f0ede8 0%, #e5e0d8 50%, #f0ede8 100%);
          background-size: 200% 100%; animation: epShimmer 1.4s ease infinite;
        }
        .ep-picker-empty {
          text-align: center; padding: 28px 16px;
          font-size: 13.5px; color: #9a9590;
        }
        .ep-picker-row {
          display: flex; align-items: center; justify-content: space-between;
          gap: 12px; padding: 10px 12px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          transition: border-color 0.12s;
        }
        .ep-picker-row:hover { border-color: #B3DEF0; background: #EAF5FC; }
        .ep-picker-info { flex: 1; min-width: 0; }
        .ep-picker-name { font-size: 14px; font-weight: 500; color: #1a1a1a; }
        .ep-picker-meta {
          display: flex; gap: 8px; flex-wrap: wrap;
          font-size: 12px; color: #9a9590; margin-top: 2px;
        }
        .ep-picker-cat {
          background: #D6EEF8; color: #0C3C60;
          padding: 1px 7px; border-radius: 100px;
          font-size: 11px; font-weight: 600;
        }
        .ep-picker-add-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 12px; border-radius: 8px;
          border: 1.5px solid #B3DEF0; background: #EAF5FC;
          font-family: 'Outfit', sans-serif; font-size: 12.5px; font-weight: 500;
          color: #2E8BC0; cursor: pointer; transition: all 0.15s; flex-shrink: 0;
        }
        .ep-picker-add-btn:hover:not(:disabled) { background: #D6EEF8; border-color: #2E8BC0; }
        .ep-picker-add-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .ep-picker-ft {
          padding: 12px 20px 18px; flex-shrink: 0; border-top: 1px solid #f0ede8;
        }
        .ep-btn-cancel {
          padding: 9px 20px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          color: #5a5550; cursor: pointer; transition: background 0.15s;
        }
        .ep-btn-cancel:hover { background: #f5f3ef; }

        /* Misc */
        .ep-error-box {
          background: #fee2e2; border: 1px solid #fca5a5; border-radius: 10px;
          padding: 10px 14px; font-size: 13.5px; color: #b91c1c; margin-bottom: 8px;
        }
        .ep-mini-spin {
          width: 12px; height: 12px;
          border: 2px solid rgba(46,139,192,0.3); border-top-color: #2E8BC0;
          border-radius: 50%; animation: epSpin 0.7s linear infinite; display: block;
        }
        @keyframes epSpin { to { transform: rotate(360deg); } }

        /* Toast */
        .ep-toast {
          position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
          background: #0C3C60; color: #fff; padding: 12px 22px; border-radius: 12px;
          font-size: 14px; font-weight: 500; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          z-index: 2000; white-space: nowrap;
          animation: epToastIn 0.3s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes epToastIn {
          from { opacity:0; transform: translateX(-50%) translateY(12px); }
          to   { opacity:1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <div className="ep-root">

        {/* Section header */}
        <div className="ep-header">
          <div className="ep-header-left">
            <div className="ep-prog-title">Exercise Program</div>
            {!loading && (
              <div className="ep-prog-sub">
                {totalCount === 0
                  ? "No exercises assigned yet"
                  : `${completedCount} of ${totalCount} completed`
                }
              </div>
            )}
          </div>
          {canEdit && (
            <button className="ep-add-ex-btn" onClick={() => setShowPicker(true)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Exercise
            </button>
          )}
        </div>

        {/* Completion progress bar */}
        {!loading && totalCount > 0 && (
          <div className="ep-progress-wrap">
            <div className="ep-progress-label">
              <span>Completion</span>
              <span>{Math.round((completedCount / totalCount) * 100)}%</span>
            </div>
            <div className="ep-progress-track">
              <div
                className="ep-progress-fill"
                style={{ width: `${(completedCount / totalCount) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Exercise list */}
        <div className="ep-list">
          {loading
            ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="ep-skel" />)
            : totalCount === 0
              ? (
                <div className="ep-empty">
                  <div className="ep-empty-icon">🏃</div>
                  <div className="ep-empty-title">No exercises yet</div>
                  <div className="ep-empty-sub">
                    {canEdit
                      ? 'Click "Add Exercise" to assign exercises from the library.'
                      : "No exercises have been assigned to this patient yet."
                    }
                  </div>
                </div>
              )
              : exercises.map((rec) => (
                <div key={rec.id} className={`ep-ex-card ${(rec.completed ?? false) ? "completed" : ""}`}>

                  {/* Checkbox */}
                  <div className="ep-checkbox-wrap">
                    <div
                      className={`ep-checkbox ${(rec.completed ?? false) ? "checked" : ""} ${!canComplete_ ? "disabled" : ""} ${togglingId === rec.id ? "toggling" : ""}`}
                      onClick={() => togglingId === rec.id ? undefined : handleToggle(rec)}
                      title={
                        !canComplete_
                          ? "Only physiotherapists can mark exercises"
                          : (rec.completed ?? false) ? "Mark as incomplete" : "Mark as completed"
                      }
                    >
                      {(rec.completed ?? false) && (
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      )}
                    </div>
                  </div>

                  {/* Body */}
                  <div className="ep-ex-body">
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                      <div className="ep-ex-name" style={{ marginBottom: 0 }}>{rec.exerciseName}</div>
                      <span style={{
                        fontSize: 10, fontWeight: 700, padding: "1px 7px",
                        borderRadius: 100, textTransform: "uppercase", letterSpacing: "0.06em",
                        background: rec.programType === "home" ? "#d1fae5" : "#D6EEF8",
                        color: rec.programType === "home" ? "#065f46" : "#0C3C60",
                        flexShrink: 0,
                      }}>
                        {rec.programType === "home" ? "Home" : "Clinic"}
                      </span>
                    </div>

                    <div className="ep-ex-params">
                      <span><span className="ep-ex-param-val">{rec.sets}</span> sets</span>
                      <span><span className="ep-ex-param-val">{rec.reps}</span> reps</span>
                      {rec.holdTime > 0 && (
                        <span><span className="ep-ex-param-val">{rec.holdTime}s</span> hold</span>
                      )}
                    </div>

                    {rec.notes && (
                      <div className="ep-ex-notes">{rec.notes}</div>
                    )}

                    <div className="ep-ex-footer">
                      {rec.mediaUrl && (
                        <button
                          className="ep-watch-btn"
                          onClick={() => window.open(rec.mediaUrl, "_blank", "noopener,noreferrer")}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polygon points="5 3 19 12 5 21 5 3"/>
                          </svg>
                          Watch Video
                        </button>
                      )}

                      {(rec.completed ?? false) && (
                        <span className="ep-completed-tag">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="20 6 9 17 4 12"/>
                          </svg>
                          Completed
                        </span>
                      )}

                      {canEdit && editingId !== rec.id && (
                        <button className="ep-edit-btn" onClick={() => handleEditOpen(rec)}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                          Edit
                        </button>
                      )}
                      {canEdit && (
                        <button
                          className="ep-remove-btn"
                          disabled={removingId === rec.id}
                          onClick={() => handleRemove(rec)}
                        >
                          {removingId === rec.id
                            ? "Removing…"
                            : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                              </svg> Remove</>
                          }
                        </button>
                      )}
                    </div>
                    {canEdit && editingId === rec.id && (
                      <div className="ep-inline-edit">
                        <div className="ep-edit-row">
                          <div className="ep-edit-field">
                            <label className="ep-edit-label">Sets</label>
                            <input className="ep-edit-input" type="number" min="1"
                              value={editVals.sets}
                              onChange={(e) => setEditVals({ ...editVals, sets: e.target.value })} />
                          </div>
                          <div className="ep-edit-field">
                            <label className="ep-edit-label">Reps</label>
                            <input className="ep-edit-input" type="number" min="1"
                              value={editVals.reps}
                              onChange={(e) => setEditVals({ ...editVals, reps: e.target.value })} />
                          </div>
                          <div className="ep-edit-field">
                            <label className="ep-edit-label">Hold (s)</label>
                            <input className="ep-edit-input" type="number" min="0"
                              value={editVals.holdTime}
                              onChange={(e) => setEditVals({ ...editVals, holdTime: e.target.value })} />
                          </div>
                        </div>
                        <div className="ep-edit-field">
                          <label className="ep-edit-label">Notes</label>
                          <input className="ep-edit-input"
                            value={editVals.notes} placeholder="Physio notes…"
                            onChange={(e) => setEditVals({ ...editVals, notes: e.target.value })} />
                        </div>
                        {editError && <div style={{ fontSize: 12, color: "#b91c1c" }}>{editError}</div>}
                        <div className="ep-edit-actions">
                          <button className="ep-edit-save" disabled={editSaving} onClick={() => handleSaveEdit(rec)}>
                            {editSaving
                              ? "Saving…"
                              : <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Save</>
                            }
                          </button>
                          <button className="ep-edit-cancel" onClick={() => { setEditingId(null); setEditError(null); }}>Cancel</button>
                        </div>
                      </div>
                    )}
                  </div>

                </div>
              ))
          }
        </div>
      </div>

      {/* Library picker modal */}
      {showPicker && (
        <LibraryPicker
          patientId={patientId}
          viewerUid={viewerUid}
          onClose={() => setShowPicker(false)}
          onAdded={(name) => {
            setShowPicker(false);
            showToast(`✓ "${name}" added to exercise program`);
          }}
        />
      )}

      {toast && <div className="ep-toast">{toast}</div>}
    </>
  );
}
