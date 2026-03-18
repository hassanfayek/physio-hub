// FILE: src/features/patient/PatientSheetPage.tsx

import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import {
  subscribeToPatient,
  subscribeToPhysiotherapists,
  assignSeniorEditor,
  type Patient,
  type Physiotherapist,
} from "../../services/patientService";
import type { PhysioProfile } from "../../services/authService";
import ExerciseProgram      from "./ExerciseProgram";
import {
  collection, addDoc, doc, setDoc, query, where, orderBy,
  onSnapshot, serverTimestamp, type Timestamp,
} from "firebase/firestore";
import {
  subscribeToPatientAllAppointments,
  updateAppointmentStatus,
  fmtHour12,
  type Appointment as ApptRecord,
} from "../../services/appointmentService";
import { db } from "../../firebase";

// ─── Static mock data (unchanged from original) ───────────────────────────────

type DocType = "mri" | "xray" | "report" | "referral";

interface MedicalDoc {
  id: number;
  type: DocType;
  label: string;
  date: string;
  size: string;
  icon: string;
}

const DOCS: MedicalDoc[] = [
  { id: 1, type: "mri",      label: "MRI Knee — Right",         date: "14 Jan 2025", size: "28.4 MB", icon: "🩻" },
  { id: 2, type: "report",   label: "Surgical Op Report",        date: "22 Jan 2025", size: "2.1 MB",  icon: "📄" },
  { id: 3, type: "xray",     label: "X-Ray Post-Op",             date: "6 Feb 2025",  size: "14.8 MB", icon: "🩻" },
  { id: 4, type: "referral", label: "GP Referral Letter",        date: "10 Jan 2025", size: "0.8 MB",  icon: "📋" },
  { id: 5, type: "report",   label: "Anaesthesia Report",        date: "22 Jan 2025", size: "1.2 MB",  icon: "📄" },
  { id: 6, type: "xray",     label: "X-Ray Follow-Up 6 Weeks",   date: "5 Mar 2025",  size: "12.1 MB", icon: "🩻" },
];


const DOC_COLORS: Record<DocType, { bg: string; text: string }> = {
  mri:      { bg: "#dbeafe", text: "#1e40af" },
  xray:     { bg: "#ede9fe", text: "#5b21b6" },
  report:   { bg: "#fef3c7", text: "#92400e" },
  referral: { bg: "#d1fae5", text: "#065f46" },
};

// ─── Senior Editor Assignment panel (clinic_manager only) ─────────────────────
// Renders a small dropdown above the tabs so the manager can grant write access
// to a specific physiotherapist without touching any other part of the UI.

interface SeniorAssignPanelProps {
  patientId:        string;
  physios:          Physiotherapist[];
  seniorEditorId:   string | null;
  seniorEditorName: string | null;
}

function SeniorAssignPanel({
  patientId,
  physios,
  seniorEditorId,
  seniorEditorName,
}: SeniorAssignPanelProps) {
  const [saving, setSaving] = useState(false);
  const [saved,  setSaved]  = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const selectedId = e.target.value;
    setSaving(true);
    setError(null);
    setSaved(false);

    if (!selectedId) {
      const result = await assignSeniorEditor(patientId, null, null);
      setSaving(false);
      if (result.error) { setError(result.error); return; }
    } else {
      const physio = physios.find((p) => p.uid === selectedId);
      if (!physio) { setSaving(false); return; }
      const result = await assignSeniorEditor(
        patientId,
        physio.uid,
        `Dr. ${physio.firstName} ${physio.lastName}`
      );
      setSaving(false);
      if (result.error) { setError(result.error); return; }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="ps-senior-panel">
      <div className="ps-senior-label">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        </svg>
        Senior Physiotherapist
      </div>

      <div className="ps-senior-row">
        <select
          className="ps-senior-select"
          value={seniorEditorId ?? ""}
          onChange={handleChange}
          disabled={saving}
        >
          <option value="">— Unassigned —</option>
          {physios.map((p) => (
            <option key={p.uid} value={p.uid}>
              Dr. {p.firstName} {p.lastName}
            </option>
          ))}
        </select>

        {saving && <span className="ps-senior-spinner" />}

        {saved && !saving && (
          <span className="ps-senior-saved">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2.5"
              strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12"/>
            </svg>
            Saved
          </span>
        )}
      </div>

      {seniorEditorName && !saving && (
        <div className="ps-senior-current">
          Edit access granted to {seniorEditorName}
        </div>
      )}
      {error && <div className="ps-senior-error">{error}</div>}
    </div>
  );
}

// ─── Read-only banner ─────────────────────────────────────────────────────────

function ReadOnlyBanner({ role }: { role: string }) {
  const msg =
    role === "patient"
      ? "You are viewing your clinical record. Editing is managed by your physiotherapist."
      : "You have view-only access to this patient sheet.";
  return (
    <div className="ps-readonly-banner">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
        stroke="currentColor" strokeWidth="2"
        strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
      </svg>
      {msg}
    </div>
  );
}

// ─── Session notes types ─────────────────────────────────────────────────────

interface SessionNote {
  id:            string;
  patientId:     string;
  physioId:      string;
  date:          string;
  treatmentType: string;
  notes:         string;
  createdAt:     Timestamp | null;
}

// Treatment Program entries — same patientSessions collection
// Manager / senior physio can add; patients cannot see this section
interface TreatmentEntry {
  id:            string;
  patientId:     string;
  physioId:      string;
  date:          string;
  treatmentType: string;
  notes:         string;
  entryMode:     "session" | "plan";
  numSessions?:  number;
  goals?:        string;
  createdAt:     Timestamp | null;
}

interface SessionFeedback {
  id:            string;
  appointmentId: string;
  patientId:     string;
  physioId:      string;
  sessionDate:   string;
  painLevel:     number;
  difficulty:    string;
  energyLevel:   string;
  rating:        number;
  comments:      string;
  createdAt:     Timestamp | null;
}

const TREATMENT_TYPES = [
  "Manual Therapy",
  "Exercise Therapy",
  "Stretching",
  "Strength Training",
  "Dry Needling",
  "Mobility Work",
  "Other",
];

// ─── Diagnosis data structure ────────────────────────────────────────────────

interface DiagnosisData {
  primaryDiagnosis: string;
  icdCode:          string;
  onsetDate:        string;
  mechanism:        string;
  surgeryDate:      string;
  surgeon:          string;
  contraindications: string;   // newline-separated list
}

const EMPTY_DIAGNOSIS: DiagnosisData = {
  primaryDiagnosis:  "",
  icdCode:           "",
  onsetDate:         "",
  mechanism:         "",
  surgeryDate:       "",
  surgeon:           "",
  contraindications: "",
};

// ─── PT Assessment structure ──────────────────────────────────────────────────

interface PTAssessment {
  subjectiveComplaints: string;
  painLocation:         string;
  painScore:            string;
  aggravatingFactors:   string;
  relievingFactors:     string;
  medicalHistory:       string;
  medications:          string;
  postureObservation:   string;
  rangeOfMotion:        string;
  muscleStrength:       string;
  specialTests:         string;
  functionalLimits:     string;
  shortTermGoals:       string;
  longTermGoals:        string;
  treatmentApproach:    string;
  precautions:          string;
  assessorName:         string;
  assessmentDate:       string;
}

const EMPTY_ASSESSMENT: PTAssessment = {
  subjectiveComplaints: "",
  painLocation:         "",
  painScore:            "",
  aggravatingFactors:   "",
  relievingFactors:     "",
  medicalHistory:       "",
  medications:          "",
  postureObservation:   "",
  rangeOfMotion:        "",
  muscleStrength:       "",
  specialTests:         "",
  functionalLimits:     "",
  shortTermGoals:       "",
  longTermGoals:        "",
  treatmentApproach:    "",
  precautions:          "",
  assessorName:         "",
  assessmentDate:       new Date().toISOString().slice(0, 10),
};

// ─── Main component ───────────────────────────────────────────────────────────

export interface PatientSheetPageProps {
  /** When provided (physio/manager navigating to a patient's sheet),
   *  this overrides the default of user.uid. */
  patientId?: string;
  /** Optional callback so a host component can render a back button or
   *  handle back-navigation without this component knowing about it. */
  onBack?: () => void;
}

