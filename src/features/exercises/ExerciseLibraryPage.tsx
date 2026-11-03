// FILE: src/features/exercises/ExerciseLibraryPage.tsx
// Global exercise library tab rendered inside PhysioDashboard.
// Provides: Browse · Add · Edit · Delete · Assign to Patient.
// Uses the same design tokens (colours, radii, font) as the existing app.
// CSS prefix: el-  (exercise library)

import React, { useState, useEffect, useCallback, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { X, Check, Plus, Search, Video, Play, Dumbbell, Users, AlertTriangle, UserPlus, Pencil, Copy, Trash2, ListChecks, Home, Building2 } from "lucide-react";
import VideoShowbox, { type ShowboxItem } from "../../components/VideoShowbox";
import { exerciseVideo } from "../../utils/youtube";
import {
  subscribeToExerciseLibrary,
  createExercise,
  updateExercise,
  deleteExercise,
  assignExerciseToPatient,
  duplicateExercise,
  fetchExerciseUsage,
  type LibraryExercise,
  type Difficulty,
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
  videoId:         string;
  difficulty:      Difficulty;
  precautions:     string;
}

const BLANK_FORM: ExerciseFormState = {
  name: "", category: "", equipment: "", description: "",
  defaultSets: "3", defaultReps: "10", defaultHoldTime: "0",
  notes: "", mediaUrl: "", videoId: "", difficulty: "", precautions: "",
};

const CATEGORIES = [
  "Shoulder", "Knee", "Hip", "Spine", "Ankle & Foot",
  "Elbow & Wrist", "Neck", "Core", "Balance", "Cardio", "Other",
];

const DIFF_LABEL: Record<string, string> = { easy: "Easy", moderate: "Moderate", hard: "Hard" };

const EQUIPMENT_TYPES = [
  "Bodyweight", "Resistance Bands", "Free Weights", "Machine",
  "Swiss Ball", "TRX / Suspension", "Foam Roller", "Balance Board",
  "Parallel Bars", "Pool / Hydrotherapy", "Other",
];

// ─── Media helper ─────────────────────────────────────────────────────────────

function isImage(url: string) {
  return /\.(jpg|jpeg|png|gif|webp|svg)(\?|$)/i.test(url);
}

// Shorts URLs are stored as-is so VideoEmbed can detect them.
// Regular YouTube URLs are reduced to the bare 11-char ID.
function extractYouTubeId(raw: string): string {
  if (!raw) return "";
  // Keep full Shorts URL — VideoEmbed handles it as a link
  if (/youtube\.com\/shorts\//.test(raw)) return raw.split("?")[0];
  const m = raw.match(/(?:v=|youtu\.be\/|embed\/|shorts:)([^&?/\s]{11})/);
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(raw)) return raw;
  return raw;
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
          videoId:         initial.videoId,
          difficulty:      initial.difficulty,
          precautions:     initial.precautions,
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
      videoId:         extractYouTubeId(form.videoId.trim()),
      difficulty:      form.difficulty,
      precautions:     form.precautions.trim(),
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
              <label className="el-label">Difficulty</label>
              <div className="el-seg">
                {(["", "easy", "moderate", "hard"] as Difficulty[]).map((d) => (
                  <button key={d || "none"} type="button" className={`el-seg-btn d-${d || "none"} ${form.difficulty === d ? "on" : ""}`}
                    onClick={() => setForm((f) => ({ ...f, difficulty: d }))}>{d ? DIFF_LABEL[d] : "Not set"}</button>
                ))}
              </div>
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
              <textarea className="el-textarea" rows={2} value={form.notes} onChange={set("notes")} placeholder="Default note copied to the patient when assigned…" />
            </div>

            <div className="el-field">
              <label className="el-label">Precautions</label>
              <textarea className="el-textarea" rows={2} value={form.precautions} onChange={set("precautions")} placeholder="When to stop, what to avoid… (shown to patients in red)" />
            </div>

            <div className="el-field">
              <label className="el-label">YouTube Video ID or URL</label>
              <input
                className="el-input"
                value={form.videoId}
                onChange={set("videoId")}
                placeholder="e.g. dQw4w9WgXcQ or https://youtube.com/watch?v=…"
              />
              {form.videoId && /youtube\.com\/shorts\//.test(extractYouTubeId(form.videoId)) ? (
                <a
                  href={extractYouTubeId(form.videoId)}
                  target="_blank" rel="noopener noreferrer"
                  style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, padding: "10px 14px", borderRadius: 10, background: "#f0fdf4", border: "1px solid #86efac", color: "#16a34a", fontWeight: 600, fontSize: 13, textDecoration: "none" }}
                >
                  ▶ Watch Short on YouTube (opens in new tab)
                </a>
              ) : form.videoId && extractYouTubeId(form.videoId) ? (
                <div style={{ marginTop: 8, borderRadius: 10, overflow: "hidden", aspectRatio: "16/9" }}>
                  <iframe
                    width="100%" height="100%"
                    src={`https://www.youtube.com/embed/${extractYouTubeId(form.videoId)}`}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                    allowFullScreen
                    style={{ border: "none", display: "block" }}
                  />
                </div>
              ) : null
              }
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

