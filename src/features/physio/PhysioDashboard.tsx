// FILE: src/features/physio/PhysioDashboard.tsx

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Calendar, Dumbbell, Plus, ChevronDown, ChevronRight, Pencil, LogOut, ArrowLeft, Receipt, BookOpen, Wifi, Stethoscope, Sparkles, UserCog, Menu, X } from "lucide-react";
import { useLang } from "../../contexts/LanguageContext";
import { doc, getDoc, deleteDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../hooks/useAuth";
import PatientsTab      from "./PatientsTab";
import PatientSheetPage from "../patient/PatientSheetPage";
import SchedulePage        from "../schedule/SchedulePage";
import ExerciseLibraryPage from "../exercises/ExerciseLibraryPage";
import {
  subscribeToAppointmentsByDay,
  subscribeToAppointmentsByWeek,
  getWeekStart,
  toDateStr,
  fmtHour12,
  type Appointment,
} from "../../services/appointmentService";
import type { PhysioProfile } from "../../services/authService";
import logo from "../../assets/physio-logo.svg";
import { subscribeToPhysiotherapists, subscribeToPhysioPatients, subscribeToAllPatients, type Physiotherapist, type Patient } from "../../services/patientService";
import { registerSecretary, registerViewer, type RegisterViewerData } from "../../services/authService";
import { subscribeToSecretaries, deleteSecretary, type Secretary } from "../../services/secretaryService";
import { subscribeToViewers, deleteViewer, type Viewer } from "../../services/viewerService";
import { subscribeToPhysicians, deletePhysician, type Physician } from "../../services/physicianService";
import { registerPhysician, type RegisterPhysicianData } from "../../services/authService";
import { subscribeToPartners, registerPartner, deletePartner, type Partner } from "../../services/partnerService";
import AddPhysioModal from "../../components/AddPhysioModal";
import NotificationPanel from "../../components/NotificationPanel";
import { createPortal } from "react-dom";
import ClinicBillingPage from "./ClinicBillingPage";
import TreatmentProtocolsPage from "../protocols/TreatmentProtocolsPage";
import DiagnosisTemplatesPage from "../diagnoses/DiagnosisTemplatesPage";
import OnlineServicesPage from "../rehab/OnlineServicesPage";
import LoyaltyClubPage from "../loyalty/LoyaltyClubPage";
import StaffListPage from "../staff/StaffListPage";
import { runBackgroundScan, subscribeToPackageAlerts } from "../../services/notificationService";


// ─── Tab definitions ──────────────────────────────────────────────────────────

type Tab = "overview" | "patients" | "people" | "schedule" | "exercises" | "billing" | "protocols" | "online-services" | "diagnoses" | "loyalty" | "staff";

interface TabDef {
  id:    Tab;
  label: string;
  icon:  React.ReactNode;
  badge?: number;
}

function IconOverview()  { return <LayoutDashboard size={18} strokeWidth={1.8} color="currentColor" />; }
function IconPatients()  { return <Users size={18} strokeWidth={1.8} color="currentColor" />; }
function IconSchedule()  { return <Calendar size={18} strokeWidth={1.8} color="currentColor" />; }
function IconExercises() { return <Dumbbell size={18} strokeWidth={1.8} color="currentColor" />; }
function IconBilling()   { return <Receipt size={18} strokeWidth={1.8} color="currentColor" />; }
function IconProtocols() { return <BookOpen size={18} strokeWidth={1.8} color="currentColor" />; }
function IconRehab()      { return <Wifi         size={18} strokeWidth={1.8} color="currentColor" />; }
function IconDiagnoses() { return <Stethoscope  size={18} strokeWidth={1.8} color="currentColor" />; }
function IconAdd()       { return <Plus size={14} strokeWidth={2.5} color="currentColor" />; }

// ─── Team tab (manager only) ─────────────────────────────────────────────────

function TeamTab() {
  const [physios,        setPhysios]        = React.useState<Physiotherapist[]>([]);
  const [showAddPhysio,  setShowAddPhysio]  = React.useState(false);
  const [expandedUid,    setExpandedUid]    = React.useState<string | null>(null);
  const [deletingUid,    setDeletingUid]    = React.useState<string | null>(null);
  const [editingPhysio,  setEditingPhysio]  = React.useState<typeof physios[0] | null>(null);
  const [editForm,       setEditForm]       = React.useState<{
    firstName: string; lastName: string; rank: string;
    licenseNumber: string; clinicName: string; phone: string; specializations: string;
  }>({ firstName: "", lastName: "", rank: "junior", licenseNumber: "", clinicName: "", phone: "", specializations: "" });
  const [editSaving,     setEditSaving]     = React.useState(false);
  const [editError,      setEditError]      = React.useState<string | null>(null);
  const [saveSuccess,    setSaveSuccess]    = React.useState<string | null>(null);

  // ── Secretary state ──────────────────────────────────────────────────────
  const [secretaries,       setSecretaries]       = React.useState<Secretary[]>([]);
  const [showAddSecretary,  setShowAddSecretary]  = React.useState(false);
  const [secretaryForm,     setSecretaryForm]     = React.useState({ firstName: "", lastName: "", email: "", password: "", phone: "" });
  const [secretarySaving,   setSecretarySaving]   = React.useState(false);
  const [secretaryError,    setSecretaryError]    = React.useState<string | null>(null);
  const [deletingSecUid,    setDeletingSecUid]    = React.useState<string | null>(null);

  // ── Physician state ───────────────────────────────────────────────────────
  const [physicians,        setPhysicians]        = React.useState<Physician[]>([]);
  const [showAddPhysician,  setShowAddPhysician]  = React.useState(false);
  const [physicianForm,     setPhysicianForm]     = React.useState<RegisterPhysicianData>({ firstName: "", lastName: "", email: "", password: "", phone: "", specialization: "", clinicName: "" });
  const [physicianSaving,   setPhysicianSaving]   = React.useState(false);
  const [physicianError,    setPhysicianError]    = React.useState<string | null>(null);
  const [deletingPhyUid,    setDeletingPhyUid]    = React.useState<string | null>(null);

  // ── Viewer state ──────────────────────────────────────────────────────────
  const [viewers,           setViewers]           = React.useState<Viewer[]>([]);
  const [showAddViewer,     setShowAddViewer]     = React.useState(false);
  const [viewerForm,        setViewerForm]        = React.useState<RegisterViewerData>({ firstName: "", lastName: "", email: "", password: "", phone: "" });
  const [viewerSaving,      setViewerSaving]      = React.useState(false);
  const [viewerError,       setViewerError]       = React.useState<string | null>(null);
  const [deletingViewerUid, setDeletingViewerUid] = React.useState<string | null>(null);

  // ── Partner state ─────────────────────────────────────────────────────────
  const [partners,          setPartners]          = React.useState<Partner[]>([]);
  const [showAddPartner,    setShowAddPartner]    = React.useState(false);
  const [partnerForm,       setPartnerForm]       = React.useState({ name: "", organizationName: "", email: "", password: "", phone: "", sharePercent: "40" });
  const [partnerSaving,     setPartnerSaving]     = React.useState(false);
  const [partnerError,      setPartnerError]      = React.useState<string | null>(null);
  const [deletingPartnerUid, setDeletingPartnerUid] = React.useState<string | null>(null);

  React.useEffect(() => {
    return subscribeToPhysiotherapists(setPhysios, () => {});
  }, []);

  React.useEffect(() => {
    return subscribeToSecretaries(setSecretaries, () => {});
  }, []);

  React.useEffect(() => {
    return subscribeToPhysicians(setPhysicians, () => {});
  }, []);

  React.useEffect(() => {
    return subscribeToViewers(setViewers, () => {});
  }, []);

  React.useEffect(() => {
    return subscribeToPartners(setPartners, () => {});
  }, []);

  const handleAddPhysician = async () => {
    if (!physicianForm.email || !physicianForm.password || !physicianForm.firstName || !physicianForm.lastName) {
      setPhysicianError("First name, last name, email and password are required."); return;
    }
    setPhysicianSaving(true); setPhysicianError(null);
    try {
      await registerPhysician(physicianForm);
      setSaveSuccess(`Dr. ${physicianForm.firstName} ${physicianForm.lastName} added as physician.`);
      setPhysicianForm({ firstName: "", lastName: "", email: "", password: "", phone: "", specialization: "", clinicName: "" });
      setShowAddPhysician(false);
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? "";
      setPhysicianError(
        msg.includes("email-already-in-use")
          ? "This email is already registered."
          : msg || "Failed to add physician."
      );
    }
    setPhysicianSaving(false);
  };

  const handleDeletePhysician = async (uid: string, name: string) => {
    if (!window.confirm(`Remove Dr. ${name}? This will permanently delete their account.`)) return;
    setDeletingPhyUid(uid);
    const { error } = await deletePhysician(uid);
    if (error) alert(error);
    setDeletingPhyUid(null);
  };

  const handleAddPartner = async () => {
    if (!partnerForm.name || !partnerForm.organizationName || !partnerForm.email || !partnerForm.password) {
      setPartnerError("Name, organization, email and password are required."); return;
    }
    setPartnerSaving(true); setPartnerError(null);
    try {
      const pct = parseInt(partnerForm.sharePercent, 10);
      await registerPartner({ ...partnerForm, sharePercent: isNaN(pct) ? 40 : pct });
      setSaveSuccess(`${partnerForm.organizationName} partner account created.`);
      setPartnerForm({ name: "", organizationName: "", email: "", password: "", phone: "", sharePercent: "40" });
      setShowAddPartner(false);
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? "";
      setPartnerError(msg.includes("email-already-in-use") ? "This email is already registered." : msg || "Failed to create partner account.");
    }
    setPartnerSaving(false);
  };

  const handleDeletePartner = async (uid: string, orgName: string) => {
    if (!window.confirm(`Remove ${orgName}? This will permanently delete their account.`)) return;
    setDeletingPartnerUid(uid);
    const { error } = await deletePartner(uid);
    if (error) alert(error);
    setDeletingPartnerUid(null);
  };

  const handleAddViewer = async () => {
    if (!viewerForm.email || !viewerForm.password || !viewerForm.firstName || !viewerForm.lastName) {
      setViewerError("First name, last name, email and password are required."); return;
    }
    setViewerSaving(true); setViewerError(null);
    try {
      await registerViewer(viewerForm);
      setSaveSuccess(`${viewerForm.firstName} ${viewerForm.lastName} added as viewer.`);
      setViewerForm({ firstName: "", lastName: "", email: "", password: "", phone: "" });
      setShowAddViewer(false);
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? "";
      setViewerError(msg.includes("email-already-in-use") ? "This email is already registered." : msg || "Failed to add viewer.");
    }
    setViewerSaving(false);
  };

  const handleDeleteViewer = async (uid: string, name: string) => {
    if (!window.confirm(`Remove ${name}? This will permanently delete their account.`)) return;
    setDeletingViewerUid(uid);
    const { error } = await deleteViewer(uid);
    if (error) alert(error);
    setDeletingViewerUid(null);
  };

  const handleDeletePhysio = async (uid: string, name: string) => {
    if (!window.confirm(`Remove Dr. ${name} from the team? This will permanently delete their account.`)) return;
    setDeletingUid(uid);
    try {
      // 1. Delete Firestore documents
      await deleteDoc(doc(db, "physiotherapists", uid));
      await deleteDoc(doc(db, "users", uid));

      // 2. Delete Firebase Auth account via Cloud Function
      try {
        const { getFunctions, httpsCallable } = await import("firebase/functions");
        const functions = getFunctions(db.app);
        const deleteAuthUser = httpsCallable(functions, "deleteAuthUser");
        await deleteAuthUser({ uid });
      } catch {
        // Auth deletion best-effort — Firestore docs are deleted
      }
    } catch (err: unknown) {
      alert((err as { message?: string }).message ?? "Failed to delete physiotherapist.");
    }
    setDeletingUid(null);
  };

  const handleSavePhysioEdit = async () => {
    if (!editingPhysio) return;
    setEditSaving(true); setEditError(null);
    try {
      const displayName = `Dr. ${editForm.firstName} ${editForm.lastName}`;
      await updateDoc(doc(db, "physiotherapists", editingPhysio.uid), {
        firstName:       editForm.firstName,
        lastName:        editForm.lastName,
        rank:            editForm.rank,
        licenseNumber:   editForm.licenseNumber,
        clinicName:      editForm.clinicName,
        phone:           editForm.phone,
        specializations: editForm.specializations.split(",").map((t) => t.trim()).filter(Boolean),
        updatedAt:       serverTimestamp(),
      });
      await updateDoc(doc(db, "users", editingPhysio.uid), {
        displayName,
        role:      editForm.rank === "manager" ? "clinic_manager" : "physiotherapist",
        updatedAt: serverTimestamp(),
      });
      setEditingPhysio(null);
    } catch (err: unknown) {
      setEditError((err as { message?: string }).message ?? "Failed to save changes.");
    }
    setEditSaving(false);
  };

  const handleAddSecretary = async () => {
    if (!secretaryForm.email || !secretaryForm.password || !secretaryForm.firstName || !secretaryForm.lastName) {
      setSecretaryError("First name, last name, email and password are required."); return;
    }
    setSecretarySaving(true); setSecretaryError(null);
    try {
      await registerSecretary({
        email:     secretaryForm.email,
        password:  secretaryForm.password,
        firstName: secretaryForm.firstName,
        lastName:  secretaryForm.lastName,
        phone:     secretaryForm.phone,
      });
      setSaveSuccess(`${secretaryForm.firstName} ${secretaryForm.lastName} added as secretary.`);
      setSecretaryForm({ firstName: "", lastName: "", email: "", password: "", phone: "" });
      setShowAddSecretary(false);
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? "";
      setSecretaryError(
        msg.includes("email-already-in-use")
          ? "This email is already registered."
          : msg || "Failed to add secretary."
      );
    }
    setSecretarySaving(false);
  };

  const handleDeleteSecretary = async (uid: string, name: string) => {
    if (!window.confirm(`Remove ${name} from secretaries? This will permanently delete their account.`)) return;
    setDeletingSecUid(uid);
    const { error } = await deleteSecretary(uid);
    if (error) alert(error);
    setDeletingSecUid(null);
  };

  return (
    <>
      <style>{`
        .tm-title { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 500; color: #1a1a1a; margin-bottom: 3px; }
        .tm-sub   { font-size: 13px; color: #9a9590; margin-bottom: 16px; }
        .tm-action-row { display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap; }
        .tm-add-btn {
          display: inline-flex; align-items: center; gap: 8px;
          padding: 11px 18px; border-radius: 11px; border: none;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: all 0.15s; min-height: 44px;
        }
        .tm-add-btn.physio { background: #2E8BC0; color: #fff; }
        .tm-add-btn.physio:hover { background: #0C3C60; }
        .tm-add-btn.patient { background: #EAF5FC; color: #2E8BC0; border: 1.5px solid #B3DEF0; }
        .tm-add-btn.patient:hover { background: #D6EEF8; }
        .tm-success { background: #d8f3dc; border: 1px solid #b7e4c7; border-radius: 10px; padding: 12px 16px; font-size: 13.5px; color: #1b4332; margin-bottom: 16px; }
        .tm-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
        .tm-card {
          background: #fff; border: 1.5px solid #e5e0d8; border-radius: 14px;
          overflow: hidden; transition: border-color 0.15s; position: relative;
        }
        .tm-card:hover { border-color: #B3DEF0; }
        .tm-card-header {
          display: flex; align-items: center; gap: 12px;
          padding: 14px 16px; cursor: pointer; position: relative;
        }
        .tm-card-chevron { color: #c0bbb4; transition: transform 0.2s; flex-shrink: 0; }
        .tm-card-chevron.open { transform: rotate(180deg); }
        .tm-card-body {
          border-top: 1px solid #f0ede8; padding: 14px 20px;
          display: grid; grid-template-columns: 1fr 1fr; gap: 10px 20px;
          background: #fafaf8;
          animation: tmSlide 0.18s ease;
        }
        @keyframes tmSlide { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:translateY(0); } }
        .tm-info-row { display: flex; flex-direction: column; gap: 2px; }
        .tm-info-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #c0bbb4; }
        .tm-info-val   { font-size: 13.5px; font-weight: 500; color: #1a1a1a; }
        .tm-del-btn {
          position: absolute; top: 10px; right: 10px;
          width: 26px; height: 26px; border-radius: 50%;
          border: 1.5px solid #e5e0d8; background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #9a9590; transition: all 0.15s; font-size: 11px;
        }
        .tm-del-btn:hover { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }
        .tm-del-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .tm-edit-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 5px 12px; border-radius: 8px;
          border: 1.5px solid #B3DEF0; background: #EAF5FC;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 500;
          color: #2E8BC0; cursor: pointer; transition: all 0.15s;
        }
        .tm-edit-btn:hover { background: #D6EEF8; }
        .tm-avatar {
          width: 46px; height: 46px; border-radius: 50%; flex-shrink: 0;
          background: linear-gradient(135deg, #2E8BC0, #5BC0BE);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; font-weight: 700; color: #fff; letter-spacing: 0.5px;
        }
        .tm-name  { font-size: 15px; font-weight: 600; color: #1a1a1a; margin-bottom: 2px; }
        .tm-spec  { font-size: 12.5px; color: #9a9590; }
        .tm-badge {
          font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 100px;
          background: #D6EEF8; color: #0C3C60; margin-top: 4px; display: inline-block;
        }
        .tm-rank-badge {
          font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 100px;
          display: inline-block; margin-right: 4px; text-transform: uppercase; letter-spacing: 0.05em;
        }
        .tm-rank-senior  { background: #fef3c7; color: #92400e; }
        .tm-rank-junior  { background: #D6EEF8; color: #0C3C60; }
        .tm-rank-trainee { background: #f3f4f6; color: #374151; }
        .tm-rank-manager { background: #ede9fe; color: #5b21b6; }

        /* Modal */
        .tm-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.4);
          display: flex; align-items: center; justify-content: center;
          z-index: 300; backdrop-filter: blur(3px);
        }
        .tm-modal {
          background: #fff; border-radius: 20px; padding: 28px;
          width: min(480px, 94vw); max-height: 90vh; overflow-y: auto;
          box-shadow: 0 24px 80px rgba(0,0,0,0.18);
          animation: tmModalIn 0.22s cubic-bezier(0.16,1,0.3,1) both;
        }
        @keyframes tmModalIn { from { opacity:0; transform:scale(0.95) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
        .tm-modal-title { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 500; color: #1a1a1a; margin-bottom: 4px; }
        .tm-modal-sub   { font-size: 13px; color: #9a9590; margin-bottom: 20px; }
        .tm-field { margin-bottom: 14px; }
        .tm-label { font-size: 11.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #9a9590; margin-bottom: 5px; display: block; }
        .tm-input {
          width: 100%; padding: 10px 13px; border-radius: 9px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a; outline: none;
          transition: border-color 0.15s;
        }
        .tm-input:focus { border-color: #2E8BC0; background: #fff; }
        .tm-field-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .tm-modal-actions { display: flex; gap: 10px; margin-top: 20px; }
        .tm-modal-save {
          flex: 1; padding: 11px; border-radius: 10px; border: none;
          background: #2E8BC0; color: #fff; font-family: 'Outfit', sans-serif;
          font-size: 14px; font-weight: 500; cursor: pointer; transition: background 0.15s;
        }
        .tm-modal-save:hover:not(:disabled) { background: #0C3C60; }
        .tm-modal-save:disabled { opacity: 0.6; cursor: not-allowed; }
        .tm-modal-cancel {
          padding: 11px 20px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; color: #5a5550;
          cursor: pointer; transition: background 0.15s;
        }
        .tm-modal-cancel:hover { background: #f5f3ef; }
        .tm-modal-error { font-size: 13px; color: #b91c1c; margin-top: 10px; }
        .tm-section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: rgba(255,255,255,0.35); font-weight: 700; padding: 0; margin-bottom: 4px; margin-top: 14px; color: #9a9590; }
      `}</style>

      <div className="tm-title">Team</div>
      <div className="tm-sub">Manage your physiotherapy team and secretaries.</div>

      {saveSuccess && <div className="tm-success">✓ {saveSuccess}</div>}

      <div className="tm-action-row">
        <button className="tm-add-btn physio" onClick={() => setShowAddPhysio(true)}>
          <IconAdd /> Add Physiotherapist
        </button>
        <button className="tm-add-btn patient" onClick={() => { setShowAddSecretary(true); setSecretaryError(null); }}>
          <IconAdd /> Add Secretary
        </button>
        <button className="tm-add-btn patient" onClick={() => { setShowAddPhysician(true); setPhysicianError(null); }} style={{ background: "#f0fdf4", color: "#2d7a3a", borderColor: "#b7e4c7" }}>
          <IconAdd /> Add Physician
        </button>
        <button className="tm-add-btn patient" onClick={() => { setShowAddViewer(true); setViewerError(null); }} style={{ background: "#fef3c7", color: "#92400e", borderColor: "#fcd34d" }}>
          <IconAdd /> Add Viewer
        </button>
      </div>

      <div className="tm-section-label" style={{ color: "#9a9590", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 12 }}>
        Physiotherapy Team ({physios.length})
      </div>
      {physios.length === 0 ? (
        <div style={{ textAlign: "center", padding: "32px 0", color: "#9a9590", fontSize: 14 }}>No physiotherapists added yet.</div>
      ) : (
        <div className="tm-grid">
          {physios.map((p) => (
            <div key={p.uid} className="tm-card">
              <div className="tm-card-header"
                onClick={() => setExpandedUid(expandedUid === p.uid ? null : p.uid)}>
                <div className="tm-avatar">{p.firstName[0]}{p.lastName[0]}</div>
                <div style={{ flex: 1 }}>
                  <div className="tm-name">Dr. {p.firstName} {p.lastName}</div>
                  <div className="tm-spec">{p.clinicName || "Physio+ Clinic"}</div>
                  <div style={{ marginTop: 4 }}>
                    <span className={`tm-rank-badge tm-rank-${p.rank ?? "junior"}`}>
                      {(p.rank ?? "junior").charAt(0).toUpperCase() + (p.rank ?? "junior").slice(1)}
                    </span>
                    {p.specializations?.[0] && <span className="tm-badge">{p.specializations[0]}</span>}
                  </div>
                </div>
                <ChevronDown className={`tm-card-chevron ${expandedUid === p.uid ? "open" : ""}`} size={14} strokeWidth={2.5} />
                <button
                  className="tm-del-btn"
                  style={{ position: "static", marginLeft: 4 }}
                  disabled={deletingUid === p.uid}
                  onClick={(e) => { e.stopPropagation(); handleDeletePhysio(p.uid, `${p.firstName} ${p.lastName}`); }}
                  title="Remove physiotherapist"
                >
                  {deletingUid === p.uid ? "…" : "✕"}
                </button>
              </div>
              {expandedUid === p.uid && (
                <div className="tm-card-body">
                  {([
                    ["License No.",      p.licenseNumber || "—"],
                    ["Phone",            p.phone         || "—"],
                    ["Clinic",           p.clinicName    || "—"],
                    ["Specializations",  (p.specializations ?? []).join(", ") || "—"],
                  ] as [string, string][]).map(([label, val]) => (
                    <div key={label} className="tm-info-row">
                      <span className="tm-info-label">{label}</span>
                      <span className="tm-info-val">{val}</span>
                    </div>
                  ))}
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #f0ede8" }}>
                    <button
                      className="tm-edit-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setEditingPhysio(p);
                        setEditForm({
                          firstName:       p.firstName,
                          lastName:        p.lastName,
                          rank:            p.rank ?? "junior",
                          licenseNumber:   p.licenseNumber || "",
                          clinicName:      p.clinicName || "",
                          phone:           p.phone || "",
                          specializations: (p.specializations ?? []).join(", "),
                        });
                        setEditError(null);
                      }}
                    >
                      <Pencil size={11} strokeWidth={2.5} />
                      Edit Info
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── Secretaries section ── */}
      <div className="tm-section-label" style={{ color: "#9a9590", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 12, marginTop: 24 }}>
        Secretaries ({secretaries.length})
      </div>
      {secretaries.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#9a9590", fontSize: 14, marginBottom: 16 }}>No secretaries added yet.</div>
      ) : (
        <div className="tm-grid" style={{ marginBottom: 16 }}>
          {secretaries.map((s) => (
            <div key={s.uid} className="tm-card">
              <div className="tm-card-header" style={{ cursor: "default" }}>
                <div className="tm-avatar" style={{ background: "linear-gradient(135deg, #9b59b6, #8e44ad)" }}>
                  {s.firstName[0]}{s.lastName[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="tm-name">{s.firstName} {s.lastName}</div>
                  <div className="tm-spec">{s.email}</div>
                  <div style={{ marginTop: 4 }}>
                    <span className="tm-badge" style={{ background: "#f3e8ff", color: "#7c3aed" }}>Secretary</span>
                  </div>
                </div>
                <button
                  className="tm-del-btn"
                  style={{ position: "static", marginLeft: 4 }}
                  disabled={deletingSecUid === s.uid}
                  onClick={() => handleDeleteSecretary(s.uid, `${s.firstName} ${s.lastName}`)}
                  title="Remove secretary"
                >
                  {deletingSecUid === s.uid ? "…" : "✕"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Physicians section ── */}
      <div className="tm-section-label" style={{ color: "#9a9590", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 12, marginTop: 24 }}>
        Physicians ({physicians.length})
      </div>
      {physicians.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#9a9590", fontSize: 14, marginBottom: 16 }}>No physicians added yet.</div>
      ) : (
        <div className="tm-grid" style={{ marginBottom: 16 }}>
          {physicians.map((p) => (
            <div key={p.uid} className="tm-card">
              <div className="tm-card-header" style={{ cursor: "default" }}>
                <div className="tm-avatar" style={{ background: "linear-gradient(135deg, #2d7a3a, #52b788)" }}>
                  {p.firstName[0]}{p.lastName[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="tm-name">Dr. {p.firstName} {p.lastName}</div>
                  <div className="tm-spec">{p.email}</div>
                  <div style={{ marginTop: 4 }}>
                    <span className="tm-badge" style={{ background: "#dcfce7", color: "#166534" }}>Physician</span>
                    {p.specialization && <span className="tm-badge" style={{ marginLeft: 4 }}>{p.specialization}</span>}
                  </div>
                </div>
                <button
                  className="tm-del-btn"
                  style={{ position: "static", marginLeft: 4 }}
                  disabled={deletingPhyUid === p.uid}
                  onClick={() => handleDeletePhysician(p.uid, `${p.firstName} ${p.lastName}`)}
                  title="Remove physician"
                >
                  {deletingPhyUid === p.uid ? "…" : "✕"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Viewers section ── */}
      <div className="tm-section-label" style={{ color: "#9a9590", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700, marginBottom: 12, marginTop: 24 }}>
        Viewers ({viewers.length})
      </div>
      {viewers.length === 0 ? (
        <div style={{ textAlign: "center", padding: "24px 0", color: "#9a9590", fontSize: 14, marginBottom: 16 }}>No viewer accounts yet. Viewers can see the daily schedule and patient session balances only.</div>
      ) : (
        <div className="tm-grid" style={{ marginBottom: 16 }}>
          {viewers.map((v) => (
            <div key={v.uid} className="tm-card">
              <div className="tm-card-header" style={{ cursor: "default" }}>
                <div className="tm-avatar" style={{ background: "linear-gradient(135deg, #92400e, #d97706)" }}>
                  {v.firstName[0]}{v.lastName[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div className="tm-name">{v.firstName} {v.lastName}</div>
                  <div className="tm-spec">{v.email}</div>
                  <div style={{ marginTop: 4 }}>
                    <span className="tm-badge" style={{ background: "#fef3c7", color: "#92400e" }}>View only</span>
                  </div>
                </div>
                <button
                  className="tm-del-btn"
                  style={{ position: "static", marginLeft: 4 }}
                  disabled={deletingViewerUid === v.uid}
                  onClick={() => handleDeleteViewer(v.uid, `${v.firstName} ${v.lastName}`)}
                  title="Remove viewer"
                >
                  {deletingViewerUid === v.uid ? "…" : "✕"}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Physio Modal */}
      {showAddPhysio && (
        <AddPhysioModal
          onClose={() => setShowAddPhysio(false)}
          onCreated={(fullName) => {
            setSaveSuccess(`Dr. ${fullName} added successfully.`);
            setTimeout(() => setSaveSuccess(null), 4000);
          }}
        />
      )}

      {/* Add Secretary Modal */}
      {showAddSecretary && createPortal(
        <div className="tm-modal-overlay" onClick={() => !secretarySaving && setShowAddSecretary(false)}>
          <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-title">Add Secretary</div>
            <div className="tm-modal-sub">Create a new secretary account. They will use this email and password to log in.</div>
            <div className="tm-field-row">
              <div className="tm-field"><label className="tm-label">First Name</label><input className="tm-input" value={secretaryForm.firstName} onChange={(e) => setSecretaryForm({ ...secretaryForm, firstName: e.target.value })} placeholder="Sarah" /></div>
              <div className="tm-field"><label className="tm-label">Last Name</label><input className="tm-input" value={secretaryForm.lastName} onChange={(e) => setSecretaryForm({ ...secretaryForm, lastName: e.target.value })} placeholder="Ali" /></div>
            </div>
            <div className="tm-field"><label className="tm-label">Email Address</label><input className="tm-input" type="email" value={secretaryForm.email} onChange={(e) => setSecretaryForm({ ...secretaryForm, email: e.target.value })} placeholder="secretary@clinic.com" /></div>
            <div className="tm-field"><label className="tm-label">Password</label><input className="tm-input" type="password" value={secretaryForm.password} onChange={(e) => setSecretaryForm({ ...secretaryForm, password: e.target.value })} placeholder="Min. 6 characters" /></div>
            <div className="tm-field"><label className="tm-label">Phone (optional)</label><input className="tm-input" value={secretaryForm.phone} onChange={(e) => setSecretaryForm({ ...secretaryForm, phone: e.target.value })} placeholder="+20 100 000 0000" /></div>
            {secretaryError && <div className="tm-modal-error">{secretaryError}</div>}
            <div className="tm-modal-actions">
              <button className="tm-modal-cancel" onClick={() => setShowAddSecretary(false)}>Cancel</button>
              <button className="tm-modal-save" disabled={secretarySaving} onClick={handleAddSecretary}>
                {secretarySaving ? "Creating account…" : "Create Account"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Viewer Modal */}
      {showAddViewer && createPortal(
        <div className="tm-modal-overlay" onClick={() => !viewerSaving && setShowAddViewer(false)}>
          <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-title">Add Viewer</div>
            <div className="tm-modal-sub">Viewer accounts can only see the daily schedule and patient session balances. No other access is granted.</div>
            <div className="tm-field-row">
              <div className="tm-field"><label className="tm-label">First Name</label><input className="tm-input" value={viewerForm.firstName} onChange={(e) => setViewerForm({ ...viewerForm, firstName: e.target.value })} placeholder="Sara" /></div>
              <div className="tm-field"><label className="tm-label">Last Name</label><input className="tm-input" value={viewerForm.lastName} onChange={(e) => setViewerForm({ ...viewerForm, lastName: e.target.value })} placeholder="Ali" /></div>
            </div>
            <div className="tm-field"><label className="tm-label">Email Address</label><input className="tm-input" type="email" value={viewerForm.email} onChange={(e) => setViewerForm({ ...viewerForm, email: e.target.value })} placeholder="viewer@clinic.com" /></div>
            <div className="tm-field"><label className="tm-label">Password</label><input className="tm-input" type="password" value={viewerForm.password} onChange={(e) => setViewerForm({ ...viewerForm, password: e.target.value })} placeholder="Min. 6 characters" /></div>
            <div className="tm-field"><label className="tm-label">Phone (optional)</label><input className="tm-input" value={viewerForm.phone} onChange={(e) => setViewerForm({ ...viewerForm, phone: e.target.value })} placeholder="+20 100 000 0000" /></div>
            {viewerError && <div className="tm-modal-error">{viewerError}</div>}
            <div className="tm-modal-actions">
              <button className="tm-modal-cancel" onClick={() => setShowAddViewer(false)}>Cancel</button>
              <button className="tm-modal-save" disabled={viewerSaving} onClick={handleAddViewer}>
                {viewerSaving ? "Creating account…" : "Create Account"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Add Physician Modal */}
      {showAddPhysician && createPortal(
        <div className="tm-modal-overlay" onClick={() => !physicianSaving && setShowAddPhysician(false)}>
          <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-title">Add Physician</div>
            <div className="tm-modal-sub">Create a physician account. They can log in to view their referred patients.</div>
            <div className="tm-field-row">
              <div className="tm-field"><label className="tm-label">First Name</label><input className="tm-input" value={physicianForm.firstName} onChange={(e) => setPhysicianForm({ ...physicianForm, firstName: e.target.value })} placeholder="Ahmed" /></div>
              <div className="tm-field"><label className="tm-label">Last Name</label><input className="tm-input" value={physicianForm.lastName} onChange={(e) => setPhysicianForm({ ...physicianForm, lastName: e.target.value })} placeholder="Hassan" /></div>
            </div>
            <div className="tm-field"><label className="tm-label">Email Address</label><input className="tm-input" type="email" value={physicianForm.email} onChange={(e) => setPhysicianForm({ ...physicianForm, email: e.target.value })} placeholder="doctor@hospital.com" /></div>
            <div className="tm-field"><label className="tm-label">Password</label><input className="tm-input" type="password" value={physicianForm.password} onChange={(e) => setPhysicianForm({ ...physicianForm, password: e.target.value })} placeholder="Min. 6 characters" /></div>
            <div className="tm-field-row">
              <div className="tm-field"><label className="tm-label">Specialization</label><input className="tm-input" value={physicianForm.specialization} onChange={(e) => setPhysicianForm({ ...physicianForm, specialization: e.target.value })} placeholder="e.g. Orthopaedics" /></div>
              <div className="tm-field"><label className="tm-label">Phone (optional)</label><input className="tm-input" value={physicianForm.phone} onChange={(e) => setPhysicianForm({ ...physicianForm, phone: e.target.value })} placeholder="+20 100 000 0000" /></div>
            </div>
            <div className="tm-field"><label className="tm-label">Clinic / Hospital (optional)</label><input className="tm-input" value={physicianForm.clinicName} onChange={(e) => setPhysicianForm({ ...physicianForm, clinicName: e.target.value })} placeholder="e.g. Cairo Medical Center" /></div>
            {physicianError && <div className="tm-modal-error">{physicianError}</div>}
            <div className="tm-modal-actions">
              <button className="tm-modal-cancel" onClick={() => setShowAddPhysician(false)}>Cancel</button>
              <button className="tm-modal-save" disabled={physicianSaving} onClick={handleAddPhysician}>
                {physicianSaving ? "Creating account…" : "Create Account"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── Partners section ─────────────────────────────────────────────── */}
      <div style={{ marginTop: 28 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a" }}>Referral Partners</div>
            <div style={{ fontSize: 12, color: "#9a9590", marginTop: 2 }}>Gyms or clinics with a revenue-share agreement</div>
          </div>
          <button
            onClick={() => setShowAddPartner(true)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", borderRadius: 9, border: "1.5px solid #2563eb", background: "#eff6ff", color: "#2563eb", fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
          >
            <IconAdd /> Add Partner
          </button>
        </div>

        {partners.length === 0 ? (
          <div style={{ padding: "20px", background: "#fafaf8", borderRadius: 12, border: "1px dashed #e5e0d8", textAlign: "center", color: "#9a9590", fontSize: 13 }}>
            No partner accounts yet.
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {partners.map((p) => (
              <div key={p.uid} style={{ background: "#fff", border: "1px solid #e8e4de", borderRadius: 12, padding: "14px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: "#eff6ff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>🤝</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 14, color: "#1a1a1a" }}>{p.organizationName}</div>
                    <div style={{ fontSize: 12, color: "#6b7280" }}>Contact: {p.name} · {p.email}</div>
                    {p.phone && <div style={{ fontSize: 12, color: "#9a9590" }}>{p.phone}</div>}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 100, padding: "3px 12px", fontSize: 12, fontWeight: 700, color: "#059669" }}>
                    {p.sharePercent}% share
                  </div>
                  <button
                    disabled={deletingPartnerUid === p.uid}
                    onClick={() => handleDeletePartner(p.uid, p.organizationName)}
                    style={{ width: 28, height: 28, borderRadius: 7, border: "none", background: "#fee2e2", color: "#b91c1c", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                  >
                    {deletingPartnerUid === p.uid ? "…" : "✕"}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Partner Modal */}
      {showAddPartner && createPortal(
        <div className="tm-modal-overlay" onClick={() => !partnerSaving && setShowAddPartner(false)}>
          <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-title">Add Referral Partner</div>
            <div className="tm-modal-sub">Create a read-only account for a gym or clinic partner. They can view their referred patients and earnings.</div>
            <div className="tm-field-row">
              <div className="tm-field"><label className="tm-label">Contact Person Name</label><input className="tm-input" value={partnerForm.name} onChange={(e) => setPartnerForm({ ...partnerForm, name: e.target.value })} placeholder="Ahmed Khalil" /></div>
              <div className="tm-field"><label className="tm-label">Organization Name</label><input className="tm-input" value={partnerForm.organizationName} onChange={(e) => setPartnerForm({ ...partnerForm, organizationName: e.target.value })} placeholder="FitZone Gym" /></div>
            </div>
            <div className="tm-field"><label className="tm-label">Email Address</label><input className="tm-input" type="email" value={partnerForm.email} onChange={(e) => setPartnerForm({ ...partnerForm, email: e.target.value })} placeholder="partner@fitzone.com" /></div>
            <div className="tm-field"><label className="tm-label">Password</label><input className="tm-input" type="password" value={partnerForm.password} onChange={(e) => setPartnerForm({ ...partnerForm, password: e.target.value })} placeholder="Min. 6 characters" /></div>
            <div className="tm-field-row">
              <div className="tm-field"><label className="tm-label">Phone (optional)</label><input className="tm-input" value={partnerForm.phone} onChange={(e) => setPartnerForm({ ...partnerForm, phone: e.target.value })} placeholder="+20 100 000 0000" /></div>
              <div className="tm-field">
                <label className="tm-label">Partner's Revenue Share %</label>
                <input className="tm-input" type="number" min="1" max="99" value={partnerForm.sharePercent} onChange={(e) => setPartnerForm({ ...partnerForm, sharePercent: e.target.value })} placeholder="40" />
              </div>
            </div>
            {partnerError && <div className="tm-modal-error">{partnerError}</div>}
            <div className="tm-modal-actions">
              <button className="tm-modal-cancel" onClick={() => setShowAddPartner(false)}>Cancel</button>
              <button className="tm-modal-save" disabled={partnerSaving} onClick={handleAddPartner}>
                {partnerSaving ? "Creating account…" : "Create Account"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* Edit Physio Modal */}
      {editingPhysio && createPortal(
        <div className="tm-modal-overlay" onClick={() => !editSaving && setEditingPhysio(null)}>
          <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-title">Edit Physiotherapist</div>
            <div className="tm-modal-sub">Update Dr. {editingPhysio.firstName} {editingPhysio.lastName}'s information.</div>
            <div className="tm-field-row">
              <div className="tm-field"><label className="tm-label">First Name</label>
                <input className="tm-input" value={editForm.firstName}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} /></div>
              <div className="tm-field"><label className="tm-label">Last Name</label>
                <input className="tm-input" value={editForm.lastName}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} /></div>
            </div>
            <div className="tm-field">
              <label className="tm-label">Rank / Level</label>
              <select className="tm-input" value={editForm.rank}
                onChange={(e) => setEditForm({ ...editForm, rank: e.target.value })}
                style={{ cursor: "pointer" }}>
                <option value="manager">Manager (Full Access)</option>
                <option value="senior">Senior Physiotherapist</option>
                <option value="junior">Junior Physiotherapist</option>
                <option value="trainee">Trainee Physiotherapist</option>
              </select>
            </div>
            <div className="tm-field-row">
              <div className="tm-field"><label className="tm-label">License Number</label>
                <input className="tm-input" value={editForm.licenseNumber}
                  onChange={(e) => setEditForm({ ...editForm, licenseNumber: e.target.value })}
                  placeholder="PT-12345" /></div>
              <div className="tm-field"><label className="tm-label">Phone</label>
                <input className="tm-input" value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="+20 100 000 0000" /></div>
            </div>
            <div className="tm-field"><label className="tm-label">Clinic Name</label>
              <input className="tm-input" value={editForm.clinicName}
                onChange={(e) => setEditForm({ ...editForm, clinicName: e.target.value })}
                placeholder="Physio+ Clinic" /></div>
            <div className="tm-field"><label className="tm-label">Specializations (comma separated)</label>
              <input className="tm-input" value={editForm.specializations}
                onChange={(e) => setEditForm({ ...editForm, specializations: e.target.value })}
                placeholder="Sports Rehab, Orthopaedics" /></div>
            {editError && <div className="tm-modal-error">{editError}</div>}
            <div className="tm-modal-actions">
              <button className="tm-modal-cancel" onClick={() => setEditingPhysio(null)}>Cancel</button>
              <button className="tm-modal-save" disabled={editSaving} onClick={handleSavePhysioEdit}>
                {editSaving ? "Saving…" : "Save Changes"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

    </>
  );
}

// ─── People tab (manager only — combines Patients + Team) ────────────────────

interface PeopleTabProps {
  physioId:      string;
  isManager:     boolean;
  isSenior:      boolean;
  isSecretary:   boolean;
  onViewPatient: (id: string) => void;
}

function PeopleTab({ physioId, isManager, isSenior, isSecretary, onViewPatient }: PeopleTabProps) {
  const [sub, setSub] = React.useState<"patients" | "team">("patients");
  return (
    <>
      <style>{`
        .ppt-toggle {
          display: inline-flex; background: #f0ede8; border-radius: 10px;
          padding: 3px; gap: 3px; margin-bottom: 18px;
        }
        .ppt-pill {
          padding: 7px 20px; border-radius: 8px; border: none;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; color: #9a9590; background: transparent;
        }
        .ppt-pill.active { background: #fff; color: #1a1a1a; box-shadow: 0 1px 4px rgba(0,0,0,0.10); }
      `}</style>
      <div className="ppt-toggle">
        <button className={`ppt-pill${sub === "patients" ? " active" : ""}`} onClick={() => setSub("patients")}>Patients</button>
        <button className={`ppt-pill${sub === "team"     ? " active" : ""}`} onClick={() => setSub("team")}>Team</button>
      </div>
      {sub === "patients" && (
        <PatientsTab
          physioId={physioId}
          isManager={isManager}
          isSenior={isSenior}
          isSecretary={isSecretary}
          onViewPatient={onViewPatient}
        />
      )}
      {sub === "team" && <TeamTab />}
    </>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

// ─── Status display helper ─────────────────────────────────────────────────────
// Maps Firestore appointment status values to human-readable labels and badge colours.

function apptDisplayStatus(status: string): { label: string; color: string; textColor: string } {
  if (status === "in_progress") return { label: "In Progress", color: "#fef3c7", textColor: "#92400e" };
  if (status === "completed")   return { label: "Completed",   color: "#d8f3dc", textColor: "#1b4332" };
  if (status === "cancelled")   return { label: "Cancelled",   color: "#fee2e2", textColor: "#b91c1c" };
  return                               { label: "Upcoming",    color: "#D6EEF8", textColor: "#0C3C60" };
}

interface OverviewTabProps {
  physio:          PhysioProfile;
  isManager:       boolean;
  isSenior?:       boolean;
  isSecretary?:    boolean;
  onViewPatient?:  (patientId: string) => void;
}

function OverviewTab({ physio, isManager, isSenior = false, isSecretary = false, onViewPatient }: OverviewTabProps) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);

  const hour     = now.getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const [patients,        setPatients]        = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);
  const [todayAppts,      setTodayAppts]      = useState<Appointment[]>([]);
  const [apptLoading,     setApptLoading]     = useState(true);
  const [weekAppts,       setWeekAppts]       = useState<Appointment[]>([]);

  useEffect(() => {
    setPatientsLoading(true);
    const unsub = (isManager || isSecretary)
      ? subscribeToAllPatients(
          (data) => { setPatients(data); setPatientsLoading(false); },
          ()     => setPatientsLoading(false)
        )
      : subscribeToPhysioPatients(
          physio.uid,
          (data) => { setPatients(data); setPatientsLoading(false); },
          ()     => setPatientsLoading(false)
        );
    return () => unsub();
  }, [physio.uid, isManager, isSecretary]);

  const isJunior = !isManager && !isSecretary && !isSenior;
  const juniorPatientIdSet = isJunior ? new Set(patients.map((p) => p.uid)) : null;
  const displayedAppts = (isJunior && juniorPatientIdSet && !patientsLoading)
    ? todayAppts.filter((a) => juniorPatientIdSet!.has(a.patientId))
    : todayAppts;

  useEffect(() => {
    setApptLoading(true);
    const today = toDateStr(new Date());
    const unsub = subscribeToAppointmentsByDay(
      today,
      (isManager || isSecretary || isJunior) ? null : physio.uid,
      (data) => { setTodayAppts(data); setApptLoading(false); },
      ()     => setApptLoading(false)
    );
    return () => unsub();
  }, [physio.uid, isManager, isSecretary, isJunior]);

  // Week subscription for "Sessions This Week" KPI
  useEffect(() => {
    const weekStart = getWeekStart(new Date());
    const weekEnd   = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    const unsub = subscribeToAppointmentsByWeek(
      toDateStr(weekStart),
      toDateStr(weekEnd),
      (isManager || isSecretary || isJunior) ? null : physio.uid,
      (data) => setWeekAppts(data)
    );
    return () => unsub();
  }, [physio.uid, isManager, isSecretary, isJunior]);

  const completedCount   = displayedAppts.filter((a) => a.status === "completed").length;
  const inProgressCount  = displayedAppts.filter((a) => a.status === "in_progress").length;
  const upcomingCount    = displayedAppts.filter((a) => !a.status || a.status === "scheduled").length;
  const shimmer = { borderRadius: 12, background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)", backgroundSize: "200% 100%", animation: "phShimmer 1.4s ease infinite" };

  const thisMonth    = now.getMonth();
  const thisYear     = now.getFullYear();
  const newThisMonth = patients.filter((p) => {
    if (!p.createdAt) return false;
    const d = p.createdAt.toDate();
    return d.getMonth() === thisMonth && d.getFullYear() === thisYear;
  }).length;
  const sessionsThisWeek = weekAppts.filter((a) => a.status === "completed").length;

  const totalPatients  = patients.length;
  const activePatients = patients.filter((p) => p.status === "active").length;

  const kpiCards = [
    { label: "Total Patients",      value: patientsLoading ? "…" : totalPatients,      sub: "registered",         color: "#2E8BC0", icon: "👥" },
    { label: "Active",              value: patientsLoading ? "…" : activePatients,      sub: "in rehabilitation",  color: "#16a34a", icon: "✅" },
    { label: "New This Month",      value: patientsLoading ? "…" : newThisMonth,        sub: "patients joined",    color: "#7c3aed", icon: "🆕" },
    { label: "Sessions This Week",  value: sessionsThisWeek,                            sub: "completed sessions", color: "#d97706", icon: "📋" },
  ];

  return (
    <>
      <style>{`
        @keyframes phShimmer { to { background-position: -200% 0; } }
        @keyframes phPulse { 0%,100% { opacity:1; transform:scale(1); } 50% { opacity:.5; transform:scale(1.4); } }

        /* ── Welcome banner ── */
        .ph-banner {
          background: linear-gradient(135deg, #0C3C60 0%, #2E8BC0 100%);
          border-radius: 18px; padding: 22px 24px; margin-bottom: 18px;
          display: flex; align-items: center; justify-content: space-between; gap: 12px;
          flex-wrap: wrap;
        }
        .ph-banner-greeting {
          font-family: 'Playfair Display', serif;
          font-size: 22px; font-weight: 500; color: #fff; margin-bottom: 3px;
        }
        .ph-banner-date { font-size: 12.5px; color: rgba(255,255,255,0.7); }
        .ph-banner-clock {
          font-family: 'Playfair Display', serif;
          font-size: 28px; font-weight: 600; color: #fff;
          letter-spacing: 0.02em; text-align: right;
        }
        .ph-banner-clock-label { font-size: 10px; color: rgba(255,255,255,0.6); text-align: right; text-transform: uppercase; letter-spacing: 0.1em; }

        /* ── KPI grid ── */
        .ph-kpi-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px; margin-bottom: 18px;
        }
        @media (min-width: 640px) { .ph-kpi-grid { grid-template-columns: repeat(4, 1fr); } }
        .ph-kpi {
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 14px; padding: 16px 16px 14px;
          position: relative; overflow: hidden;
        }
        .ph-kpi-icon {
          font-size: 22px; margin-bottom: 8px; display: block;
        }
        .ph-kpi-val {
          font-family: 'Playfair Display', serif;
          font-size: 32px; line-height: 1; font-weight: 500; margin-bottom: 3px;
        }
        .ph-kpi-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #9a9590; }
        .ph-kpi-sub   { font-size: 11px; color: #c0bbb4; margin-top: 1px; }
        .ph-kpi-bar {
          position: absolute; bottom: 0; left: 0; right: 0; height: 3px;
        }

        /* ── Day summary row ── */
        .ph-day-summary {
          display: flex; align-items: center; gap: 16px; flex-wrap: wrap;
          margin-bottom: 12px;
        }
        .ph-day-pill {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 12px; font-weight: 600; padding: 4px 10px;
          border-radius: 100px;
        }
        .ph-day-dot {
          width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
        }
        .ph-day-dot.live { animation: phPulse 1.4s ease infinite; }

        /* ── Section card ── */
        .ph-sec-card {
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 16px; padding: 18px; margin-bottom: 14px;
        }
        .ph-sec-title {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.1em; color: #9a9590; margin-bottom: 14px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .ph-sec-empty {
          text-align: center; padding: 28px 16px;
          color: #c0bbb4; font-size: 13px;
        }

        /* ── Appointment row ── */
        .ph-appt-row {
          display: flex; align-items: center; gap: 12px;
          padding: 12px 14px; border-radius: 12px;
          border: 1px solid #e5e0d8; background: #fafaf8;
          margin-bottom: 8px; flex-wrap: wrap; transition: border-color 0.15s;
        }
        .ph-appt-row:last-child { margin-bottom: 0; }
        .ph-appt-row.inprogress { border-color: #86efac; background: #f0fdf4; }
        .ph-appt-row.completed  { opacity: 0.65; }
        .ph-appt-time {
          min-width: 60px; text-align: center; flex-shrink: 0;
          font-family: 'Playfair Display', serif;
          font-size: 15px; font-weight: 600;
        }
        .ph-appt-info { flex: 1; min-width: 120px; }
        .ph-appt-name { font-size: 14px; font-weight: 600; color: #1a1a1a; }
        .ph-appt-sub  { font-size: 12px; color: #9a9590; margin-top: 1px; }
        .ph-status-chip {
          font-size: 11px; font-weight: 700; padding: 3px 10px;
          border-radius: 100px; white-space: nowrap; flex-shrink: 0;
        }
        .ph-now-badge {
          display: inline-flex; align-items: center; gap: 5px;
          font-size: 10px; font-weight: 700; padding: 2px 8px;
          border-radius: 100px; background: #16a34a; color: #fff;
          text-transform: uppercase; letter-spacing: 0.06em; flex-shrink: 0;
        }
        .ph-view-btn {
          font-size: 12px; font-weight: 600; padding: 4px 11px; border-radius: 100px;
          background: transparent; border: 1.5px solid #2E8BC0; color: #2E8BC0;
          cursor: pointer; white-space: nowrap; flex-shrink: 0; font-family: inherit;
          transition: all 0.13s;
        }
        .ph-view-btn:hover { background: #EAF5FC; }

        /* ── Patient row ── */
        .ph-pat-row {
          display: flex; align-items: center; gap: 11px;
          padding: 10px 12px; border-radius: 12px;
          border: 1px solid #e5e0d8; background: #fafaf8;
          margin-bottom: 7px; flex-wrap: wrap;
        }
        .ph-pat-row:last-child { margin-bottom: 0; }
        .ph-avatar {
          width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700; color: #fff;
        }
        .ph-pat-name  { font-size: 14px; font-weight: 600; color: #1a1a1a; }
        .ph-pat-sub   { font-size: 12px; color: #9a9590; margin-top: 1px; }
      `}</style>

      {/* ── Welcome Banner ── */}
      <div className="ph-banner">
        <div>
          <div className="ph-banner-greeting">
            {greeting}, {isManager ? "Manager" : physio.firstName} 👋
          </div>
          <div className="ph-banner-date">
            {now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </div>
        </div>
        <div>
          <div className="ph-banner-clock">
            {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
          </div>
          <div className="ph-banner-clock-label">Local time</div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="ph-kpi-grid">
        {kpiCards.map((k) => (
          <div key={k.label} className="ph-kpi">
            <span className="ph-kpi-icon">{k.icon}</span>
            <div className="ph-kpi-val" style={{ color: k.value === "…" ? "#c0bbb4" : k.color, fontSize: k.value === "…" ? 22 : undefined }}>
              {k.value}
            </div>
            <div className="ph-kpi-label">{k.label}</div>
            <div className="ph-kpi-sub">{k.sub}</div>
            <div className="ph-kpi-bar" style={{ background: k.color, opacity: 0.25 }} />
          </div>
        ))}
      </div>

      {/* ── Today's Schedule ── */}
      <div className="ph-sec-card">
        <div className="ph-sec-title">
          <span>Today&#39;s Schedule</span>
          {!apptLoading && displayedAppts.length > 0 && (
            <div className="ph-day-summary" style={{ margin: 0 }}>
              {inProgressCount > 0 && (
                <span className="ph-day-pill" style={{ background: "#dcfce7", color: "#16a34a" }}>
                  <span className="ph-day-dot live" style={{ background: "#16a34a" }} />
                  {inProgressCount} Live
                </span>
              )}
              {upcomingCount > 0 && (
                <span className="ph-day-pill" style={{ background: "#EAF5FC", color: "#0C3C60" }}>
                  <span className="ph-day-dot" style={{ background: "#2E8BC0" }} />
                  {upcomingCount} Upcoming
                </span>
              )}
              {completedCount > 0 && (
                <span className="ph-day-pill" style={{ background: "#f3f4f6", color: "#6b7280" }}>
                  <span className="ph-day-dot" style={{ background: "#9ca3af" }} />
                  {completedCount} Done
                </span>
              )}
            </div>
          )}
        </div>

        {apptLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1,2,3].map((n) => <div key={n} style={{ height: 58, ...shimmer }} />)}
          </div>
        ) : displayedAppts.length === 0 ? (
          <div className="ph-sec-empty">
            <div style={{ fontSize: 28, marginBottom: 8 }}>📅</div>
            No appointments scheduled for today
          </div>
        ) : (
          <div>
            {displayedAppts.map((a) => {
              const { label, color, textColor } = apptDisplayStatus(a.status);
              const isLive = a.status === "in_progress";
              const isDone = a.status === "completed";
              return (
                <div key={a.id} className={`ph-appt-row${isLive ? " inprogress" : isDone ? " completed" : ""}`}>
                  <div className="ph-appt-time" style={{ color: isLive ? "#16a34a" : isDone ? "#9ca3af" : "#2E8BC0" }}>
                    {fmtHour12(a.hour)}
                  </div>
                  <div className="ph-appt-info">
                    <div className="ph-appt-name">{a.patientName}</div>
                    <div className="ph-appt-sub">
                      {a.sessionType}{(isManager || isSecretary) && a.physioName ? ` · ${a.physioName}` : ""}
                    </div>
                  </div>
                  {isLive && (
                    <span className="ph-now-badge">
                      <span className="ph-day-dot live" style={{ background: "#fff" }} />
                      NOW
                    </span>
                  )}
                  <span className="ph-status-chip" style={{ background: color, color: textColor }}>{label}</span>
                  {a.patientId && onViewPatient && (
                    <button className="ph-view-btn" onClick={() => onViewPatient(a.patientId)}>
                      View Sheet
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

    </>
  );
}


// ─── Dashboard shell ──────────────────────────────────────────────────────────

export default function PhysioDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { lang, toggleLang, t } = useLang();
  const [activeTab,             setActiveTab]             = useState<Tab>("overview");
  const [viewingPatientId,      setViewingPatientId]      = useState<string | null>(null);
  const [viewingPatientSection, setViewingPatientSection] = useState<string | undefined>(undefined);

  // ── Resolve role flags ───────────────────────────────────────────────────
  const [isManager,   setIsManager]   = useState(() => user?.role === "clinic_manager");
  const [isSenior,    setIsSenior]    = useState(false);
  const [isSecretary, setIsSecretary] = useState(() => user?.role === "secretary");
  const [roleLoading, setRoleLoading] = useState(true);

  useEffect(() => {
    if (!user?.uid) return;
    setRoleLoading(true);
    const isSecretaryRole = user.role === "secretary";

    const userPromise = getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const role = snap.data().role as string | undefined;
        setIsManager(role === "manager" || role === "clinic_manager");
        setIsSecretary(role === "secretary");
      }
    });

    const physioPromise = !isSecretaryRole
      ? getDoc(doc(db, "physiotherapists", user.uid)).then((snap) => {
          if (snap.exists()) {
            const rank = snap.data().rank as string | undefined;
            setIsSenior(rank === "senior" || rank === "manager");
            if (rank === "manager") setIsManager(true);
          }
        })
      : Promise.resolve();

    Promise.all([userPromise, physioPromise]).finally(() => setRoleLoading(false));
  }, [user?.uid, user?.role]);

  // Live package-expiry alerts + daily unpaid-balance scan — manager/secretary only
  useEffect(() => {
    if (!user?.uid || roleLoading) return;
    if (!isManager && !isSecretary) return;
    runBackgroundScan(user.uid);
    const unsubPackages = subscribeToPackageAlerts(user.uid);
    return () => { unsubPackages(); };
  }, [user?.uid, isManager, isSecretary, roleLoading]);

  const physio = user as unknown as PhysioProfile | null;
  if (!physio) return null;

  const TABS: TabDef[] = [
    { id: "overview",  label: t("nav.overview"),       icon: <IconOverview /> },
    ...(isManager
      ? [{ id: "people" as Tab, label: "People", icon: <IconPatients /> }]
      : [{ id: "patients" as Tab, label: t("nav.patients"), icon: <IconPatients /> }]
    ),
    { id: "schedule",  label: t("nav.schedule"),       icon: <IconSchedule /> },
    ...(!isSecretary ? [{ id: "exercises" as Tab, label: t("nav.exercises.lib"), icon: <IconExercises /> }] : []),
    ...(isManager    ? [{ id: "billing"   as Tab, label: "Billing",              icon: <IconBilling /> }]   : []),
    ...(!isSecretary ? [{ id: "protocols" as Tab, label: "Protocols",            icon: <IconProtocols /> }] : []),
    ...(isManager    ? [{ id: "diagnoses" as Tab, label: "Diagnoses",            icon: <IconDiagnoses /> }] : []),
    ...((isManager || isSenior) ? [{ id: "online-services" as Tab, label: "Online Services", icon: <IconRehab /> }] : []),
    ...((isManager || isSecretary) ? [{ id: "loyalty" as Tab, label: "Loyalty Club", icon: <Sparkles size={18} strokeWidth={1.8} color="currentColor" /> }] : []),
    ...((isManager || isSecretary) ? [{ id: "staff" as Tab, label: "Staff", icon: <UserCog size={18} strokeWidth={1.8} color="currentColor" /> }] : []),
  ];

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <>
      <style>{`
        

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Outfit', sans-serif; background: #f5f3ef; }

        .phd-root {
          min-height: 100vh; background: #f5f3ef;
          font-family: 'Outfit', sans-serif;
          display: grid; grid-template-rows: 56px 1fr;
          overflow-x: hidden; max-width: 100vw;
        }

        .phd-topbar {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          padding: 0 16px;
          background: #fff;
          border-bottom: 1px solid #e8e4de;
          position: sticky; top: 0; z-index: 100;
          box-shadow: 0 2px 12px rgba(0,0,0,0.04);
          height: 56px;
        }
        .phd-topbar-left { display: flex; align-items: center; gap: 12px; min-width: 0; }
        .phd-topbar-brand { display: flex; align-items: center; gap: 10px; }
        .phd-topbar-brand-name { font-size: 15px; font-weight: 700; color: #0C3C60; line-height: 1.2; }
        .phd-topbar-brand-sub  { font-size: 11px; font-weight: 500; color: #9a9590; letter-spacing: 0.02em; }
        .phd-topbar-logo { display: none; }
        .phd-topbar-right { display: flex; align-items: center; justify-content: flex-end; gap: 8px; grid-column: 3; min-width: 0; }

        .phd-user-chip {
          display: flex; align-items: center; gap: 9px;
          padding: 6px 12px; border-radius: 100px;
          background: #f5f3ef; border: 1px solid #e5e0d8;
          cursor: pointer; transition: background 0.15s;
        }
        .phd-user-chip:hover { background: #ede9e3; }

        .phd-user-name { font-size: 13px; font-weight: 500; color: #2E8BC0; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .phd-logout-btn {
          padding: 7px 14px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 13px;
          color: #9a9590; cursor: pointer; min-height: 40px;
          transition: all 0.15s; display: flex; align-items: center; gap: 6px;
        }
        .phd-logout-btn:hover { border-color: #fca5a5; color: #b91c1c; background: #fff5f5; }

        /* ── Sign-out confirm dialog ── */
        .phd-signout-overlay {
          position: fixed; inset: 0; z-index: 500;
          background: rgba(0,0,0,0.4); backdrop-filter: blur(3px);
          display: flex; align-items: center; justify-content: center; padding: 20px;
        }
        .phd-signout-dialog {
          background: #fff; border-radius: 18px; padding: 28px 28px 22px;
          width: min(360px, 100%); box-shadow: 0 24px 80px rgba(0,0,0,0.18);
          animation: phdSOIn 0.2s cubic-bezier(0.16,1,0.3,1) both;
          text-align: center;
        }
        @keyframes phdSOIn { from { opacity:0; transform:scale(0.93) translateY(10px); } to { opacity:1; transform:scale(1) translateY(0); } }
        .phd-signout-icon { font-size: 36px; margin-bottom: 12px; }
        .phd-signout-title { font-family: 'Playfair Display', serif; font-size: 20px; font-weight: 500; color: #1a1a1a; margin-bottom: 6px; }
        .phd-signout-sub { font-size: 13.5px; color: #9a9590; margin-bottom: 22px; }
        .phd-signout-btns { display: flex; gap: 10px; }
        .phd-signout-cancel {
          flex: 1; padding: 11px; border-radius: 10px; border: 1.5px solid #e5e0d8;
          background: #fff; font-family: 'Outfit', sans-serif; font-size: 14px;
          color: #5a5550; cursor: pointer; transition: background 0.15s;
        }
        .phd-signout-cancel:hover { background: #f5f3ef; }
        .phd-signout-confirm {
          flex: 1; padding: 11px; border-radius: 10px; border: none;
          background: #b91c1c; color: #fff; font-family: 'Outfit', sans-serif;
          font-size: 14px; font-weight: 600; cursor: pointer; transition: background 0.15s;
        }
        .phd-signout-confirm:hover { background: #991b1b; }

        .phd-body {
          display: grid; grid-template-columns: 240px 1fr;
          min-height: calc(100vh - 56px);
        }
        /* Grid items default to min-width: auto and won't shrink below their
           content's natural width (same bug class fixed on the login page) —
           .phd-main hosts wide tables/grids across the various tabs, so this
           keeps it shrinkable instead of blowing out narrow viewports. */
        .phd-main { min-width: 0; }

        /* Dark sidebar — desktop only */
        .phd-sidebar {
          background: #0C3C60;
          border-right: 1px solid #0a3254;
          padding: 16px 12px;
          display: flex; flex-direction: column; gap: 4px;
          position: sticky; top: 56px;
          height: calc(100vh - 56px); overflow-y: auto;
        }

        /* Profile card inside dark sidebar */
        .phd-profile {
          background: rgba(46,139,192,0.25);
          border: 1px solid rgba(91,192,190,0.2);
          border-radius: 12px; padding: 12px;
          position: relative; overflow: hidden;
          margin-bottom: 4px;
          flex-shrink: 0; /* never let the flex column compress this below its content */
        }
        /* The mobile drawer's close button sits directly above the profile
           card in the DOM (only rendered when the drawer is open) — give the
           card room instead of letting the button overlap its top-right corner. */
        .phd-drawer-close + .phd-profile { margin-top: 36px; }
        .phd-profile::before {
          content: ''; position: absolute; top: -20px; right: -20px;
          width: 70px; height: 70px; border-radius: 50%;
          background: rgba(255,255,255,0.05);
        }
        .phd-p-avatar {
          width: 42px; height: 42px; border-radius: 50%;
          background: rgba(255,255,255,0.15);
          border: 2px solid rgba(255,255,255,0.25);
          display: flex; align-items: center; justify-content: center;
          font-size: 16px; color: #fff; font-weight: 700; margin-bottom: 10px;
          letter-spacing: 0.5px;
        }
        .phd-p-name {
          font-family: 'Playfair Display', serif;
          font-size: 14px; font-weight: 500; color: #fff; margin-bottom: 2px;
        }
        .phd-p-role { font-size: 11px; color: rgba(255,255,255,0.55); margin-bottom: 10px; }
        .phd-p-stat-row {
          display: flex; justify-content: space-between;
          padding: 6px 0; border-top: 1px solid rgba(255,255,255,0.07); font-size: 11.5px;
        }
        .phd-p-stat-row span:first-child { color: rgba(255,255,255,0.45); }
        .phd-p-stat-row span:last-child  { color: rgba(255,255,255,0.85); font-weight: 500; }

        /* Nav — matches patient portal style */
        .phd-nav-section { flex-shrink: 0; }
        .phd-nav-label {
          font-size: 10px; text-transform: uppercase;
          letter-spacing: 0.12em; color: rgba(255,255,255,0.35);
          font-weight: 700; padding: 0 10px; margin-bottom: 4px; margin-top: 10px;
        }
        .phd-nav-item {
          display: flex; align-items: center; gap: 10px;
          padding: 11px 10px; border-radius: 10px; cursor: pointer;
          transition: all 0.14s; margin-bottom: 1px;
          border: 1px solid transparent; color: rgba(255,255,255,0.8);
          user-select: none; position: relative;
        }
        .phd-nav-item:hover { background: rgba(46,139,192,0.5); color: #fff; }
        .phd-nav-item.active { background: #5BC0BE; border-color: #5BC0BE; color: #fff; }
        .phd-nav-icon {
          width: 34px; height: 34px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.08); flex-shrink: 0; transition: background 0.14s;
        }
        .phd-nav-item.active .phd-nav-icon { background: rgba(255,255,255,0.2); }
        .phd-nav-text { flex: 1; font-size: 14px; font-weight: 500; }
        .phd-nav-badge {
          background: #5BC0BE; color: #0C3C60;
          font-size: 10px; font-weight: 800;
          min-width: 18px; height: 18px;
          border-radius: 100px; padding: 0 5px;
          display: flex; align-items: center; justify-content: center;
        }
        .phd-nav-arrow { opacity: 0; transition: opacity 0.15s; color: rgba(255,255,255,0.5); flex-shrink: 0; }
        .phd-nav-item:hover .phd-nav-arrow { opacity: 1; }
        .phd-nav-item.active .phd-nav-arrow { opacity: 0.6; }

        /* Sign-out in sidebar */
        .phd-sidebar-signout {
          margin-top: auto;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.08);
          flex-shrink: 0;
        }
        .phd-sidebar-signout-btn {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 11px 10px; border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.1);
          background: transparent; cursor: pointer;
          font-family: 'Outfit', sans-serif; font-size: 14px;
          font-weight: 500; color: rgba(255,255,255,0.55);
          transition: all 0.15s; text-align: left;
        }
        .phd-sidebar-signout-btn:hover {
          background: rgba(224,122,95,0.15);
          border-color: rgba(224,122,95,0.3);
          color: #fca5a5;
        }

        .phd-main {
          padding: 20px 18px; overflow-y: auto; overflow-x: hidden;
          animation: phdFadeIn 0.25s ease both;
        }
        @keyframes phdFadeIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: none; }
        }

        /* ── HAMBURGER (mobile only) ── */
        .phd-hamburger {
          display: none;
          align-items: center; justify-content: center;
          width: 40px; height: 40px;
          border: 1px solid #e5e0d8; border-radius: 8px;
          background: #f5f3ef; cursor: pointer;
          color: #5a5550; transition: background 0.15s;
          flex-shrink: 0;
        }
        .phd-hamburger:hover { background: #ede9e3; }

        /* ── MOBILE DRAWER OVERLAY ── */
        .phd-overlay {
          display: none;
          position: fixed; inset: 0; z-index: 199;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(2px);
          animation: phdOvIn 0.2s ease both;
        }
        .phd-overlay.open { display: block; }
        @keyframes phdOvIn { from { opacity: 0; } to { opacity: 1; } }

        /* ── Close button inside the drawer (mobile only) ── */
        .phd-drawer-close {
          display: none;
          position: absolute; top: 12px; right: 12px;
          width: 32px; height: 32px; border-radius: 8px;
          align-items: center; justify-content: center;
          background: rgba(255,255,255,0.08); border: none; cursor: pointer;
        }

        /* ── Desktop: sidebar always visible, no hamburger/drawer chrome ── */
        @media (min-width: 769px) {
          .phd-sidebar {
            display: flex !important;
            transform: none !important;
            position: sticky;
          }
          .phd-main { padding: 20px 18px; }
        }

        /* ── Mobile: sidebar becomes a slide-in drawer, opened via hamburger ── */
        @media (max-width: 768px) {
          .phd-body { grid-template-columns: 1fr; }
          .phd-hamburger { display: flex; }
          .phd-logout-btn { padding: 8px; }
          .phd-logout-btn .phd-logout-text { display: none; }
          .lang-toggle { padding: 6px 9px; }
          .lang-toggle-text { display: none; }
          .phd-user-name { max-width: 70px; }
          .phd-user-chip { padding: 5px 10px; }
          .phd-main { padding: 14px 12px; }
          .phd-topbar-brand-name { font-size: 13px; }

          .phd-sidebar {
            display: flex !important;
            position: fixed; top: 0; left: 0;
            width: 280px; max-width: 82vw; height: 100vh;
            z-index: 201;
            transform: translateX(-100%);
            transition: transform 0.25s ease;
            box-shadow: 4px 0 24px rgba(0,0,0,0.18);
            /* Without this, a fixed+transformed element can still widen the
               page's scrollable area on mobile Safari even while visually
               off-screen — contain stops it from affecting anything outside
               its own box. */
            contain: layout style;
          }
          .phd-sidebar.open { transform: translateX(0); }
          .phd-drawer-close { display: flex; }
        }
      `}</style>

      <div className="phd-root">
        {/* Topbar */}
        <header className="phd-topbar">
          {/* Left: hamburger (mobile) + logo + clinic name */}
          <div className="phd-topbar-left">
            <button className="phd-hamburger" onClick={() => setMobileNavOpen(true)} aria-label="Open navigation">
              <Menu size={20} strokeWidth={2} color="currentColor" />
            </button>
            <div className="phd-topbar-brand">
              <img src={logo} alt="Physio+ Hub" style={{ height: 36, width: "auto", objectFit: "contain", display: "block" }} />
              <div className="phd-topbar-brand-name">Physio+ Clinic</div>
            </div>
          </div>

          {/* Right: user chip + notifications + language + sign out */}
          <div className="phd-topbar-right">
            <div className="phd-user-chip">
              <div className="phd-user-name">
                {isManager ? physio.firstName : isSecretary ? physio.firstName : `Dr. ${physio.lastName}`}
              </div>
            </div>
            {(isManager || isSecretary) && (
              <NotificationPanel
                userId={user!.uid}
                onNavigateToPatient={(patientId) => {
                  setViewingPatientId(patientId);
                  setActiveTab(isManager ? "people" : "patients");
                }}
              />
            )}
            <button className="lang-toggle" onClick={toggleLang} title="Switch language">
              🌐 <span className="lang-toggle-text">{lang === "en" ? "العربية" : "English"}</span>
            </button>
            <button className="phd-logout-btn" onClick={() => setShowSignOutConfirm(true)}>
              <LogOut size={13} strokeWidth={2} color="currentColor" />
              <span className="phd-logout-text">{t("common.signOut")}</span>
            </button>
          </div>
        </header>


        {/* Mobile drawer overlay */}
        {mobileNavOpen && <div className="phd-overlay open" onClick={() => setMobileNavOpen(false)} />}

        {/* Body */}
        <div className="phd-body">
          {/* Sidebar (desktop: always visible · mobile: slide-in drawer) */}
          <aside className={`phd-sidebar ${mobileNavOpen ? "open" : ""}`}>
            {mobileNavOpen && (
              <button className="phd-drawer-close" onClick={() => setMobileNavOpen(false)} aria-label="Close navigation">
                <X size={18} strokeWidth={2} color="rgba(255,255,255,0.8)" />
              </button>
            )}
            <div className="phd-profile">
              <div className="phd-p-avatar">
                {physio.firstName[0]}{physio.lastName[0]}
              </div>
              <div className="phd-p-name">
                {isSecretary ? physio.firstName : isManager ? physio.firstName : `Dr. ${physio.firstName}`} {physio.lastName}
              </div>
              <div className="phd-p-role">
                {isSecretary ? "Secretary" : isManager ? "Clinic Manager" : (physio.specializations?.[0] ?? "Physiotherapist")}
              </div>
              {!isSecretary && [
                ["Clinic",  physio.clinicName    || "—"],
                ["License", physio.licenseNumber || "—"],
              ].map(([k, v]) => (
                <div key={k} className="phd-p-stat-row">
                  <span>{k}</span><span>{v}</span>
                </div>
              ))}
            </div>

            <div className="phd-nav-section">
              <div className="phd-nav-label">{t("nav.navigation")}</div>
              {TABS.map((tab) => (
                <div
                  key={tab.id}
                  className={`phd-nav-item ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => { setActiveTab(tab.id); setViewingPatientId(null); setViewingPatientSection(undefined); setMobileNavOpen(false); }}
                >
                  <div className="phd-nav-icon">{tab.icon}</div>
                  <span className="phd-nav-text">{tab.label}</span>
                  {tab.badge ? (
                    <span className="phd-nav-badge">{tab.badge}</span>
                  ) : (
                    <span className="phd-nav-arrow"><ChevronRight size={14} strokeWidth={2} color="white" /></span>
                  )}
                </div>
              ))}
            </div>


            {/* Sign out */}
            <div className="phd-sidebar-signout">
              <button className="phd-sidebar-signout-btn" onClick={handleLogout}>
                <LogOut size={16} strokeWidth={2} color="rgba(255,255,255,0.55)" />
                {t("common.signOut")}
              </button>
            </div>
          </aside>

          {/* Main content */}
          <main className="phd-main" key={viewingPatientId ?? activeTab}>
            {viewingPatientId ? (
              <>
                {/* Back button — only navigation addition, no styling changes */}
                <button
                  onClick={() => setViewingPatientId(null)}
                  style={{
                    display: "inline-flex", alignItems: "center", gap: 7,
                    marginBottom: 20, padding: "7px 14px", borderRadius: 10,
                    border: "1.5px solid #e5e0d8", background: "#fff",
                    fontFamily: "'Outfit', sans-serif", fontSize: 13.5,
                    fontWeight: 500, color: "#5a5550", cursor: "pointer",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#B3DEF0"; (e.currentTarget as HTMLButtonElement).style.color = "#2E8BC0"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "#e5e0d8"; (e.currentTarget as HTMLButtonElement).style.color = "#5a5550"; }}
                >
                  <ArrowLeft size={14} strokeWidth={2} />
                  Back to Patients
                </button>
                <PatientSheetPage
                  patientId={viewingPatientId}
                  initialSection={viewingPatientSection}
                  onBack={() => { setViewingPatientId(null); setViewingPatientSection(undefined); }}
                />
              </>
            ) : (
              <>
                {activeTab === "overview"  && (roleLoading ? null : <OverviewTab physio={physio} isManager={isManager} isSenior={isSenior} isSecretary={isSecretary} onViewPatient={(id) => setViewingPatientId(id)} />)}
                {activeTab === "patients"  && !isManager && (
                  <PatientsTab
                    physioId={physio.uid}
                    isManager={isManager}
                    isSenior={isSenior}
                    isSecretary={isSecretary}
                    onViewPatient={(id) => setViewingPatientId(id)}
                  />
                )}
                {activeTab === "people" && isManager && (
                  <PeopleTab
                    physioId={physio.uid}
                    isManager={isManager}
                    isSenior={isSenior}
                    isSecretary={isSecretary}
                    onViewPatient={(id) => setViewingPatientId(id)}
                  />
                )}
                {activeTab === "schedule"  && (
                  <SchedulePage
                    physioId={physio.uid}
                    firstName={physio.firstName}
                    lastName={physio.lastName}
                    isManager={isManager}
                    isSecretary={isSecretary}
                    canBook={isManager || isSenior || isSecretary}
                    onViewPatient={(id) => { setViewingPatientSection(undefined); setViewingPatientId(id); }}
                    onViewPatientSection={(id, section) => { setViewingPatientSection(section); setViewingPatientId(id); }}
                  />
                )}
                {activeTab === "exercises" && !isSecretary && (
                  <ExerciseLibraryPage
                    physioId={physio.uid}
                    firstName={physio.firstName}
                    lastName={physio.lastName}
                    isManager={isManager}
                    isSenior={isSenior}
                  />
                )}
                {activeTab === "billing"   && isManager   && <ClinicBillingPage />}
                {activeTab === "protocols" && !isSecretary && (
                  <TreatmentProtocolsPage physioId={physio.uid} isManager={isManager} />
                )}
                {activeTab === "diagnoses" && !isSecretary && (
                  <DiagnosisTemplatesPage physioId={physio.uid} isManager={isManager} />
                )}
                {activeTab === "online-services" && (isManager || isSenior) && (
                  <OnlineServicesPage
                    physioId={physio.uid}
                    physioName={`Dr. ${physio.firstName} ${physio.lastName}`}
                    isManager={isManager}
                    isSenior={isSenior}
                  />
                )}
                {activeTab === "loyalty" && (isManager || isSecretary) && <LoyaltyClubPage />}
                {activeTab === "staff"   && (isManager || isSecretary) && <StaffListPage />}
              </>
            )}
          </main>
        </div>
      </div>

      {/* ── Sign-out confirmation ── */}
      {showSignOutConfirm && (
        <div className="phd-signout-overlay" onClick={() => setShowSignOutConfirm(false)}>
          <div className="phd-signout-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="phd-signout-icon">👋</div>
            <div className="phd-signout-title">Sign out?</div>
            <div className="phd-signout-sub">You'll be returned to the login screen.</div>
            <div className="phd-signout-btns">
              <button className="phd-signout-cancel" onClick={() => setShowSignOutConfirm(false)}>Cancel</button>
              <button className="phd-signout-confirm" onClick={handleLogout}>Sign Out</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
