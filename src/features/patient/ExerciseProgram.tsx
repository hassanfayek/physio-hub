// FILE: src/features/patient/ExerciseProgram.tsx
// Rendered as a tab section inside PatientSheetPage.
// Shows all exercises assigned to a patient, with:
//   - Checklist (any physio can complete; completion saved to Firestore)
//   - "Add Exercise" button (manager + senior physio only)
//   - "Remove" button (manager + senior physio only)
//   - Media link per exercise
// CSS prefix: ep-  (exercise program — no collision with ps- classes)

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { X, Home, Heart, Plus, Check, Pencil, Trash2, Play } from "lucide-react";
import {
  subscribeToPatientExercises,
  subscribeToExerciseLibrary,
  assignExerciseToPatient,
  toggleExerciseCompletion,
  resetDailyHomeExercises,
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
  const [addedIds,     setAddedIds]     = useState<Set<string>>(new Set());
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
      videoId:      ex.videoId,
      programType,
    });
    setAdding(null);
    if ("error" in result && result.error) { setError(result.error); return; }
    setAddedIds((prev) => new Set(prev).add(ex.id));
    onAdded(ex.name);
  };

  return createPortal(
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
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        {/* Program type selector */}
        <div className="ep-prog-toggle-wrap">
          <button
            className={`ep-prog-toggle-btn${programType === "clinic" ? " active" : ""}`}
            onClick={() => setProgramType("clinic")}
          >
            <Home size={13} strokeWidth={2} />
            Clinic Program
          </button>
          <button
            className={`ep-prog-toggle-btn home${programType === "home" ? " active home" : ""}`}
            onClick={() => setProgramType("home")}
          >
            <Heart size={13} strokeWidth={2} />
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
                className={`ep-picker-add-btn${addedIds.has(ex.id) ? " added" : ""}`}
                disabled={adding === ex.id}
                onClick={() => handleAdd(ex)}
                title={`Add to ${programType === "home" ? "Home" : "Clinic"} Program`}
              >
                {adding === ex.id
                  ? <><span className="ep-mini-spin" /> Adding…</>
                  : addedIds.has(ex.id)
                    ? <><Check size={13} strokeWidth={2.5} /> Added</>
                    : <><Plus size={13} strokeWidth={2.5} /> Add</>
                }
              </button>
            </div>
          ))}
        </div>

        <div className="ep-picker-ft">
          <button className="ep-btn-cancel" onClick={onClose}>Done</button>
        </div>

      </div>
    </div>,
    document.body
  );
}

// ─── Exercise card (shared between patient flat list and physio sectioned view) ─

interface ExerciseCardProps {
  rec:          PatientExercise;
  viewerRole:   string;
  canEdit:      boolean;
  canComplete_: boolean;
  togglingId:   string | null;
  editingId:    string | null;
  editVals:     { sets: string; reps: string; holdTime: string; notes: string; programType: "clinic" | "home" };
  editSaving:   boolean;
  editError:    string | null;
  removingId:   string | null;
  onToggle:     (rec: PatientExercise) => void;
  onEditOpen:   (rec: PatientExercise) => void;
  onSaveEdit:   (rec: PatientExercise) => void;
  onRemove:     (rec: PatientExercise) => void;
  onSetEditVals: (v: { sets: string; reps: string; holdTime: string; notes: string; programType: "clinic" | "home" }) => void;
  onCancelEdit: () => void;
}

