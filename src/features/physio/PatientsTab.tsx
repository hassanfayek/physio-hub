// FILE: src/features/physio/PatientsTab.tsx

import { useState, useEffect, useRef } from "react";
import { Check, Trash2, Search, X, Plus, AlertCircle, UserPlus } from "lucide-react";
import AddPatientModal from "../../components/AddPatientModal";
import {
  subscribeToPhysioPatients,
  subscribeToAllPatients,
  subscribeToPhysiotherapists,
  assignPatientToPhysio,
  assignPatientStaff,
  deletePatient,
  type Patient,
  type Physiotherapist,
} from "../../services/patientService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientsTabProps {
  physioId:       string;
  isManager?:     boolean;
  isSenior?:      boolean;
  isSecretary?:   boolean;
  /** Called when the user clicks a patient name to view their sheet. */
  onViewPatient?: (patientId: string) => void;
}

// ─── Delete confirm button ────────────────────────────────────────────────────
// Two-click pattern: first click shows "Confirm?", second click deletes.

function DeleteButton({ patientId, onDeleted }: { patientId: string; onDeleted: () => void }) {
  const [confirm,  setConfirm]  = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleClick = async () => {
    if (!confirm) { setConfirm(true); return; }
    setDeleting(true);
    await deletePatient(patientId);
    setDeleting(false);
    onDeleted();
  };

  // Reset confirm state if user moves away
  useEffect(() => {
    if (!confirm) return;
    const t = setTimeout(() => setConfirm(false), 3000);
    return () => clearTimeout(t);
  }, [confirm]);

  return (
    <button
      className={`pt-del-btn ${confirm ? "pt-del-confirm" : ""}`}
      onClick={handleClick}
      disabled={deleting}
      title={confirm ? "Click again to confirm deletion" : "Delete patient record"}
    >
      {deleting ? (
        <span className="pt-del-spinner" />
      ) : confirm ? (
        <>
          <Check size={12} strokeWidth={2.5} />
          Confirm?
        </>
      ) : (
        <Trash2 size={14} strokeWidth={2} />
      )}
    </button>
  );
}

// ─── Staff assignment panel (senior required, junior/trainee optional) ──────────

