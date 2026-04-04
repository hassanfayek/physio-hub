// FILE: src/features/exercises/ExerciseLibraryPage.tsx
// Global exercise library tab rendered inside PhysioDashboard.
// Provides: Browse · Add · Edit · Delete · Assign to Patient.
// Uses the same design tokens (colours, radii, font) as the existing app.
// CSS prefix: el-  (exercise library)

import React, { useState, useEffect, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { X, Check } from "lucide-react";
import {
  subscribeToExerciseLibrary,
  createExercise,
  updateExercise,
  deleteExercise,
  assignExerciseToPatient,
  type LibraryExercise,
} from "../../services/exerciseService";
import {
  subscribeToAllPatients,
  subscribeToPatients,
  type Patient,
} from "../../services/patientService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExerciseLibraryPageProps {
  physioId:  string;
  firstName: string;
  lastName:  string;
  isManager: boolean;
  isSenior?: boolean;
}

type ModalMode = "add" | "edit" | "assign";

interface ExerciseFormState {
  name:            string;
  category:        string;
  equipment:       string;
  description:     string;
  defaultSets:     string;
  defaultReps:     string;
  defaultHoldTime: string;
  notes:           string;
  mediaUrl:        string;
}

const BLANK_FORM: ExerciseFormState = {
  name: "", category: "", equipment: "", description: "",
  defaultSets: "3", defaultReps: "10", defaultHoldTime: "0",
  notes: "", mediaUrl: "",
};

const CATEGORIES = [
  "Shoulder", "Knee", "Hip", "Spine", "Ankle & Foot",
  "Elbow & Wrist", "Neck", "Core", "Balance", "Cardio", "Other",
];

const EQUIPMENT_TYPES = [
  "Bodyweight", "Resistance Bands", "Free Weights", "Machine",
  "Swiss Ball", "TRX / Suspension", "Foam Roller", "Balance Board",
  "Parallel Bars", "Pool / Hydrotherapy", "Other",
];

// ─── Media helper ─────────────────────────────────────────────────────────────

function isYouTube(url: string) {
  return /(?:youtube\.com|youtu\.be)/.test(url);
}
function isImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);
}
function youTubeThumb(url: string) {
  const m = url.match(/(?:v=|youtu\.be\/)([^&?/]+)/);
  return m ? `https://img.youtube.com/vi/${m[1]}/hqdefault.jpg` : null;
}

// ─── Add / Edit Modal ────────────────────────────────────────────────────────

interface ExerciseModalProps {
  mode:       "add" | "edit";
  initial?:   LibraryExercise;
  onClose:    () => void;
  onSaved:    () => void;
}

