// FILE: src/features/physio/PatientsTab.tsx

import { useState, useEffect, useRef, useMemo } from "react";
import { Check, Trash2, Search, X, Plus, AlertCircle, UserPlus, Filter, ChevronDown, ChevronUp, Download } from "lucide-react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../hooks/useAuth";
import { docToAppointment, fmtHour12 } from "../../services/appointmentService";
import { docToSessionPrice, docToPackage } from "../../services/priceService";
import { ACQUISITION_SOURCES, labelFor, clinicToday } from "../../services/businessService";
import ContactButtons from "../inquiries/ContactButtons";
import {
  visitsByPatient, balancesByPatient, applyFilter, sortPatients, toCsv, sourceOf,
  type LAppt, type LCharge, type LPackage, type LPatient, type ListFilter, type SortKey, type Attention,
} from "./patientListLogic";
import AddPatientModal from "../../components/AddPatientModal";
import {
  subscribeToPhysioPatients,
  subscribeToAllPatients,
  subscribeToPhysiotherapists,
  assignPatientToPhysio,
  assignPatientStaff,
  deletePatient,
  updatePatientStatus,
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

  // Deactivated staff drop out of the pickers, except whoever is already
  // assigned — so an existing assignment still displays instead of going blank.
  const assignedIds = new Set([patient.seniorEditorId, patient.traineeId, ...(patient.juniorIds ?? [])].filter(Boolean));
  const pickable = physios.filter((p) => p.active || assignedIds.has(p.uid));
  const seniors  = pickable.filter((p) => (p.rank ?? "junior") === "senior");
  const juniors  = pickable.filter((p) => (p.rank ?? "junior") === "junior");
  const trainees = pickable.filter((p) => (p.rank ?? "junior") === "trainee");

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
    } else {
      result = await assignPatientStaff(patient.uid, {
        traineeId:   uid  || null,
        traineeName: name || null,
      });
    }
    setSaving(null);
    if (result.error) setErr(result.error);
  };

  const toggleJunior = async (uid: string, name: string) => {
    setSaving("junior"); setErr(null);
    const currentIds   = patient.juniorIds   ?? [];
    const currentNames = patient.juniorNames ?? [];
    let newIds: string[];
    let newNames: string[];
    if (currentIds.includes(uid)) {
      const idx = currentIds.indexOf(uid);
      newIds   = currentIds.filter((_, i) => i !== idx);
      newNames = currentNames.filter((_, i) => i !== idx);
    } else {
      newIds   = [...currentIds,   uid];
      newNames = [...currentNames, name];
    }
    const result = await assignPatientStaff(patient.uid, { juniorIds: newIds, juniorNames: newNames });
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

  const currentJuniorIds = patient.juniorIds ?? [];

  return (
    <div className="sa-panel">
      {makeSelect("senior",  patient.seniorEditorId ?? "", seniors,  "Senior",  true)}

      {/* Junior — multi-select checkboxes */}
      <div className="sa-field">
        <label className="sa-label" style={{ display: "flex", alignItems: "center", gap: 6 }}>
          Junior(s)
          {saving === "junior" && <span className="ps-spinner" style={{ width: 10, height: 10 }} />}
        </label>
        {juniors.length === 0 ? (
          <span style={{ fontSize: 11, color: "#c0bbb4" }}>No juniors registered</span>
        ) : (
          <div className="sa-junior-list">
            {juniors.map((p) => {
              const checked = currentJuniorIds.includes(p.uid);
              return (
                <label key={p.uid} className={`sa-junior-item${checked ? " checked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleJunior(p.uid, `Dr. ${p.firstName} ${p.lastName}`)}
                    disabled={saving === "junior"}
                    style={{ accentColor: "#2d6a4f", cursor: "pointer" }}
                  />
                  <span>Dr. {p.firstName} {p.lastName}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {makeSelect("trainee", patient.traineeId ?? "", trainees, "Trainee", false)}
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
  const [referralFilter, setReferralFilter] = useState("");
  // Mobile-only: which row's Assign Staff / Delete panel is expanded (desktop shows it always)
  const [expandedId,     setExpandedId]     = useState<string | null>(null);

  const canAddPatient = isManager || isSenior || isSecretary;

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

  // ── Visits & balances ────────────────────────────────────────────────────
  // Manager/secretary load the clinic's recent appointments; a physio loads only
  // their own patients' appointments (never anyone else's). Balances: manager +
  // secretary only.
  const { user } = useAuth();
  const staffView = isManager || isSecretary;
  const today = clinicToday();
  const [appts, setAppts] = useState<LAppt[]>([]);
  const [unpaid, setUnpaid] = useState<LCharge[]>([]);
  const [pkgs, setPkgs] = useState<LPackage[]>([]);
  const patientIdsKey = staffView ? "" : patients.map((p) => p.uid).sort().join(",");
  useEffect(() => {
    const toA = (d: { id: string; data: () => Record<string, unknown> }) => { const a = docToAppointment(d.id, d.data()); return { id: a.id, patientId: a.patientId, date: a.date, hour: Number(a.hour), status: a.status }; };
    if (staffView) {
      const from = new Date(); from.setFullYear(from.getFullYear() - 1);
      return onSnapshot(query(collection(db, "appointments"), where("date", ">=", from.toISOString().slice(0, 10))),
        (snap) => setAppts(snap.docs.map(toA)), () => {});
    }
    const ids = patientIdsKey ? patientIdsKey.split(",") : [];
    const chunks: string[][] = [];
    for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
    const parts = new Map<number, LAppt[]>();
    const unsubs = chunks.map((chunk, i) => onSnapshot(query(collection(db, "appointments"), where("patientId", "in", chunk)),
      (snap) => { parts.set(i, snap.docs.map(toA)); setAppts([...parts.values()].flat()); }, () => {}));
    return () => unsubs.forEach((u) => u());
  }, [staffView, patientIdsKey]);
  useEffect(() => {
    if (!staffView) return;
    const u1 = onSnapshot(query(collection(db, "patientSessionPrices"), where("paid", "==", false)), (snap) => setUnpaid(snap.docs.map((d) => {
      const c = docToSessionPrice(d.id, d.data());
      return { id: c.id, patientId: c.patientId, appointmentId: c.appointmentId, amount: Number(c.amount) || 0, paid: !!c.paid, packageId: c.packageId, keptAsExtra: !!c.keptAsExtra };
    })), () => {});
    const u2 = onSnapshot(collection(db, "patientPackages"), (snap) => setPkgs(snap.docs.map((d) => {
      const k = docToPackage(d.id, d.data());
      return { patientId: k.patientId, totalAmount: Number(k.totalAmount) || 0, paidAmount: Number(k.paidAmount) || 0 };
    })), () => {});
    return () => { u1(); u2(); };
  }, [staffView]);

  const visits = useMemo(() => visitsByPatient(appts, today), [appts, today]);
  const balances = useMemo(() => staffView ? balancesByPatient(unpaid, pkgs, new Map(appts.map((a) => [a.id, a.status] as const))) : new Map<string, number>(), [staffView, unpaid, pkgs, appts]);
  const lp = (p: Patient): LPatient => ({
    uid: p.uid, firstName: p.firstName, lastName: p.lastName, phone: p.phone, email: p.email, status: p.status || "active",
    createdDate: p.createdAt ? p.createdAt.toDate().toISOString().slice(0, 10) : "", physioId: p.physioId,
    seniorEditorId: p.seniorEditorId, juniorIds: p.juniorIds ?? [], traineeId: p.traineeId,
    acquisitionSource: p.acquisitionSource, referredByPhysicianId: p.referredByPhysicianId,
  });
  const [listFilter, setListFilter] = useState<ListFilter>({ status: "active", doctor: "", source: "", attention: "" });
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [statusBusy, setStatusBusy] = useState<string | null>(null);
  const changeStatus = async (p: Patient, status: Patient["status"]) => {
    if (status === p.status) return;
    const label = status === "discharged" ? "discharge" : status === "on_hold" ? "put on hold" : "reactivate";
    if (!window.confirm(`${label[0].toUpperCase() + label.slice(1)} ${p.firstName} ${p.lastName}?`)) return;
    setStatusBusy(p.uid);
    const r = await updatePatientStatus(p.uid, status, user?.uid ?? "");
    setStatusBusy(null);
    showToast(r.error ? r.error : `✓ ${p.firstName} ${p.lastName} is now ${status === "on_hold" ? "on hold" : status}`);
  };
  const exportCsv = (rows: Patient[]) => {
    const name = (id: string | null) => (id ? physioMap.current.get(id) ?? "" : "");
    const data: (string | number)[][] = [["Name", "Phone", "Email", "Status", "Senior", "Juniors", "Trainee", "Heard about us via", "Referred by", "Joined", "Last visit", "Next appointment", "Balance owed (EGP)"]];
    for (const p of rows) {
      const v = visits.get(p.uid);
      data.push([`${p.firstName} ${p.lastName}`, p.phone ?? "", p.email ?? "", p.status, name(p.seniorEditorId), (p.juniorIds ?? []).map((j) => name(j)).join(" / "), name(p.traineeId),
        labelFor(ACQUISITION_SOURCES, sourceOf(lp(p)), "Unknown"), p.referredBy ?? "", lp(p).createdDate, v?.last ?? "", v?.next ? `${v.next.date} ${fmtHour12(v.next.hour)}` : "", Math.round(balances.get(p.uid) ?? 0)]);
    }
    const blob = new Blob([toCsv(data)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob); a.download = `patients-${today}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };

  // ── Unique referral sources for filter dropdown ───────────────────────────
  const referralOptions = useMemo(() => {
    const set = new Set<string>();
    patients.forEach((p) => { if (p.referredBy) set.add(p.referredBy.trim()); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [patients]);

  // ── Real-time search + referral filter ───────────────────────────────────
  const filteredPatients = patients.filter((p) => {
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      const fullName   = `${p.firstName ?? ""} ${p.lastName ?? ""}`.toLowerCase().trim();
      const qDigits    = q.replace(/\D/g, "");
      const phoneDigits = (p.phone ?? "").replace(/\D/g, "");
      const matches =
        p.firstName?.toLowerCase().includes(q) ||
        p.lastName?.toLowerCase().includes(q)  ||
        fullName.includes(q)                   ||
        p.email?.toLowerCase().includes(q)     ||
        (qDigits.length > 0 && phoneDigits.includes(qDigits));
      if (!matches) return false;
    }
    if (referralFilter) {
      const ref = (p.referredBy ?? "").trim().toLowerCase();
      if (ref !== referralFilter.toLowerCase()) return false;
    }
    return true;
  });


  const byUid = new Map(patients.map((p) => [p.uid, p] as const));
  const shownPatients = sortPatients(applyFilter(filteredPatients.map(lp), listFilter, visits, balances), sortKey, visits, balances)
    .map((x) => byUid.get(x.uid)!).filter(Boolean);
  const counts = {
    active: patients.filter((p) => (p.status || "active") === "active").length,
    on_hold: patients.filter((p) => p.status === "on_hold").length,
    discharged: patients.filter((p) => p.status === "discharged").length,
    noSenior: patients.filter((p) => !p.seniorEditorId).length,
    noUpcoming: patients.filter((p) => (p.status || "active") === "active" && !visits.get(p.uid)?.next).length,
    owes: patients.filter((p) => (balances.get(p.uid) ?? 0) > 0).length,
  };
  const setAttention = (a: Attention) => setListFilter((f) => ({ ...f, attention: f.attention === a ? "" : a, status: a === "no_upcoming" ? "active" : f.status }));

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 4000);
  };


  return (
    <>
      <style>{`

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

        /* Search + filter row */
        .pt-filter-row {
          display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap;
        }
        .pt-search-wrap {
          position: relative; flex: 1; min-width: 180px;
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

        .pt-referral-select-wrap {
          position: relative; display: flex; align-items: center;
        }
        .pt-referral-icon {
          position: absolute; left: 11px; top: 50%; transform: translateY(-50%);
          color: #c0bbb4; pointer-events: none;
        }
        .pt-referral-select {
          font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
          padding: 10px 36px 10px 34px; border-radius: 12px;
          border: 1.5px solid #e5e0d8; background: #fff; outline: none;
          cursor: pointer; appearance: none; -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239a9590' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 10px center;
          transition: border-color 0.15s, box-shadow 0.15s;
          white-space: nowrap; min-width: 160px;
        }
        .pt-referral-select:focus { border-color: #2d6a4f; box-shadow: 0 0 0 3px rgba(45,106,79,0.08); }
        .pt-referral-select.active { border-color: #2d6a4f; background-color: #f0fdf4; color: #2d6a4f; }
        .pt-referral-clear {
          position: absolute; right: 24px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #2d6a4f;
          display: flex; align-items: center; padding: 2px; pointer-events: all;
        }

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

        /* Patient list — responsive rows (replaces the old <table>) */
        .pt-list {
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 14px; overflow: hidden;
          box-shadow: 0 1px 6px rgba(0,0,0,0.03);
        }
        .pt-row {
          display: flex; align-items: flex-start; gap: 14px; flex-wrap: wrap;
          padding: 14px 16px; border-bottom: 1px solid #f5f3ef;
          transition: background 0.12s;
        }
        .pt-row:last-child { border-bottom: none; }
        .pt-row:hover { background: #fafaf8; }

        .pt-row-main { display: flex; gap: 10px; align-items: flex-start; flex: 1 1 220px; min-width: 220px; }
        .pt-cell-avatar {
          width: 38px; height: 38px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 600; margin-top: 1px;
        }
        .pt-cell-name  { font-weight: 500; color: #1a1a1a; line-height: 1.3; }
        .pt-cell-contact { font-size: 12.5px; color: #9a9590; line-height: 1.5; }
        .pt-cell-email { display: block; }
        .pt-cell-phone { display: block; }

        .pt-row-tags { display: flex; flex-direction: column; gap: 5px; flex: 1 1 160px; min-width: 140px; }
        .pt-referred-tag { font-size: 12px; color: #5a5550; }
        .pt-referred-tag strong { color: #9a9590; font-weight: 600; font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; margin-right: 5px; }

        .pt-row-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .pt-row-toggle {
          display: none; align-items: center; gap: 4px;
          background: none; border: 1.5px solid #e5e0d8; border-radius: 8px;
          padding: 6px 10px; font-family: 'Outfit', sans-serif; font-size: 12px;
          color: #5a5550; cursor: pointer; margin-left: auto;
        }

        .pt-status-chip {
          display: inline-block; padding: 3px 10px; border-radius: 100px;
          font-size: 12px; font-weight: 500; white-space: nowrap;
        }
        .pt-unassigned-chip {
          display: inline-flex; align-items: center; gap: 4px;
          padding: 3px 10px; border-radius: 100px; width: fit-content;
          font-size: 12px; font-weight: 500;
          background: #f5f3ef; color: #9a9590; white-space: nowrap;
        }

        @media (max-width: 768px) {
          .pt-row { flex-direction: column; }
          /* Undo the desktop flex-grow — in a column flex, flex:1 grows along
             the now-vertical main axis and stretches these apart instead of
             letting them stack tightly. */
          .pt-row-main, .pt-row-tags { flex: none; }
          .pt-row-toggle { display: flex; }
          .pt-row-actions { display: none; width: 100%; padding-top: 10px; border-top: 1px dashed #e5e0d8; margin-top: 4px; }
          .pt-row-actions.expanded { display: flex; }
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
        .sa-junior-list { display: flex; flex-direction: column; gap: 3px; max-height: 120px; overflow-y: auto; }
        .sa-junior-item {
          display: flex; align-items: center; gap: 6px;
          font-size: 12.5px; color: #1a1a1a; cursor: pointer;
          padding: 4px 8px; border-radius: 7px; border: 1.5px solid #e5e0d8;
          background: #fafaf8; transition: all 0.12s; user-select: none;
        }
        .sa-junior-item:hover { border-color: #b7e4c7; background: #f0fdf4; }
        .sa-junior-item.checked { border-color: #2d6a4f; background: #e8f5ee; color: #1b4332; font-weight: 500; }
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
          display: flex; align-items: flex-start; justify-content: center;
          z-index: 300; backdrop-filter: blur(3px);
        }
        @media (min-width: 480px) {
          .pt-modal-overlay { align-items: center; }
        }
        .pt-modal {
          background: #fff; border-radius: 0 0 20px 20px; padding: 24px;
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
        /* ── People tab upgrade ── */
        button.pt-stat { text-align: left; cursor: pointer; font-family: inherit; transition: border-color .15s, box-shadow .15s; }
        button.pt-stat:hover { border-color: #B3DEF0; box-shadow: 0 4px 12px rgba(12,60,96,.06); }
        .pt-filter2 { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
        .pt-chips { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
        .pt-chips-label { font-size: 12px; color: #9a9590; font-weight: 600; margin-right: 2px; }
        .pt-chip { border: 1.5px solid #e5e0d8; background: #fff; border-radius: 100px; padding: 5px 12px; font-family: inherit; font-size: 12.5px; font-weight: 600; color: #5a5550; cursor: pointer; }
        .pt-chip b { margin-left: 4px; color: #9a9590; }
        .pt-chip.on { background: #0C3C60; border-color: #0C3C60; color: #fff; } .pt-chip.on b { color: rgba(255,255,255,.75); }
        .pt-chip.warn:not(.on) { border-color: #fde68a; background: #fffbeb; color: #92400e; }
        .pt-selects { display: flex; gap: 6px; flex-wrap: wrap; }
        .pt-selects select { border: 1.5px solid #e5e0d8; border-radius: 10px; padding: 7px 10px; font-family: inherit; font-size: 13px; background: #fff; color: #1a1a1a; min-width: 0; }
        .pt-export { display: inline-flex; align-items: center; gap: 6px; border: 1.5px solid #B3DEF0; background: #EAF5FC; color: #2E8BC0; border-radius: 10px; padding: 7px 12px; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; margin-left: auto; }
        .pt-visits { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: #9a9590; margin-top: 5px; }
        .pt-visits b { color: #1a1a1a; font-weight: 600; }
        .pt-visits .pt-warn b { color: #b45309; }
        .pt-owes { font-size: 11.5px; font-weight: 700; color: #991b1b; background: #fee2e2; padding: 1px 8px; border-radius: 100px; }
        .pt-row-quick { display: flex; gap: 6px; align-items: center; margin-top: 7px; flex-wrap: wrap; }
        .pt-status-sel { border-radius: 100px; padding: 4px 8px; font-family: inherit; font-size: 12px; font-weight: 700; border: 1.5px solid; cursor: pointer; }
        .pt-status-sel.s-active, .pt-status-pill.s-active { background: #dcfce7; color: #166534; border-color: #86efac; }
        .pt-status-sel.s-on_hold, .pt-status-pill.s-on_hold { background: #fef3c7; color: #92400e; border-color: #fde68a; }
        .pt-status-sel.s-discharged, .pt-status-pill.s-discharged { background: #f3f4f6; color: #4b5563; border-color: #d1d5db; }
        .pt-status-pill { font-size: 11px; font-weight: 700; padding: 2px 9px; border-radius: 100px; border: 1px solid; }
        .iq-contact { display: inline-flex; gap: 6px; }
        .iq-wa { height: 28px; min-width: 28px; padding: 0 7px; border-radius: 8px; border: 1.5px solid #86efac; background: #f0fdf4; color: #15803d; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
        .iq-icon { height: 28px; min-width: 28px; padding: 0 7px; border-radius: 8px; border: 1.5px solid #e5e0d8; background: #fff; color: #2E8BC0; display: inline-flex; align-items: center; justify-content: center; text-decoration: none; }
        @media (max-width: 640px) { .pt-export { margin-left: 0; } }
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
              <button className="pt-btn-primary" onClick={() => setShowAddPatient(true)}>
                <UserPlus size={14} strokeWidth={2.5} />
                Add Patient
              </button>
            )}
          </div>
        </div>

        {/* Summary — click a number to filter */}
        {!loading && (
          <div className="pt-stats">
            {[
              { label: "Total", value: patients.length, sub: "registered", on: listFilter.status === "", click: () => setListFilter((f) => ({ ...f, status: "" })) },
              { label: "Active", value: counts.active, sub: "in treatment", on: listFilter.status === "active", click: () => setListFilter((f) => ({ ...f, status: "active" })) },
              { label: "On hold", value: counts.on_hold, sub: "paused", on: listFilter.status === "on_hold", click: () => setListFilter((f) => ({ ...f, status: "on_hold" })) },
              { label: "Discharged", value: counts.discharged, sub: "finished", on: listFilter.status === "discharged", click: () => setListFilter((f) => ({ ...f, status: "discharged" })) },
              { label: "New This Month", value: patients.filter((p) => {
                  if (!p.createdAt) return false;
                  const d = p.createdAt.toDate(); const now = new Date();
                  return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
                }).length, sub: "patients joined", on: false, click: () => setSortKey("newest") },
            ].map((st) => (
              <button key={st.label} className={`pt-stat ${st.on ? "accent" : ""}`} onClick={st.click}>
                <div className="pt-stat-label">{st.label}</div>
                <div className="pt-stat-value">{st.value}</div>
                <div className="pt-stat-sub">{st.sub}</div>
              </button>
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

        {/* Search + referral filter row */}
        {!loading && patients.length > 0 && (
          <div className="pt-filter-row">
            <div className="pt-search-wrap">
              <span className="pt-search-icon">
                <Search size={16} strokeWidth={2} />
              </span>
              <input
                type="text"
                className="pt-search-input"
                placeholder="Search patients by name, email, or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className="pt-search-clear" onClick={() => setSearchQuery("")} aria-label="Clear search">
                  <X size={14} strokeWidth={2.5} />
                </button>
              )}
            </div>

            {referralOptions.length > 0 && (
              <div className="pt-referral-select-wrap">
                <span className="pt-referral-icon">
                  <Filter size={14} strokeWidth={2} />
                </span>
                <select
                  className={`pt-referral-select${referralFilter ? " active" : ""}`}
                  value={referralFilter}
                  onChange={(e) => setReferralFilter(e.target.value)}
                >
                  <option value="">All Referrals</option>
                  {referralOptions.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {referralFilter && (
                  <button className="pt-referral-clear" onClick={() => setReferralFilter("")} aria-label="Clear referral filter">
                    <X size={12} strokeWidth={2.5} />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Status · doctor · source · needs attention · sort · export */}
        {!loading && patients.length > 0 && (
          <div className="pt-filter2">
            <div className="pt-chips">
              {([["active", "Active"], ["on_hold", "On hold"], ["discharged", "Discharged"], ["", "All"]] as const).map(([v, l]) => (
                <button key={l} className={`pt-chip ${listFilter.status === v ? "on" : ""}`} onClick={() => setListFilter((f) => ({ ...f, status: v }))}>{l}</button>
              ))}
            </div>
            <div className="pt-chips">
              <span className="pt-chips-label">Needs attention:</span>
              <button className={`pt-chip warn ${listFilter.attention === "no_upcoming" ? "on" : ""}`} onClick={() => setAttention("no_upcoming")}>No upcoming visit <b>{counts.noUpcoming}</b></button>
              {staffView && <button className={`pt-chip warn ${listFilter.attention === "owes" ? "on" : ""}`} onClick={() => setAttention("owes")}>Owes money <b>{counts.owes}</b></button>}
              {staffView && <button className={`pt-chip warn ${listFilter.attention === "no_senior" ? "on" : ""}`} onClick={() => setAttention("no_senior")}>No senior assigned <b>{counts.noSenior}</b></button>}
            </div>
            <div className="pt-selects">
              {staffView && (
                <select value={listFilter.doctor} onChange={(e) => setListFilter((f) => ({ ...f, doctor: e.target.value }))}>
                  <option value="">All doctors</option>
                  {physios.filter((ph) => ph.active).map((ph) => <option key={ph.uid} value={ph.uid}>Dr. {ph.firstName} {ph.lastName}</option>)}
                </select>
              )}
              <select value={listFilter.source} onChange={(e) => setListFilter((f) => ({ ...f, source: e.target.value }))}>
                <option value="">All sources</option>
                {ACQUISITION_SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                <option value="unknown">Unknown</option>
              </select>
              <select value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)}>
                <option value="name">Sort: Name</option>
                <option value="newest">Sort: Newest</option>
                <option value="last_visit">Sort: Last visit</option>
                {staffView && <option value="balance">Sort: Balance owed</option>}
              </select>
              {isManager && (
                <button className="pt-export" onClick={() => exportCsv(shownPatients)} title="Download the patients shown as a CSV file (opens in Excel)">
                  <Download size={14} /> Export ({shownPatients.length})
                </button>
              )}
            </div>
          </div>
        )}

        {/* Patients list */}
        <div className="pt-list">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div className="pt-row" key={i}>
                <div className="pt-row-main">
                  <div className="pt-skel pt-skel-avatar" />
                  <div>
                    <div className="pt-skel pt-skel-md" style={{ marginBottom: 6 }} />
                    <div className="pt-skel pt-skel-sm" />
                  </div>
                </div>
                {(isManager || isSecretary) && <div className="pt-skel pt-skel-sel" />}
              </div>
            ))
          ) : shownPatients.length === 0 ? (
            <div className="pt-empty">
              <div className="pt-empty-icon">{searchQuery ? "🔍" : "🏥"}</div>
              {searchQuery || listFilter.attention || listFilter.doctor || listFilter.source || listFilter.status
                ? "No patients match these filters."
                : (isManager || isSecretary)
                  ? "No patients found in the system."
                  : "No patients assigned to you yet."
              }
            </div>
          ) : (
            shownPatients.map((patient) => {
              const fullName = `${patient.firstName} ${patient.lastName}`;
              const initials = `${patient.firstName[0] ?? ""}${patient.lastName[0] ?? ""}`.toUpperCase();
              const hue      = fullName.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 360;
              const hasTeam  = patient.seniorEditorName || (patient.juniorNames ?? []).length > 0 || patient.traineeName;
              const isExpanded = expandedId === patient.uid;
              const showActions = isManager || isSecretary;

              return (
                <div className="pt-row" key={patient.uid}>
                  <div className="pt-row-main">
                    <div className="pt-cell-avatar" style={{ background: `hsl(${hue},40%,88%)`, color: `hsl(${hue},45%,32%)` }}>
                      {initials}
                    </div>
                    <div>
                      <div
                        className="pt-cell-name"
                        onClick={() => onViewPatient?.(patient.uid)}
                        style={onViewPatient ? { cursor: "pointer", color: "#2d6a4f" } : undefined}
                      >{fullName}</div>
                      <div className="pt-cell-contact">
                        {patient.phone && <span className="pt-cell-phone">{patient.phone}</span>}
                        <span className="pt-cell-email">{patient.email}</span>
                      </div>
                      <div className="pt-visits">
                        {(() => { const v = visits.get(patient.uid); return <>
                          <span>Last visit: <b>{v?.last ? new Date(v.last + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—"}</b></span>
                          <span className={v?.next ? "" : (patient.status || "active") === "active" ? "pt-warn" : ""}>Next: <b>{v?.next ? `${new Date(v.next.date + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" })} ${fmtHour12(v.next.hour)}` : "not booked"}</b></span>
                        </>; })()}
                        {staffView && (balances.get(patient.uid) ?? 0) > 0 && <span className="pt-owes">Owes {Math.round(balances.get(patient.uid)!).toLocaleString("en-US")} EGP</span>}
                      </div>
                      <div className="pt-row-quick">
                        {patient.phone && <ContactButtons phone={patient.phone} />}
                        {staffView ? (
                          <select className={`pt-status-sel s-${patient.status || "active"}`} value={patient.status || "active"} disabled={statusBusy === patient.uid}
                            onChange={(e) => changeStatus(patient, e.target.value as Patient["status"])} title="Patient status">
                            <option value="active">Active</option>
                            <option value="on_hold">On hold</option>
                            <option value="discharged">Discharged</option>
                          </select>
                        ) : (
                          <span className={`pt-status-pill s-${patient.status || "active"}`}>{patient.status === "on_hold" ? "On hold" : patient.status === "discharged" ? "Discharged" : "Active"}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="pt-row-tags">
                    {patient.referredBy && (
                      <div className="pt-referred-tag"><strong>Referred</strong>{patient.referredBy}</div>
                    )}
                    {patient.seniorEditorName && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, background: "#fef3c7", color: "#92400e", padding: "1px 6px", borderRadius: 100, textTransform: "uppercase" }}>Senior</span>
                        <span style={{ fontSize: 13, color: "#1a1a1a" }}>{patient.seniorEditorName}</span>
                      </div>
                    )}
                    {(patient.juniorNames ?? []).map((name, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, background: "#D6EEF8", color: "#0C3C60", padding: "1px 6px", borderRadius: 100, textTransform: "uppercase" }}>Junior</span>
                        <span style={{ fontSize: 13, color: "#1a1a1a" }}>{name}</span>
                      </div>
                    ))}
                    {patient.traineeName && (
                      <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, background: "#f3f4f6", color: "#374151", padding: "1px 6px", borderRadius: 100, textTransform: "uppercase" }}>Trainee</span>
                        <span style={{ fontSize: 13, color: "#1a1a1a" }}>{patient.traineeName}</span>
                      </div>
                    )}
                    {!hasTeam && (
                      <span className="pt-unassigned-chip">
                        <Plus size={10} strokeWidth={2.5} />
                        Unassigned
                      </span>
                    )}
                  </div>

                  {showActions && (
                    <button
                      className="pt-row-toggle"
                      onClick={() => setExpandedId(isExpanded ? null : patient.uid)}
                      aria-label={isExpanded ? "Hide staff assignment" : "Manage staff assignment"}
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                      Manage
                    </button>
                  )}

                  {showActions && (
                    <div className={`pt-row-actions ${isExpanded ? "expanded" : ""}`}>
                      <StaffAssignmentPanel patient={patient} physios={physios} />
                      {isManager && (
                        <DeleteButton
                          patientId={patient.uid}
                          onDeleted={() => showToast(`✓ Patient record removed`)}
                        />
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
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
