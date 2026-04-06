// FILE: src/features/protocols/TreatmentProtocolsPage.tsx
// Clinic-wide treatment protocol library.
// All physios can read & assign. Only clinic_manager can create / edit / delete.

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Plus, Pencil, Trash2, ChevronDown, X, Check, Search } from "lucide-react";
import {
  subscribeToProtocols,
  createProtocol,
  updateProtocol,
  deleteProtocol,
  assignProtocolToPatient,
  type TreatmentProtocol,
  type ProtocolPhase,
} from "../../services/protocolService";
import { subscribeToAllPatients, type Patient } from "../../services/patientService";

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
  "Knee", "Shoulder", "Hip", "Spine", "Ankle & Foot",
  "Elbow & Wrist", "Neck", "Post-Surgical", "Neurological", "Other",
];

const CATEGORY_COLORS: Record<string, { bg: string; text: string }> = {
  "Knee":          { bg: "#dbeafe", text: "#1e40af" },
  "Shoulder":      { bg: "#ede9fe", text: "#5b21b6" },
  "Hip":           { bg: "#fef3c7", text: "#92400e" },
  "Spine":         { bg: "#d1fae5", text: "#065f46" },
  "Ankle & Foot":  { bg: "#ccfbf1", text: "#0f766e" },
  "Elbow & Wrist": { bg: "#ffe4e6", text: "#9f1239" },
  "Neck":          { bg: "#f0fdf4", text: "#166534" },
  "Post-Surgical": { bg: "#f5f3ff", text: "#4c1d95" },
  "Neurological":  { bg: "#fef9c3", text: "#713f12" },
  "Other":         { bg: "#f3f4f6", text: "#374151" },
};

const BLANK_PHASE: ProtocolPhase = {
  name: "", duration: "", goals: "", interventions: "", exercises: "", precautions: "", progressCriteria: "",
};

const BLANK_PROTOCOL = {
  title: "", injury: "", category: "", overview: "", duration: "",
  phases: [{ ...BLANK_PHASE, name: "Phase 1" }] as ProtocolPhase[],
  tags: [] as string[], createdBy: "",
};

// ─── Props ────────────────────────────────────────────────────────────────────

interface TreatmentProtocolsPageProps {
  physioId:  string;
  isManager: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function TreatmentProtocolsPage({ physioId, isManager }: TreatmentProtocolsPageProps) {
  const [protocols,   setProtocols]   = useState<TreatmentProtocol[]>([]);
  const [patients,    setPatients]    = useState<Patient[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [filterCat,   setFilterCat]   = useState("");
  const [expandedId,  setExpandedId]  = useState<string | null>(null);

  // Editor modal
  const [showEditor,  setShowEditor]  = useState(false);
  const [editTarget,  setEditTarget]  = useState<TreatmentProtocol | null>(null);
  const [form,        setForm]        = useState({ ...BLANK_PROTOCOL });
  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);

  // Assign modal
  const [assignTarget, setAssignTarget] = useState<TreatmentProtocol | null>(null);
  const [assignPatient, setAssignPatient] = useState<Patient | null>(null);
  const [assignNotes,  setAssignNotes]  = useState("");
  const [assignSearch, setAssignSearch] = useState("");
  const [assigning,    setAssigning]    = useState(false);
  const [assignError,  setAssignError]  = useState<string | null>(null);
  const [assignDone,   setAssignDone]   = useState(false);

  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [toast,       setToast]       = useState<string | null>(null);

  // ── Subscriptions ──────────────────────────────────────────────────────────
  useEffect(() => {
    return subscribeToProtocols(
      (data) => { setProtocols(data); setLoading(false); },
      ()     => setLoading(false)
    );
  }, []);

  useEffect(() => {
    return subscribeToAllPatients((p) => setPatients(p), () => {});
  }, []);

  // ── Helpers ────────────────────────────────────────────────────────────────
  const showToast = (msg: string) => { setToast(msg); setTimeout(() => setToast(null), 3000); };

  const displayed = protocols.filter((p) => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      p.title.toLowerCase().includes(q) ||
      p.injury.toLowerCase().includes(q) ||
      p.overview.toLowerCase().includes(q) ||
      p.tags.some((t) => t.toLowerCase().includes(q));
    const matchCat = !filterCat || p.category === filterCat;
    return matchSearch && matchCat;
  });

  const usedCategories = [...new Set(protocols.map((p) => p.category).filter(Boolean))];