function ExerciseModal({ mode, initial, onClose, onSaved }: ExerciseModalProps) {
  const [form,    setForm]    = useState<ExerciseFormState>(
    initial
      ? {
          name:            initial.name,
          category:        initial.category,
          equipment:       initial.equipment,
          description:     initial.description,
          defaultSets:     String(initial.defaultSets),
          defaultReps:     String(initial.defaultReps),
          defaultHoldTime: String(initial.defaultHoldTime),
          notes:           initial.notes,
          mediaUrl:        initial.mediaUrl,
        }
      : BLANK_FORM
  );
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState<string | null>(null);
  const [addedCount,  setAddedCount]  = useState(0);
  const [lastAdded,   setLastAdded]   = useState<string>("");

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const set = (k: keyof ExerciseFormState) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError("Exercise name is required."); return; }
    setSaving(true);
    setError(null);

    const payload = {
      name:            form.name.trim(),
      category:        form.category,
      equipment:       form.equipment,
      description:     form.description.trim(),
      defaultSets:     Math.max(1, parseInt(form.defaultSets) || 3),
      defaultReps:     Math.max(1, parseInt(form.defaultReps) || 10),
      defaultHoldTime: Math.max(0, parseInt(form.defaultHoldTime) || 0),
      notes:           form.notes.trim(),
      mediaUrl:        form.mediaUrl.trim(),
    };

    const result = mode === "add"
      ? await createExercise(payload)
      : await updateExercise(initial!.id, payload);

    setSaving(false);
    if ("error" in result && result.error) { setError(result.error); return; }
    if (mode === "edit") {
      onSaved();
    } else {
      setAddedCount((c) => c + 1);
      setLastAdded(form.name.trim());
      setForm(BLANK_FORM);
      setError(null);
    }
  };

  return createPortal(
    <div className="el-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="el-modal" role="dialog" aria-modal="true">

        <div className="el-modal-hd">
          <div>
            <div className="el-modal-badge">{mode === "add" ? "New Exercise" : "Edit Exercise"}</div>
            <div className="el-modal-title">{mode === "add" ? "Add to Library" : form.name || "Edit Exercise"}</div>
          </div>
          <button className="el-close-btn" onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0, overflow: "hidden" }}>
          <div className="el-modal-body">

            {error && <div className="el-error-box">{error}</div>}

            <div className="el-field">
              <label className="el-label">Exercise Name *</label>
              <input className="el-input" value={form.name} onChange={set("name")} placeholder="e.g. Shoulder External Rotation" required />
            </div>

            <div className="el-field">
              <label className="el-label">Category</label>
              <select className="el-select" value={form.category} onChange={set("category")}>
                <option value="">— Select category —</option>
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>

            <div className="el-field">
              <label className="el-label">Equipment</label>
              <select className="el-select" value={form.equipment} onChange={set("equipment")}>
                <option value="">— Select equipment —</option>
                {EQUIPMENT_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>

            <div className="el-field">
              <label className="el-label">Description</label>
              <textarea className="el-textarea" rows={3} value={form.description} onChange={set("description")} placeholder="Describe how to perform the exercise…" />
            </div>

            <div className="el-row3">
              <div className="el-field">
                <label className="el-label">Sets</label>
                <input className="el-input" type="number" min={1} max={20} value={form.defaultSets} onChange={set("defaultSets")} />
              </div>
              <div className="el-field">
                <label className="el-label">Reps</label>
                <input className="el-input" type="number" min={1} max={100} value={form.defaultReps} onChange={set("defaultReps")} />
              </div>
              <div className="el-field">
                <label className="el-label">Hold (sec)</label>
                <input className="el-input" type="number" min={0} max={120} value={form.defaultHoldTime} onChange={set("defaultHoldTime")} />
              </div>
            </div>

            <div className="el-field">
              <label className="el-label">Notes</label>
              <textarea className="el-textarea" rows={2} value={form.notes} onChange={set("notes")} placeholder="Any clinical notes or precautions…" />
            </div>

            <div className="el-field">
              <label className="el-label">Media URL (YouTube, video, or image)</label>
              <input className="el-input" value={form.mediaUrl} onChange={set("mediaUrl")} placeholder="https://…" />
              {form.mediaUrl && (
                <div className="el-media-preview">
                  {isImage(form.mediaUrl) && <img src={form.mediaUrl} alt="preview" className="el-preview-img" />}
                  {isYouTube(form.mediaUrl) && youTubeThumb(form.mediaUrl) && <img src={youTubeThumb(form.mediaUrl)!} alt="YouTube thumbnail" className="el-preview-img" />}
                  <a href={form.mediaUrl} target="_blank" rel="noopener noreferrer" className="el-preview-link">Open link ↗</a>
                </div>
              )}
            </div>

          </div>

          {addedCount > 0 && mode === "add" && (
            <div style={{
              background: "#d8f3dc", border: "1px solid #b7e4c7",
              borderRadius: 10, padding: "10px 14px", margin: "0 0 12px",
              fontSize: 13, color: "#1b4332",
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <Check size={13} strokeWidth={2.5} />
              <strong>{lastAdded}</strong> added — {addedCount} exercise{addedCount > 1 ? "s" : ""} this session
            </div>
          )}
          <div className="el-modal-ft">
            <button type="button" className="el-btn-cancel" onClick={onClose}>{mode === "add" && addedCount > 0 ? `Done (${addedCount} added)` : "Cancel"}</button>
            <button type="submit" className="el-btn-primary" disabled={saving}>
              {saving
                ? <><span className="el-spinner" /> Saving…</>
                : mode === "add" ? (addedCount > 0 ? "Add Another" : "Add Exercise") : "Save Changes"
              }
            </button>
          </div>
        </form>

      </div>
    </div>,
    document.body
  );
}

// ─── Assign-to-Patient Modal ──────────────────────────────────────────────────

interface AssignModalProps {
  exercise:  LibraryExercise;
  patients:  Patient[];
  physioId:  string;
  isManager: boolean;
  onClose:   () => void;
}

function AssignModal({ exercise, patients, physioId, onClose }: AssignModalProps) {
  const [assignedCount, setAssignedCount] = useState(0);
  const [lastAssigned,  setLastAssigned]  = useState<string>("");
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [sets,     setSets]     = useState(String(exercise.defaultSets));
  const [reps,     setReps]     = useState(String(exercise.defaultReps));
  const [holdTime, setHoldTime] = useState(String(exercise.defaultHoldTime));
  const [notes,    setNotes]    = useState(exercise.notes);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const filtered = patients.filter((p) =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  const handleAssign = async () => {
    if (!selected) { setError("Please select a patient."); return; }
    setSaving(true);
    setError(null);

    const result = await assignExerciseToPatient({
      patientId:    selected.uid,
      exerciseId:   exercise.id,
      exerciseName: exercise.name,
      sets:         Math.max(1, parseInt(sets) || 3),
      reps:         Math.max(1, parseInt(reps) || 10),
      holdTime:     Math.max(0, parseInt(holdTime) || 0),
      notes:        notes.trim(),
      createdBy:    physioId,
      mediaUrl:     exercise.mediaUrl,
    });

    setSaving(false);
    if ("error" in result && result.error) { setError(result.error); return; }
    // Stay open — show success feedback and let physio assign to more patients
    setAssignedCount((c) => c + 1);
    setLastAssigned(`${selected.firstName} ${selected.lastName}`);
    setSelected(null);
  };

  return createPortal(
    <div className="el-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="el-modal" role="dialog" aria-modal="true">

        <div className="el-modal-hd">
          <div>
            <div className="el-modal-badge">Assign Exercise</div>
            <div className="el-modal-title">{exercise.name}</div>
            {exercise.category && <div className="el-modal-sub">{exercise.category}</div>}
          </div>
          <button className="el-close-btn" onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        <div className="el-modal-body">

          {error && <div className="el-error-box">{error}</div>}

          {/* Patient search */}
          <div className="el-field">
            <label className="el-label">Search Patient</label>
            <input
              className="el-input"
              placeholder="Type patient name…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); setSelected(null); }}
              autoFocus
            />
          </div>

          {/* Patient list */}
          {search.length > 0 && (
            <div className="el-patient-list">
              {filtered.length === 0 && (
                <div className="el-patient-empty">No patients match "{search}"</div>
              )}
              {filtered.map((p) => (
                <div
                  key={p.uid}
                  className={`el-patient-row ${selected?.uid === p.uid ? "selected" : ""}`}
                  onClick={() => setSelected(p)}
                >
                  <div className="el-patient-avatar">{p.firstName[0]}{p.lastName[0]}</div>
                  <div>
                    <div className="el-patient-name">{p.firstName} {p.lastName}</div>
                    <div className="el-patient-cond">{p.condition || "—"}</div>
                  </div>
                  {selected?.uid === p.uid && (
                    <Check className="el-patient-check" size={16} strokeWidth={2.5} />
                  )}
                </div>
              ))}
            </div>
          )}

          {selected && (
            <div className="el-selected-banner">
              Assigning to: <strong>{selected.firstName} {selected.lastName}</strong>
            </div>
          )}

          {/* Override sets/reps/hold */}
          <div className="el-row3">
            <div className="el-field">
              <label className="el-label">Sets</label>
              <input className="el-input" type="number" min={1} max={20} value={sets} onChange={(e) => setSets(e.target.value)} />
            </div>
            <div className="el-field">
              <label className="el-label">Reps</label>
              <input className="el-input" type="number" min={1} max={100} value={reps} onChange={(e) => setReps(e.target.value)} />
            </div>
            <div className="el-field">
              <label className="el-label">Hold (sec)</label>
              <input className="el-input" type="number" min={0} max={120} value={holdTime} onChange={(e) => setHoldTime(e.target.value)} />
            </div>
          </div>

          <div className="el-field">
            <label className="el-label">Custom Notes for Patient</label>
            <textarea className="el-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any patient-specific instructions…" />
          </div>

        </div>

        <div className="el-modal-ft">
          <button type="button" className="el-btn-cancel" onClick={onClose}>{assignedCount > 0 ? "Done" : "Cancel"}</button>
          {assignedCount > 0 && (
            <div style={{
              background: "#d8f3dc", border: "1px solid #b7e4c7",
              borderRadius: 10, padding: "10px 14px",
              fontSize: 13, color: "#1b4332", marginBottom: 12,
              display: "flex", alignItems: "center", gap: 8,
            }}>
              <Check size={13} strokeWidth={2.5} />
              Assigned to <strong>{lastAssigned}</strong> ({assignedCount} total this session)
            </div>
          )}
          <button type="button" className="el-btn-primary" disabled={!selected || saving} onClick={handleAssign}>
            {saving
              ? <><span className="el-spinner" /> Assigning…</>
              : <>
                  <Check size={13} strokeWidth={2.5} />
                  Assign to Patient
                </>
            }
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ExerciseLibraryPage({
  physioId,
  isManager,
  isSenior = false,
}: ExerciseLibraryPageProps) {
  const canEdit = isManager || isSenior;
  const [exercises,   setExercises]   = useState<LibraryExercise[]>([]);
  const [patients,    setPatients]    = useState<Patient[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,         setSearch]         = useState("");
  const [filterCat,      setFilterCat]      = useState("");
  const [filterEquipment,setFilterEquipment]= useState("");
  const [modal,       setModal]       = useState<ModalMode | null>(null);
  const [editTarget,  setEditTarget]  = useState<LibraryExercise | null>(null);
  const [assignTarget,setAssignTarget]= useState<LibraryExercise | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);

  // Realtime: exercise library
  useEffect(() => {
    setLoading(true);
    return subscribeToExerciseLibrary(
      (data) => { setExercises(data); setLoading(false); },
      ()     => setLoading(false)
    );
  }, []);

  // Realtime: patients (for assign modal)
  useEffect(() => {
    const unsub = isManager
      ? subscribeToAllPatients(setPatients)
      : subscribeToPatients(physioId, setPatients);
    return () => unsub();
  }, [physioId, isManager]);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleDelete = async (ex: LibraryExercise) => {
    if (!window.confirm(`Delete "${ex.name}" from the library? This cannot be undone.`)) return;
    setDeletingId(ex.id);
    const result = await deleteExercise(ex.id);
    setDeletingId(null);
    if (result.error) { showToast("Error: " + result.error); return; }
    showToast(`"${ex.name}" removed from library`);
  };

  const openEdit = (ex: LibraryExercise) => {
    setEditTarget(ex);
    setModal("edit");
  };

  const openAssign = (ex: LibraryExercise) => {
    setAssignTarget(ex);
    setModal("assign");
  };

  // Filtered list
  const displayed = exercises.filter((ex) => {
    const matchSearch = ex.name.toLowerCase().includes(search.toLowerCase()) ||
                        ex.description.toLowerCase().includes(search.toLowerCase());
    const matchCat    = !filterCat || ex.category === filterCat;
    const matchEquip  = !filterEquipment || ex.equipment === filterEquipment;
    return matchSearch && matchCat && matchEquip;
  });

  const categories       = Array.from(new Set(exercises.map((e) => e.category).filter(Boolean)));
  const usedEquipment    = Array.from(new Set(exercises.map((e) => e.equipment).filter(Boolean)));

  return (
    <>
      <style>{`
        .el-root { font-family: 'Outfit', sans-serif; }

        /* ── Page header ── */
        .el-header {
          display: flex; align-items: flex-end; justify-content: space-between;
          margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
        }
        .el-title {
          font-family: 'Playfair Display', serif;
          font-size: 22px; font-weight: 500; color: #1a1a1a;
          letter-spacing: -0.02em; margin-bottom: 3px;
        }
        .el-sub { font-size: 13px; color: #9a9590; }

        /* ── Toolbar ── */
        .el-toolbar {
          display: flex; flex-direction: column; align-items: stretch; gap: 8px;
          margin-bottom: 14px;
        }
        .el-toolbar-row {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
        }
        .el-search {
          font-family: 'Outfit', sans-serif;
          flex: 1; min-width: 0; padding: 10px 14px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fff; font-size: 14px;
          color: #1a1a1a; outline: none; transition: border-color 0.15s;
          min-height: 44px;
        }
        .el-search:focus { border-color: #2E8BC0; box-shadow: 0 0 0 3px rgba(46,139,192,0.08); }
        .el-cat-filter {
          font-family: 'Outfit', sans-serif;
          padding: 10px 28px 10px 12px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fff; font-size: 13.5px;
          color: #5a5550; outline: none; cursor: pointer; transition: border-color 0.15s;
          appearance: none; -webkit-appearance: none; min-height: 44px;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%232d6a4f' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 10px center;
        }
        .el-cat-filter:focus { border-color: #2E8BC0; }

        /* Equipment filter chips */
        .el-chip-row {
          display: flex; gap: 6px; flex-wrap: wrap; align-items: center;
        }
        .el-chip-label {
          font-size: 11px; font-weight: 600; color: #9a9590;
          text-transform: uppercase; letter-spacing: 0.07em; white-space: nowrap;
          margin-right: 2px;
        }
        .el-chip {
          padding: 5px 12px; border-radius: 100px; border: 1.5px solid #e5e0d8;
          background: #fff; font-family: 'Outfit', sans-serif;
          font-size: 12.5px; font-weight: 500; color: #5a5550;
          cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .el-chip:hover { border-color: #B3DEF0; color: #2E8BC0; background: #EAF5FC; }
        .el-chip.active { border-color: #2E8BC0; color: #2E8BC0; background: #D6EEF8; }

        /* Add button */
        .el-add-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 10px 16px; border-radius: 10px; border: none;
          background: #2E8BC0; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          cursor: pointer; transition: background 0.2s; white-space: nowrap;
          min-height: 44px;
        }
        .el-add-btn:hover { background: #0C3C60; }

        /* ── Count row ── */
        .el-count-row {
          font-size: 12px; color: #9a9590; margin-bottom: 10px;
        }

        /* ── Exercise cards ── */
        .el-grid {
          display: flex; flex-direction: column; gap: 8px;
        }
        .el-card {
          background: #fff; border: 1.5px solid #e5e0d8; border-radius: 14px;
          padding: 14px 14px; display: flex; align-items: flex-start; gap: 12px;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .el-card:hover { border-color: #B3DEF0; box-shadow: 0 2px 12px rgba(46,139,192,0.07); }

        /* Thumbnail / media indicator */
        .el-thumb {
          width: 52px; height: 52px; border-radius: 10px; flex-shrink: 0;
          overflow: hidden; background: #f5f3ef;
          display: flex; align-items: center; justify-content: center;
          border: 1px solid #e5e0d8;
        }
        .el-thumb img { width: 100%; height: 100%; object-fit: cover; }
        .el-thumb-icon { font-size: 22px; }

        /* Card body */
        .el-card-body { flex: 1; min-width: 0; }
        .el-card-top {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          margin-bottom: 4px;
        }
        .el-card-name {
          font-size: 15px; font-weight: 600; color: #1a1a1a;
        }
        .el-card-cat {
          font-size: 11px; font-weight: 600;
          background: #D6EEF8; color: #0C3C60;
          padding: 2px 8px; border-radius: 100px;
        }
        .el-card-desc {
          font-size: 13px; color: #5a5550; margin-bottom: 6px;
          display: -webkit-box; -webkit-line-clamp: 2;
          -webkit-box-orient: vertical; overflow: hidden;
        }
        .el-card-meta {
          display: flex; gap: 14px; flex-wrap: wrap;
          font-size: 12.5px; color: #9a9590;
        }
        .el-card-meta-item {
          display: flex; align-items: center; gap: 4px;
        }
        .el-card-meta-val { font-weight: 600; color: #1a1a1a; }

        /* Card actions */
        .el-card-actions {
          display: flex; flex-direction: column; gap: 6px; flex-shrink: 0;
        }
        .el-btn-assign {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 8px;
          border: 1.5px solid #B3DEF0; background: #EAF5FC;
          font-family: 'Outfit', sans-serif; font-size: 12.5px; font-weight: 500;
          color: #2E8BC0; cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .el-btn-assign:hover { background: #D6EEF8; border-color: #2E8BC0; }
        .el-btn-edit {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 12.5px; font-weight: 500;
          color: #5a5550; cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .el-btn-edit:hover { background: #f0ede8; }
        .el-btn-del {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 12.5px; font-weight: 500;
          color: #c0bbb4; cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .el-btn-del:hover:not(:disabled) { border-color: #fca5a5; color: #b91c1c; background: #fff5f3; }
        .el-btn-del:disabled { opacity: 0.5; cursor: not-allowed; }
        .el-media-link-btn {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 12px; color: #5BC0BE; font-weight: 500;
          padding: 2px 0; background: none; border: none; cursor: pointer;
          font-family: 'Outfit', sans-serif;
          transition: color 0.15s;
        }
        .el-media-link-btn:hover { color: #2E8BC0; }

        /* Empty state */
        .el-empty {
          text-align: center; padding: 64px 24px;
          background: #fafaf8; border-radius: 16px; border: 1.5px dashed #e5e0d8;
        }
        .el-empty-icon { font-size: 36px; margin-bottom: 12px; }
        .el-empty-title { font-family: 'Playfair Display', serif; font-size: 20px; color: #1a1a1a; margin-bottom: 6px; }
        .el-empty-sub { font-size: 13.5px; color: #9a9590; margin-bottom: 20px; }

        /* ── Skeleton ── */
        .el-skel {
          height: 78px; border-radius: 16px;
          background: linear-gradient(90deg, #f0ede8 0%, #e5e0d8 50%, #f0ede8 100%);
          background-size: 200% 100%;
          animation: elShimmer 1.4s ease infinite;
        }
        @keyframes elShimmer { to { background-position: -200% 0; } }

        /* ── Modal shell ── */
        .el-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(10,15,10,0.55); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          overflow-y: auto; padding: 24px;
          animation: elOverlayIn 0.2s ease both;
        }
        @keyframes elOverlayIn { from { opacity:0; } to { opacity:1; } }

        .el-modal {
          background: #fff; border-radius: 24px;
          width: 100%; max-width: 520px;
          max-height: min(90vh, 100%);
          display: flex; flex-direction: column;
          overflow: hidden; flex-shrink: 0;
          box-shadow: 0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04);
          animation: elModalIn 0.25s cubic-bezier(0.16,1,0.3,1) both;
          font-family: 'Outfit', sans-serif;
        }
        @keyframes elModalIn {
          from { opacity:0; transform: scale(0.94) translateY(16px); }
          to   { opacity:1; transform: scale(1)    translateY(0); }
        }

        .el-modal-hd {
          padding: 22px 24px 0;
          display: flex; align-items: flex-start; justify-content: space-between;
          flex-shrink: 0;
        }
        .el-modal-badge {
          font-size: 11px; font-weight: 600; letter-spacing: 0.07em;
          text-transform: uppercase; color: #2E8BC0; margin-bottom: 4px;
        }
        .el-modal-title {
          font-family: 'Playfair Display', serif;
          font-size: 22px; font-weight: 500; color: #1a1a1a; letter-spacing: -0.02em;
        }
        .el-modal-sub { font-size: 13px; color: #9a9590; margin-top: 2px; }
        .el-close-btn {
          width: 32px; height: 32px; border-radius: 50%;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #9a9590; transition: all 0.15s; flex-shrink: 0;
          margin-top: 2px;
        }
        .el-close-btn:hover { background: #f0ede8; color: #1a1a1a; }

        .el-modal-body {
          padding: 18px 24px; overflow-y: auto;
          display: flex; flex-direction: column; gap: 14px;
          flex: 1; min-height: 0;
        }
        .el-modal-ft {
          padding: 14px 24px 20px;
          display: flex; gap: 10px; justify-content: flex-end; flex-shrink: 0;
          border-top: 1px solid #f0ede8;
        }

        /* Form elements */
        .el-field { display: flex; flex-direction: column; gap: 5px; }
        .el-label {
          font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
          font-weight: 600; color: #9a9590;
        }
        .el-input, .el-select, .el-textarea {
          font-family: 'Outfit', sans-serif;
          padding: 9px 12px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-size: 14px; color: #1a1a1a; outline: none;
          transition: border-color 0.15s;
        }
        .el-input:focus, .el-select:focus, .el-textarea:focus {
          border-color: #2E8BC0; background: #fff;
          box-shadow: 0 0 0 3px rgba(46,139,192,0.08);
        }
        .el-select {
          appearance: none; -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%232d6a4f' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 10px center;
          padding-right: 28px; cursor: pointer;
          background-color: #fafaf8;
        }
        .el-textarea { resize: vertical; min-height: 68px; }
        .el-row3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }

        .el-error-box {
          background: #fee2e2; border: 1px solid #fca5a5; border-radius: 10px;
          padding: 10px 14px; font-size: 13.5px; color: #b91c1c;
        }

        /* Media preview */
        .el-media-preview { display: flex; align-items: center; gap: 10px; margin-top: 6px; }
        .el-preview-img { width: 72px; height: 48px; border-radius: 8px; object-fit: cover; border: 1px solid #e5e0d8; }
        .el-preview-link { font-size: 12.5px; color: #5BC0BE; font-weight: 500; }
        .el-preview-link:hover { color: #2E8BC0; }

        /* Patient list in assign modal */
        .el-patient-list {
          max-height: 200px; overflow-y: auto; display: flex; flex-direction: column; gap: 4px;
          border: 1.5px solid #e5e0d8; border-radius: 10px; background: #fafaf8; padding: 6px;
        }
        .el-patient-empty { padding: 12px; text-align: center; font-size: 13px; color: #9a9590; }
        .el-patient-row {
          display: flex; align-items: center; gap: 10px;
          padding: 8px 10px; border-radius: 8px; cursor: pointer;
          transition: background 0.1s;
        }
        .el-patient-row:hover { background: #f0f7f4; }
        .el-patient-row.selected { background: #D6EEF8; }
        .el-patient-avatar {
          width: 30px; height: 30px; border-radius: 50%;
          background: #D6EEF8; color: #2E8BC0;
          display: flex; align-items: center; justify-content: center;
          font-size: 11px; font-weight: 700; flex-shrink: 0;
        }
        .el-patient-name { font-size: 13.5px; font-weight: 500; color: #1a1a1a; }
        .el-patient-cond { font-size: 11.5px; color: #9a9590; }
        .el-patient-check { color: #2E8BC0; margin-left: auto; flex-shrink: 0; }
        .el-selected-banner {
          background: #D6EEF8; border: 1px solid #B3DEF0; border-radius: 10px;
          padding: 8px 14px; font-size: 13px; color: #0C3C60;
        }

        /* Modal buttons */
        .el-btn-cancel {
          padding: 9px 18px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          color: #5a5550; cursor: pointer; transition: background 0.15s;
        }
        .el-btn-cancel:hover { background: #f5f3ef; }
        .el-btn-primary {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 9px 20px; border-radius: 10px; border: none;
          background: #2E8BC0; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          cursor: pointer; transition: background 0.2s;
        }
        .el-btn-primary:hover:not(:disabled) { background: #0C3C60; }
        .el-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Spinner */
        .el-spinner {
          width: 14px; height: 14px;
          border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;
          border-radius: 50%; animation: elSpin 0.7s linear infinite;
        }
        @keyframes elSpin { to { transform: rotate(360deg); } }

        /* ── Mobile: top-sheet modal ── */
        @media (max-width: 540px) {
          .el-overlay {
            align-items: flex-start;
            padding: 0;
          }
          .el-modal {
            max-width: 100%;
            max-height: 92dvh;
            border-radius: 0 0 22px 22px;
            width: 100%;
          }
          .el-modal-hd  { padding: 20px 18px 0; }
          .el-modal-body { padding: 14px 18px; }
          .el-modal-ft  { padding: 12px 18px 16px; flex-direction: column-reverse; }
          .el-btn-cancel, .el-btn-primary { width: 100%; justify-content: center; }
        }

        /* Toast */
        .el-toast {
          position: fixed; bottom: 28px; left: 50%; transform: translateX(-50%);
          background: #0C3C60; color: #fff; padding: 13px 22px; border-radius: 12px;
          font-size: 14px; font-weight: 500; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          z-index: 2000; white-space: nowrap;
          animation: elToastIn 0.3s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes elToastIn {
          from { opacity:0; transform: translateX(-50%) translateY(12px); }
          to   { opacity:1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <div className="el-root">

        {/* Page header */}
        <div className="el-header">
          <div>
            <div className="el-title">Exercise Library</div>
            <div className="el-sub">
              {loading ? "Loading…" : `${exercises.length} exercise${exercises.length !== 1 ? "s" : ""} in library`}
            </div>
          </div>
          {canEdit && (
            <button className="el-add-btn" onClick={() => setModal("add")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              Add Exercise
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="el-toolbar">
          <div className="el-toolbar-row">
            <input
              className="el-search"
              placeholder="Search exercises…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="el-cat-filter"
              value={filterCat}
              onChange={(e) => setFilterCat(e.target.value)}
            >
              <option value="">All Categories</option>
              {categories.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          {usedEquipment.length > 0 && (
            <div className="el-chip-row">
              <span className="el-chip-label">Equipment:</span>
              <button
                className={`el-chip${filterEquipment === "" ? " active" : ""}`}
                onClick={() => setFilterEquipment("")}
              >All</button>
              {usedEquipment.map((eq) => (
                <button
                  key={eq}
                  className={`el-chip${filterEquipment === eq ? " active" : ""}`}
                  onClick={() => setFilterEquipment(filterEquipment === eq ? "" : eq)}
                >{eq}</button>
              ))}
            </div>
          )}
        </div>

        {!loading && (
          <div className="el-count-row">
            {displayed.length === exercises.length
              ? `Showing all ${displayed.length} exercise${displayed.length !== 1 ? "s" : ""}`
              : `${displayed.length} of ${exercises.length} exercise${exercises.length !== 1 ? "s" : ""}`
            }
          </div>
        )}

        {/* Exercise list */}
        <div className="el-grid">
          {loading
            ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="el-skel" />)
            : displayed.length === 0
              ? (
                <div className="el-empty">
                  <div className="el-empty-icon">🏋️</div>
                  <div className="el-empty-title">
                    {exercises.length === 0 ? "No exercises yet" : "No results found"}
                  </div>
                  <div className="el-empty-sub">
                    {exercises.length === 0
                      ? "Add exercises to the library to get started."
                      : "Try a different search term or category."}
                  </div>
                  {exercises.length === 0 && canEdit && (
                    <button className="el-add-btn" onClick={() => setModal("add")}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                      </svg>
                      Add First Exercise
                    </button>
                  )}
                </div>
              )
              : displayed.map((ex) => {
                  const thumb = ex.mediaUrl
                    ? isYouTube(ex.mediaUrl) ? youTubeThumb(ex.mediaUrl)
                    : isImage(ex.mediaUrl)   ? ex.mediaUrl
                    : null
                    : null;

                  return (
                    <div key={ex.id} className="el-card">
                      {/* Thumbnail */}
                      <div className="el-thumb">
                        {thumb
                          ? <img src={thumb} alt={ex.name} />
                          : <span className="el-thumb-icon">🏋️</span>
                        }
                      </div>

                      {/* Body */}
                      <div className="el-card-body">
                        <div className="el-card-top">
                          <span className="el-card-name">{ex.name}</span>
                          {ex.category && <span className="el-card-cat">{ex.category}</span>}
                          {ex.equipment && (
                            <span className="el-card-cat" style={{ background: "#f3f4f6", color: "#374151" }}>
                              {ex.equipment}
                            </span>
                          )}
                        </div>

                        {ex.description && (
                          <div className="el-card-desc">{ex.description}</div>
                        )}

                        <div className="el-card-meta">
                          <div className="el-card-meta-item">
                            Sets: <span className="el-card-meta-val">&nbsp;{ex.defaultSets}</span>
                          </div>
                          <div className="el-card-meta-item">
                            Reps: <span className="el-card-meta-val">&nbsp;{ex.defaultReps}</span>
                          </div>
                          {ex.defaultHoldTime > 0 && (
                            <div className="el-card-meta-item">
                              Hold: <span className="el-card-meta-val">&nbsp;{ex.defaultHoldTime}s</span>
                            </div>
                          )}
                          {ex.mediaUrl && (
                            <button
                              className="el-media-link-btn"
                              onClick={() => window.open(ex.mediaUrl, "_blank", "noopener,noreferrer")}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
                              </svg>
                              View Media
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="el-card-actions">
                        {canEdit ? (
                        <><button className="el-btn-assign" onClick={() => openAssign(ex)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                            <circle cx="9" cy="7" r="4"/>
                            <line x1="19" y1="8" x2="19" y2="14"/>
                            <line x1="22" y1="11" x2="16" y2="11"/>
                          </svg>
                          Assign to Patient
                        </button>
                        <button className="el-btn-edit" onClick={() => openEdit(ex)}>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                          </svg>
                          Edit
                        </button>
                        <button
                          className="el-btn-del"
                          disabled={deletingId === ex.id}
                          onClick={() => handleDelete(ex)}
                        >
                          {deletingId === ex.id
                            ? <><span style={{ width: 11, height: 11, border: "2px solid #e5e0d8", borderTopColor: "#b91c1c", borderRadius: "50%", display: "block", animation: "elSpin 0.7s linear infinite" }} /> Deleting…</>
                            : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                <path d="M10 11v6M14 11v6"/>
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                              </svg> Delete</>
                          }
                        </button>
                        </>) : (
                          <span style={{ fontSize: 12, color: "#c0bbb4", fontStyle: "italic", padding: "4px 0" }}>View only</span>
                        )}
                      </div>
                    </div>
                  );
                })
          }
        </div>
      </div>

      {/* Add / Edit modal */}
      {(modal === "add" || modal === "edit") && (
        <ExerciseModal
          mode={modal}
          initial={modal === "edit" ? editTarget ?? undefined : undefined}
          onClose={() => { setModal(null); setEditTarget(null); }}
          onSaved={() => {
            setModal(null);
            setEditTarget(null);
            showToast("✓ Exercise updated");
          }}
        />
      )}

      {/* Assign modal */}
      {modal === "assign" && assignTarget && (
        <AssignModal
          exercise={assignTarget}
          patients={patients}
          physioId={physioId}
          isManager={isManager}
          onClose={() => { setModal(null); setAssignTarget(null); }}
        />
      )}

      {/* Toast */}
      {toast && <div className="el-toast">{toast}</div>}
    </>
  );
}