function StaffAssignmentPanel({ patient, physios }: { patient: Patient; physios: Physiotherapist[] }) {
  const [saving, setSaving] = useState<string | null>(null);
  const [err,    setErr]    = useState<string | null>(null);

  const seniors  = physios.filter((p) => (p.rank ?? "junior") === "senior");
  const juniors  = physios.filter((p) => (p.rank ?? "junior") === "junior");
  const trainees = physios.filter((p) => (p.rank ?? "junior") === "trainee");

  const assign = async (field: string, uid: string, name: string) => {
    setSaving(field); setErr(null);
    let result: { error?: string };
    if (field === "primary") {
      result = await assignPatientToPhysio(patient.uid, uid);
    } else if (field === "senior") {
      result = await assignPatientStaff(patient.uid, {
        seniorEditorId:   uid   || null,
        seniorEditorName: name  || null,
      });
    } else if (field === "junior") {
      result = await assignPatientStaff(patient.uid, {
        juniorId:   uid  || null,
        juniorName: name || null,
      });
    } else {
      result = await assignPatientStaff(patient.uid, {
        traineeId:   uid  || null,
        traineeName: name || null,
      });
    }
    setSaving(null);
    if (result.error) setErr(result.error);
  };

  const makeSelect = (
    field: string,
    value: string,
    options: Physiotherapist[],
    label: string,
    required: boolean
  ) => (
    <div className="sa-field">
      <label className="sa-label">
        {label}{required && <span style={{ color: "#e07a5f", marginLeft: 3 }}>*</span>}
      </label>
      <div className="sa-select-wrap">
        <select
          className={`ps-select sa-select ${saving === field ? "ps-saving" : ""} ${!value && required ? "sa-required" : ""}`}
          value={value ?? ""}
          onChange={(e) => {
            const uid = e.target.value;
            const physio = physios.find((p) => p.uid === uid);
            const name = physio ? `Dr. ${physio.firstName} ${physio.lastName}` : "";
            assign(field, uid, name);
          }}
          disabled={saving === field}
        >
          <option value="">{required ? "— Select (required) —" : "— None —"}</option>
          {options.map((p) => (
            <option key={p.uid} value={p.uid}>Dr. {p.firstName} {p.lastName}</option>
          ))}
        </select>
        {saving === field && <span className="ps-spinner" />}
      </div>
    </div>
  );

  return (
    <div className="sa-panel">
      {makeSelect("senior",  patient.seniorEditorId ?? "", seniors,  "Senior",  true)}
      {makeSelect("junior",  patient.juniorId        ?? "", juniors,  "Junior",  false)}
      {makeSelect("trainee", patient.traineeId       ?? "", trainees, "Trainee", false)}
      {err && <div className="sa-err">{err}</div>}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PatientsTab({ physioId, isManager = false, isSenior = false, isSecretary = false, onViewPatient }: PatientsTabProps) {
  const [patients,       setPatients]       = useState<Patient[]>([]);
  const [physios,        setPhysios]        = useState<Physiotherapist[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState<string | null>(null);
  const [toastMsg,       setToastMsg]       = useState<string | null>(null);
  const [searchQuery,    setSearchQuery]    = useState("");

  const canAddPatient = isManager || isSenior;

  // ── Add Patient modal state ────────────────────────────────────────────────
  const [showAddPatient, setShowAddPatient] = useState(false);

  const physioMap = useRef<Map<string, string>>(new Map());
  useEffect(() => {
    physioMap.current = new Map(physios.map((p) => [p.uid, `${p.firstName} ${p.lastName}`]));
  }, [physios]);

  // ── Patients subscription ─────────────────────────────────────────────────
  useEffect(() => {
    setLoading(true);
    setError(null);

    const unsubscribe = (isManager || isSecretary)
      ? subscribeToAllPatients(
          (data) => { setPatients(data); setLoading(false); },
          (err)  => { setError(err.message ?? "Failed to load patients."); setLoading(false); }
        )
      : subscribeToPhysioPatients(
          physioId,
          (data) => { setPatients(data); setLoading(false); },
          (err)  => { setError(err.message ?? "Failed to load patients."); setLoading(false); }
        );

    return () => unsubscribe();
  }, [physioId, isManager, isSecretary]);

  // ── Physiotherapists subscription ─────────────────────────────────────────
  useEffect(() => {
    const unsubscribe = subscribeToPhysiotherapists(
      (data) => setPhysios(data),
      ()     => {}
    );
    return () => unsubscribe();
  }, []);

  // ── Real-time search filter ───────────────────────────────────────────────
  const filteredPatients = patients.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      p.firstName?.toLowerCase().includes(q) ||
      p.lastName?.toLowerCase().includes(q)  ||
      p.email?.toLowerCase().includes(q)
    );
  });


  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };

  const STATUS_META: Record<string, { label: string; bg: string; text: string }> = {
    active:     { label: "Active",     bg: "#d8f3dc", text: "#1b4332" },
    discharged: { label: "Discharged", bg: "#f3f4f6", text: "#374151" },
    on_hold:    { label: "On Hold",    bg: "#fef3c7", text: "#92400e" },
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Outfit:wght@400;500;600&display=swap');

        .pt-root { font-family: 'Outfit', sans-serif; }

        /* Header */
        .pt-header {
          display: flex; align-items: flex-start; justify-content: space-between;
          margin-bottom: 14px; flex-wrap: wrap; gap: 10px;
        }
        .pt-title {
          font-family: 'Playfair Display', serif;
          font-size: 22px; font-weight: 500; color: #1a1a1a;
          letter-spacing: -0.02em; margin-bottom: 3px;
        }
        .pt-sub { font-size: 13px; color: #9a9590; }

        .pt-header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

        .pt-manager-badge {
          display: inline-flex; align-items: center; gap: 6px;
          background: #ede9fe; border: 1px solid #c4b5fd;
          color: #5b21b6; border-radius: 100px;
          font-size: 12px; font-weight: 600; padding: 5px 10px;
        }

        /* Action buttons */
        .pt-btn-primary {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 10px 16px; border-radius: 10px; border: none;
          background: #2d6a4f; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 13.5px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; white-space: nowrap; min-height: 44px;
        }
        .pt-btn-primary:hover { background: #1b4332; box-shadow: 0 4px 12px rgba(45,106,79,0.2); }

        .pt-btn-secondary {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 10px 16px; border-radius: 10px;
          border: 1.5px solid #c4b5fd; background: #faf5ff; color: #5b21b6;
          font-family: 'Outfit', sans-serif; font-size: 13.5px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; white-space: nowrap; min-height: 44px;
        }
        .pt-btn-secondary:hover { background: #ede9fe; border-color: #a78bfa; }

        /* Search bar */
        .pt-search-wrap {
          position: relative; margin-bottom: 14px;
        }
        .pt-search-icon {
          position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
          color: #c0bbb4; pointer-events: none;
        }
        .pt-search-input {
          font-family: 'Outfit', sans-serif;
          width: 100%; padding: 10px 14px 10px 40px;
          border-radius: 12px; border: 1.5px solid #e5e0d8;
          background: #fff; font-size: 14px; color: #1a1a1a; outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .pt-search-input::placeholder { color: #c0bbb4; }
        .pt-search-input:focus { border-color: #2d6a4f; box-shadow: 0 0 0 3px rgba(45,106,79,0.08); }
        .pt-search-clear {
          position: absolute; right: 12px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #c0bbb4;
          display: flex; align-items: center; padding: 2px;
          transition: color 0.15s;
        }
        .pt-search-clear:hover { color: #5a5550; }

        /* Stats */
        .pt-stats {
          display: grid; grid-template-columns: repeat(2, 1fr);
          gap: 8px; margin-bottom: 14px;
        }
        @media (min-width: 480px) {
          .pt-stats { grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); }
        }
        .pt-stat {
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 12px; padding: 12px 14px;
          box-shadow: 0 1px 6px rgba(0,0,0,0.03);
        }
        .pt-stat.accent { border-top: 3px solid #2d6a4f; }
        .pt-stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #c0bbb4; font-weight: 600; margin-bottom: 4px; }
        .pt-stat-value { font-family: 'Playfair Display', serif; font-size: 26px; color: #1a1a1a; line-height: 1; margin-bottom: 2px; }
        .pt-stat-sub { font-size: 11px; color: #9a9590; }

        /* Error banner */
        .pt-error-banner {
          padding: 14px 18px; margin-bottom: 20px;
          background: #fff5f3; border: 1px solid #fecaca;
          border-radius: 12px; font-size: 13.5px; color: #b91c1c;
          display: flex; align-items: center; gap: 10px;
        }

        /* Table */
        .pt-assign-table-wrap {
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 14px; overflow-x: auto;
          box-shadow: 0 1px 6px rgba(0,0,0,0.03);
          -webkit-overflow-scrolling: touch;
        }
        .pt-assign-table { width: 100%; border-collapse: collapse; font-size: 13px; }
        .pt-assign-table thead th {
          background: #fafaf8; border-bottom: 1px solid #e5e0d8;
          padding: 10px 12px; text-align: left;
          font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em;
          color: #c0bbb4; font-weight: 600; white-space: nowrap;
        }
        .pt-assign-table tbody tr {
          border-bottom: 1px solid #f5f3ef; transition: background 0.12s;
        }
        .pt-assign-table tbody tr:last-child { border-bottom: none; }
        .pt-assign-table tbody tr:hover       { background: #fafaf8; }
        .pt-assign-table td { padding: 10px 12px; vertical-align: middle; }

        .pt-patient-cell { display: flex; align-items: center; gap: 10px; }
        .pt-cell-avatar {
          width: 32px; height: 32px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 600;
        }
        .pt-cell-name  { font-weight: 500; color: #1a1a1a; line-height: 1.2; }
        .pt-cell-email { font-size: 12px; color: #9a9590; }
        .pt-cell-cond  { color: #5a5550; }

        .pt-status-chip {
          display: inline-block; padding: 3px 10px; border-radius: 100px;
          font-size: 12px; font-weight: 500; white-space: nowrap;
        }
        .pt-unassigned-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px; border-radius: 100px;
          font-size: 12px; font-weight: 500;
          background: #f5f3ef; color: #9a9590; white-space: nowrap;
        }

        /* Delete button */
        .pt-del-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 10px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500;
          color: #9a9590; cursor: pointer; transition: all 0.15s;
          white-space: nowrap;
        }
        .pt-del-btn:hover:not(:disabled) { border-color: #fca5a5; color: #b91c1c; background: #fff5f3; }
        .pt-del-btn.pt-del-confirm { border-color: #fca5a5; color: #b91c1c; background: #fff5f3; }
        .pt-del-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .pt-del-spinner {
          width: 12px; height: 12px; border-radius: 50%;
          border: 2px solid #e5e0d8; border-top-color: #b91c1c;
          animation: ptDelSpin 0.7s linear infinite;
        }
        @keyframes ptDelSpin { to { transform: rotate(360deg); } }

        /* Physio selector */
        .ps-wrap { display: flex; align-items: center; gap: 6px; }

        /* Staff assignment panel */
        .sa-panel { display: flex; flex-direction: column; gap: 6px; min-width: 200px; }
        .sa-field  { display: flex; flex-direction: column; gap: 3px; }
        .sa-label  { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.07em; color: #9a9590; }
        .sa-select-wrap { display: flex; align-items: center; gap: 6px; }
        .sa-select { min-width: 160px; }
        .sa-required { border-color: #fca5a5 !important; }
        .sa-err { font-size: 11.5px; color: #b91c1c; margin-top: 2px; }
        .ps-select {
          font-family: 'Outfit', sans-serif; font-size: 13px; color: #1a1a1a;
          background: #f5f3ef; border: 1.5px solid #e5e0d8; border-radius: 8px;
          padding: 5px 28px 5px 10px; cursor: pointer; appearance: none; -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239a9590' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 8px center;
          min-width: 150px; max-width: 200px; outline: none; transition: border-color 0.15s;
        }
        .ps-select:hover:not(:disabled) { border-color: #b7e4c7; }
        .ps-select:focus { border-color: #2d6a4f; box-shadow: 0 0 0 3px rgba(45,106,79,0.1); }
        .ps-select:disabled { opacity: 0.55; cursor: not-allowed; }
        .ps-select.ps-saving { border-color: #b7e4c7; }
        .ps-spinner {
          width: 14px; height: 14px; flex-shrink: 0;
          border: 2px solid #e5e0d8; border-top-color: #2d6a4f; border-radius: 50%;
          animation: psSpin 0.7s linear infinite;
        }
        @keyframes psSpin { to { transform: rotate(360deg); } }
        .ps-err { font-size: 11.5px; color: #b91c1c; }

        /* Skeleton */
        .pt-skel {
          border-radius: 6px;
          background: linear-gradient(90deg, #f0ede8 0%, #e5e0d8 50%, #f0ede8 100%);
          background-size: 200% 100%;
          animation: ptShimmer 1.4s ease infinite;
        }
        @keyframes ptShimmer { to { background-position: -200% 0; } }
        .pt-skel-avatar { width: 32px; height: 32px; border-radius: 50%; }
        .pt-skel-md  { height: 13px; width: 120px; }
        .pt-skel-sm  { height: 13px; width: 80px; }
        .pt-skel-lg  { height: 13px; width: 160px; }
        .pt-skel-sel { height: 30px; width: 160px; border-radius: 8px; }

        /* Empty state */
        .pt-empty { text-align: center; padding: 60px 24px; color: #9a9590; font-size: 14px; }
        .pt-empty-icon { font-size: 36px; margin-bottom: 10px; }

        /* Add Patient Modal */
        .pt-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.4);
          display: flex; align-items: flex-end; justify-content: center;
          z-index: 300; backdrop-filter: blur(3px);
        }
        @media (min-width: 480px) {
          .pt-modal-overlay { align-items: center; }
        }
        .pt-modal {
          background: #fff; border-radius: 20px 20px 0 0; padding: 24px;
          width: 100%; max-width: 480px; max-height: 92vh; overflow-y: auto;
          box-shadow: 0 24px 80px rgba(0,0,0,0.18);
          animation: ptModalIn 0.22s cubic-bezier(0.16,1,0.3,1) both;
        }
        @media (min-width: 480px) {
          .pt-modal { border-radius: 20px; width: min(460px, 94vw); }
        }
        @keyframes ptModalIn { from { opacity:0; transform:scale(0.95) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
        .pt-modal-title { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 500; color: #1a1a1a; margin-bottom: 3px; }
        .pt-modal-sub   { font-size: 13px; color: #9a9590; margin-bottom: 16px; }
        .pt-modal-field { margin-bottom: 12px; }
        .pt-modal-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #9a9590; margin-bottom: 4px; display: block; }
        .pt-modal-input {
          width: 100%; padding: 12px 13px; border-radius: 9px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 15px; color: #1a1a1a; outline: none;
          transition: border-color 0.15s; min-height: 48px;
        }
        .pt-modal-input:focus { border-color: #2d6a4f; background: #fff; }
        .pt-modal-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .pt-modal-actions { display: flex; gap: 10px; margin-top: 16px; }
        .pt-modal-save {
          flex: 1; padding: 13px; border-radius: 10px; border: none;
          background: #2d6a4f; color: #fff; font-family: 'Outfit', sans-serif;
          font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.15s;
          min-height: 50px;
        }
        .pt-modal-save:hover:not(:disabled) { background: #1b4332; }
        .pt-modal-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .pt-modal-cancel {
          padding: 13px 18px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; color: #5a5550;
          cursor: pointer; min-height: 50px;
        }
        .pt-modal-error { font-size: 13px; color: #b91c1c; margin-top: 10px; }

        /* Toast */
        .pt-toast {
          position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
          background: #1b4332; color: #fff; padding: 13px 22px; border-radius: 12px;
          font-size: 14px; font-weight: 500; box-shadow: 0 8px 32px rgba(0,0,0,0.2);
          z-index: 2000; white-space: nowrap;
          animation: ptToastIn 0.3s cubic-bezier(0.16,1,0.3,1) both;
          display: flex; align-items: center; gap: 10px;
        }
        @keyframes ptToastIn {
          from { opacity: 0; transform: translateX(-50%) translateY(16px); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `}</style>

      <div className="pt-root">

        {/* Header */}
        <div className="pt-header">
          <div>
            <div className="pt-title">{(isManager || isSecretary) ? "All Patients" : "My Patients"}</div>
            <div className="pt-sub">
              {loading
                ? "Loading patient records…"
                : `${patients.length} patient${patients.length !== 1 ? "s" : ""}${(isManager || isSecretary) ? " across the clinic" : " under your care"}`}
            </div>
          </div>

          <div className="pt-header-actions">
            {(isManager || isSecretary) && (
              <div className="pt-manager-badge">
                <Check size={12} strokeWidth={2.5} />
                {isSecretary ? "Secretary View" : "Clinic Manager View"}
              </div>
            )}


            {canAddPatient && (
              <button className="pt-btn-primary" onClick={() => { setShowAddPatient(true); setAddError(null); }}>
                <UserPlus size={14} strokeWidth={2.5} />
                Add Patient
              </button>
            )}
          </div>
        </div>

        {/* Stats strip */}
        {!loading && (
          <div className="pt-stats">
            {[
              { label: "Total",      value: patients.length,                                          sub: "registered",        accent: true  },
              { label: "Active",     value: patients.filter((p) => p.status === "active").length,     sub: "in rehabilitation", accent: false },
              { label: "On Hold",    value: patients.filter((p) => p.status === "on_hold").length,    sub: "paused",            accent: false },
              { label: "Discharged", value: patients.filter((p) => p.status === "discharged").length, sub: "completed",         accent: false },
              ...((isManager || isSecretary)
                ? [{ label: "Unassigned", value: patients.filter((p) => !p.physioId).length, sub: "need assignment", accent: false }]
                : []
              ),
            ].map((s) => (
              <div key={s.label} className={`pt-stat ${s.accent ? "accent" : ""}`}>
                <div className="pt-stat-label">{s.label}</div>
                <div className="pt-stat-value">{s.value}</div>
                <div className="pt-stat-sub">{s.sub}</div>
              </div>
            ))}
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="pt-error-banner">
            <AlertCircle size={16} strokeWidth={2} />
            {error}
          </div>
        )}

        {/* Search bar */}
        {!loading && patients.length > 0 && (
          <div className="pt-search-wrap">
            <span className="pt-search-icon">
              <Search size={16} strokeWidth={2} />
            </span>
            <input
              type="text"
              className="pt-search-input"
              placeholder="Search patients by name or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="pt-search-clear" onClick={() => setSearchQuery("")} aria-label="Clear search">
                <X size={14} strokeWidth={2.5} />
              </button>
            )}
          </div>
        )}

        {/* Patients table */}
        <div className="pt-assign-table-wrap">
          <table className="pt-assign-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Condition</th>
                <th>Status</th>
                <th>Team</th>
                {(isManager || isSecretary) && <th>Assign Staff</th>}
                {isManager && <th></th>}
              </tr>
            </thead>
            <tbody>
              {loading
                ? Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      <td><div className="pt-patient-cell"><div className="pt-skel pt-skel-avatar" /><div className="pt-skel pt-skel-md" /></div></td>
                      <td><div className="pt-skel pt-skel-sm" /></td>
                      <td><div className="pt-skel pt-skel-sm" /></td>
                      <td><div className="pt-skel pt-skel-lg" /></td>
                      {(isManager || isSecretary) && <td><div className="pt-skel pt-skel-sel" /></td>}
                      {isManager && <td><div className="pt-skel pt-skel-sm" /></td>}
                    </tr>
                  ))
                : filteredPatients.length === 0
                  ? (
                    <tr>
                      <td colSpan={(isManager || isSecretary) ? 6 : 4}>
                        <div className="pt-empty">
                          <div className="pt-empty-icon">{searchQuery ? "🔍" : "🏥"}</div>
                          {searchQuery
                            ? `No patients match "${searchQuery}"`
                            : (isManager || isSecretary)
                              ? "No patients found in the system."
                              : "No patients assigned to you yet."
                          }
                        </div>
                      </td>
                    </tr>
                  )
                  : filteredPatients.map((patient) => {
                      const fullName   = `${patient.firstName} ${patient.lastName}`;
                      const initials   = `${patient.firstName[0] ?? ""}${patient.lastName[0] ?? ""}`.toUpperCase();
                      const hue        = fullName.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
                      const sm         = STATUS_META[patient.status] ?? STATUS_META.active;

                      return (
                        <tr key={patient.uid}>
                          <td>
                            <div className="pt-patient-cell">
                              <div className="pt-cell-avatar" style={{ background: `hsl(${hue},40%,88%)`, color: `hsl(${hue},45%,32%)` }}>
                                {initials}
                              </div>
                              <div>
                                <div
                                  className="pt-cell-name"
                                  onClick={() => onViewPatient?.(patient.uid)}
                                  style={onViewPatient ? { cursor: "pointer", color: "#2d6a4f" } : undefined}
                                >{fullName}</div>
                                <div className="pt-cell-email">{patient.email}</div>
                              </div>
                            </div>
                          </td>
                          <td className="pt-cell-cond">{patient.condition || "—"}</td>
                          <td>
                            <span className="pt-status-chip" style={{ background: sm.bg, color: sm.text }}>{sm.label}</span>
                          </td>
                          <td>
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {patient.seniorEditorName && (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 100, textTransform: "uppercase" }}>Senior</span>
                                  <span style={{ fontSize: 13, color: "#1a1a1a" }}>{patient.seniorEditorName}</span>
                                </div>
                              )}
                              {patient.juniorName && (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, background: "#D6EEF8", color: "#0C3C60", padding: "1px 6px", borderRadius: 100, textTransform: "uppercase" }}>Junior</span>
                                  <span style={{ fontSize: 13, color: "#1a1a1a" }}>{patient.juniorName}</span>
                                </div>
                              )}
                              {patient.traineeName && (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <span style={{ fontSize: 10, fontWeight: 700, background: "#f3f4f6", color: "#374151", padding: "1px 6px", borderRadius: 100, textTransform: "uppercase" }}>Trainee</span>
                                  <span style={{ fontSize: 13, color: "#1a1a1a" }}>{patient.traineeName}</span>
                                </div>
                              )}
                              {!patient.seniorEditorName && !patient.juniorName && !patient.traineeName && (
                                <span className="pt-unassigned-chip">
                                  <Plus size={10} strokeWidth={2.5} />
                                  Unassigned
                                </span>
                              )}
                            </div>
                          </td>
                          {(isManager || isSecretary) && (
                            <td>
                              <StaffAssignmentPanel patient={patient} physios={physios} />
                            </td>
                          )}
                          {isManager && (
                            <td>
                              <DeleteButton
                                patientId={patient.uid}
                                onDeleted={() => showToast(`✓ Patient record removed`)}
                              />
                            </td>
                          )}
                        </tr>
                      );
                    })
              }
            </tbody>
          </table>
        </div>

        {/* Add Patient Modal */}
        {showAddPatient && (
          <AddPatientModal
            physioId={physioId}
            physios={isManager ? physios : []}
            onClose={() => setShowAddPatient(false)}
            onCreated={(patient) => {
              showToast(`✓ ${patient.firstName} ${patient.lastName} added`);
            }}
          />
        )}

        {/* Toast */}
        {toastMsg && (
          <div className="pt-toast">
            <Check size={16} strokeWidth={2.5} />
            {toastMsg}
          </div>
        )}
      </div>
    </>
  );
}