function ExerciseCard({
  rec, viewerRole, canEdit, canComplete_, togglingId, editingId,
  editVals, editSaving, editError, removingId,
  onToggle, onEditOpen, onSaveEdit, onRemove, onSetEditVals, onCancelEdit,
}: ExerciseCardProps) {
  const isClinicPatient = viewerRole === "patient" && (rec.programType ?? "clinic") === "clinic";
  const isDisabled = !canComplete_ || isClinicPatient;
  const checkTitle = !canComplete_
    ? "Only physiotherapists can mark exercises"
    : isClinicPatient
      ? "Clinic exercises are marked by your physiotherapist"
      : (rec.completed ?? false) ? "Mark as incomplete" : "Mark as completed";

  return (
    <div className={`ep-ex-card ${(rec.completed ?? false) ? "completed" : ""}`}>

      {/* Checkbox */}
      <div className="ep-checkbox-wrap">
        <div
          className={`ep-checkbox ${(rec.completed ?? false) ? "checked" : ""} ${isDisabled ? "disabled" : ""} ${togglingId === rec.id ? "toggling" : ""}`}
          onClick={() => togglingId === rec.id ? undefined : onToggle(rec)}
          title={checkTitle}
        >
          {(rec.completed ?? false) && <Check size={11} strokeWidth={3} color="#fff" />}
        </div>
      </div>

      {/* Body */}
      <div className="ep-ex-body">
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
          <div className="ep-ex-name" style={{ marginBottom: 0 }}>{rec.exerciseName}</div>
          {/* Only show badge in patient view (physio view uses section headers instead) */}
          {viewerRole === "patient" && (
            <span style={{
              fontSize: 10, fontWeight: 700, padding: "1px 7px",
              borderRadius: 100, textTransform: "uppercase", letterSpacing: "0.06em",
              background: rec.programType === "home" ? "#d1fae5" : "#D6EEF8",
              color: rec.programType === "home" ? "#065f46" : "#0C3C60",
              flexShrink: 0,
            }}>
              {rec.programType === "home" ? "Home" : "Clinic"}
            </span>
          )}
        </div>

        <div className="ep-ex-params">
          <span><span className="ep-ex-param-val">{rec.sets}</span> sets</span>
          <span><span className="ep-ex-param-val">{rec.reps}</span> reps</span>
          {rec.holdTime > 0 && (
            <span><span className="ep-ex-param-val">{rec.holdTime}s</span> hold</span>
          )}
        </div>

        {rec.notes && <div className="ep-ex-notes">{rec.notes}</div>}

        {rec.videoId && (
          <div className="ep-video-wrap">
            <iframe
              src={`https://www.youtube.com/embed/${rec.videoId}`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        )}

        <div className="ep-ex-footer">
          {!rec.videoId && rec.mediaUrl && (
            <button className="ep-watch-btn" onClick={() => window.open(rec.mediaUrl, "_blank", "noopener,noreferrer")}>
              <Play size={12} strokeWidth={2} /> Watch Video
            </button>
          )}
          {(rec.completed ?? false) && (
            <span className="ep-completed-tag">
              <Check size={10} strokeWidth={2.5} /> Completed
            </span>
          )}
          {canEdit && editingId !== rec.id && (
            <button className="ep-edit-btn" onClick={() => onEditOpen(rec)}>
              <Pencil size={10} strokeWidth={2.5} /> Edit
            </button>
          )}
          {canEdit && (
            <button className="ep-remove-btn" disabled={removingId === rec.id} onClick={() => onRemove(rec)}>
              {removingId === rec.id ? "Removing…" : <><Trash2 size={11} strokeWidth={2} /> Remove</>}
            </button>
          )}
        </div>

        {canEdit && editingId === rec.id && (
          <div className="ep-inline-edit">
            {/* Program type toggle */}
            <div className="ep-edit-field">
              <label className="ep-edit-label">Program Type</label>
              <div style={{ display: "flex", gap: 6 }}>
                <button
                  type="button"
                  onClick={() => onSetEditVals({ ...editVals, programType: "clinic" })}
                  style={{
                    flex: 1, padding: "6px 10px", borderRadius: 7, border: "1.5px solid",
                    fontFamily: "'Outfit', sans-serif", fontSize: 12.5, fontWeight: 500,
                    cursor: "pointer", transition: "all 0.15s",
                    borderColor: editVals.programType === "clinic" ? "#2E8BC0" : "#e5e0d8",
                    background: editVals.programType === "clinic" ? "#2E8BC0" : "#fff",
                    color: editVals.programType === "clinic" ? "#fff" : "#9a9590",
                  }}
                >🏥 Clinic</button>
                <button
                  type="button"
                  onClick={() => onSetEditVals({ ...editVals, programType: "home" })}
                  style={{
                    flex: 1, padding: "6px 10px", borderRadius: 7, border: "1.5px solid",
                    fontFamily: "'Outfit', sans-serif", fontSize: 12.5, fontWeight: 500,
                    cursor: "pointer", transition: "all 0.15s",
                    borderColor: editVals.programType === "home" ? "#059669" : "#e5e0d8",
                    background: editVals.programType === "home" ? "#059669" : "#fff",
                    color: editVals.programType === "home" ? "#fff" : "#9a9590",
                  }}
                >🏠 Home</button>
              </div>
            </div>
            <div className="ep-edit-row">
              <div className="ep-edit-field">
                <label className="ep-edit-label">Sets</label>
                <input className="ep-edit-input" type="number" min="1"
                  value={editVals.sets}
                  onChange={(e) => onSetEditVals({ ...editVals, sets: e.target.value })} />
              </div>
              <div className="ep-edit-field">
                <label className="ep-edit-label">Reps</label>
                <input className="ep-edit-input" type="number" min="1"
                  value={editVals.reps}
                  onChange={(e) => onSetEditVals({ ...editVals, reps: e.target.value })} />
              </div>
              <div className="ep-edit-field">
                <label className="ep-edit-label">Hold (s)</label>
                <input className="ep-edit-input" type="number" min="0"
                  value={editVals.holdTime}
                  onChange={(e) => onSetEditVals({ ...editVals, holdTime: e.target.value })} />
              </div>
            </div>
            <div className="ep-edit-field">
              <label className="ep-edit-label">Notes</label>
              <input className="ep-edit-input"
                value={editVals.notes} placeholder="Physio notes…"
                onChange={(e) => onSetEditVals({ ...editVals, notes: e.target.value })} />
            </div>
            {editError && <div style={{ fontSize: 12, color: "#b91c1c" }}>{editError}</div>}
            <div className="ep-edit-actions">
              <button className="ep-edit-save" disabled={editSaving} onClick={() => onSaveEdit(rec)}>
                {editSaving ? "Saving…" : <><Check size={11} strokeWidth={2.5} /> Save</>}
              </button>
              <button className="ep-edit-cancel" onClick={onCancelEdit}>Cancel</button>
            </div>
          </div>
        )}
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
  const resetDoneRef = useRef(false);
  const [removingId,     setRemovingId]     = useState<string | null>(null);
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [programFilter,  setProgramFilter]  = useState<"both" | "clinic" | "home">("both");
  const [editVals,     setEditVals]     = useState<{ sets: string; reps: string; holdTime: string; notes: string; programType: "clinic" | "home" }>({ sets: "", reps: "", holdTime: "", notes: "", programType: "clinic" });
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
      (data) => {
        setExercises(data);
        setLoading(false);
        if (!resetDoneRef.current && data.length > 0) {
          resetDoneRef.current = true;
          resetDailyHomeExercises(data);
        }
      },
      ()     => setLoading(false)
    );
  }, [patientId]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  };

  const handleToggle = async (rec: PatientExercise) => {
    if (!canComplete_) return;
    if (viewerRole === "patient" && (rec.programType ?? "clinic") === "clinic") return;
    const currentCompleted = rec.completed ?? false;
    setTogglingId(rec.id);
    await toggleExerciseCompletion(rec.id, !currentCompleted, rec.patientId);
    setTogglingId(null);
  };

  const handleEditOpen = (rec: PatientExercise) => {
    setEditingId(rec.id);
    setEditVals({
      sets:        String(rec.sets),
      reps:        String(rec.reps),
      holdTime:    String(rec.holdTime ?? 0),
      notes:       rec.notes ?? "",
      programType: rec.programType ?? "clinic",
    });
    setEditError(null);
  };

  const handleSaveEdit = async (rec: PatientExercise) => {
    setEditSaving(true); setEditError(null);
    const result = await updatePatientExercise(rec.id, {
      sets:        Math.max(1, parseInt(editVals.sets)     || rec.sets),
      reps:        Math.max(1, parseInt(editVals.reps)     || rec.reps),
      holdTime:    Math.max(0, parseInt(editVals.holdTime) || 0),
      notes:       editVals.notes.trim(),
      programType: editVals.programType,
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

  const visibleExercises = viewerRole === "patient"
    ? exercises.filter((e) => (e.programType ?? "clinic") === "home")
    : exercises;
  const completedCount = visibleExercises.filter((e) => e.completed).length;
  const totalCount     = visibleExercises.length;

  // For physio/manager view: split into two groups
  const clinicExercises = exercises.filter((e) => (e.programType ?? "clinic") === "clinic");
  const homeExercises   = exercises.filter((e) => (e.programType ?? "clinic") === "home");

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
          padding: 7px 14px; border-radius: 9px; min-height: 44px;
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
        .ep-video-wrap {
          width: 100%; border-radius: 10px; overflow: hidden;
          position: relative; padding-top: 56.25%;
          margin-top: 8px;
        }
        .ep-video-wrap iframe {
          position: absolute; inset: 0;
          width: 100%; height: 100%;
          border: none; display: block;
        }
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
        @media (max-width: 480px) { .ep-edit-row { grid-template-columns: 1fr 1fr; } }
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

        /* ── Program filter toggle ── */
        .ep-filter-row {
          display: flex; gap: 6px; margin-bottom: 18px;
          background: #f0ede8; padding: 4px; border-radius: 11px;
          width: fit-content;
        }
        .ep-filter-btn {
          padding: 7px 18px; border-radius: 8px; border: none;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; background: transparent; color: #9a9590;
          display: flex; align-items: center; gap: 5px; white-space: nowrap;
        }
        .ep-filter-btn.active {
          background: #fff; color: #1a1a1a; font-weight: 600;
          box-shadow: 0 1px 4px rgba(0,0,0,0.08);
        }
        .ep-filter-btn.active.clinic { color: #0C3C60; }
        .ep-filter-btn.active.home   { color: #065f46; }

        /* ── Side-by-side columns ── */
        .ep-columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
          align-items: start;
        }
        @media (max-width: 700px) {
          .ep-columns { grid-template-columns: 1fr; }
        }
        .ep-col-header {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 10px;
        }
        .ep-col-title {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.07em; padding: 4px 12px; border-radius: 100px;
        }
        .ep-col-title.clinic { background: #D6EEF8; color: #0C3C60; }
        .ep-col-title.home   { background: #d1fae5; color: #065f46; }
        .ep-col-count { font-size: 11px; color: #9a9590; }
        .ep-col-list { display: flex; flex-direction: column; gap: 10px; }

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
        .ep-picker-add-btn:hover:not(:disabled):not(.added) { background: #D6EEF8; border-color: #2E8BC0; }
        .ep-picker-add-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .ep-picker-add-btn.added { background: #d1fae5; border-color: #6ee7b7; color: #065f46; cursor: default; }

        .ep-picker-ft {
          padding: 12px 20px 18px; flex-shrink: 0; border-top: 1px solid #f0ede8;
        }
        .ep-btn-cancel {
          padding: 9px 20px; border-radius: 10px; min-height: 44px;
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

        .ep-picker-search { min-height: 44px; }
        .ep-picker-add-btn { min-height: 40px; }
        .ep-edit-save { min-height: 40px; }
        .ep-edit-cancel { min-height: 40px; }

        @media (max-width: 520px) {
          .ep-overlay { padding: 0; align-items: flex-start; }
          .ep-picker-modal {
            border-radius: 0 0 22px 22px; max-width: 100%;
            max-height: 92dvh;
          }
          @keyframes epModalIn {
            from { opacity:0; transform: translateY(-100%); }
            to   { opacity:1; transform: translateY(0); }
          }
          .ep-picker-hd { padding: 16px 16px 0; }
          .ep-prog-toggle-wrap { padding: 10px 16px 0; }
          .ep-picker-search-wrap { padding: 10px 16px 8px; }
          .ep-picker-list { padding: 6px 16px; }
          .ep-picker-ft { padding: 12px 16px 20px; }
          .ep-picker-search { font-size: 15px; }
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
              <Plus size={13} strokeWidth={2.5} />
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
        {loading ? (
          <div className="ep-list">
            {Array.from({ length: 3 }).map((_, i) => <div key={i} className="ep-skel" />)}
          </div>
        ) : totalCount === 0 ? (
          <div className="ep-empty">
            <div className="ep-empty-icon">🏃</div>
            <div className="ep-empty-title">No exercises yet</div>
            <div className="ep-empty-sub">
              {canEdit ? 'Click "Add Exercise" to assign exercises from the library.' : "No exercises have been assigned to this patient yet."}
            </div>
          </div>
        ) : viewerRole !== "patient" ? (
          <>
            {/* ── Filter toggle ── */}
            <div className="ep-filter-row">
              <button className={`ep-filter-btn${programFilter === "both" ? " active" : ""}`} onClick={() => setProgramFilter("both")}>
                All ({exercises.length})
              </button>
              <button className={`ep-filter-btn clinic${programFilter === "clinic" ? " active clinic" : ""}`} onClick={() => setProgramFilter("clinic")}>
                🏥 Clinic ({clinicExercises.length})
              </button>
              <button className={`ep-filter-btn home${programFilter === "home" ? " active home" : ""}`} onClick={() => setProgramFilter("home")}>
                🏠 Home ({homeExercises.length})
              </button>
            </div>

            {/* ── Content ── */}
            {programFilter === "both" ? (
              <div className="ep-columns">
                {/* Clinic column */}
                <div>
                  <div className="ep-col-header">
                    <span className="ep-col-title clinic">🏥 Clinic</span>
                    <span className="ep-col-count">{clinicExercises.filter(e => e.completed).length}/{clinicExercises.length} done</span>
                  </div>
                  <div className="ep-col-list">
                    {clinicExercises.length === 0 ? (
                      <div className="ep-empty" style={{ padding: "20px 16px" }}><div className="ep-empty-sub">None assigned.</div></div>
                    ) : clinicExercises.map((rec) => (
                      <ExerciseCard key={rec.id} rec={rec} viewerRole={viewerRole} canEdit={canEdit} canComplete_={canComplete_}
                        togglingId={togglingId} editingId={editingId} editVals={editVals} editSaving={editSaving} editError={editError}
                        removingId={removingId}
                        onToggle={handleToggle} onEditOpen={handleEditOpen} onSaveEdit={handleSaveEdit} onRemove={handleRemove}
                        onSetEditVals={setEditVals} onCancelEdit={() => { setEditingId(null); setEditError(null); }} />
                    ))}
                  </div>
                </div>
                {/* Home column */}
                <div>
                  <div className="ep-col-header">
                    <span className="ep-col-title home">🏠 Home</span>
                    <span className="ep-col-count">{homeExercises.filter(e => e.completed).length}/{homeExercises.length} done</span>
                  </div>
                  <div className="ep-col-list">
                    {homeExercises.length === 0 ? (
                      <div className="ep-empty" style={{ padding: "20px 16px" }}><div className="ep-empty-sub">None assigned.</div></div>
                    ) : homeExercises.map((rec) => (
                      <ExerciseCard key={rec.id} rec={rec} viewerRole={viewerRole} canEdit={canEdit} canComplete_={canComplete_}
                        togglingId={togglingId} editingId={editingId} editVals={editVals} editSaving={editSaving} editError={editError}
                        removingId={removingId}
                        onToggle={handleToggle} onEditOpen={handleEditOpen} onSaveEdit={handleSaveEdit} onRemove={handleRemove}
                        onSetEditVals={setEditVals} onCancelEdit={() => { setEditingId(null); setEditError(null); }} />
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="ep-list">
                {(programFilter === "clinic" ? clinicExercises : homeExercises).map((rec) => (
                  <ExerciseCard key={rec.id} rec={rec} viewerRole={viewerRole} canEdit={canEdit} canComplete_={canComplete_}
                    togglingId={togglingId} editingId={editingId} editVals={editVals} editSaving={editSaving} editError={editError}
                    removingId={removingId}
                    onToggle={handleToggle} onEditOpen={handleEditOpen} onSaveEdit={handleSaveEdit} onRemove={handleRemove}
                    onSetEditVals={setEditVals} onCancelEdit={() => { setEditingId(null); setEditError(null); }} />
                ))}
              </div>
            )}
          </>
        ) : (
          <div className="ep-list">
            {visibleExercises.map((rec) => (
              <ExerciseCard key={rec.id} rec={rec} viewerRole={viewerRole} canEdit={canEdit} canComplete_={canComplete_}
                togglingId={togglingId} editingId={editingId} editVals={editVals} editSaving={editSaving} editError={editError}
                removingId={removingId}
                onToggle={handleToggle} onEditOpen={handleEditOpen} onSaveEdit={handleSaveEdit} onRemove={handleRemove}
                onSetEditVals={setEditVals} onCancelEdit={() => { setEditingId(null); setEditError(null); }} />
            ))}
          </div>
        )}
      </div>

      {/* Library picker modal */}
      {showPicker && (
        <LibraryPicker
          patientId={patientId}
          viewerUid={viewerUid}
          onClose={() => setShowPicker(false)}
          onAdded={(name) => {
            showToast(`✓ "${name}" added`);
          }}
        />
      )}

      {toast && <div className="ep-toast">{toast}</div>}
    </>
  );
}