// ─── Assign-to-Patient Modal (one exercise, or several at once) ───────────────

interface AssignModalProps {
  exercises: LibraryExercise[];
  patients:  Patient[];
  physioId:  string;
  onClose:   () => void;
  onAssigned: () => void;
}

function AssignModal({ exercises, patients, physioId, onClose, onAssigned }: AssignModalProps) {
  const single = exercises.length === 1 ? exercises[0] : null;
  const [assignedTo,  setAssignedTo]  = useState<string[]>([]);
  const [search,   setSearch]   = useState("");
  const [selected, setSelected] = useState<Patient | null>(null);
  const [programType, setProgramType] = useState<"clinic" | "home">("home");
  const [sets,     setSets]     = useState(String(single?.defaultSets ?? 3));
  const [reps,     setReps]     = useState(String(single?.defaultReps ?? 10));
  const [holdTime, setHoldTime] = useState(String(single?.defaultHoldTime ?? 0));
  const [notes,    setNotes]    = useState(single?.notes ?? "");
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  const q = search.trim().toLowerCase(), qd = search.replace(/\D/g, "");
  const filtered = patients
    .filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || (qd.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(qd)))
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`))
    .slice(0, 50);

  const handleAssign = async () => {
    if (!selected) { setError("Please select a patient."); return; }
    setSaving(true);
    setError(null);
    for (const ex of exercises) {
      const result = await assignExerciseToPatient({
        patientId:    selected.uid,
        exerciseId:   ex.id,
        exerciseName: ex.name,
        sets:         single ? Math.max(1, parseInt(sets) || 3) : ex.defaultSets,
        reps:         single ? Math.max(1, parseInt(reps) || 10) : ex.defaultReps,
        holdTime:     single ? Math.max(0, parseInt(holdTime) || 0) : ex.defaultHoldTime,
        notes:        single ? notes.trim() : ex.notes,
        createdBy:    physioId,
        mediaUrl:     ex.mediaUrl,
        videoId:      ex.videoId,
        programType,
      });
      if ("error" in result && result.error) { setSaving(false); setError(result.error); return; }
    }
    setSaving(false);
    // Stay open so the same exercise(s) can go to more patients
    setAssignedTo((a) => [...a, `${selected.firstName} ${selected.lastName}`]);
    setSelected(null);
    setSearch("");
    onAssigned();
  };

  return createPortal(
    <div className="el-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="el-modal" role="dialog" aria-modal="true">

        <div className="el-modal-hd">
          <div>
            <div className="el-modal-badge">{single ? "Assign Exercise" : `Assign ${exercises.length} Exercises`}</div>
            <div className="el-modal-title">{single ? single.name : "Build a program"}</div>
            {single?.category && <div className="el-modal-sub">{single.category}</div>}
          </div>
          <button className="el-close-btn" onClick={onClose} aria-label="Close">
            <X size={14} strokeWidth={2.5} />
          </button>
        </div>

        <div className="el-modal-body">

          {error && <div className="el-error-box">{error}</div>}

          {!single && (
            <div className="el-bulk-list">
              {exercises.map((ex) => (
                <div key={ex.id} className="el-bulk-item">
                  <span>{ex.name}</span>
                  <small>{ex.defaultSets} × {ex.defaultReps}{ex.defaultHoldTime > 0 ? ` · ${ex.defaultHoldTime}s` : ""}</small>
                </div>
              ))}
            </div>
          )}

          <div className="el-field">
            <label className="el-label">Program</label>
            <div className="el-seg">
              <button type="button" className={`el-seg-btn ${programType === "home" ? "on home" : ""}`} onClick={() => setProgramType("home")}><Home size={13} /> Home program</button>
              <button type="button" className={`el-seg-btn ${programType === "clinic" ? "on" : ""}`} onClick={() => setProgramType("clinic")}><Building2 size={13} /> In clinic</button>
            </div>
          </div>

          <div className="el-field">
            <label className="el-label">Patient</label>
            {selected ? (
              <div className="el-selected-banner">
                <span className="el-patient-avatar">{selected.firstName[0]}{selected.lastName[0]}</span>
                <strong>{selected.firstName} {selected.lastName}</strong>
                <button type="button" className="el-change" onClick={() => setSelected(null)}>Change</button>
              </div>
            ) : (
              <>
                <input className="el-input" placeholder="Search name or phone…" value={search} onChange={(e) => setSearch(e.target.value)} autoFocus />
                <div className="el-patient-list">
                  {filtered.length === 0 && <div className="el-patient-empty">No patients match.</div>}
                  {filtered.map((p) => (
                    <div key={p.uid} className="el-patient-row" onClick={() => setSelected(p)}>
                      <div className="el-patient-avatar">{p.firstName[0]}{p.lastName[0]}</div>
                      <div>
                        <div className="el-patient-name">{p.firstName} {p.lastName}</div>
                        <div className="el-patient-cond">{p.phone || "—"}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {single && (
            <>
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
                <label className="el-label">Note for the patient</label>
                <textarea className="el-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any patient-specific instructions…" />
              </div>
            </>
          )}
          {!single && <div className="el-hint">Each exercise uses its library sets, reps and hold. You can fine-tune them on the patient's sheet.</div>}

          {assignedTo.length > 0 && (
            <div className="el-success">
              <Check size={14} strokeWidth={2.5} /> Assigned to {assignedTo.join(", ")}. Pick another patient to assign again.
            </div>
          )}
        </div>

        <div className="el-modal-ft">
          <button type="button" className="el-btn-cancel" onClick={onClose}>{assignedTo.length > 0 ? "Done" : "Cancel"}</button>
          <button type="button" className="el-btn-primary" disabled={!selected || saving} onClick={handleAssign}>
            {saving
              ? <><span className="el-spinner" /> Assigning…</>
              : <><Check size={13} strokeWidth={2.5} /> Assign{single ? "" : ` ${exercises.length}`}</>
            }
          </button>
        </div>

      </div>
    </div>,
    document.body
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type SortKey = "name" | "newest" | "used" | "category";

function cardThumb(ex: LibraryExercise): string | null {
  const v = exerciseVideo(ex);
  if (v) return v.thumb;
  return ex.mediaUrl && isImage(ex.mediaUrl) ? ex.mediaUrl : null;
}

function toShowboxItem(ex: LibraryExercise): ShowboxItem {
  return {
    key: ex.id, title: ex.name, video: exerciseVideo(ex),
    dosage: `${ex.defaultSets} sets · ${ex.defaultReps} reps${ex.defaultHoldTime > 0 ? ` · ${ex.defaultHoldTime}s hold` : ""}`,
    tags: [ex.category, ex.equipment], difficulty: ex.difficulty,
    description: ex.description, precautions: ex.precautions,
    notes: ex.notes, notesLabel: "Default note",
  };
}

export default function ExerciseLibraryPage({
  physioId,
  isManager,
  isSenior = false,
}: ExerciseLibraryPageProps) {
  const canEdit = isManager || isSenior;
  const [exercises,   setExercises]   = useState<LibraryExercise[]>([]);
  const [patients,    setPatients]    = useState<Patient[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [usage,       setUsage]       = useState<Map<string, number>>(new Map());
  const [search,         setSearch]         = useState("");
  const [filterCat,      setFilterCat]      = useState("");
  const [filterEquipment,setFilterEquipment]= useState("");
  const [filterDiff,     setFilterDiff]     = useState("");
  const [videoOnly,      setVideoOnly]      = useState(false);
  const [sort,           setSort]           = useState<SortKey>("name");
  const [modal,       setModal]       = useState<ModalMode | null>(null);
  const [editTarget,  setEditTarget]  = useState<LibraryExercise | null>(null);
  const [assignList,  setAssignList]  = useState<LibraryExercise[]>([]);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);
  const [selecting,   setSelecting]   = useState(false);
  const [picked,      setPicked]      = useState<Set<string>>(new Set());
  const [viewing,     setViewing]     = useState<number | null>(null);

  // Realtime: exercise library
  useEffect(() => {
    return subscribeToExerciseLibrary(
      (data) => { setExercises(data); setLoading(false); },
      ()     => setLoading(false)
    );
  }, []);

  // How many patients use each exercise (one read; refreshed after assigning)
  const refreshUsage = useCallback(() => { fetchExerciseUsage().then(setUsage).catch(() => {}); }, []);
  useEffect(refreshUsage, [refreshUsage]);

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
    const n = usage.get(ex.id) ?? 0;
    const extra = n > 0 ? `\n\n${n} patient${n > 1 ? "s" : ""} already have it — their programs keep their copy.` : "";
    if (!window.confirm(`Delete "${ex.name}" from the library? This cannot be undone.${extra}`)) return;
    setDeletingId(ex.id);
    const result = await deleteExercise(ex.id);
    setDeletingId(null);
    if (result.error) { showToast("Error: " + result.error); return; }
    showToast(`"${ex.name}" removed from library`);
  };

  const handleDuplicate = async (ex: LibraryExercise) => {
    const r = await duplicateExercise(ex);
    showToast(r.error ? "Error: " + r.error : `Copied "${ex.name}"`);
  };

  const openEdit = (ex: LibraryExercise) => { setViewing(null); setEditTarget(ex); setModal("edit"); };
  const openAssign = (list: LibraryExercise[]) => { setViewing(null); setAssignList(list); setModal("assign"); };
  const togglePick = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  // Filtered + sorted list
  const q = search.trim().toLowerCase();
  const base = exercises.filter((ex) =>
    (!q || ex.name.toLowerCase().includes(q) || ex.description.toLowerCase().includes(q) || ex.category.toLowerCase().includes(q)) &&
    (!filterEquipment || ex.equipment === filterEquipment) &&
    (!filterDiff || ex.difficulty === filterDiff) &&
    (!videoOnly || !!exerciseVideo(ex)));
  const displayed = base.filter((ex) => !filterCat || ex.category === filterCat).sort((a, b) => {
    if (sort === "used") return (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0) || a.name.localeCompare(b.name);
    if (sort === "newest") return (b.createdAt?.toMillis?.() ?? 0) - (a.createdAt?.toMillis?.() ?? 0);
    if (sort === "category") return (a.category || "~").localeCompare(b.category || "~") || a.name.localeCompare(b.name);
    return a.name.localeCompare(b.name);
  });

  const catCounts = new Map<string, number>();
  base.forEach((e) => { if (e.category) catCounts.set(e.category, (catCounts.get(e.category) ?? 0) + 1); });
  const categories    = [...catCounts.keys()].sort();
  const usedEquipment = Array.from(new Set(exercises.map((e) => e.equipment).filter(Boolean))).sort();
  const withVideo     = exercises.filter((e) => exerciseVideo(e)).length;
  const pickedList    = exercises.filter((e) => picked.has(e.id));
  const anyFilter     = !!(q || filterCat || filterEquipment || filterDiff || videoOnly);

  return (
    <>
      <style>{`
        .el-root { font-family: 'Outfit', sans-serif; padding-bottom: 80px; }

        /* ── Hero ── */
        .el-hero { display: flex; justify-content: space-between; align-items: center; gap: 16px; flex-wrap: wrap; padding: 20px 22px; border-radius: 20px; background: linear-gradient(135deg, #0C3C60 0%, #2E8BC0 100%); color: #fff; margin-bottom: 16px; }
        .el-title { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 500; letter-spacing: -0.02em; }
        .el-hero-stats { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
        .el-hero-stat { font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 100px; background: rgba(255,255,255,.16); }
        .el-hero-actions { display: flex; gap: 8px; flex-wrap: wrap; }
        .el-add-btn { display: inline-flex; align-items: center; gap: 7px; padding: 10px 16px; border-radius: 12px; border: none; background: #fff; color: #0C3C60; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; min-height: 44px; white-space: nowrap; }
        .el-add-btn:hover { background: #EAF5FC; }
        .el-ghost-btn { display: inline-flex; align-items: center; gap: 7px; padding: 10px 14px; border-radius: 12px; border: 1.5px solid rgba(255,255,255,.4); background: transparent; color: #fff; font-family: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; min-height: 44px; white-space: nowrap; }
        .el-ghost-btn.on { background: rgba(255,255,255,.2); border-color: #fff; }

        /* ── Toolbar ── */
        .el-toolbar { background: #fff; border: 1.5px solid #e5e0d8; border-radius: 16px; padding: 12px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 14px; }
        .el-toolbar-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
        .el-search { flex: 1 1 220px; display: flex; align-items: center; gap: 8px; padding: 0 12px; border-radius: 12px; border: 1.5px solid #e5e0d8; background: #fafaf8; color: #9a9590; min-height: 44px; }
        .el-search:focus-within { border-color: #2E8BC0; background: #fff; }
        .el-search input { flex: 1; min-width: 0; border: none; outline: none; background: transparent; font-family: inherit; font-size: 14px; color: #1a1a1a; }
        .el-filter { font-family: inherit; padding: 0 28px 0 12px; border-radius: 12px; border: 1.5px solid #e5e0d8; background-color: #fafaf8; font-size: 13px; color: #5a5550; min-height: 44px; cursor: pointer; appearance: none; -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239a9590' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; }
        .el-filter.on { border-color: #2E8BC0; color: #0C3C60; background-color: #EAF5FC; }
        .el-toggle { display: inline-flex; align-items: center; gap: 6px; padding: 0 12px; min-height: 44px; border-radius: 12px; border: 1.5px solid #e5e0d8; background: #fafaf8; font-family: inherit; font-size: 13px; font-weight: 600; color: #5a5550; cursor: pointer; }
        .el-toggle.on { border-color: #2E8BC0; color: #0C3C60; background: #EAF5FC; }
        .el-chip-row { display: flex; gap: 6px; overflow-x: auto; padding-bottom: 2px; scrollbar-width: thin; }
        .el-chip { flex-shrink: 0; padding: 6px 12px; border-radius: 100px; border: 1.5px solid #e5e0d8; background: #fff; font-family: inherit; font-size: 12.5px; font-weight: 600; color: #5a5550; cursor: pointer; white-space: nowrap; }
        .el-chip span { color: #9a9590; margin-left: 3px; font-weight: 500; }
        .el-chip:hover { border-color: #B3DEF0; }
        .el-chip.active { border-color: #0C3C60; background: #0C3C60; color: #fff; } .el-chip.active span { color: rgba(255,255,255,.7); }
        .el-count-row { display: flex; justify-content: space-between; align-items: center; font-size: 12.5px; color: #9a9590; margin-bottom: 10px; }
        .el-clear { background: none; border: none; color: #2E8BC0; font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }

        /* ── Cards ── */
        .el-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }
        .el-card { position: relative; background: #fff; border: 1.5px solid #e5e0d8; border-radius: 18px; overflow: hidden; display: flex; flex-direction: column; transition: box-shadow .18s, border-color .18s, transform .18s; }
        .el-card:hover { border-color: #B3DEF0; box-shadow: 0 10px 28px rgba(12,60,96,.10); transform: translateY(-2px); }
        .el-card.picked { border-color: #2E8BC0; box-shadow: 0 0 0 3px rgba(46,139,192,.18); }
        .el-media { position: relative; aspect-ratio: 16 / 9; background: linear-gradient(135deg, #D6EEF8, #EAF5FC); border: none; padding: 0; cursor: pointer; overflow: hidden; display: block; width: 100%; }
        .el-media img { width: 100%; height: 100%; object-fit: cover; transition: transform .3s; }
        .el-card:hover .el-media img { transform: scale(1.04); }
        .el-media-ph { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; color: #2E8BC0; font-size: 12px; font-weight: 600; }
        .el-media::after { content: ""; position: absolute; inset: 0; background: linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,.35)); pointer-events: none; }
        .el-play { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); width: 50px; height: 50px; border-radius: 50%; background: rgba(255,255,255,.94); color: #0C3C60; display: flex; align-items: center; justify-content: center; padding-left: 3px; box-shadow: 0 6px 20px rgba(0,0,0,.25); transition: transform .15s; z-index: 1; }
        .el-card:hover .el-play { transform: translate(-50%,-50%) scale(1.1); }
        .el-badge { position: absolute; z-index: 1; font-size: 10.5px; font-weight: 700; padding: 3px 8px; border-radius: 100px; text-transform: uppercase; letter-spacing: .04em; }
        .el-badge.short { right: 8px; bottom: 8px; background: #ff0033; color: #fff; }
        .el-badge.diff { left: 8px; top: 8px; }
        .d-easy { background: #dcfce7; color: #166534; } .d-moderate { background: #fef3c7; color: #92400e; } .d-hard { background: #fee2e2; color: #991b1b; }
        .el-pick { position: absolute; right: 8px; top: 8px; z-index: 2; width: 26px; height: 26px; border-radius: 8px; border: 2px solid #fff; background: rgba(0,0,0,.3); color: #fff; display: flex; align-items: center; justify-content: center; cursor: pointer; }
        .el-card.picked .el-pick { background: #2E8BC0; border-color: #2E8BC0; }
        .el-body { padding: 12px 14px 4px; display: flex; flex-direction: column; gap: 6px; flex: 1; }
        .el-name { font-size: 15px; font-weight: 700; color: #1a1a1a; line-height: 1.25; cursor: pointer; }
        .el-tags { display: flex; gap: 5px; flex-wrap: wrap; }
        .el-tag { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 100px; background: #EAF5FC; color: #0C3C60; }
        .el-tag.eq { background: #f3f4f6; color: #374151; }
        .el-desc { font-size: 12.5px; color: #7a7570; line-height: 1.45; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .el-meta { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; font-size: 12px; color: #9a9590; margin-top: auto; padding-top: 4px; }
        .el-dose { font-weight: 700; color: #0C3C60; }
        .el-used { display: inline-flex; align-items: center; gap: 4px; }
        .el-caution { display: inline-flex; align-items: center; gap: 3px; color: #dc2626; font-weight: 600; }
        .el-actions { display: flex; gap: 6px; padding: 10px 14px 14px; }
        .el-btn-assign { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 10px; border-radius: 10px; border: none; background: #2E8BC0; color: #fff; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
        .el-btn-assign:hover { background: #0C3C60; }
        .el-icon-btn { width: 36px; height: 36px; flex-shrink: 0; border-radius: 10px; border: 1.5px solid #e5e0d8; background: #fafaf8; color: #7a7570; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; }
        .el-icon-btn:hover { border-color: #B3DEF0; color: #2E8BC0; }
        .el-icon-btn.del:hover { border-color: #fca5a5; color: #b91c1c; background: #fff5f3; }
        .el-icon-btn:disabled { opacity: .5; cursor: wait; }
        .el-viewonly { font-size: 12px; color: #c0bbb4; font-style: italic; padding: 8px 0; }
        .el-skel-card { height: 280px; border-radius: 18px; background: linear-gradient(90deg, #f0ede8 0%, #e5e0d8 50%, #f0ede8 100%); background-size: 200% 100%; animation: elShimmer 1.4s ease infinite; }

        /* ── Bulk bar ── */
        .el-bulkbar { position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%); z-index: 900; display: flex; align-items: center; gap: 10px; padding: 10px 10px 10px 18px; border-radius: 16px; background: #0C3C60; color: #fff; box-shadow: 0 14px 40px rgba(12,60,96,.35); font-size: 14px; font-weight: 600; animation: elToastIn .25s cubic-bezier(.16,1,.3,1) both; max-width: calc(100vw - 24px); }
        .el-bulkbar button { border: none; border-radius: 10px; padding: 9px 14px; font-family: inherit; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
        .el-bulkbar .go { background: #fff; color: #0C3C60; } .el-bulkbar .go:disabled { opacity: .5; }
        .el-bulkbar .x { background: rgba(255,255,255,.14); color: #fff; }

        /* ── Modal extras ── */
        .el-seg { display: flex; gap: 6px; flex-wrap: wrap; }
        .el-seg-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 10px; border-radius: 10px; border: 1.5px solid #e5e0d8; background: #fff; font-family: inherit; font-size: 13px; font-weight: 600; color: #7a7570; cursor: pointer; white-space: nowrap; }
        .el-seg-btn.on { border-color: #2E8BC0; background: #2E8BC0; color: #fff; }
        .el-seg-btn.on.home { border-color: #059669; background: #059669; }
        .el-seg-btn.on.d-easy { background: #16a34a; border-color: #16a34a; color: #fff; }
        .el-seg-btn.on.d-moderate { background: #d97706; border-color: #d97706; color: #fff; }
        .el-seg-btn.on.d-hard { background: #dc2626; border-color: #dc2626; color: #fff; }
        .el-seg-btn.on.d-none { background: #5a5550; border-color: #5a5550; }
        .el-bulk-list { display: flex; flex-direction: column; gap: 4px; max-height: 160px; overflow-y: auto; border: 1.5px solid #e5e0d8; border-radius: 12px; padding: 6px; background: #fafaf8; }
        .el-bulk-item { display: flex; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 600; color: #1a1a1a; padding: 6px 8px; }
        .el-bulk-item small { color: #9a9590; font-weight: 500; white-space: nowrap; }
        .el-hint { font-size: 12px; color: #9a9590; }
        .el-change { margin-left: auto; background: none; border: none; color: #2E8BC0; font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; }
        .el-success { display: flex; align-items: flex-start; gap: 8px; background: #dcfce7; border: 1px solid #86efac; border-radius: 10px; padding: 10px 12px; font-size: 13px; color: #166534; }
        .el-sb-actions { display: flex; gap: 8px; }
        .el-sb-actions .el-btn-assign { padding: 11px; font-size: 14px; }

        @media (max-width: 600px) {
          .el-hero { padding: 16px; border-radius: 16px; }
          .el-hero-actions { width: 100%; } .el-hero-actions button { flex: 1; justify-content: center; }
          .el-filter, .el-toggle { flex: 1 1 calc(50% - 8px); }
          .el-grid { grid-template-columns: 1fr 1fr; gap: 10px; }
          .el-body { padding: 10px 10px 2px; } .el-name { font-size: 13.5px; }
          .el-desc { display: none; }
          .el-actions { padding: 8px 10px 10px; flex-wrap: wrap; }
          .el-btn-assign { flex-basis: 100%; }
          .el-icon-btn { flex: 1; height: 32px; }
          .el-play { width: 40px; height: 40px; }
          .el-sb-actions .el-icon-btn { flex: 0 0 44px; height: 44px; }
        }
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
          display: flex; align-items: center; gap: 10px;
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

        {/* Hero */}
        <div className="el-hero">
          <div>
            <div className="el-title">Exercise Library</div>
            <div className="el-hero-stats">
              <span className="el-hero-stat">{loading ? "Loading…" : `${exercises.length} exercises`}</span>
              {!loading && <span className="el-hero-stat">{withVideo} with video</span>}
              {!loading && <span className="el-hero-stat">{new Set(exercises.map((e) => e.category).filter(Boolean)).size} categories</span>}
            </div>
          </div>
          {canEdit && (
            <div className="el-hero-actions">
              <button className={`el-ghost-btn ${selecting ? "on" : ""}`} onClick={() => { setSelecting((v) => !v); setPicked(new Set()); }}>
                <ListChecks size={15} /> {selecting ? "Cancel selection" : "Select to assign"}
              </button>
              <button className="el-add-btn" onClick={() => setModal("add")}><Plus size={15} strokeWidth={2.5} /> Add Exercise</button>
            </div>
          )}
        </div>

        {/* Toolbar */}
        <div className="el-toolbar">
          <div className="el-toolbar-row">
            <label className="el-search"><Search size={15} />
              <input placeholder="Search exercises…" value={search} onChange={(e) => setSearch(e.target.value)} />
              {search && <X size={14} style={{ cursor: "pointer" }} onClick={() => setSearch("")} />}
            </label>
            <select className={`el-filter ${filterEquipment ? "on" : ""}`} value={filterEquipment} onChange={(e) => setFilterEquipment(e.target.value)}>
              <option value="">Any equipment</option>
              {usedEquipment.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
            </select>
            <select className={`el-filter ${filterDiff ? "on" : ""}`} value={filterDiff} onChange={(e) => setFilterDiff(e.target.value)}>
              <option value="">Any difficulty</option>
              {(["easy", "moderate", "hard"] as const).map((d) => <option key={d} value={d}>{DIFF_LABEL[d]}</option>)}
            </select>
            <button className={`el-toggle ${videoOnly ? "on" : ""}`} onClick={() => setVideoOnly((v) => !v)}><Video size={14} /> Has video</button>
            <select className="el-filter" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
              <option value="name">Sort: A–Z</option>
              <option value="newest">Sort: Newest</option>
              <option value="used">Sort: Most used</option>
              <option value="category">Sort: Category</option>
            </select>
          </div>
          {categories.length > 0 && (
            <div className="el-chip-row">
              <button className={`el-chip${filterCat === "" ? " active" : ""}`} onClick={() => setFilterCat("")}>All<span>{base.length}</span></button>
              {categories.map((c) => (
                <button key={c} className={`el-chip${filterCat === c ? " active" : ""}`} onClick={() => setFilterCat(filterCat === c ? "" : c)}>
                  {c}<span>{catCounts.get(c)}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {!loading && (
          <div className="el-count-row">
            <span>{displayed.length === exercises.length ? `Showing all ${displayed.length}` : `${displayed.length} of ${exercises.length}`}{selecting ? " · tap cards to select" : ""}</span>
            {(anyFilter || filterCat) && <button className="el-clear" onClick={() => { setSearch(""); setFilterCat(""); setFilterEquipment(""); setFilterDiff(""); setVideoOnly(false); }}>Clear filters</button>}
          </div>
        )}

        {/* Exercise grid */}
        {loading ? (
          <div className="el-grid">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="el-skel-card" />)}</div>
        ) : displayed.length === 0 ? (
          <div className="el-empty">
            <div className="el-empty-icon">🏋️</div>
            <div className="el-empty-title">{exercises.length === 0 ? "No exercises yet" : "No results found"}</div>
            <div className="el-empty-sub">{exercises.length === 0 ? "Add exercises to the library to get started." : "Try a different search or filter."}</div>
            {exercises.length === 0 && canEdit && (
              <button className="el-add-btn" style={{ background: "#2E8BC0", color: "#fff" }} onClick={() => setModal("add")}><Plus size={15} /> Add First Exercise</button>
            )}
          </div>
        ) : (
          <div className="el-grid">
            {displayed.map((ex, i) => {
              const thumb = cardThumb(ex);
              const v = exerciseVideo(ex);
              const used = usage.get(ex.id) ?? 0;
              const isPicked = picked.has(ex.id);
              const open = () => (selecting ? togglePick(ex.id) : setViewing(i));
              return (
                <div key={ex.id} className={`el-card ${isPicked ? "picked" : ""}`}>
                  <button className="el-media" onClick={open} aria-label={`View ${ex.name}`}>
                    {thumb ? <img src={thumb} alt="" loading="lazy" /> : <span className="el-media-ph"><Dumbbell size={26} />{ex.category || "Exercise"}</span>}
                    {v && !selecting && <span className="el-play"><Play size={20} fill="currentColor" /></span>}
                    {v?.isShort && <span className="el-badge short">Short</span>}
                    {ex.difficulty && <span className={`el-badge diff d-${ex.difficulty}`}>{DIFF_LABEL[ex.difficulty]}</span>}
                  </button>
                  {selecting && <span className="el-pick" onClick={() => togglePick(ex.id)}>{isPicked && <Check size={14} strokeWidth={3} />}</span>}
                  <div className="el-body">
                    <div className="el-name" onClick={open}>{ex.name}</div>
                    <div className="el-tags">
                      {ex.category && <span className="el-tag">{ex.category}</span>}
                      {ex.equipment && <span className="el-tag eq">{ex.equipment}</span>}
                    </div>
                    {ex.description && <div className="el-desc">{ex.description}</div>}
                    <div className="el-meta">
                      <span className="el-dose">{ex.defaultSets} × {ex.defaultReps}{ex.defaultHoldTime > 0 ? ` · ${ex.defaultHoldTime}s` : ""}</span>
                      <span className="el-used" title="Patients with this exercise in their program"><Users size={12} /> {used}</span>
                      {ex.precautions && <span className="el-caution" title={ex.precautions}><AlertTriangle size={12} /> Caution</span>}
                    </div>
                  </div>
                  <div className="el-actions">
                    {canEdit ? (
                      <>
                        <button className="el-btn-assign" onClick={() => openAssign([ex])}><UserPlus size={14} /> Assign</button>
                        <button className="el-icon-btn" title="Edit" onClick={() => openEdit(ex)}><Pencil size={14} /></button>
                        <button className="el-icon-btn" title="Duplicate" onClick={() => handleDuplicate(ex)}><Copy size={14} /></button>
                        <button className="el-icon-btn del" title="Delete" disabled={deletingId === ex.id} onClick={() => handleDelete(ex)}><Trash2 size={14} /></button>
                      </>
                    ) : <span className="el-viewonly">View only</span>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bulk selection bar */}
      {selecting && (
        <div className="el-bulkbar">
          <span>{picked.size} selected</span>
          <button className="go" disabled={picked.size === 0} onClick={() => openAssign(pickedList)}>Assign to patient</button>
          <button className="x" onClick={() => { setSelecting(false); setPicked(new Set()); }}>Cancel</button>
        </div>
      )}

      {/* Video showbox */}
      {viewing !== null && displayed[viewing] && (
        <VideoShowbox
          items={displayed.map(toShowboxItem)}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          footer={canEdit ? (item) => {
            const ex = displayed.find((e) => e.id === item.key);
            return ex ? (
              <div className="el-sb-actions">
                <button className="el-btn-assign" onClick={() => openAssign([ex])}><UserPlus size={15} /> Assign to patient</button>
                <button className="el-icon-btn" style={{ width: 44, height: 44 }} title="Edit" onClick={() => openEdit(ex)}><Pencil size={15} /></button>
              </div>
            ) : null;
          } : undefined}
        />
      )}

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
      {modal === "assign" && assignList.length > 0 && (
        <AssignModal
          exercises={assignList}
          patients={patients}
          physioId={physioId}
          onAssigned={refreshUsage}
          onClose={() => {
            setModal(null); setAssignList([]);
            if (selecting) { setSelecting(false); setPicked(new Set()); }
          }}
        />
      )}

      {/* Toast */}
      {toast && <div className="el-toast">{toast}</div>}
    </>
  );
}