  // ── Editor ─────────────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm({ ...BLANK_PROTOCOL, createdBy: physioId });
    setEditTarget(null);
    setSaveError(null);
    setShowEditor(true);
  };

  const openEdit = (protocol: TreatmentProtocol) => {
    setForm({
      title:     protocol.title,
      injury:    protocol.injury,
      category:  protocol.category,
      overview:  protocol.overview,
      duration:  protocol.duration,
      phases:    protocol.phases.map((ph) => ({ ...ph })),
      tags:      [...protocol.tags],
      createdBy: protocol.createdBy,
    });
    setEditTarget(protocol);
    setSaveError(null);
    setShowEditor(true);
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.injury.trim()) {
      setSaveError("Title and injury are required.");
      return;
    }
    setSaving(true); setSaveError(null);
    const payload = {
      ...form,
      title:    form.title.trim(),
      injury:   form.injury.trim(),
      overview: form.overview.trim(),
      phases:   form.phases.filter((ph) => ph.name.trim()),
      tags:     form.tags.filter(Boolean),
      createdBy: physioId,
    };
    const result = editTarget
      ? await updateProtocol(editTarget.id, payload)
      : await createProtocol(payload);
    setSaving(false);
    if ("error" in result && result.error) { setSaveError(result.error); return; }
    showToast(editTarget ? "Protocol updated" : "Protocol created");
    setShowEditor(false);
  };

  const handleDelete = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeletingId(id);
    await deleteProtocol(id);
    setDeletingId(null);
    showToast("Protocol deleted");
  };

  // Phase helpers
  const addPhase = () => setForm((f) => ({
    ...f, phases: [...f.phases, { ...BLANK_PHASE, name: `Phase ${f.phases.length + 1}` }],
  }));
  const removePhase = (i: number) => setForm((f) => ({
    ...f, phases: f.phases.filter((_, idx) => idx !== i),
  }));
  const setPhase = (i: number, key: keyof ProtocolPhase, val: string) =>
    setForm((f) => ({
      ...f,
      phases: f.phases.map((ph, idx) => idx === i ? { ...ph, [key]: val } : ph),
    }));

  // ── Assign ─────────────────────────────────────────────────────────────────
  const openAssign = (protocol: TreatmentProtocol) => {
    setAssignTarget(protocol);
    setAssignPatient(null);
    setAssignNotes("");
    setAssignSearch("");
    setAssignError(null);
    setAssignDone(false);
  };

  const handleAssign = async () => {
    if (!assignTarget || !assignPatient) { setAssignError("Please select a patient."); return; }
    setAssigning(true); setAssignError(null);
    const result = await assignProtocolToPatient({
      patientId:     assignPatient.uid,
      protocolId:    assignTarget.id,
      protocolTitle: assignTarget.title,
      injury:        assignTarget.injury,
      assignedBy:    physioId,
      notes:         assignNotes.trim(),
    });
    setAssigning(false);
    if ("error" in result && result.error) { setAssignError(result.error); return; }
    setAssignDone(true);
    showToast(`Protocol assigned to ${assignPatient.firstName} ${assignPatient.lastName}`);
  };

  const filteredPatients = patients.filter((p) =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(assignSearch.toLowerCase()) ||
    p.phone.includes(assignSearch)
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .tp-root { font-family: 'Outfit', sans-serif; }

        /* Header */
        .tp-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 24px; flex-wrap: wrap; }
        .tp-title { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 500; color: #1a1a1a; letter-spacing: -0.02em; }
        .tp-sub   { font-size: 13px; color: #9a9590; margin-top: 3px; }
        .tp-add-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 10px 18px; border-radius: 12px; border: none;
          background: #2E8BC0; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          cursor: pointer; transition: background 0.15s; white-space: nowrap;
        }
        .tp-add-btn:hover { background: #0C3C60; }

        /* Search & filter */
        .tp-controls { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 18px; }
        .tp-search-wrap { position: relative; flex: 1; min-width: 180px; }
        .tp-search-icon { position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: #c0bbb4; }
        .tp-search {
          width: 100%; padding: 9px 12px 9px 36px;
          border: 1.5px solid #e5e0d8; border-radius: 10px;
          font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
          background: #fff; outline: none;
        }
        .tp-search:focus { border-color: #2E8BC0; }
        .tp-cat-chips { display: flex; gap: 6px; flex-wrap: wrap; }
        .tp-chip {
          padding: 5px 13px; border-radius: 100px; border: 1.5px solid #e5e0d8;
          background: #fff; font-family: 'Outfit', sans-serif; font-size: 12px;
          font-weight: 500; color: #9a9590; cursor: pointer; transition: all 0.15s;
        }
        .tp-chip.active { background: #2E8BC0; border-color: #2E8BC0; color: #fff; }
        .tp-chip:hover:not(.active) { border-color: #B3DEF0; color: #2E8BC0; }

        /* Protocol card */
        .tp-list { display: flex; flex-direction: column; gap: 10px; }
        .tp-card {
          background: #fff; border: 1.5px solid #e5e0d8; border-radius: 16px;
          overflow: hidden; transition: border-color 0.15s;
        }
        .tp-card:hover { border-color: #B3DEF0; }
        .tp-card-header {
          padding: 16px 18px; display: flex; align-items: center; gap: 12px; cursor: pointer;
        }
        .tp-card-icon {
          width: 44px; height: 44px; border-radius: 10px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 20px;
        }
        .tp-card-body { flex: 1; min-width: 0; }
        .tp-card-title { font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 3px; }
        .tp-card-meta { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
        .tp-cat-badge {
          font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 4px;
          text-transform: uppercase; letter-spacing: 0.06em;
        }
        .tp-injury { font-size: 12.5px; color: #5a5550; }
        .tp-duration { font-size: 12px; color: #9a9590; }
        .tp-card-actions { display: flex; gap: 6px; flex-shrink: 0; align-items: center; }
        .tp-action-btn {
          width: 32px; height: 32px; border-radius: 8px; border: 1.5px solid #e5e0d8;
          background: #fff; display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #9a9590; transition: all 0.15s;
        }
        .tp-action-btn:hover { border-color: #B3DEF0; color: #2E8BC0; background: #EAF5FC; }
        .tp-action-btn.danger:hover { border-color: #fca5a5; color: #b91c1c; background: #fee2e2; }
        .tp-assign-btn {
          padding: 6px 14px; border-radius: 8px; border: none;
          background: #2d6a4f; color: #fff; font-family: 'Outfit', sans-serif;
          font-size: 12px; font-weight: 500; cursor: pointer; transition: background 0.15s;
          white-space: nowrap;
        }
        .tp-assign-btn:hover { background: #1b4332; }
        .tp-chevron { color: #c0bbb4; transition: transform 0.2s; flex-shrink: 0; }
        .tp-chevron.open { transform: rotate(180deg); }

        /* Expanded detail */
        .tp-detail {
          border-top: 1.5px solid #f0ede8; padding: 18px 18px 20px;
          background: #fafaf8;
        }
        .tp-overview { font-size: 13.5px; color: #5a5550; line-height: 1.6; margin-bottom: 18px; }
        .tp-phases-title {
          font-size: 11px; font-weight: 700; color: #9a9590; text-transform: uppercase;
          letter-spacing: 0.08em; margin-bottom: 12px;
        }
        .tp-phases { display: flex; flex-direction: column; gap: 10px; }
        .tp-phase {
          background: #fff; border: 1.5px solid #e5e0d8; border-radius: 12px; padding: 14px 16px;
        }
        .tp-phase-name {
          font-size: 13px; font-weight: 700; color: #1a1a1a; margin-bottom: 2px;
        }
        .tp-phase-dur { font-size: 12px; color: #9a9590; margin-bottom: 10px; }
        .tp-phase-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .tp-phase-field label {
          display: block; font-size: 10px; font-weight: 700; color: #c0bbb4;
          text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 3px;
        }
        .tp-phase-field p { font-size: 13px; color: #5a5550; line-height: 1.5; white-space: pre-wrap; }
        .tp-tags { display: flex; gap: 5px; flex-wrap: wrap; margin-top: 14px; }
        .tp-tag {
          font-size: 11px; padding: 2px 9px; border-radius: 100px;
          background: #f3f4f6; color: #374151; font-weight: 500;
        }

        /* Empty */
        .tp-empty {
          text-align: center; padding: 60px 24px; background: #fafaf8;
          border-radius: 14px; border: 1.5px dashed #e5e0d8;
          font-size: 14px; color: #9a9590;
        }

        /* Shimmer */
        @keyframes tpShimmer { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
        .tp-shimmer {
          height: 72px; border-radius: 14px;
          background: linear-gradient(90deg,#f0ede8,#e5e0d8,#f0ede8);
          background-size: 200% 100%; animation: tpShimmer 1.4s ease infinite;
        }

        /* Toast */
        .tp-toast {
          position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
          background: #1a1a1a; color: #fff; padding: 10px 20px; border-radius: 100px;
          font-size: 13.5px; z-index: 9999; pointer-events: none;
          animation: tpToastIn 0.2s ease;
        }
        @keyframes tpToastIn { from { opacity:0; transform:translateX(-50%) translateY(10px); } to { opacity:1; transform:translateX(-50%) translateY(0); } }

        /* Editor modal */
        .tp-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.45);
          display: flex; align-items: center; justify-content: center;
          z-index: 9999; padding: 20px; backdrop-filter: blur(4px);
        }
        .tp-modal {
          background: #fff; border-radius: 20px;
          width: min(680px, 100%); max-height: 90vh;
          display: flex; flex-direction: column;
          box-shadow: 0 24px 80px rgba(0,0,0,0.2);
          animation: tpModalIn 0.22s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes tpModalIn { from { opacity:0; transform:scale(0.95) translateY(16px); } to { opacity:1; transform:scale(1) translateY(0); } }
        .tp-modal-hd {
          padding: 24px 24px 0; display: flex; justify-content: space-between; align-items: flex-start; flex-shrink: 0;
        }
        .tp-modal-title { font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 2px; }
        .tp-modal-sub   { font-size: 13px; color: #9a9590; }
        .tp-modal-close {
          width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid #e5e0d8;
          background: #fafaf8; display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #9a9590; flex-shrink: 0;
        }
        .tp-modal-close:hover { background: #f0ede8; color: #1a1a1a; }
        .tp-modal-body { padding: 20px 24px; overflow-y: auto; flex: 1; }
        .tp-modal-ft {
          padding: 14px 24px 20px; border-top: 1px solid #f0ede8; flex-shrink: 0;
          display: flex; gap: 10px; justify-content: flex-end;
        }
        .tp-field { margin-bottom: 14px; }
        .tp-label {
          display: block; font-size: 11.5px; font-weight: 600; color: #5a5550;
          text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px;
        }
        .tp-input, .tp-select, .tp-textarea {
          width: 100%; padding: 10px 13px; border: 1.5px solid #e5e0d8; border-radius: 10px;
          font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
          background: #fff; outline: none; box-sizing: border-box; transition: border-color 0.15s;
        }
        .tp-input:focus, .tp-select:focus, .tp-textarea:focus { border-color: #2E8BC0; }
        .tp-textarea { resize: vertical; min-height: 70px; }
        .tp-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .tp-phase-block {
          border: 1.5px solid #e5e0d8; border-radius: 12px; padding: 14px 16px; margin-bottom: 10px;
        }
        .tp-phase-block-hd {
          display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;
        }
        .tp-phase-block-title { font-size: 13px; font-weight: 600; color: #1a1a1a; }
        .tp-rm-phase-btn {
          background: none; border: none; cursor: pointer; color: #c0bbb4;
          padding: 2px; transition: color 0.15s;
        }
        .tp-rm-phase-btn:hover { color: #b91c1c; }
        .tp-add-phase-btn {
          width: 100%; padding: 9px; border-radius: 10px; border: 1.5px dashed #e5e0d8;
          background: #fafaf8; font-family: 'Outfit', sans-serif; font-size: 13px;
          color: #9a9590; cursor: pointer; transition: all 0.15s; margin-bottom: 10px;
        }
        .tp-add-phase-btn:hover { border-color: #2E8BC0; color: #2E8BC0; background: #EAF5FC; }
        .tp-error { font-size: 13px; color: #b91c1c; margin-top: 8px; }
        .tp-btn-cancel {
          padding: 10px 20px; border-radius: 10px; border: 1.5px solid #e5e0d8;
          background: #fff; font-family: 'Outfit', sans-serif; font-size: 14px; cursor: pointer;
        }
        .tp-btn-cancel:hover { background: #f5f3ef; }
        .tp-btn-save {
          padding: 10px 24px; border-radius: 10px; border: none;
          background: #2E8BC0; color: #fff; font-family: 'Outfit', sans-serif;
          font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.15s;
        }
        .tp-btn-save:hover:not(:disabled) { background: #0C3C60; }
        .tp-btn-save:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Assign modal */
        .tp-assign-modal {
          background: #fff; border-radius: 20px; width: min(480px, 100%);
          max-height: 90vh; display: flex; flex-direction: column;
          box-shadow: 0 24px 80px rgba(0,0,0,0.2);
          animation: tpModalIn 0.22s cubic-bezier(0.16,1,0.3,1) both;
        }
        .tp-patient-list { display: flex; flex-direction: column; gap: 6px; max-height: 260px; overflow-y: auto; margin: 10px 0; }
        .tp-patient-row {
          display: flex; align-items: center; gap: 10px; padding: 9px 12px;
          border: 1.5px solid #e5e0d8; border-radius: 10px; cursor: pointer; transition: all 0.15s;
        }
        .tp-patient-row:hover  { border-color: #B3DEF0; background: #f0f8ff; }
        .tp-patient-row.sel    { border-color: #2E8BC0; background: #EAF5FC; }
        .tp-patient-avatar {
          width: 32px; height: 32px; border-radius: 50%; display: flex;
          align-items: center; justify-content: center; font-size: 12px; font-weight: 600; flex-shrink: 0;
        }
        .tp-patient-name  { font-size: 13.5px; font-weight: 500; color: #1a1a1a; }
        .tp-patient-phone { font-size: 12px; color: #9a9590; }
        .tp-patient-check { margin-left: auto; color: #2E8BC0; }
        .tp-done-screen { text-align: center; padding: 24px 0 8px; }
        .tp-done-icon { font-size: 48px; margin-bottom: 12px; }
        .tp-done-title { font-size: 18px; font-weight: 600; color: #1a1a1a; margin-bottom: 6px; }
        .tp-done-sub { font-size: 13px; color: #9a9590; }
        .tp-btn-primary {
          flex: 1; padding: 10px; border-radius: 10px; border: none;
          background: #2d6a4f; color: #fff; font-family: 'Outfit', sans-serif;
          font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.15s;
        }
        .tp-btn-primary:hover:not(:disabled) { background: #1b4332; }
        .tp-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }

        @media (max-width: 520px) {
          .tp-modal-overlay { align-items: flex-start; padding: 0; }
          .tp-modal, .tp-assign-modal { border-radius: 0 0 20px 20px; width: 100%; max-height: 96dvh; }
          .tp-grid2 { grid-template-columns: 1fr; }
          .tp-phase-row { grid-template-columns: 1fr; }
          .tp-card-actions { flex-wrap: wrap; }
        }
      `}</style>

      <div className="tp-root">
        {/* Header */}
        <div className="tp-header">
          <div>
            <div className="tp-title">Treatment Protocols</div>
            <div className="tp-sub">
              {loading ? "Loading…" : `${protocols.length} protocol${protocols.length !== 1 ? "s" : ""} in the library`}
            </div>
          </div>
          {isManager && (
            <button className="tp-add-btn" onClick={openAdd}>
              <Plus size={15} strokeWidth={2.5} /> New Protocol
            </button>
          )}
        </div>

        {/* Search & filters */}
        <div className="tp-controls">
          <div className="tp-search-wrap">
            <Search size={14} className="tp-search-icon" />
            <input
              className="tp-search"
              placeholder="Search protocols, injuries…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        {usedCategories.length > 1 && (
          <div className="tp-cat-chips" style={{ marginBottom: 18 }}>
            <button className={`tp-chip${!filterCat ? " active" : ""}`} onClick={() => setFilterCat("")}>All</button>
            {usedCategories.map((c) => (
              <button
                key={c}
                className={`tp-chip${filterCat === c ? " active" : ""}`}
                style={filterCat === c ? {} : { background: (CATEGORY_COLORS[c] ?? CATEGORY_COLORS["Other"]).bg, color: (CATEGORY_COLORS[c] ?? CATEGORY_COLORS["Other"]).text, borderColor: "transparent" }}
                onClick={() => setFilterCat(filterCat === c ? "" : c)}
              >{c}</button>
            ))}
          </div>
        )}

        {/* List */}
        {loading ? (
          <div className="tp-list">
            {[1,2,3].map((n) => <div key={n} className="tp-shimmer" />)}
          </div>
        ) : displayed.length === 0 ? (
          <div className="tp-empty">
            {protocols.length === 0
              ? isManager
                ? 'No protocols yet. Click "New Protocol" to create the first one.'
                : "No treatment protocols in the library yet."
              : "No protocols match your search."}
          </div>
        ) : (
          <div className="tp-list">
            {displayed.map((protocol) => {
              const colors = CATEGORY_COLORS[protocol.category] ?? CATEGORY_COLORS["Other"];
              const isOpen = expandedId === protocol.id;
              return (
                <div key={protocol.id} className="tp-card">
                  <div className="tp-card-header" onClick={() => setExpandedId(isOpen ? null : protocol.id)}>
                    <div className="tp-card-icon" style={{ background: colors.bg }}>
                      {protocol.category === "Knee" ? "🦵"
                       : protocol.category === "Shoulder" ? "💪"
                       : protocol.category === "Hip" ? "🦴"
                       : protocol.category === "Spine" ? "🦴"
                       : protocol.category === "Ankle & Foot" ? "🦶"
                       : protocol.category === "Neck" ? "🔵"
                       : protocol.category === "Post-Surgical" ? "🏥"
                       : protocol.category === "Neurological" ? "🧠"
                       : "📋"}
                    </div>
                    <div className="tp-card-body">
                      <div className="tp-card-title">{protocol.title}</div>
                      <div className="tp-card-meta">
                        {protocol.category && (
                          <span className="tp-cat-badge" style={{ background: colors.bg, color: colors.text }}>
                            {protocol.category}
                          </span>
                        )}
                        <span className="tp-injury">{protocol.injury}</span>
                        {protocol.duration && (
                          <span className="tp-duration">· {protocol.duration}</span>
                        )}
                      </div>
                    </div>
                    <div className="tp-card-actions" onClick={(e) => e.stopPropagation()}>
                      <button className="tp-assign-btn" onClick={() => openAssign(protocol)}>
                        Assign to Patient
                      </button>
                      {isManager && (
                        <>
                          <button className="tp-action-btn" title="Edit" onClick={() => openEdit(protocol)}>
                            <Pencil size={13} strokeWidth={2} />
                          </button>
                          <button
                            className="tp-action-btn danger"
                            title="Delete"
                            disabled={deletingId === protocol.id}
                            onClick={() => handleDelete(protocol.id, protocol.title)}
                          >
                            {deletingId === protocol.id
                              ? <span style={{ fontSize: 11 }}>…</span>
                              : <Trash2 size={13} strokeWidth={2} />}
                          </button>
                        </>
                      )}
                    </div>
                    <ChevronDown size={16} className={`tp-chevron${isOpen ? " open" : ""}`} />
                  </div>

                  {isOpen && (
                    <div className="tp-detail">
                      {protocol.overview && (
                        <div className="tp-overview">{protocol.overview}</div>
                      )}
                      {protocol.phases.length > 0 && (
                        <>
                          <div className="tp-phases-title">Treatment Phases · {protocol.phases.length} phase{protocol.phases.length !== 1 ? "s" : ""}</div>
                          <div className="tp-phases">
                            {protocol.phases.map((phase, i) => (
                              <div key={i} className="tp-phase">
                                <div className="tp-phase-name">{phase.name}</div>
                                {phase.duration && <div className="tp-phase-dur">{phase.duration}</div>}
                                <div className="tp-phase-row" style={{ gridTemplateColumns: "1fr 1fr" }}>
                                  {phase.goals && (
                                    <div className="tp-phase-field">
                                      <label>Goals</label>
                                      <p>{phase.goals}</p>
                                    </div>
                                  )}
                                  {phase.interventions && (
                                    <div className="tp-phase-field">
                                      <label>Interventions</label>
                                      <p>{phase.interventions}</p>
                                    </div>
                                  )}
                                  {phase.exercises && (
                                    <div className="tp-phase-field">
                                      <label>Exercises</label>
                                      <p>{phase.exercises}</p>
                                    </div>
                                  )}
                                  {phase.precautions && (
                                    <div className="tp-phase-field">
                                      <label>Precautions</label>
                                      <p>{phase.precautions}</p>
                                    </div>
                                  )}
                                  {phase.progressCriteria && (
                                    <div className="tp-phase-field" style={{ gridColumn: "1 / -1", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 10px" }}>
                                      <label style={{ color: "#166534" }}>Progress Criteria</label>
                                      <p style={{ color: "#166534" }}>{phase.progressCriteria}</p>
                                    </div>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {protocol.tags.length > 0 && (
                        <div className="tp-tags">
                          {protocol.tags.map((tag) => (
                            <span key={tag} className="tp-tag">#{tag}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Protocol Editor Modal ── */}
      {showEditor && createPortal(
        <div className="tp-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !saving) setShowEditor(false); }}>
          <div className="tp-modal" role="dialog" aria-modal="true">
            <div className="tp-modal-hd">
              <div>
                <div className="tp-modal-title">{editTarget ? "Edit Protocol" : "New Treatment Protocol"}</div>
                <div className="tp-modal-sub">Define the protocol structure and rehabilitation phases</div>
              </div>
              <button className="tp-modal-close" onClick={() => setShowEditor(false)} disabled={saving}>
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>

            <div className="tp-modal-body">
              {/* Basic info */}
              <div className="tp-grid2">
                <div className="tp-field">
                  <label className="tp-label">Protocol Title *</label>
                  <input className="tp-input" placeholder="e.g. ACL Reconstruction Rehab" value={form.title}
                    onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} autoFocus />
                </div>
                <div className="tp-field">
                  <label className="tp-label">Injury / Condition *</label>
                  <input className="tp-input" placeholder="e.g. ACL Tear, Grade II" value={form.injury}
                    onChange={(e) => setForm((f) => ({ ...f, injury: e.target.value }))} />
                </div>
              </div>
              <div className="tp-grid2">
                <div className="tp-field">
                  <label className="tp-label">Category</label>
                  <select className="tp-select" value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}>
                    <option value="">Select…</option>
                    {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="tp-field">
                  <label className="tp-label">Total Duration</label>
                  <input className="tp-input" placeholder="e.g. 12–16 weeks" value={form.duration}
                    onChange={(e) => setForm((f) => ({ ...f, duration: e.target.value }))} />
                </div>
              </div>
              <div className="tp-field">
                <label className="tp-label">Overview</label>
                <textarea className="tp-textarea" rows={3} placeholder="Brief description of this protocol's approach and goals…"
                  value={form.overview} onChange={(e) => setForm((f) => ({ ...f, overview: e.target.value }))} />
              </div>
              <div className="tp-field">
                <label className="tp-label">Tags (comma-separated)</label>
                <input className="tp-input" placeholder="e.g. post-op, conservative, weight-bearing"
                  value={form.tags.join(", ")}
                  onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) }))} />
              </div>

              {/* Phases */}
              <div style={{ borderTop: "1.5px solid #f0ede8", margin: "18px 0 16px" }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1a1a1a", marginBottom: 12 }}>
                Rehabilitation Phases ({form.phases.length})
              </div>
              {form.phases.map((phase, i) => (
                <div key={i} className="tp-phase-block">
                  <div className="tp-phase-block-hd">
                    <span className="tp-phase-block-title">Phase {i + 1}</span>
                    {form.phases.length > 1 && (
                      <button className="tp-rm-phase-btn" onClick={() => removePhase(i)} title="Remove phase">
                        <Trash2 size={13} strokeWidth={2} />
                      </button>
                    )}
                  </div>
                  <div className="tp-grid2">
                    <div className="tp-field">
                      <label className="tp-label">Phase Name</label>
                      <input className="tp-input" placeholder="e.g. Phase 1 — Acute" value={phase.name}
                        onChange={(e) => setPhase(i, "name", e.target.value)} />
                    </div>
                    <div className="tp-field">
                      <label className="tp-label">Duration</label>
                      <input className="tp-input" placeholder="e.g. Week 1–2" value={phase.duration}
                        onChange={(e) => setPhase(i, "duration", e.target.value)} />
                    </div>
                  </div>
                  <div className="tp-field">
                    <label className="tp-label">Goals</label>
                    <textarea className="tp-textarea" rows={2} placeholder="What should be achieved in this phase?"
                      value={phase.goals} onChange={(e) => setPhase(i, "goals", e.target.value)} />
                  </div>
                  <div className="tp-grid2">
                    <div className="tp-field">
                      <label className="tp-label">Interventions</label>
                      <textarea className="tp-textarea" rows={2} placeholder="Manual therapy, modalities…"
                        value={phase.interventions} onChange={(e) => setPhase(i, "interventions", e.target.value)} />
                    </div>
                    <div className="tp-field">
                      <label className="tp-label">Exercises</label>
                      <textarea className="tp-textarea" rows={2} placeholder="Exercise prescription…"
                        value={phase.exercises} onChange={(e) => setPhase(i, "exercises", e.target.value)} />
                    </div>
                  </div>
                  <div className="tp-grid2">
                    <div className="tp-field">
                      <label className="tp-label">Precautions</label>
                      <input className="tp-input" placeholder="Any contraindications or precautions…"
                        value={phase.precautions} onChange={(e) => setPhase(i, "precautions", e.target.value)} />
                    </div>
                    <div className="tp-field">
                      <label className="tp-label">Progress Criteria</label>
                      <input className="tp-input" placeholder="e.g. Full ROM, pain ≤ 2/10, no swelling…"
                        value={phase.progressCriteria} onChange={(e) => setPhase(i, "progressCriteria", e.target.value)} />
                    </div>
                  </div>
                </div>
              ))}
              <button className="tp-add-phase-btn" onClick={addPhase}>
                <Plus size={13} strokeWidth={2.5} style={{ display: "inline", verticalAlign: "middle", marginRight: 4 }} />
                Add Phase
              </button>
              {saveError && <div className="tp-error">{saveError}</div>}
            </div>

            <div className="tp-modal-ft">
              <button className="tp-btn-cancel" onClick={() => setShowEditor(false)} disabled={saving}>Cancel</button>
              <button className="tp-btn-save" onClick={handleSave} disabled={saving}>
                {saving ? "Saving…" : editTarget ? "Save Changes" : "Create Protocol"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Assign Modal ── */}
      {assignTarget && createPortal(
        <div className="tp-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget && !assigning) setAssignTarget(null); }}>
          <div className="tp-assign-modal" role="dialog" aria-modal="true">
            <div className="tp-modal-hd">
              <div>
                <div className="tp-modal-title">Assign Protocol</div>
                <div className="tp-modal-sub">{assignTarget.title}</div>
              </div>
              <button className="tp-modal-close" onClick={() => setAssignTarget(null)} disabled={assigning}>
                <X size={14} strokeWidth={2.5} />
              </button>
            </div>

            <div className="tp-modal-body">
              {assignDone ? (
                <div className="tp-done-screen">
                  <div className="tp-done-icon">✅</div>
                  <div className="tp-done-title">Protocol Assigned!</div>
                  <div className="tp-done-sub">
                    {assignTarget.title} has been assigned to {assignPatient?.firstName} {assignPatient?.lastName}.
                  </div>
                </div>
              ) : (
                <>
                  <div className="tp-field">
                    <label className="tp-label">Search Patient</label>
                    <div className="tp-search-wrap">
                      <Search size={14} className="tp-search-icon" />
                      <input className="tp-search" placeholder="Name or phone…" value={assignSearch}
                        onChange={(e) => { setAssignSearch(e.target.value); setAssignPatient(null); }} />
                    </div>
                  </div>
                  <div className="tp-patient-list">
                    {filteredPatients.slice(0, 30).map((p) => {
                      const hue = (p.firstName.charCodeAt(0) + p.lastName.charCodeAt(0)) % 360;
                      const isSel = assignPatient?.uid === p.uid;
                      return (
                        <div key={p.uid} className={`tp-patient-row${isSel ? " sel" : ""}`} onClick={() => setAssignPatient(p)}>
                          <div className="tp-patient-avatar" style={{ background: `hsl(${hue},40%,88%)`, color: `hsl(${hue},45%,32%)` }}>
                            {p.firstName[0]}{p.lastName[0]}
                          </div>
                          <div>
                            <div className="tp-patient-name">{p.firstName} {p.lastName}</div>
                            {p.phone && <div className="tp-patient-phone">{p.phone}</div>}
                          </div>
                          {isSel && <Check size={15} strokeWidth={2.5} className="tp-patient-check" />}
                        </div>
                      );
                    })}
                    {filteredPatients.length === 0 && (
                      <div style={{ textAlign: "center", padding: "20px", color: "#9a9590", fontSize: 13 }}>
                        No patients found.
                      </div>
                    )}
                  </div>
                  <div className="tp-field" style={{ marginTop: 4 }}>
                    <label className="tp-label">Notes (optional)</label>
                    <textarea className="tp-textarea" rows={2}
                      placeholder="Any specific notes about this assignment…"
                      value={assignNotes} onChange={(e) => setAssignNotes(e.target.value)} />
                  </div>
                  {assignError && <div className="tp-error">{assignError}</div>}
                </>
              )}
            </div>

            <div className="tp-modal-ft">
              {assignDone ? (
                <>
                  <button className="tp-btn-cancel" onClick={() => { setAssignDone(false); setAssignPatient(null); setAssignNotes(""); setAssignSearch(""); }}>
                    Assign Another
                  </button>
                  <button className="tp-btn-save" onClick={() => setAssignTarget(null)}>Done</button>
                </>
              ) : (
                <>
                  <button className="tp-btn-cancel" onClick={() => setAssignTarget(null)} disabled={assigning}>Cancel</button>
                  <button className="tp-btn-primary" disabled={assigning || !assignPatient} onClick={handleAssign}>
                    {assigning ? "Assigning…" : "Assign Protocol"}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Toast */}
      {toast && createPortal(<div className="tp-toast">{toast}</div>, document.body)}
    </>
  );
}