export default function PatientSheetPage({ patientId: patientIdProp }: PatientSheetPageProps = {}) {
  const { user } = useAuth();

  // Patient ID resolution:
  //   • prop provided (physio/manager opened a patient's sheet) → use prop
  //   • role === "patient"                                       → their own UID
  const patientId = patientIdProp ?? user?.uid ?? "";

  // ── Live patient document ──────────────────────────────────────────────────
  const [patient, setPatient] = useState<Patient | null>(null);
  const [physios, setPhysios] = useState<Physiotherapist[]>([]);

  useEffect(() => {
    if (!patientId) return;
    return subscribeToPatient(patientId, setPatient, () => setPatient(null));
  }, [patientId]);

  // Load diagnosis from Firestore (stored in patients/{id}/diagnosis sub-doc)
  useEffect(() => {
    if (!patientId) return;
    const unsub = onSnapshot(
      doc(db, "patientDiagnosis", patientId),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data() as Partial<DiagnosisData>;
          const filled: DiagnosisData = { ...EMPTY_DIAGNOSIS, ...d };
          setDiagData(filled);
          setDiagDraft(filled);
        }
      },
      () => {}
    );
    return unsub;
  }, [patientId]);

  // Load PT assessment from Firestore
  useEffect(() => {
    if (!patientId) return;
    const unsub = onSnapshot(
      doc(db, "patientAssessments", patientId),
      (snap) => {
        if (snap.exists()) {
          const d = snap.data() as Partial<PTAssessment>;
          const filled: PTAssessment = { ...EMPTY_ASSESSMENT, ...d };
          setAssessment(filled);
          setAsmDraft(filled);
        }
      },
      () => {}
    );
    return unsub;
  }, [patientId]);

  const handleSaveDiagnosis = async () => {
    if (!patientId) return;
    setDiagSaving(true);
    await setDoc(doc(db, "patientDiagnosis", patientId), {
      ...diagDraft,
      updatedAt: serverTimestamp(),
    });
    setDiagData(diagDraft);
    setDiagEditing(false);
    setDiagSaving(false);
    setDiagSaved(true);
    setTimeout(() => setDiagSaved(false), 2500);
  };

  const handleSaveAssessment = async () => {
    if (!patientId) return;
    setAsmSaving(true);
    await setDoc(doc(db, "patientAssessments", patientId), {
      ...asmDraft,
      updatedAt: serverTimestamp(),
    });
    setAssessment(asmDraft);
    setAsmEditing(false);
    setAsmSaving(false);
    setAsmSaved(true);
    setTimeout(() => setAsmSaved(false), 2500);
  };

  // Load physio roster only when the current user is a manager (for assignment dropdown)
  useEffect(() => {
    if (user?.role !== "clinic_manager") return;
    return subscribeToPhysiotherapists(setPhysios);
  }, [user?.role]);

  // ── Permission logic ───────────────────────────────────────────────────────
  const role = user?.role ?? "patient";

  // canEdit:
  //   clinic_manager            → always true
  //   senior physiotherapist    → true (assigned senior editor for this patient)
  //   any other physio          → false (view-only)
  //   patient                   → false (view-only)
  const canEdit: boolean =
    role === "clinic_manager" ||
    (role === "physiotherapist" &&
      !!patient?.seniorEditorId &&
      (user as PhysioProfile).uid === patient.seniorEditorId);

  const isManager = role === "clinic_manager";

  // ── Diagnosis state (editable by canEdit) ─────────────────────────────────
  const [diagData,     setDiagData]     = useState<DiagnosisData>(EMPTY_DIAGNOSIS);
  const [diagEditing,  setDiagEditing]  = useState(false);
  const [diagDraft,    setDiagDraft]    = useState<DiagnosisData>(EMPTY_DIAGNOSIS);
  const [diagSaving,   setDiagSaving]   = useState(false);
  const [diagSaved,    setDiagSaved]    = useState(false);

  // ── PT Assessment state (editable by canEdit) ─────────────────────────────
  const [assessment,    setAssessment]   = useState<PTAssessment>(EMPTY_ASSESSMENT);
  const [asmEditing,    setAsmEditing]   = useState(false);
  const [asmDraft,      setAsmDraft]     = useState<PTAssessment>(EMPTY_ASSESSMENT);
  const [asmSaving,     setAsmSaving]    = useState(false);
  const [asmSaved,      setAsmSaved]     = useState(false);

  // ── Local UI state (unchanged) ─────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<string>("diagnosis");
  const [previewDoc,    setPreviewDoc]    = useState<MedicalDoc | null>(null);

  const allSections = [
    { id: "diagnosis",         label: "Diagnosis" },
    { id: "assessment",        label: "PT Assessment",    physioOnly: true },
    { id: "notes",             label: "Treatment Program", physioOnly: true },
    { id: "session-notes",     label: "Session Notes",     physioOnly: true },
    { id: "documents",         label: "Documents" },
    { id: "session-feedback",  label: "Session Feedback", managerOnly: true },
    { id: "session-history",   label: "Session History" },
    { id: "exercises",         label: "Exercises" },
  ];
  // Filter sections by role:
  //   physioOnly  → hidden from patients
  //   managerOnly → only clinic_manager + the patient themselves can see
  const sections = allSections.filter((sec) => {
    if (sec.physioOnly  && role === "patient")        return false;
    if (sec.managerOnly && role === "physiotherapist") return false;
    return true;
  });

  // ── Session notes state ────────────────────────────────────────────────────
  const [sessionNotes,    setSessionNotes]    = useState<SessionNote[]>([]);
  const [snDate,          setSnDate]          = useState(() => new Date().toISOString().slice(0,10));
  const [snTreatment,     setSnTreatment]     = useState(TREATMENT_TYPES[0]);
  const [snNotes,         setSnNotes]         = useState("");
  const [snSaving,        setSnSaving]        = useState(false);
  const [snError,         setSnError]         = useState<string | null>(null);
  const [snSuccess,       setSnSuccess]       = useState(false);

  // ── Treatment Program state (physio/manager only) ─────────────────────────
  const [treatmentEntries, setTreatmentEntries] = useState<TreatmentEntry[]>([]);
  const [tpDate,           setTpDate]           = useState(() => new Date().toISOString().slice(0,10));
  const [tpType,           setTpType]           = useState(TREATMENT_TYPES[0]);
  const [tpNotes,          setTpNotes]          = useState("");
  const [tpSaving,         setTpSaving]         = useState(false);
  const [tpError,          setTpError]          = useState<string | null>(null);
  const [tpSuccess,        setTpSuccess]        = useState(false);
  // Mode: "session" = single session note | "plan" = multi-session treatment plan
  const [tpMode,           setTpMode]           = useState<"session" | "plan">("session");
  const [tpNumSessions,    setTpNumSessions]    = useState(6);
  const [tpGoals,          setTpGoals]          = useState("");

  // ── Session feedback (read-only view from sessionFeedback collection) ──────
  const [sessionFeedbackList, setSessionFeedbackList] = useState<SessionFeedback[]>([]);

  // ── Session history (from appointments collection) ────────────────────────
  const [sessionHistory,     setSessionHistory]     = useState<ApptRecord[]>([]);
  const [updatingStatusId,   setUpdatingStatusId]   = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) return;
    return subscribeToPatientAllAppointments(
      patientId,
      (appts) => setSessionHistory(appts),
      () => {}
    );
  }, [patientId]);

  const handleUpdateStatus = async (
    apptId: string,
    status: "completed" | "cancelled" | "scheduled"
  ) => {
    setUpdatingStatusId(apptId);
    await updateAppointmentStatus(apptId, status);
    setUpdatingStatusId(null);
  };

  useEffect(() => {
    if (!patientId) return;
    const q = query(
      collection(db, "sessionFeedback"),
      where("patientId", "==", patientId),
      orderBy("sessionDate", "desc")
    );
    return onSnapshot(q, (snap) => {
      setSessionFeedbackList(snap.docs.map((d) => ({
        id:            d.id,
        appointmentId: (d.data().appointmentId as string) ?? "",
        patientId:     (d.data().patientId     as string) ?? "",
        physioId:      (d.data().physioId      as string) ?? "",
        sessionDate:   (d.data().sessionDate   as string) ?? "",
        painLevel:     (d.data().painLevel     as number) ?? 0,
        difficulty:    (d.data().difficulty    as string) ?? "",
        energyLevel:   (d.data().energyLevel   as string) ?? "",
        rating:        (d.data().rating        as number) ?? 0,
        comments:      (d.data().comments      as string) ?? "",
        createdAt:     (d.data().createdAt     as Timestamp | null) ?? null,
      })));
    });
  }, [patientId]);

  useEffect(() => {
    if (!patientId) return;
    const q = query(
      collection(db, "patientSessions"),
      where("patientId", "==", patientId),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setSessionNotes(snap.docs.map((d) => ({
        id:            d.id,
        patientId:     (d.data().patientId     as string) ?? "",
        physioId:      (d.data().physioId      as string) ?? "",
        date:          (d.data().date          as string) ?? "",
        treatmentType: (d.data().treatmentType as string) ?? "",
        notes:         (d.data().notes         as string) ?? "",
        createdAt:     (d.data().createdAt     as Timestamp | null) ?? null,
      })));
    });
  }, [patientId]);

  // Subscribe to treatment entries (same collection as session notes)
  useEffect(() => {
    if (!patientId || role === "patient") return;
    const q = query(
      collection(db, "patientSessions"),
      where("patientId", "==", patientId),
      orderBy("createdAt", "desc")
    );
    return onSnapshot(q, (snap) => {
      setTreatmentEntries(snap.docs.map((d) => ({
        id:            d.id,
        patientId:     (d.data().patientId     as string) ?? "",
        physioId:      (d.data().physioId      as string) ?? "",
        date:          (d.data().date          as string) ?? "",
        treatmentType: (d.data().treatmentType as string) ?? "",
        notes:         (d.data().notes         as string) ?? "",
        entryMode:     ((d.data().entryMode    as string) === "plan" ? "plan" : "session") as "session" | "plan",
        numSessions:   (d.data().numSessions   as number | undefined),
        goals:         (d.data().goals         as string | undefined),
        createdAt:     (d.data().createdAt     as Timestamp | null) ?? null,
      })));
    });
  }, [patientId, role]);

  const handleSaveTreatmentEntry = async () => {
    if (!tpNotes.trim() || !patientId) return;
    setTpSaving(true);
    setTpError(null);
    try {
      await addDoc(collection(db, "patientSessions"), {
        patientId,
        physioId:      user?.uid ?? "",
        date:          tpDate,
        treatmentType: tpType,
        notes:         tpNotes.trim(),
        entryMode:     tpMode,
        ...(tpMode === "plan" && {
          numSessions: tpNumSessions,
          goals:       tpGoals.trim(),
        }),
        createdAt:     serverTimestamp(),
      });
      setTpNotes("");
      setTpGoals("");
      setTpSuccess(true);
      setTimeout(() => setTpSuccess(false), 2500);
    } catch {
      setTpError("Failed to save. Please try again.");
    }
    setTpSaving(false);
  };

  const handleSaveSessionNote = async () => {
    if (!snNotes.trim() || !patientId) return;
    setSnSaving(true);
    setSnError(null);
    try {
      await addDoc(collection(db, "patientSessions"), {
        patientId,
        physioId:      user?.uid ?? "",
        date:          snDate,
        treatmentType: snTreatment,
        notes:         snNotes.trim(),
        createdAt:     serverTimestamp(),
      });
      setSnNotes("");
      setSnSuccess(true);
      setTimeout(() => setSnSuccess(false), 2500);
    } catch (e) {
      setSnError("Failed to save. Please try again.");
    }
    setSnSaving(false);
  };

  const physioDisplayName = patient?.seniorEditorName ?? patient?.physioId ? (patient?.seniorEditorName ?? "Assigned Physiotherapist") : "—";

  return (
    <>
      <style>{`
        .ps-title {
          font-family: 'Playfair Display', serif;
          font-size: 30px;
          font-weight: 500;
          color: #1a1a1a;
          letter-spacing: -0.02em;
          margin-bottom: 4px;
        }
        .ps-sub { font-size: 14px; color: #9a9590; margin-bottom: 24px; }

        /* ── DIAGNOSIS ── */
        .ps-diag-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
          margin-bottom: 16px;
        }
        .ps-diag-card {
          background: #fff;
          border: 1px solid #e5e0d8;
          border-radius: 14px;
          padding: 18px 20px;
        }
        .ps-diag-label {
          font-size: 10.5px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #c0bbb4;
          font-weight: 600;
          margin-bottom: 6px;
        }
        .ps-diag-value { font-size: 14px; color: #1a1a1a; line-height: 1.5; }
        .ps-diag-card.full { grid-column: 1 / -1; }
        .ps-diag-card.accent {
          background: linear-gradient(145deg, #f0f7f4, #e6f4ed);
          border-color: #B3DEF0;
        }

        .ps-icd-badge {
          display: inline-block;
          background: #0C3C60;
          color: #86efac;
          font-size: 12px;
          font-weight: 600;
          padding: 3px 10px;
          border-radius: 6px;
          font-family: 'Courier New', monospace;
          letter-spacing: 0.05em;
        }

        .ps-contra-list { list-style: none; }
        .ps-contra-item {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          padding: 6px 0;
          font-size: 13.5px;
          color: #5a5550;
          border-bottom: 1px solid #f0ede8;
        }
        .ps-contra-item:last-child { border-bottom: none; }
        .ps-contra-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: #e07a5f;
          flex-shrink: 0;
          margin-top: 5px;
        }

        /* ── CLINICAL NOTES ── */
        .ps-note-card {
          background: #fff;
          border: 1px solid #e5e0d8;
          border-radius: 16px;
          padding: 20px 22px;
          margin-bottom: 12px;
          position: relative;
        }
        .ps-note-card::before {
          content: '';
          position: absolute;
          left: 0; top: 20px; bottom: 20px;
          width: 3px;
          background: linear-gradient(180deg, #2E8BC0, #5BC0BE);
          border-radius: 3px;
        }
        .ps-note-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
        }
        .ps-note-session {
          font-size: 13px;
          font-weight: 600;
          color: #2E8BC0;
          background: #D6EEF8;
          padding: 2px 10px;
          border-radius: 100px;
        }
        .ps-note-date { font-size: 12px; color: #9a9590; }
        .ps-note-text { font-size: 14px; color: #5a5550; line-height: 1.7; }

        /* ── DOCUMENTS ── */
        .ps-doc-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 12px;
          margin-bottom: 20px;
        }
        .ps-doc-card {
          background: #fff;
          border: 1px solid #e5e0d8;
          border-radius: 14px;
          padding: 18px;
          cursor: pointer;
          transition: all 0.2s;
        }
        .ps-doc-card:hover {
          border-color: #B3DEF0;
          box-shadow: 0 4px 16px rgba(46,139,192,0.1);
          transform: translateY(-2px);
        }
        .ps-doc-icon {
          font-size: 32px;
          margin-bottom: 10px;
          display: block;
        }
        .ps-doc-label {
          font-size: 13px;
          font-weight: 500;
          color: #1a1a1a;
          margin-bottom: 4px;
          line-height: 1.3;
        }
        .ps-doc-meta { font-size: 11px; color: #9a9590; }
        .ps-doc-type-badge {
          font-size: 10px;
          font-weight: 600;
          padding: 2px 7px;
          border-radius: 4px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          display: inline-block;
          margin-bottom: 8px;
        }

        .ps-upload-zone {
          border: 2px dashed #e5e0d8;
          border-radius: 14px;
          padding: 28px;
          text-align: center;
          cursor: pointer;
          transition: all 0.2s;
          background: #fafaf8;
        }
        .ps-upload-zone:hover {
          border-color: #5BC0BE;
          background: #f0f7f4;
        }
        /* Read-only state: keep zone visible but non-interactive */
        .ps-upload-zone.ps-disabled {
          opacity: 0.45;
          cursor: not-allowed;
          pointer-events: none;
        }
        .ps-upload-icon { font-size: 28px; margin-bottom: 8px; }
        .ps-upload-text { font-size: 14px; color: #5a5550; margin-bottom: 4px; }
        .ps-upload-sub { font-size: 12px; color: #c0bbb4; }

        /* Modal */
        .ps-doc-modal {
          position: fixed; inset: 0;
          background: rgba(0,0,0,0.5);
          display: flex; align-items: center; justify-content: center;
          z-index: 200;
          backdrop-filter: blur(4px);
        }
        .ps-doc-modal-inner {
          background: #fff;
          border-radius: 20px;
          padding: 28px;
          width: min(460px, 90vw);
          box-shadow: 0 24px 80px rgba(0,0,0,0.2);
          animation: modalIn 0.2s ease;
        }
        @keyframes modalIn { from { opacity:0; transform:scale(0.95); } to { opacity:1; transform:scale(1); } }
        .ps-doc-preview-box {
          aspect-ratio: 16/9;
          border-radius: 12px;
          background: linear-gradient(145deg, #0C3C60, #2E8BC0);
          display: flex; align-items: center; justify-content: center;
          font-size: 60px;
          margin-bottom: 18px;
        }
        .ps-doc-modal-name { font-family: 'Playfair Display', serif; font-size: 20px; margin-bottom: 6px; }
        .ps-doc-modal-meta { font-size: 13px; color: #9a9590; margin-bottom: 20px; }
        .ps-doc-modal-actions { display: flex; gap: 10px; }
        .ps-doc-dl {
          flex: 1; padding: 11px; border-radius: 10px;
          background: #2E8BC0; border: none; color: #fff;
          font-size: 14px; font-weight: 500; cursor: pointer;
          font-family: 'Outfit', sans-serif;
          transition: background 0.15s;
        }
        .ps-doc-dl:hover:not(:disabled) { background: #0C3C60; }
        .ps-doc-dl:disabled { background: #c0bbb4; cursor: not-allowed; opacity: 0.6; }
        .ps-doc-close {
          padding: 11px 20px; border-radius: 10px;
          border: 1px solid #e5e0d8; background: #fff;
          font-size: 14px; cursor: pointer;
          font-family: 'Outfit', sans-serif;
          transition: background 0.15s;
        }
        .ps-doc-close:hover { background: #f5f3ef; }

        /* ── PROGRESS ── */
        .ps-progress-cards { display: flex; flex-direction: column; gap: 14px; }
        .ps-progress-card {
          background: #fff;
          border: 1px solid #e5e0d8;
          border-radius: 16px;
          padding: 20px 22px;
        }
        .ps-progress-top {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 14px;
        }
        .ps-progress-icon {
          font-size: 26px;
          width: 44px; height: 44px;
          display: flex; align-items: center; justify-content: center;
          background: #f5f3ef;
          border-radius: 10px;
          flex-shrink: 0;
        }
        .ps-progress-info { flex: 1; }
        .ps-progress-metric { font-size: 15px; font-weight: 600; color: #1a1a1a; }
        .ps-progress-vals {
          display: flex;
          gap: 16px;
          font-size: 13px;
        }
        .ps-progress-current { color: #2E8BC0; font-weight: 700; font-size: 22px; font-family: 'Playfair Display', serif; }
        .ps-progress-current-unit { font-size: 13px; color: #9a9590; font-family: 'Outfit', sans-serif; font-weight: 400; }
        .ps-progress-target { font-size: 12px; color: #9a9590; }

        .ps-big-bar-track {
          height: 8px;
          border-radius: 8px;
          background: #f0ede8;
          overflow: visible;
          position: relative;
        }
        .ps-big-bar-fill {
          height: 100%;
          border-radius: 8px;
          background: linear-gradient(90deg, #2E8BC0, #5BC0BE);
          position: relative;
        }
        .ps-big-bar-target {
          position: absolute;
          top: -4px;
          width: 2px;
          height: 16px;
          background: #e07a5f;
          border-radius: 2px;
        }
        .ps-bar-legend {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #c0bbb4;
          margin-top: 6px;
        }
        .ps-bar-legend-target { color: #e07a5f; }

        /* ── PERMISSION UI — new additions only, no existing class touched ── */

        .ps-readonly-banner {
          display: flex; align-items: center; gap: 8px;
          background: #fafaf8; border: 1px solid #e5e0d8; border-radius: 10px;
          padding: 10px 14px; margin-bottom: 20px;
          font-size: 13px; color: #9a9590;
          font-family: 'Outfit', sans-serif;
        }

        .ps-senior-panel {
          display: flex; align-items: center; flex-wrap: wrap; gap: 10px;
          background: #f0f7f4; border: 1px solid #B3DEF0; border-radius: 12px;
          padding: 12px 16px; margin-bottom: 20px;
          font-family: 'Outfit', sans-serif;
        }
        .ps-senior-label {
          display: flex; align-items: center; gap: 6px;
          font-size: 12px; font-weight: 600; color: #2E8BC0;
          text-transform: uppercase; letter-spacing: 0.08em;
          white-space: nowrap;
        }
        .ps-senior-row {
          display: flex; align-items: center; gap: 8px; flex: 1; min-width: 200px;
        }
        .ps-senior-select {
          font-family: 'Outfit', sans-serif;
          flex: 1; padding: 7px 28px 7px 12px; border-radius: 8px;
          border: 1.5px solid #B3DEF0; background: #fff;
          font-size: 13.5px; color: #1a1a1a; outline: none;
          cursor: pointer; transition: border-color 0.15s;
          appearance: none; -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%232d6a4f' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 10px center;
        }
        .ps-senior-select:focus { border-color: #2E8BC0; box-shadow: 0 0 0 3px rgba(46,139,192,0.1); }
        .ps-senior-select:disabled { opacity: 0.6; cursor: not-allowed; }
        .ps-senior-spinner {
          width: 14px; height: 14px; flex-shrink: 0;
          border: 2px solid #B3DEF0; border-top-color: #2E8BC0;
          border-radius: 50%; animation: psSpin 0.7s linear infinite;
        }
        @keyframes psSpin { to { transform: rotate(360deg); } }
        .ps-senior-saved {
          display: flex; align-items: center; gap: 4px;
          font-size: 12px; font-weight: 600; color: #2E8BC0; white-space: nowrap;
        }
        .ps-senior-current {
          font-size: 12px; color: #5BC0BE; width: 100%;
        }
        .ps-senior-error {
          font-size: 12px; color: #b91c1c; width: 100%;
        }

        /* ── PATIENT PROFILE HEADER ── */
        .ps-patient-header {
          display: flex;
          align-items: center;
          gap: 20px;
          background: #2E8BC0;
          border-radius: 18px;
          padding: 22px 24px;
          margin-bottom: 24px;
          position: relative;
          overflow: hidden;
        }
        .ps-patient-header::before {
          content: '';
          position: absolute;
          top: -30px; right: -30px;
          width: 120px; height: 120px;
          border-radius: 50%;
          background: rgba(255,255,255,0.06);
        }
        .ps-patient-avatar {
          width: 56px; height: 56px; flex-shrink: 0;
          border-radius: 50%;
          background: rgba(255,255,255,0.18);
          border: 2px solid rgba(255,255,255,0.3);
          display: flex; align-items: center; justify-content: center;
          font-size: 22px; font-weight: 700; color: #fff;
          font-family: 'Outfit', sans-serif;
        }
        .ps-patient-info { flex: 1; min-width: 0; }
        .ps-patient-name {
          font-family: 'Playfair Display', serif;
          font-size: 22px; font-weight: 500; color: #fff;
          margin-bottom: 3px; line-height: 1.2;
        }
        .ps-patient-condition {
          font-size: 13px; color: rgba(255,255,255,0.8); margin-bottom: 6px;
        }
        .ps-patient-physio {
          font-size: 12px; color: rgba(255,255,255,0.6);
          display: flex; align-items: center; gap: 5px;
        }

        /* ── SECTION DROPDOWN ── */
        .ps-section-dropdown-wrap {
          margin-bottom: 28px;
        }
        .ps-section-select {
          font-family: 'Outfit', sans-serif;
          font-size: 14px; font-weight: 500;
          padding: 11px 40px 11px 16px;
          border-radius: 12px;
          border: 1.5px solid #e5e0d8;
          background: #fff;
          color: #1a1a1a;
          cursor: pointer;
          outline: none;
          transition: border-color 0.15s;
          appearance: none; -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%232E8BC0' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat;
          background-position: right 14px center;
          min-width: 220px;
        }
        .ps-section-select:focus { border-color: #2E8BC0; box-shadow: 0 0 0 3px rgba(46,139,192,0.1); }

        /* ── SESSION NOTES ── */
        .ps-sn-form {
          background: #fff;
          border: 1.5px solid #e5e0d8;
          border-radius: 16px;
          padding: 22px 24px;
          margin-bottom: 24px;
        }
        .ps-sn-form-title {
          font-size: 15px; font-weight: 600; color: #1a1a1a;
          margin-bottom: 16px;
        }
        .ps-sn-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 14px;
          margin-bottom: 14px;
        }
        .ps-sn-field { display: flex; flex-direction: column; gap: 5px; }
        .ps-sn-label {
          font-size: 11.5px; font-weight: 600; color: #9a9590;
          text-transform: uppercase; letter-spacing: 0.08em;
        }
        .ps-sn-input, .ps-sn-select {
          font-family: 'Outfit', sans-serif;
          font-size: 14px; color: #1a1a1a;
          padding: 9px 12px; border-radius: 9px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          outline: none; transition: border-color 0.15s;
        }
        .ps-sn-select {
          appearance: none; -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%232E8BC0' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 10px center;
          background-color: #fafaf8; padding-right: 30px;
        }
        .ps-sn-input:focus, .ps-sn-select:focus {
          border-color: #2E8BC0; background: #fff;
          box-shadow: 0 0 0 3px rgba(46,139,192,0.08);
        }
        .ps-sn-textarea {
          font-family: 'Outfit', sans-serif;
          font-size: 14px; color: #1a1a1a; line-height: 1.6;
          width: 100%; padding: 11px 14px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          outline: none; resize: vertical; min-height: 110px;
          transition: border-color 0.15s; margin-bottom: 14px;
        }
        .ps-sn-textarea:focus {
          border-color: #2E8BC0; background: #fff;
          box-shadow: 0 0 0 3px rgba(46,139,192,0.08);
        }
        .ps-sn-save-btn {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 10px 22px; border-radius: 10px;
          border: none; background: #2E8BC0; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px;
          font-weight: 500; cursor: pointer; transition: background 0.15s;
        }
        .ps-sn-save-btn:hover:not(:disabled) { background: #0C3C60; }
        .ps-sn-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .ps-sn-success {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 13px; font-weight: 600; color: #2E8BC0; margin-left: 12px;
        }
        .ps-sn-error {
          font-size: 13px; color: #b91c1c; margin-top: 8px;
        }

        /* Session history list */
        .ps-sn-history-title {
          font-size: 13px; font-weight: 600; color: #9a9590;
          text-transform: uppercase; letter-spacing: 0.08em;
          margin-bottom: 12px;
        }
        .ps-sn-card {
          background: #fff; border: 1.5px solid #e5e0d8;
          border-radius: 14px; padding: 16px 18px;
          margin-bottom: 10px; position: relative;
        }
        .ps-sn-card::before {
          content: '';
          position: absolute; left: 0; top: 16px; bottom: 16px;
          width: 3px;
          background: linear-gradient(180deg, #2E8BC0, #5BC0BE);
          border-radius: 3px;
        }
        .ps-sn-card-header {
          display: flex; align-items: center; gap: 10px; margin-bottom: 8px;
        }
        .ps-sn-card-type {
          font-size: 12.5px; font-weight: 600; color: #2E8BC0;
          background: #D6EEF8; padding: 2px 10px; border-radius: 100px;
        }
        .ps-sn-card-date { font-size: 12px; color: #9a9590; margin-left: auto; }
        .ps-sn-card-notes { font-size: 14px; color: #5a5550; line-height: 1.6; }
        .ps-sn-empty {
          text-align: center; padding: 32px;
          font-size: 14px; color: #9a9590;
          background: #fafaf8; border-radius: 14px;
          border: 1.5px dashed #e5e0d8;
        }
        /* ── SESSION HISTORY ── */
        .ps-sh-card {
          background: #fff;
          border: 1.5px solid #e5e0d8;
          border-radius: 14px;
          padding: 16px 18px;
          margin-bottom: 10px;
          display: flex;
          align-items: center;
          gap: 14px;
          transition: border-color 0.15s;
        }
        .ps-sh-card:hover { border-color: #B3DEF0; }
        .ps-sh-date-badge {
          width: 52px; height: 56px; flex-shrink: 0;
          border-radius: 11px;
          background: linear-gradient(145deg, #EAF5FC, #D6EEF8);
          border: 1px solid #B3DEF0;
          display: flex; flex-direction: column;
          align-items: center; justify-content: center;
        }
        .ps-sh-day   { font-size: 20px; font-weight: 700; color: #2E8BC0; font-family: 'Playfair Display', serif; line-height: 1; }
        .ps-sh-month { font-size: 10px; text-transform: uppercase; color: #5BC0BE; letter-spacing: 0.05em; }
        .ps-sh-info  { flex: 1; }
        .ps-sh-type  { font-size: 14px; font-weight: 600; color: #1a1a1a; margin-bottom: 3px; }
        .ps-sh-meta  { font-size: 12.5px; color: #9a9590; }
        .ps-sh-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
        .ps-sh-status {
          font-size: 11.5px; font-weight: 600;
          padding: 3px 10px; border-radius: 100px;
        }
        .ps-sh-status.completed  { background: #d8f3dc; color: #1b4332; }
        .ps-sh-status.cancelled  { background: #fee2e2; color: #991b1b; }
        .ps-sh-status.scheduled  { background: #D6EEF8; color: #0C3C60; }
        .ps-sh-btn-row { display: flex; gap: 5px; }
        .ps-sh-btn {
          font-family: 'Outfit', sans-serif;
          font-size: 11px; font-weight: 600;
          padding: 4px 10px; border-radius: 7px;
          border: 1.5px solid; cursor: pointer;
          transition: all 0.15s;
        }
        .ps-sh-btn.complete { border-color: #b7e4c7; color: #1b4332; background: #f0fdf4; }
        .ps-sh-btn.complete:hover { background: #d8f3dc; }
        .ps-sh-btn.cancel  { border-color: #fca5a5; color: #991b1b; background: #fff5f5; }
        .ps-sh-btn.cancel:hover  { background: #fee2e2; }
        .ps-sh-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        /* ── Editable diagnosis fields ── */
        .ps-edit-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 9px;
          border: 1.5px solid #B3DEF0; background: #EAF5FC;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          color: #2E8BC0; cursor: pointer; transition: all 0.15s;
        }
        .ps-edit-btn:hover { background: #D6EEF8; border-color: #2E8BC0; }
        .ps-save-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 9px; border: none;
          background: #2E8BC0; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          cursor: pointer; transition: background 0.15s;
        }
        .ps-save-btn:hover:not(:disabled) { background: #0C3C60; }
        .ps-save-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .ps-cancel-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 9px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          color: #5a5550; cursor: pointer; transition: all 0.15s;
        }
        .ps-cancel-btn:hover { background: #f5f3ef; }
        .ps-field-input {
          width: 100%; padding: 9px 12px; border-radius: 9px;
          border: 1.5px solid #B3DEF0; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
          outline: none; transition: border-color 0.15s;
        }
        .ps-field-input:focus { border-color: #2E8BC0; box-shadow: 0 0 0 3px rgba(46,139,192,0.08); }
        .ps-field-textarea {
          width: 100%; padding: 9px 12px; border-radius: 9px;
          border: 1.5px solid #B3DEF0; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
          outline: none; resize: vertical; min-height: 80px; line-height: 1.6;
          transition: border-color 0.15s;
        }
        .ps-field-textarea:focus { border-color: #2E8BC0; box-shadow: 0 0 0 3px rgba(46,139,192,0.08); }
        .ps-field-label {
          font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.08em; color: #9a9590; margin-bottom: 5px; display: block;
        }
        .ps-field-group { margin-bottom: 14px; }
        .ps-field-row-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 14px; }
        .ps-edit-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 20px; flex-wrap: wrap; gap: 10px;
        }
        .ps-edit-toolbar-right { display: flex; gap: 8px; align-items: center; }
        .ps-edit-badge {
          font-size: 12px; font-weight: 600; color: #e07a5f;
          background: #fff5f3; padding: 4px 10px; border-radius: 100px;
          border: 1px solid #fca5a5;
        }

        /* ── PT Assessment ── */
        .ps-asm-section-title {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.1em; color: #2E8BC0;
          padding: 14px 0 8px; margin-top: 10px;
          border-top: 1.5px solid #e5e0d8;
        }
        .ps-asm-section-title:first-child { border-top: none; padding-top: 0; }
        .ps-asm-read-card {
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 14px; padding: 20px 22px; margin-bottom: 12px;
        }
        .ps-asm-read-row {
          display: grid; grid-template-columns: 180px 1fr;
          gap: 8px 16px; padding: 9px 0;
          border-bottom: 1px solid #f5f3ef; font-size: 14px;
        }
        .ps-asm-read-row:last-child { border-bottom: none; }
        .ps-asm-key { color: #9a9590; font-weight: 500; font-size: 13px; }
        .ps-asm-val { color: #1a1a1a; white-space: pre-wrap; line-height: 1.5; }
        .ps-asm-empty {
          text-align: center; padding: 44px 24px;
          background: #fafaf8; border-radius: 14px;
          border: 1.5px dashed #e5e0d8;
          font-size: 14px; color: #9a9590;
        }

        /* ── Treatment mode toggle ── */
        .ps-tp-mode-toggle {
          display: flex; gap: 6px; margin-bottom: 16px;
        }
        .ps-tp-mode-btn {
          flex: 1; padding: 9px 12px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          color: #9a9590; cursor: pointer; transition: all 0.15s;
          display: flex; align-items: center; justify-content: center; gap: 6px;
        }
        .ps-tp-mode-btn.active {
          background: #2E8BC0; border-color: #2E8BC0; color: #fff;
        }
        .ps-tp-mode-btn:not(.active):hover {
          border-color: #B3DEF0; color: #2E8BC0; background: #EAF5FC;
        }
        .ps-tp-plan-badge {
          display: inline-block; background: #5BC0BE; color: #fff;
          font-size: 10px; font-weight: 700; padding: 2px 7px;
          border-radius: 100px; letter-spacing: 0.04em;
        }
        .ps-tp-entry-type {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 11px; font-weight: 600; padding: 2px 8px;
          border-radius: 100px; margin-right: 6px;
        }
        .ps-tp-entry-session { background: #D6EEF8; color: #0C3C60; }
        .ps-tp-entry-plan    { background: #d1fae5; color: #065f46; }
      `}</style>

      {/* ── Part 2: Patient profile header ── */}
      {(() => {
        const firstName = patient?.firstName ?? "";
        const lastName  = patient?.lastName  ?? "";
        const initials  = `${firstName[0] ?? ""}${lastName[0] ?? ""}` || "P";
        const fullName  = firstName ? `${firstName} ${lastName}`.trim() : "Patient";
        const condition = patient?.condition ?? "";
        return (
          <div className="ps-patient-header">
            <div className="ps-patient-avatar">{initials}</div>
            <div className="ps-patient-info">
              <div className="ps-patient-name">{fullName}</div>
              {condition && <div className="ps-patient-condition">{condition}</div>}
              <div className="ps-patient-physio">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                Physiotherapist: {physioDisplayName}
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Manager assigns senior physiotherapist ── */}
      {isManager && (
        <SeniorAssignPanel
          patientId={patientId}
          physios={physios}
          seniorEditorId={patient?.seniorEditorId ?? null}
          seniorEditorName={patient?.seniorEditorName ?? null}
        />
      )}

      {/* ── Read-only banner for non-editors ── */}
      {!canEdit && <ReadOnlyBanner role={role} />}

      {/* ── Part 3: Section dropdown (replaces tab pills) ── */}
      <div className="ps-section-dropdown-wrap">
        <select
          className="ps-section-select"
          value={activeSection}
          onChange={(e) => setActiveSection(e.target.value)}
        >
          {sections.map((sec) => (
            <option key={sec.id} value={sec.id}>{sec.label}</option>
          ))}
        </select>
      </div>

      {/* ── DIAGNOSIS (unchanged) ── */}
      {activeSection === "diagnosis" && (
        <>
          {/* Toolbar */}
          <div className="ps-edit-toolbar">
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 500, color: "#1a1a1a" }}>Patient Diagnosis</div>
              <div style={{ fontSize: 13, color: "#9a9590", marginTop: 2 }}>
                {diagEditing ? "Editing mode — make changes and save" : "View mode"}
              </div>
            </div>
            <div className="ps-edit-toolbar-right">
              {diagSaved && !diagEditing && (
                <span className="ps-sn-success">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Saved
                </span>
              )}
              {canEdit && !diagEditing && (
                <button className="ps-edit-btn" onClick={() => { setDiagDraft(diagData); setDiagEditing(true); }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  Edit Diagnosis
                </button>
              )}
              {diagEditing && (
                <>
                  <span className="ps-edit-badge">Editing</span>
                  <button className="ps-cancel-btn" onClick={() => { setDiagEditing(false); setDiagDraft(diagData); }}>Cancel</button>
                  <button className="ps-save-btn" disabled={diagSaving} onClick={handleSaveDiagnosis}>
                    {diagSaving
                      ? <><span className="ps-senior-spinner" /> Saving…</>
                      : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Save Changes</>
                    }
                  </button>
                </>
              )}
            </div>
          </div>

          {/* READ MODE */}
          {!diagEditing && (
            <div className="ps-diag-grid">
              <div className="ps-diag-card accent full">
                <div className="ps-diag-label">Primary Diagnosis</div>
                <div className="ps-diag-value" style={{ fontSize: 16, fontWeight: 600 }}>
                  {diagData.primaryDiagnosis || <span style={{ color: "#c0bbb4", fontStyle: "italic" }}>Not recorded</span>}
                </div>
              </div>
              <div className="ps-diag-card">
                <div className="ps-diag-label">ICD-10 Code</div>
                <div className="ps-diag-value">
                  {diagData.icdCode
                    ? <span className="ps-icd-badge">{diagData.icdCode}</span>
                    : <span style={{ color: "#c0bbb4", fontStyle: "italic" }}>—</span>}
                </div>
              </div>
              <div className="ps-diag-card">
                <div className="ps-diag-label">Onset Date</div>
                <div className="ps-diag-value">{diagData.onsetDate || <span style={{ color: "#c0bbb4", fontStyle: "italic" }}>—</span>}</div>
              </div>
              <div className="ps-diag-card full">
                <div className="ps-diag-label">Mechanism of Injury</div>
                <div className="ps-diag-value">{diagData.mechanism || <span style={{ color: "#c0bbb4", fontStyle: "italic" }}>—</span>}</div>
              </div>
              <div className="ps-diag-card">
                <div className="ps-diag-label">Surgery Date</div>
                <div className="ps-diag-value">{diagData.surgeryDate || <span style={{ color: "#c0bbb4", fontStyle: "italic" }}>—</span>}</div>
              </div>
              <div className="ps-diag-card">
                <div className="ps-diag-label">Surgeon</div>
                <div className="ps-diag-value">{diagData.surgeon || <span style={{ color: "#c0bbb4", fontStyle: "italic" }}>—</span>}</div>
              </div>
              {diagData.contraindications && (
                <div className="ps-diag-card full">
                  <div className="ps-diag-label">Contraindications & Precautions</div>
                  <ul className="ps-contra-list" style={{ marginTop: 4 }}>
                    {diagData.contraindications.split("\n").filter(Boolean).map((c, i) => (
                      <li key={i} className="ps-contra-item">
                        <div className="ps-contra-dot" />{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* EDIT MODE */}
          {diagEditing && (
            <div style={{ background: "#fff", border: "1.5px solid #B3DEF0", borderRadius: 16, padding: 24 }}>
              <div className="ps-field-group">
                <label className="ps-field-label">Primary Diagnosis</label>
                <input className="ps-field-input" value={diagDraft.primaryDiagnosis}
                  onChange={(e) => setDiagDraft({ ...diagDraft, primaryDiagnosis: e.target.value })}
                  placeholder="e.g. Right ACL Rupture — Grade III" />
              </div>
              <div className="ps-field-row-2">
                <div className="ps-field-group" style={{ marginBottom: 0 }}>
                  <label className="ps-field-label">ICD-10 Code</label>
                  <input className="ps-field-input" value={diagDraft.icdCode}
                    onChange={(e) => setDiagDraft({ ...diagDraft, icdCode: e.target.value })}
                    placeholder="e.g. S83.511A" />
                </div>
                <div className="ps-field-group" style={{ marginBottom: 0 }}>
                  <label className="ps-field-label">Onset Date</label>
                  <input className="ps-field-input" value={diagDraft.onsetDate}
                    onChange={(e) => setDiagDraft({ ...diagDraft, onsetDate: e.target.value })}
                    placeholder="e.g. 14 January 2025" />
                </div>
              </div>
              <div className="ps-field-group">
                <label className="ps-field-label">Mechanism of Injury</label>
                <textarea className="ps-field-textarea" value={diagDraft.mechanism}
                  onChange={(e) => setDiagDraft({ ...diagDraft, mechanism: e.target.value })}
                  placeholder="Describe how the injury occurred…" />
              </div>
              <div className="ps-field-row-2">
                <div className="ps-field-group" style={{ marginBottom: 0 }}>
                  <label className="ps-field-label">Surgery Date</label>
                  <input className="ps-field-input" value={diagDraft.surgeryDate}
                    onChange={(e) => setDiagDraft({ ...diagDraft, surgeryDate: e.target.value })}
                    placeholder="e.g. 22 January 2025" />
                </div>
                <div className="ps-field-group" style={{ marginBottom: 0 }}>
                  <label className="ps-field-label">Surgeon</label>
                  <input className="ps-field-input" value={diagDraft.surgeon}
                    onChange={(e) => setDiagDraft({ ...diagDraft, surgeon: e.target.value })}
                    placeholder="e.g. Mr. David Chan, FRCS" />
                </div>
              </div>
              <div className="ps-field-group" style={{ marginBottom: 0 }}>
                <label className="ps-field-label">Contraindications & Precautions (one per line)</label>
                <textarea className="ps-field-textarea" value={diagDraft.contraindications}
                  onChange={(e) => setDiagDraft({ ...diagDraft, contraindications: e.target.value })}
                  placeholder="Avoid full weight-bearing until week 12&#10;No return to sport until cleared&#10;Avoid deep knee flexion beyond 90°" />
              </div>
            </div>
          )}
        </>
      )}

      {/* ── CLINICAL NOTES (unchanged) ── */}
      {activeSection === "notes" && role !== "patient" && (
        <>
          {/* Add entry form — manager + senior only */}
          {canEdit && (
            <div className="ps-sn-form">
              <div className="ps-sn-form-title">Add to Treatment Program</div>

              {/* Mode toggle */}
              <div className="ps-tp-mode-toggle">
                <button
                  className={`ps-tp-mode-btn ${tpMode === "session" ? "active" : ""}`}
                  onClick={() => setTpMode("session")}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
                  </svg>
                  Session Note
                </button>
                <button
                  className={`ps-tp-mode-btn ${tpMode === "plan" ? "active" : ""}`}
                  onClick={() => setTpMode("plan")}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                    <line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                  </svg>
                  Treatment Plan
                  <span className="ps-tp-plan-badge">6 sessions</span>
                </button>
              </div>

              {/* Session Note fields */}
              {tpMode === "session" && (
                <>
                  <div className="ps-sn-row">
                    <div className="ps-sn-field">
                      <label className="ps-sn-label">Session Date</label>
                      <input type="date" className="ps-sn-input"
                        value={tpDate} onChange={(e) => setTpDate(e.target.value)} />
                    </div>
                    <div className="ps-sn-field">
                      <label className="ps-sn-label">Treatment Type</label>
                      <select className="ps-sn-select"
                        value={tpType} onChange={(e) => setTpType(e.target.value)}>
                        {TREATMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                  <textarea className="ps-sn-textarea"
                    placeholder="Describe what was done this session, patient response, progress observed…"
                    value={tpNotes} onChange={(e) => setTpNotes(e.target.value)} />
                </>
              )}

              {/* Treatment Plan fields */}
              {tpMode === "plan" && (
                <>
                  <div className="ps-sn-row">
                    <div className="ps-sn-field">
                      <label className="ps-sn-label">Start Date</label>
                      <input type="date" className="ps-sn-input"
                        value={tpDate} onChange={(e) => setTpDate(e.target.value)} />
                    </div>
                    <div className="ps-sn-field">
                      <label className="ps-sn-label">Number of Sessions</label>
                      <select className="ps-sn-select"
                        value={tpNumSessions}
                        onChange={(e) => setTpNumSessions(Number(e.target.value))}>
                        {[3, 4, 5, 6, 8, 10, 12].map((n) => (
                          <option key={n} value={n}>{n} sessions</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="ps-sn-field" style={{ marginBottom: 14 }}>
                    <label className="ps-sn-label">Treatment Focus / Type</label>
                    <select className="ps-sn-select" style={{ marginBottom: 0 }}
                      value={tpType} onChange={(e) => setTpType(e.target.value)}>
                      {TREATMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="ps-sn-field" style={{ marginBottom: 8 }}>
                    <label className="ps-sn-label">Treatment Goals</label>
                    <textarea className="ps-sn-textarea" style={{ minHeight: 80, marginBottom: 0 }}
                      placeholder="e.g. Restore full ROM, reduce pain to 0/10 at rest, return to sport by week 12…"
                      value={tpGoals} onChange={(e) => setTpGoals(e.target.value)} />
                  </div>
                  <textarea className="ps-sn-textarea"
                    placeholder="Detailed treatment plan — exercises, manual therapy, milestones per session…"
                    value={tpNotes} onChange={(e) => setTpNotes(e.target.value)} />
                </>
              )}

              <div style={{ display: "flex", alignItems: "center" }}>
                <button className="ps-sn-save-btn"
                  disabled={tpSaving || !tpNotes.trim()} onClick={handleSaveTreatmentEntry}>
                  {tpSaving
                    ? <><span className="ps-senior-spinner" /> Saving…</>
                    : tpMode === "session"
                      ? <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Save Session Note</>
                      : <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Save Treatment Plan</>
                  }
                </button>
                {tpSuccess && (
                  <span className="ps-sn-success">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Saved
                  </span>
                )}
              </div>
              {tpError && <div className="ps-sn-error">{tpError}</div>}
            </div>
          )}

          {/* Treatment history */}
          <div className="ps-sn-history-title">Treatment History</div>
          {treatmentEntries.length === 0 ? (
            <div className="ps-sn-empty">No treatment entries recorded yet.</div>
          ) : (
            treatmentEntries.map((entry) => (
              <div key={entry.id} className="ps-sn-card">
                <div className="ps-sn-card-header">
                  <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" as const }}>
                    <span className="ps-sn-card-type">{entry.treatmentType}</span>
                    <span className={`ps-tp-entry-type ${entry.entryMode === "plan" ? "ps-tp-entry-plan" : "ps-tp-entry-session"}`}>
                      {entry.entryMode === "plan"
                        ? `Treatment Plan · ${entry.numSessions ?? 6} sessions`
                        : "Session Note"}
                    </span>
                  </div>
                  <span className="ps-sn-card-date">{entry.date}</span>
                </div>
                {entry.goals && (
                  <div style={{ fontSize: 13, color: "#065f46", background: "#d1fae5", borderRadius: 8, padding: "6px 10px", marginBottom: 8 }}>
                    <strong>Goals:</strong> {entry.goals}
                  </div>
                )}
                <div className="ps-sn-card-notes">{entry.notes}</div>
              </div>
            ))
          )}
        </>
      )}

      {/* ── PT ASSESSMENT ── */}
      {activeSection === "assessment" && role !== "patient" && (
        <>
          <div className="ps-edit-toolbar">
            <div>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 500, color: "#1a1a1a" }}>Physical Therapy Assessment</div>
              <div style={{ fontSize: 13, color: "#9a9590", marginTop: 2 }}>
                {asmEditing ? "Editing mode — complete the assessment form" : "Professional PT assessment record"}
              </div>
            </div>
            <div className="ps-edit-toolbar-right">
              {asmSaved && !asmEditing && (
                <span className="ps-sn-success">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Saved
                </span>
              )}
              {canEdit && !asmEditing && (
                <button className="ps-edit-btn" onClick={() => { setAsmDraft(assessment); setAsmEditing(true); }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                  {assessment.subjectiveComplaints ? "Edit Assessment" : "Create Assessment"}
                </button>
              )}
              {asmEditing && (
                <>
                  <span className="ps-edit-badge">Editing</span>
                  <button className="ps-cancel-btn" onClick={() => { setAsmEditing(false); setAsmDraft(assessment); }}>Cancel</button>
                  <button className="ps-save-btn" disabled={asmSaving} onClick={handleSaveAssessment}>
                    {asmSaving
                      ? <><span className="ps-senior-spinner" /> Saving…</>
                      : <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Save Assessment</>
                    }
                  </button>
                </>
              )}
            </div>
          </div>

          {/* READ MODE */}
          {!asmEditing && !assessment.subjectiveComplaints && (
            <div className="ps-asm-empty">
              No assessment recorded yet.{canEdit ? ' Click "Create Assessment" to begin.' : ""}
            </div>
          )}
          {!asmEditing && assessment.subjectiveComplaints && (() => {
            const sections = [
              {
                title: "Subjective (Patient History)",
                rows: [
                  ["Chief Complaints",      assessment.subjectiveComplaints],
                  ["Pain Location",         assessment.painLocation],
                  ["Pain Score (NRS 0–10)", assessment.painScore],
                  ["Aggravating Factors",   assessment.aggravatingFactors],
                  ["Relieving Factors",     assessment.relievingFactors],
                  ["Medical History",       assessment.medicalHistory],
                  ["Current Medications",   assessment.medications],
                ],
              },
              {
                title: "Objective (Physical Findings)",
                rows: [
                  ["Posture / Observation",  assessment.postureObservation],
                  ["Range of Motion",        assessment.rangeOfMotion],
                  ["Muscle Strength (MMT)",  assessment.muscleStrength],
                  ["Special Tests",          assessment.specialTests],
                  ["Functional Limitations", assessment.functionalLimits],
                ],
              },
              {
                title: "Assessment & Plan",
                rows: [
                  ["Short-Term Goals",    assessment.shortTermGoals],
                  ["Long-Term Goals",     assessment.longTermGoals],
                  ["Treatment Approach",  assessment.treatmentApproach],
                  ["Precautions",         assessment.precautions],
                ],
              },
              {
                title: "Sign Off",
                rows: [
                  ["Assessed By",       assessment.assessorName],
                  ["Assessment Date",   assessment.assessmentDate],
                ],
              },
            ];
            return sections.map((sec) => (
              <div key={sec.title} className="ps-asm-read-card">
                <div className="ps-asm-section-title">{sec.title}</div>
                {sec.rows.filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="ps-asm-read-row">
                    <span className="ps-asm-key">{k}</span>
                    <span className="ps-asm-val">{v}</span>
                  </div>
                ))}
              </div>
            ));
          })()}

          {/* EDIT MODE */}
          {asmEditing && (
            <div style={{ background: "#fff", border: "1.5px solid #B3DEF0", borderRadius: 16, padding: 24 }}>
              {/* Subjective */}
              <div className="ps-asm-section-title">Subjective (Patient History)</div>
              {([
                ["subjectiveComplaints", "Chief Complaints / Reason for Referral", true],
                ["painLocation",         "Pain Location",                           false],
                ["painScore",            "Pain Score (NRS 0–10)",                  false],
                ["aggravatingFactors",   "Aggravating Factors",                     true],
                ["relievingFactors",     "Relieving Factors",                       true],
                ["medicalHistory",       "Relevant Medical History",                true],
                ["medications",          "Current Medications",                     true],
              ] as [keyof PTAssessment, string, boolean][]).map(([field, label, multi]) => (
                <div key={field} className="ps-field-group">
                  <label className="ps-field-label">{label}</label>
                  {multi
                    ? <textarea className="ps-field-textarea" value={asmDraft[field] as string}
                        onChange={(e) => setAsmDraft({ ...asmDraft, [field]: e.target.value })} />
                    : <input className="ps-field-input" value={asmDraft[field] as string}
                        onChange={(e) => setAsmDraft({ ...asmDraft, [field]: e.target.value })} />
                  }
                </div>
              ))}

              {/* Objective */}
              <div className="ps-asm-section-title">Objective (Physical Findings)</div>
              {([
                ["postureObservation", "Posture & Observation",   true],
                ["rangeOfMotion",      "Range of Motion (ROM)",   true],
                ["muscleStrength",     "Muscle Strength (MMT)",   true],
                ["specialTests",       "Special Tests",           true],
                ["functionalLimits",   "Functional Limitations",  true],
              ] as [keyof PTAssessment, string, boolean][]).map(([field, label, multi]) => (
                <div key={field} className="ps-field-group">
                  <label className="ps-field-label">{label}</label>
                  {multi
                    ? <textarea className="ps-field-textarea" value={asmDraft[field] as string}
                        onChange={(e) => setAsmDraft({ ...asmDraft, [field]: e.target.value })} />
                    : <input className="ps-field-input" value={asmDraft[field] as string}
                        onChange={(e) => setAsmDraft({ ...asmDraft, [field]: e.target.value })} />
                  }
                </div>
              ))}

              {/* Assessment & Plan */}
              <div className="ps-asm-section-title">Assessment & Plan</div>
              {([
                ["shortTermGoals",    "Short-Term Goals (0–4 weeks)", true],
                ["longTermGoals",     "Long-Term Goals",              true],
                ["treatmentApproach", "Treatment Approach & Plan",    true],
                ["precautions",       "Precautions",                  true],
              ] as [keyof PTAssessment, string, boolean][]).map(([field, label, multi]) => (
                <div key={field} className="ps-field-group">
                  <label className="ps-field-label">{label}</label>
                  {multi
                    ? <textarea className="ps-field-textarea" value={asmDraft[field] as string}
                        onChange={(e) => setAsmDraft({ ...asmDraft, [field]: e.target.value })} />
                    : <input className="ps-field-input" value={asmDraft[field] as string}
                        onChange={(e) => setAsmDraft({ ...asmDraft, [field]: e.target.value })} />
                  }
                </div>
              ))}

              {/* Sign off */}
              <div className="ps-asm-section-title">Sign Off</div>
              <div className="ps-field-row-2">
                <div className="ps-field-group" style={{ marginBottom: 0 }}>
                  <label className="ps-field-label">Assessed By</label>
                  <input className="ps-field-input" value={asmDraft.assessorName}
                    onChange={(e) => setAsmDraft({ ...asmDraft, assessorName: e.target.value })}
                    placeholder="Physiotherapist name" />
                </div>
                <div className="ps-field-group" style={{ marginBottom: 0 }}>
                  <label className="ps-field-label">Assessment Date</label>
                  <input type="date" className="ps-field-input" value={asmDraft.assessmentDate}
                    onChange={(e) => setAsmDraft({ ...asmDraft, assessmentDate: e.target.value })} />
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── DOCUMENTS — upload zone and download button gated by canEdit ── */}
      {activeSection === "documents" && (
        <>
          <div className="ps-doc-grid">
            {DOCS.map((doc) => {
              const colors = DOC_COLORS[doc.type];
              return (
                <div key={doc.id} className="ps-doc-card" onClick={() => setPreviewDoc(doc)}>
                  <span
                    className="ps-doc-type-badge"
                    style={{ background: colors.bg, color: colors.text }}
                  >{doc.type.toUpperCase()}</span>
                  <span className="ps-doc-icon">{doc.icon}</span>
                  <div className="ps-doc-label">{doc.label}</div>
                  <div className="ps-doc-meta">{doc.date} · {doc.size}</div>
                </div>
              );
            })}
          </div>

          {/* Upload zone: visible always, interactive only for editors */}
          <div className={`ps-upload-zone${canEdit ? "" : " ps-disabled"}`}>
            <div className="ps-upload-icon">📤</div>
            <div className="ps-upload-text">Upload a medical document</div>
            <div className="ps-upload-sub">MRI, X-Ray, reports, referral letters · Max 50MB</div>
          </div>

          {previewDoc && (
            <div className="ps-doc-modal" onClick={() => setPreviewDoc(null)}>
              <div className="ps-doc-modal-inner" onClick={(e) => e.stopPropagation()}>
                <div className="ps-doc-preview-box">{previewDoc.icon}</div>
                <div className="ps-doc-modal-name">{previewDoc.label}</div>
                <div className="ps-doc-modal-meta">{previewDoc.date} · {previewDoc.size} · {previewDoc.type.toUpperCase()}</div>
                <div className="ps-doc-modal-actions">
                  {/* Download is an edit-level action: disabled for read-only users */}
                  <button className="ps-doc-dl" disabled={!canEdit}>⬇ Download</button>
                  <button className="ps-doc-close" onClick={() => setPreviewDoc(null)}>Close</button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* ── EXERCISES (new) ── */}
      {activeSection === "exercises" && (
        <ExerciseProgram
          patientId={patientId}
          viewerUid={user?.uid ?? ""}
          viewerRole={role as "clinic_manager" | "physiotherapist" | "patient"}
          isSenior={
            role === "physiotherapist" &&
            !!patient?.seniorEditorId &&
            (user as PhysioProfile).uid === patient.seniorEditorId
          }
        />
      )}

      {/* ── Part 4: Session Notes ── */}
      {activeSection === "session-notes" && (
        <>
          {/* Form — only visible to editors */}
          {canEdit && (
            <div className="ps-sn-form">
              <div className="ps-sn-form-title">Record Session Notes</div>
              <div className="ps-sn-row">
                <div className="ps-sn-field">
                  <label className="ps-sn-label">Session Date</label>
                  <input
                    type="date"
                    className="ps-sn-input"
                    value={snDate}
                    onChange={(e) => setSnDate(e.target.value)}
                  />
                </div>
                <div className="ps-sn-field">
                  <label className="ps-sn-label">Treatment Type</label>
                  <select
                    className="ps-sn-select"
                    value={snTreatment}
                    onChange={(e) => setSnTreatment(e.target.value)}
                  >
                    {TREATMENT_TYPES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>
              <textarea
                className="ps-sn-textarea"
                placeholder="Describe what was done during the session, patient response, progress observed…"
                value={snNotes}
                onChange={(e) => setSnNotes(e.target.value)}
              />
              <div style={{ display: "flex", alignItems: "center" }}>
                <button
                  className="ps-sn-save-btn"
                  disabled={snSaving || !snNotes.trim()}
                  onClick={handleSaveSessionNote}
                >
                  {snSaving ? (
                    <><span className="ps-senior-spinner" /> Saving…</>
                  ) : (
                    <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Save Note</>
                  )}
                </button>
                {snSuccess && (
                  <span className="ps-sn-success">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Saved
                  </span>
                )}
              </div>
              {snError && <div className="ps-sn-error">{snError}</div>}
            </div>
          )}

          {/* Session history */}
          <div className="ps-sn-history-title">Session History</div>
          {sessionNotes.length === 0 ? (
            <div className="ps-sn-empty">No session notes recorded yet.</div>
          ) : (
            sessionNotes.map((note) => (
              <div key={note.id} className="ps-sn-card">
                <div className="ps-sn-card-header">
                  <span className="ps-sn-card-type">{note.treatmentType}</span>
                  <span className="ps-sn-card-date">{note.date}</span>
                </div>
                <div className="ps-sn-card-notes">{note.notes}</div>
              </div>
            ))
          )}
        </>
      )}

      {/* ── PROGRESS (unchanged) ── */}
      {activeSection === "session-feedback" && (role === "clinic_manager" || role === "patient") && (
        <>
          {/* Read-only banner */}
          <div className="ps-readonly-banner" style={{ marginBottom: 20 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            Session feedback submitted by the patient. This section is read-only.
          </div>

          {sessionFeedbackList.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "44px 24px",
              background: "#fafaf8", borderRadius: 14,
              border: "1.5px dashed #e5e0d8",
              fontSize: 14, color: "#9a9590",
            }}>
              No session feedback submitted yet.
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {sessionFeedbackList.map((fb) => (
                <div key={fb.id} className="ps-note-card">
                  {/* Header row */}
                  <div className="ps-note-header">
                    <span className="ps-note-session">
                      {fb.sessionDate
                        ? new Date(fb.sessionDate + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                        : "—"}
                    </span>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                      {/* Pain level chip */}
                      <span style={{
                        fontSize: 12, fontWeight: 600, padding: "2px 10px",
                        borderRadius: 100, background: "#fef3c7", color: "#92400e",
                      }}>
                        Pain {fb.painLevel}/10
                      </span>
                      {/* Difficulty chip */}
                      {fb.difficulty && (
                        <span style={{
                          fontSize: 12, fontWeight: 600, padding: "2px 10px",
                          borderRadius: 100, background: "#D6EEF8", color: "#0C3C60",
                        }}>
                          {fb.difficulty}
                        </span>
                      )}
                      {/* Energy chip */}
                      {fb.energyLevel && (
                        <span style={{
                          fontSize: 12, fontWeight: 600, padding: "2px 10px",
                          borderRadius: 100, background: "#f0fdf4", color: "#166534",
                        }}>
                          {fb.energyLevel} energy
                        </span>
                      )}
                      {/* Star rating */}
                      {fb.rating > 0 && (
                        <span style={{ fontSize: 13, color: "#fbbf24" }}>
                          {"⭐".repeat(fb.rating)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Comments */}
                  {fb.comments && (
                    <div className="ps-note-text" style={{ marginTop: 8 }}>
                      {fb.comments}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </>
      )}
      {/* ── SESSION HISTORY ── */}
      {activeSection === "session-history" && (
        <>
          <div className="ps-readonly-banner" style={{ marginBottom: 20 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="2"
              strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
            {isManager
              ? "You can mark sessions as completed or cancelled."
              : "Session history is view-only."}
          </div>

          {sessionHistory.length === 0 ? (
            <div style={{
              textAlign: "center", padding: "44px 24px",
              background: "#fafaf8", borderRadius: 14,
              border: "1.5px dashed #e5e0d8",
              fontSize: 14, color: "#9a9590",
            }}>
              No sessions found for this patient.
            </div>
          ) : (
            sessionHistory.map((appt) => {
              const [, m, d] = appt.date.split("-");
              const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
              const dayNum  = parseInt(d, 10);
              const monStr  = MONTHS[parseInt(m, 10) - 1] ?? "";
              const busy    = updatingStatusId === appt.id;
              return (
                <div key={appt.id} className="ps-sh-card">
                  <div className="ps-sh-date-badge">
                    <div className="ps-sh-day">{dayNum}</div>
                    <div className="ps-sh-month">{monStr}</div>
                  </div>
                  <div className="ps-sh-info">
                    <div className="ps-sh-type">{appt.sessionType}</div>
                    <div className="ps-sh-meta">
                      {fmtHour12(appt.hour)}{appt.physioName ? ` · ${appt.physioName}` : ""}
                    </div>
                  </div>
                  <div className="ps-sh-actions">
                    <span className={`ps-sh-status ${appt.status}`}>
                      {appt.status === "completed" ? "✓ Completed"
                        : appt.status === "cancelled" ? "✗ Cancelled"
                        : "Scheduled"}
                    </span>
                    {isManager && appt.status !== "completed" && appt.status !== "cancelled" && (
                      <div className="ps-sh-btn-row">
                        <button
                          className="ps-sh-btn complete"
                          disabled={busy}
                          onClick={() => handleUpdateStatus(appt.id, "completed")}
                        >
                          {busy ? "…" : "✓ Complete"}
                        </button>
                        <button
                          className="ps-sh-btn cancel"
                          disabled={busy}
                          onClick={() => handleUpdateStatus(appt.id, "cancelled")}
                        >
                          {busy ? "…" : "✗ Cancel"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </>
      )}
    </>
  );
}
