// FILE: src/features/diagnoses/DiagnosisTemplatesPage.tsx
import { useState, useEffect } from "react";
import { Plus, Trash2, Edit2, X, Check, ChevronDown, ChevronUp } from "lucide-react";
import {
  subscribeToTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  type DiagnosisTemplate,
  type TemplateExercise,
  type CreateTemplatePayload,
} from "../../services/diagnosisTemplateService";
import {
  subscribeToExerciseLibrary,
  type LibraryExercise,
} from "../../services/exerciseService";

// ─── Constants ────────────────────────────────────────────────────────────────

const TREATMENT_TYPES = [
  "Manual Therapy", "Exercise Therapy", "Stretching",
  "Strength Training", "Dry Needling", "Mobility Work", "Other",
];

const EMPTY_DRAFT: CreateTemplatePayload = {
  name: "", bodyPart: "", description: "",
  primaryDiagnosis: "", icdCode: "", mechanism: "", contraindications: "",
  treatmentType: "Exercise Therapy", treatmentGoals: "", treatmentNotes: "",
  exercises: [],
  createdBy: "",
};

// ─── Exercise picker sub-component ───────────────────────────────────────────

function ExercisePicker({
  selected,
  onChange,
}: {
  selected: TemplateExercise[];
  onChange: (ex: TemplateExercise[]) => void;
}) {
  const [library,   setLibrary]   = useState<LibraryExercise[]>([]);
  const [search,    setSearch]    = useState("");
  const [bodyPart,  setBodyPart]  = useState("");
  const [open,      setOpen]      = useState(false);

  useEffect(() => subscribeToExerciseLibrary(setLibrary, () => {}), []);

  const categories = [...new Set(library.map((e) => e.category).filter(Boolean))].sort();
  const filtered   = library.filter((e) => {
    const q = search.toLowerCase();
    return (!q || e.name.toLowerCase().includes(q) || e.category.toLowerCase().includes(q))
      && (!bodyPart || e.category === bodyPart);
  });

  const isSelected = (id: string) => selected.some((s) => s.exerciseId === id);

  const toggle = (ex: LibraryExercise) => {
    if (isSelected(ex.id)) {
      onChange(selected.filter((s) => s.exerciseId !== ex.id));
    } else {
      onChange([...selected, {
        exerciseId:   ex.id,
        exerciseName: ex.name,
        sets:         ex.defaultSets,
        reps:         ex.defaultReps,
        holdTime:     ex.defaultHoldTime,
        notes:        ex.notes,
        programType:  "clinic",
        mediaUrl:     ex.mediaUrl,
        videoId:      ex.videoId,
      }]);
    }
  };

  const updateEx = (idx: number, patch: Partial<TemplateExercise>) => {
    const next = [...selected];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  };

  const removeEx = (idx: number) => onChange(selected.filter((_, i) => i !== idx));

  return (
    <div className="dt-ex-wrap">
      <div className="dt-ex-header" onClick={() => setOpen((o) => !o)}>
        <span className="dt-field-label" style={{ marginBottom: 0 }}>
          Exercises <span className="dt-badge">{selected.length}</span>
        </span>
        {open ? <ChevronUp size={14} strokeWidth={2} /> : <ChevronDown size={14} strokeWidth={2} />}
      </div>

      {open && (
        <div className="dt-ex-body">
          {/* Library search */}
          <div className="dt-ex-search-row">
            <input
              className="dt-input"
              placeholder="Search library…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {categories.length > 0 && (
            <div className="dt-chip-row">
              <button className={`dt-chip${bodyPart === "" ? " active" : ""}`} onClick={() => setBodyPart("")}>All</button>
              {categories.map((c) => (
                <button key={c} className={`dt-chip${bodyPart === c ? " active" : ""}`} onClick={() => setBodyPart(bodyPart === c ? "" : c)}>{c}</button>
              ))}
            </div>
          )}
          <div className="dt-ex-list">
            {filtered.map((ex) => (
              <div key={ex.id} className={`dt-ex-row${isSelected(ex.id) ? " selected" : ""}`} onClick={() => toggle(ex)}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="dt-ex-name">{ex.name}</div>
                  {ex.category && <span className="dt-cat-chip">{ex.category}</span>}
                </div>
                <div className={`dt-ex-check${isSelected(ex.id) ? " on" : ""}`}>
                  {isSelected(ex.id) && <Check size={11} strokeWidth={3} />}
                </div>
              </div>
            ))}
            {filtered.length === 0 && <div className="dt-ex-empty">No exercises found</div>}
          </div>

          {/* Selected list with editable sets/reps */}
          {selected.length > 0 && (
            <div className="dt-sel-list">
              <div className="dt-sel-heading">Selected exercises</div>
              {selected.map((ex, i) => (
                <div key={ex.exerciseId} className="dt-sel-row">
                  <div className="dt-sel-name">{ex.exerciseName}</div>
                  <div className="dt-sel-controls">
                    <label>Sets
                      <input type="number" min={1} max={20} value={ex.sets}
                        onChange={(e) => updateEx(i, { sets: parseInt(e.target.value) || 1 })} />
                    </label>
                    <label>Reps
                      <input type="number" min={1} max={100} value={ex.reps}
                        onChange={(e) => updateEx(i, { reps: parseInt(e.target.value) || 1 })} />
                    </label>
                    <label>Hold(s)
                      <input type="number" min={0} max={120} value={ex.holdTime}
                        onChange={(e) => updateEx(i, { holdTime: parseInt(e.target.value) || 0 })} />
                    </label>
                    <select value={ex.programType} onChange={(e) => updateEx(i, { programType: e.target.value as "clinic" | "home" })}>
                      <option value="clinic">Clinic</option>
                      <option value="home">Home</option>
                    </select>
                    <button className="dt-sel-remove" onClick={() => removeEx(i)} title="Remove"><X size={12} strokeWidth={2.5} /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Template form ────────────────────────────────────────────────────────────

function TemplateForm({
  initial,
  physioId,
  onSaved,
  onCancel,
}: {
  initial?:  DiagnosisTemplate;
  physioId:  string;
  onSaved:   () => void;
  onCancel:  () => void;
}) {
  const [draft,   setDraft]   = useState<CreateTemplatePayload>(
    initial
      ? {
          name: initial.name, bodyPart: initial.bodyPart, description: initial.description,
          primaryDiagnosis: initial.primaryDiagnosis, icdCode: initial.icdCode,
          mechanism: initial.mechanism, contraindications: initial.contraindications,
          treatmentType: initial.treatmentType, treatmentGoals: initial.treatmentGoals,
          treatmentNotes: initial.treatmentNotes, exercises: initial.exercises,
          createdBy: initial.createdBy || physioId,
        }
      : { ...EMPTY_DRAFT, createdBy: physioId },
  );
  const [saving,  setSaving]  = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  const set = (key: keyof CreateTemplatePayload, val: unknown) =>
    setDraft((d) => ({ ...d, [key]: val }));

  const handleSave = async () => {
    if (!draft.name.trim()) { setError("Template name is required."); return; }
    setSaving(true); setError(null);
    const res = initial
      ? await updateTemplate(initial.id, draft)
      : await createTemplate(draft);
    setSaving(false);
    if ("error" in res && res.error) { setError(res.error); return; }
    onSaved();
  };

  return (
    <div className="dt-form">
      <div className="dt-form-section">
        <div className="dt-section-title">Basic Info</div>
        <div className="dt-grid2">
          <div className="dt-field">
            <label className="dt-field-label">Template Name *</label>
            <input className="dt-input" placeholder="e.g. Shoulder Impingement Protocol"
              value={draft.name} onChange={(e) => set("name", e.target.value)} />
          </div>
          <div className="dt-field">
            <label className="dt-field-label">Body Part / Category</label>
            <input className="dt-input" placeholder="e.g. Shoulder, Knee, Lower Back"
              value={draft.bodyPart} onChange={(e) => set("bodyPart", e.target.value)} />
          </div>
        </div>
        <div className="dt-field">
          <label className="dt-field-label">Description</label>
          <textarea className="dt-textarea" rows={2} placeholder="Brief description of this diagnosis…"
            value={draft.description} onChange={(e) => set("description", e.target.value)} />
        </div>
      </div>

      <div className="dt-form-section">
        <div className="dt-section-title">Diagnosis</div>
        <div className="dt-grid2">
          <div className="dt-field">
            <label className="dt-field-label">Primary Diagnosis</label>
            <input className="dt-input" placeholder="e.g. Rotator Cuff Tendinopathy"
              value={draft.primaryDiagnosis} onChange={(e) => set("primaryDiagnosis", e.target.value)} />
          </div>
          <div className="dt-field">
            <label className="dt-field-label">ICD Code</label>
            <input className="dt-input" placeholder="e.g. M75.1"
              value={draft.icdCode} onChange={(e) => set("icdCode", e.target.value)} />
          </div>
        </div>
        <div className="dt-field">
          <label className="dt-field-label">Mechanism / Cause</label>
          <input className="dt-input" placeholder="e.g. Overuse, repetitive overhead activity"
            value={draft.mechanism} onChange={(e) => set("mechanism", e.target.value)} />
        </div>
        <div className="dt-field">
          <label className="dt-field-label">Contraindications</label>
          <textarea className="dt-textarea" rows={2} placeholder="List any contraindications…"
            value={draft.contraindications} onChange={(e) => set("contraindications", e.target.value)} />
        </div>
      </div>

      <div className="dt-form-section">
        <div className="dt-section-title">Treatment Program</div>
        <div className="dt-field">
          <label className="dt-field-label">Treatment Type</label>
          <select className="dt-input dt-select" value={draft.treatmentType}
            onChange={(e) => set("treatmentType", e.target.value)}>
            {TREATMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="dt-field">
          <label className="dt-field-label">Goals</label>
          <textarea className="dt-textarea" rows={2} placeholder="Treatment goals for this diagnosis…"
            value={draft.treatmentGoals} onChange={(e) => set("treatmentGoals", e.target.value)} />
        </div>
        <div className="dt-field">
          <label className="dt-field-label">Treatment Notes / Protocol</label>
          <textarea className="dt-textarea" rows={3} placeholder="Detailed treatment notes, protocol steps…"
            value={draft.treatmentNotes} onChange={(e) => set("treatmentNotes", e.target.value)} />
        </div>
      </div>

      <div className="dt-form-section">
        <div className="dt-section-title">Exercises</div>
        <ExercisePicker
          selected={draft.exercises}
          onChange={(ex) => set("exercises", ex)}
        />
      </div>

      {error && <div className="dt-error">{error}</div>}

      <div className="dt-form-actions">
        <button className="dt-btn-cancel" onClick={onCancel} disabled={saving}>Cancel</button>
        <button className="dt-btn-save" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : initial ? "Update Template" : "Create Template"}
        </button>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface DiagnosisTemplatesPageProps {
  physioId:  string;
  isManager: boolean;
}

export default function DiagnosisTemplatesPage({ physioId, isManager }: DiagnosisTemplatesPageProps) {
  const [templates,    setTemplates]    = useState<DiagnosisTemplate[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [bodyFilter,   setBodyFilter]   = useState("");
  const [search,       setSearch]       = useState("");
  const [creating,     setCreating]     = useState(false);
  const [editing,      setEditing]      = useState<DiagnosisTemplate | null>(null);
  const [delTarget,    setDelTarget]    = useState<DiagnosisTemplate | null>(null);
  const [deleting,     setDeleting]     = useState(false);
  const [expanded,     setExpanded]     = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    return subscribeToTemplates(
      (data) => { setTemplates(data); setLoading(false); },
      ()     => setLoading(false),
    );
  }, []);

  const bodyParts = [...new Set(templates.map((t) => t.bodyPart).filter(Boolean))].sort();

  const visible = templates.filter((t) => {
    const q = search.toLowerCase();
    return (!bodyFilter || t.bodyPart === bodyFilter)
      && (!q || t.name.toLowerCase().includes(q) || t.bodyPart.toLowerCase().includes(q));
  });

  const handleDelete = async () => {
    if (!delTarget) return;
    setDeleting(true);
    await deleteTemplate(delTarget.id);
    setDeleting(false);
    setDelTarget(null);
  };

  if (creating || editing) {
    return (
      <div className="dt-root">
        <style>{styles}</style>
        <div className="dt-page-header">
          <div>
            <div className="dt-page-title">{editing ? "Edit Template" : "New Diagnosis Template"}</div>
            <div className="dt-page-sub">{editing ? editing.name : "Build a reusable diagnosis with exercises & treatment plan"}</div>
          </div>
        </div>
        <TemplateForm
          initial={editing ?? undefined}
          physioId={physioId}
          onSaved={() => { setCreating(false); setEditing(null); }}
          onCancel={() => { setCreating(false); setEditing(null); }}
        />
      </div>
    );
  }

  return (
    <div className="dt-root">
      <style>{styles}</style>

      <div className="dt-page-header">
        <div>
          <div className="dt-page-title">Diagnosis Templates</div>
          <div className="dt-page-sub">
            {loading ? "Loading…" : `${templates.length} template${templates.length !== 1 ? "s" : ""} · assign to any patient in one click`}
          </div>
        </div>
        {isManager && (
          <button className="dt-btn-new" onClick={() => setCreating(true)}>
            <Plus size={14} strokeWidth={2.5} /> New Template
          </button>
        )}
      </div>

      {/* Search + filter */}
      <div className="dt-toolbar">
        <input className="dt-search" placeholder="Search templates…"
          value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      {bodyParts.length > 0 && (
        <div className="dt-chip-row" style={{ padding: "0 0 14px" }}>
          <button className={`dt-chip${bodyFilter === "" ? " active" : ""}`} onClick={() => setBodyFilter("")}>All</button>
          {bodyParts.map((b) => (
            <button key={b} className={`dt-chip${bodyFilter === b ? " active" : ""}`}
              onClick={() => setBodyFilter(bodyFilter === b ? "" : b)}>{b}</button>
          ))}
        </div>
      )}

      {/* List */}
      {loading && Array.from({ length: 3 }).map((_, i) => <div key={i} className="dt-skel" />)}

      {!loading && visible.length === 0 && (
        <div className="dt-empty">
          {templates.length === 0
            ? "No templates yet. Create your first diagnosis template."
            : "No templates match your search."}
        </div>
      )}

      {!loading && visible.map((t) => {
        const isOpen = expanded === t.id;
        return (
          <div key={t.id} className="dt-card">
            <div className="dt-card-row" onClick={() => setExpanded(isOpen ? null : t.id)}>
              <div className="dt-card-left">
                {t.bodyPart && <span className="dt-cat-chip">{t.bodyPart}</span>}
                <div className="dt-card-name">{t.name}</div>
                {t.description && <div className="dt-card-desc">{t.description}</div>}
              </div>
              <div className="dt-card-right">
                <span className="dt-card-stat">{t.exercises.length} exercise{t.exercises.length !== 1 ? "s" : ""}</span>
                {isManager && (
                  <>
                    <button className="dt-icon-btn" onClick={(e) => { e.stopPropagation(); setEditing(t); }}
                      title="Edit"><Edit2 size={13} strokeWidth={2} /></button>
                    <button className="dt-icon-btn danger" onClick={(e) => { e.stopPropagation(); setDelTarget(t); }}
                      title="Delete"><Trash2 size={13} strokeWidth={2} /></button>
                  </>
                )}
                {isOpen ? <ChevronUp size={14} strokeWidth={2} color="#9a9590" /> : <ChevronDown size={14} strokeWidth={2} color="#9a9590" />}
              </div>
            </div>

            {isOpen && (
              <div className="dt-card-detail">
                {t.primaryDiagnosis && (
                  <div className="dt-detail-row"><span className="dt-detail-key">Diagnosis</span><span>{t.primaryDiagnosis}{t.icdCode ? ` (${t.icdCode})` : ""}</span></div>
                )}
                {t.mechanism && (
                  <div className="dt-detail-row"><span className="dt-detail-key">Mechanism</span><span>{t.mechanism}</span></div>
                )}
                {t.treatmentType && (
                  <div className="dt-detail-row"><span className="dt-detail-key">Treatment</span><span>{t.treatmentType}</span></div>
                )}
                {t.treatmentGoals && (
                  <div className="dt-detail-row"><span className="dt-detail-key">Goals</span><span>{t.treatmentGoals}</span></div>
                )}
                {t.exercises.length > 0 && (
                  <div className="dt-detail-row" style={{ alignItems: "flex-start" }}>
                    <span className="dt-detail-key">Exercises</span>
                    <div className="dt-ex-preview-list">
                      {t.exercises.map((ex) => (
                        <div key={ex.exerciseId} className="dt-ex-preview-item">
                          <span className="dt-ex-preview-name">{ex.exerciseName}</span>
                          <span className="dt-ex-preview-meta">{ex.sets}×{ex.reps}{ex.holdTime > 0 ? ` · ${ex.holdTime}s` : ""} · {ex.programType}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Delete confirm */}
      {delTarget && (
        <div style={{ position: "fixed", inset: 0, zIndex: 1001, background: "rgba(10,15,10,0.45)", backdropFilter: "blur(3px)", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}
          onClick={(e) => { if (e.target === e.currentTarget) setDelTarget(null); }}>
          <div style={{ background: "#fff", borderRadius: 20, padding: 28, width: "min(360px,100%)", boxShadow: "0 24px 80px rgba(0,0,0,0.18)", fontFamily: "'Outfit',sans-serif" }}>
            <div style={{ fontSize: 32, textAlign: "center", marginBottom: 12 }}>🗑️</div>
            <div style={{ fontSize: 17, fontWeight: 600, textAlign: "center", marginBottom: 8 }}>Delete Template?</div>
            <div style={{ fontSize: 13, color: "#5a5550", textAlign: "center", marginBottom: 24 }}>
              "<strong>{delTarget.name}</strong>" will be permanently removed.
            </div>
            <div style={{ display: "flex", gap: 10 }}>
              <button className="dt-btn-cancel" style={{ flex: 1 }} onClick={() => setDelTarget(null)} disabled={deleting}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex: 1, padding: "11px", borderRadius: 10, border: "none", background: "#b91c1c", color: "#fff", fontFamily: "'Outfit',sans-serif", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                {deleting ? "Deleting…" : "Yes, Delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = `
  .dt-root { font-family: 'Outfit', sans-serif; }

  .dt-page-header {
    display: flex; align-items: flex-start; justify-content: space-between;
    gap: 12px; margin-bottom: 20px; flex-wrap: wrap;
  }
  .dt-page-title { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 500; color: #1a1a1a; margin-bottom: 3px; }
  .dt-page-sub   { font-size: 13px; color: #9a9590; }

  .dt-btn-new {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 9px 16px; border-radius: 10px; border: none;
    background: #2E8BC0; color: #fff;
    font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600;
    cursor: pointer; transition: background 0.15s; flex-shrink: 0;
  }
  .dt-btn-new:hover { background: #0C3C60; }

  .dt-toolbar { margin-bottom: 10px; }
  .dt-search {
    width: 100%; padding: 10px 14px; border-radius: 10px;
    border: 1.5px solid #e5e0d8; background: #fafaf8;
    font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
    outline: none; transition: border-color 0.15s; box-sizing: border-box;
  }
  .dt-search:focus { border-color: #2E8BC0; background: #fff; }

  .dt-chip-row { display: flex; flex-wrap: nowrap; gap: 6px; overflow-x: auto; scrollbar-width: none; padding-bottom: 4px; }
  .dt-chip-row::-webkit-scrollbar { display: none; }
  .dt-chip {
    padding: 4px 12px; border-radius: 100px; white-space: nowrap; flex-shrink: 0;
    border: 1.5px solid #e5e0d8; background: #fafaf8;
    font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500;
    color: #5a5550; cursor: pointer; transition: all 0.15s;
  }
  .dt-chip:hover { border-color: #B3DEF0; color: #2E8BC0; }
  .dt-chip.active { background: #2E8BC0; border-color: #2E8BC0; color: #fff; }

  .dt-skel {
    height: 72px; border-radius: 14px; margin-bottom: 8px;
    background: linear-gradient(90deg, #f0ede8 0%, #e5e0d8 50%, #f0ede8 100%);
    background-size: 200% 100%; animation: dtShimmer 1.4s ease infinite;
  }
  @keyframes dtShimmer { 0%{background-position:200% 0} 100%{background-position:-200% 0} }

  .dt-empty { text-align: center; padding: 40px 20px; font-size: 14px; color: #9a9590; }

  .dt-card {
    background: #fff; border: 1.5px solid #e5e0d8; border-radius: 14px;
    margin-bottom: 8px; overflow: hidden; transition: border-color 0.15s;
  }
  .dt-card:hover { border-color: #B3DEF0; }
  .dt-card-row {
    display: flex; align-items: center; gap: 12px;
    padding: 14px 16px; cursor: pointer;
  }
  .dt-card-left { flex: 1; min-width: 0; }
  .dt-cat-chip {
    display: inline-block; background: #D6EEF8; color: #0C3C60;
    padding: 1px 8px; border-radius: 100px; font-size: 11px; font-weight: 600;
    margin-bottom: 4px;
  }
  .dt-card-name { font-size: 15px; font-weight: 600; color: #1a1a1a; }
  .dt-card-desc { font-size: 12px; color: #9a9590; margin-top: 2px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .dt-card-right { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .dt-card-stat  { font-size: 12px; color: #9a9590; }
  .dt-icon-btn {
    width: 28px; height: 28px; border-radius: 8px; border: 1.5px solid #e5e0d8;
    background: #fafaf8; display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: #9a9590; transition: all 0.15s;
  }
  .dt-icon-btn:hover { border-color: #B3DEF0; color: #2E8BC0; background: #EAF5FC; }
  .dt-icon-btn.danger:hover { border-color: #fca5a5; color: #b91c1c; background: #fff5f3; }

  .dt-card-detail {
    padding: 0 16px 14px; border-top: 1px solid #f0ede8;
    display: flex; flex-direction: column; gap: 6px;
  }
  .dt-detail-row  { display: flex; gap: 10px; font-size: 13px; }
  .dt-detail-key  { font-weight: 600; color: #5a5550; min-width: 80px; flex-shrink: 0; }
  .dt-ex-preview-list  { display: flex; flex-direction: column; gap: 3px; }
  .dt-ex-preview-item  { display: flex; gap: 8px; align-items: baseline; }
  .dt-ex-preview-name  { font-size: 13px; color: #1a1a1a; }
  .dt-ex-preview-meta  { font-size: 11px; color: #9a9590; }

  /* ── Form ── */
  .dt-form { display: flex; flex-direction: column; gap: 0; }
  .dt-form-section {
    background: #fff; border: 1.5px solid #e5e0d8; border-radius: 14px;
    padding: 18px 20px; margin-bottom: 12px;
  }
  .dt-section-title {
    font-size: 12px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.08em; color: #2E8BC0; margin-bottom: 14px;
  }
  .dt-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
  .dt-field { margin-bottom: 10px; }
  .dt-field:last-child { margin-bottom: 0; }
  .dt-field-label {
    display: block; font-size: 11px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.07em;
    color: #5a5550; margin-bottom: 5px;
  }
  .dt-badge {
    display: inline-flex; align-items: center; justify-content: center;
    background: #2E8BC0; color: #fff; border-radius: 100px;
    font-size: 10px; font-weight: 700; padding: 1px 6px; margin-left: 5px;
  }
  .dt-input, .dt-select {
    width: 100%; padding: 10px 13px; border-radius: 10px;
    border: 1.5px solid #e5e0d8; background: #fafaf8;
    font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
    outline: none; transition: border-color 0.15s; box-sizing: border-box;
  }
  .dt-input:focus, .dt-select:focus { border-color: #2E8BC0; background: #fff; }
  .dt-textarea {
    width: 100%; padding: 10px 13px; border-radius: 10px;
    border: 1.5px solid #e5e0d8; background: #fafaf8;
    font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
    outline: none; resize: vertical; box-sizing: border-box;
    transition: border-color 0.15s;
  }
  .dt-textarea:focus { border-color: #2E8BC0; background: #fff; }
  .dt-select { appearance: none; }
  .dt-error {
    padding: 10px 14px; background: #fff5f3; border: 1px solid #fecaca;
    border-radius: 10px; font-size: 13px; color: #b91c1c; margin-bottom: 10px;
  }
  .dt-form-actions { display: flex; gap: 10px; padding: 4px 0 8px; }
  .dt-btn-cancel {
    flex: 1; padding: 11px; border-radius: 10px; border: 1.5px solid #e5e0d8;
    background: #fff; font-family: 'Outfit', sans-serif; font-size: 14px;
    font-weight: 500; color: #5a5550; cursor: pointer; transition: background 0.15s;
  }
  .dt-btn-cancel:hover:not(:disabled) { background: #f5f3ef; }
  .dt-btn-save {
    flex: 2; padding: 11px; border-radius: 10px; border: none;
    background: #2E8BC0; color: #fff;
    font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
    cursor: pointer; transition: background 0.15s;
  }
  .dt-btn-save:hover:not(:disabled) { background: #0C3C60; }
  .dt-btn-save:disabled, .dt-btn-cancel:disabled { opacity: 0.55; cursor: not-allowed; }

  /* ── Exercise picker ── */
  .dt-ex-wrap {
    border: 1.5px solid #e5e0d8; border-radius: 10px; overflow: hidden;
  }
  .dt-ex-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 10px 14px; cursor: pointer; background: #fafaf8;
    transition: background 0.12s;
  }
  .dt-ex-header:hover { background: #f0ede8; }
  .dt-ex-body { padding: 12px 14px; border-top: 1.5px solid #e5e0d8; }
  .dt-ex-search-row { margin-bottom: 8px; }
  .dt-ex-list {
    max-height: 200px; overflow-y: auto; border: 1.5px solid #e5e0d8;
    border-radius: 8px; margin-bottom: 10px;
  }
  .dt-ex-row {
    display: flex; align-items: center; gap: 10px; padding: 8px 12px;
    cursor: pointer; border-bottom: 1px solid #f5f3ef; transition: background 0.1s;
  }
  .dt-ex-row:last-child { border-bottom: none; }
  .dt-ex-row:hover, .dt-ex-row.selected { background: #EAF5FC; }
  .dt-ex-name { font-size: 13px; font-weight: 500; color: #1a1a1a; }
  .dt-ex-empty { padding: 16px; text-align: center; font-size: 13px; color: #9a9590; }
  .dt-ex-check {
    width: 20px; height: 20px; border-radius: 6px; border: 1.5px solid #e5e0d8;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
    transition: all 0.12s;
  }
  .dt-ex-check.on { background: #2E8BC0; border-color: #2E8BC0; color: #fff; }

  .dt-sel-list { border-top: 1.5px solid #e5e0d8; padding-top: 10px; }
  .dt-sel-heading { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #5a5550; margin-bottom: 8px; }
  .dt-sel-row { display: flex; flex-direction: column; gap: 6px; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #f5f3ef; }
  .dt-sel-row:last-child { border-bottom: none; margin-bottom: 0; }
  .dt-sel-name { font-size: 13px; font-weight: 600; color: #1a1a1a; }
  .dt-sel-controls {
    display: flex; gap: 8px; align-items: center; flex-wrap: wrap;
  }
  .dt-sel-controls label {
    display: flex; align-items: center; gap: 4px;
    font-size: 11px; color: #5a5550; font-weight: 600;
    text-transform: uppercase; letter-spacing: 0.05em;
  }
  .dt-sel-controls input[type="number"] {
    width: 52px; padding: 4px 7px; border-radius: 7px;
    border: 1.5px solid #e5e0d8; font-family: 'Outfit', sans-serif; font-size: 13px;
    outline: none;
  }
  .dt-sel-controls select {
    padding: 4px 8px; border-radius: 7px; border: 1.5px solid #e5e0d8;
    font-family: 'Outfit', sans-serif; font-size: 12px; outline: none;
  }
  .dt-sel-remove {
    width: 24px; height: 24px; border-radius: 6px; border: 1.5px solid #e5e0d8;
    background: #fafaf8; display: flex; align-items: center; justify-content: center;
    cursor: pointer; color: #9a9590; transition: all 0.12s; margin-left: auto;
  }
  .dt-sel-remove:hover { border-color: #fca5a5; color: #b91c1c; background: #fff5f3; }

  @media (max-width: 520px) {
    .dt-grid2 { grid-template-columns: 1fr; }
    .dt-sel-controls { flex-wrap: wrap; }
  }
`;
