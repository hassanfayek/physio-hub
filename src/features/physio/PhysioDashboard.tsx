// FILE: src/features/physio/PhysioDashboard.tsx

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Calendar, Dumbbell, Plus, ChevronDown, ChevronRight, Pencil, LogOut, ArrowLeft, Receipt, BookOpen, Wifi, Stethoscope } from "lucide-react";
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
  toDateStr,
  fmtHour12,
  type Appointment,
} from "../../services/appointmentService";
import type { PhysioProfile } from "../../services/authService";
import logo from "../../assets/physio-logo.svg";
import { subscribeToPhysiotherapists, subscribeToPhysioPatients, subscribeToAllPatients, type Physiotherapist, type Patient } from "../../services/patientService";
import { registerSecretary } from "../../services/authService";
import { subscribeToSecretaries, deleteSecretary, type Secretary } from "../../services/secretaryService";
import { subscribeToPhysicians, deletePhysician, type Physician } from "../../services/physicianService";
import { registerPhysician, type RegisterPhysicianData } from "../../services/authService";
import AddPhysioModal from "../../components/AddPhysioModal";
import NotificationPanel from "../../components/NotificationPanel";
import { createPortal } from "react-dom";
import ClinicBillingPage from "./ClinicBillingPage";
import TreatmentProtocolsPage from "../protocols/TreatmentProtocolsPage";
import DiagnosisTemplatesPage from "../diagnoses/DiagnosisTemplatesPage";
import OnlineRehabPage from "../rehab/OnlineRehabPage";
import { runBackgroundScan, subscribeToPackageAlerts } from "../../services/notificationService";


// ─── Tab definitions ──────────────────────────────────────────────────────────

type Tab = "overview" | "patients" | "people" | "schedule" | "exercises" | "billing" | "protocols" | "rehab" | "diagnoses";

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

  React.useEffect(() => {
    return subscribeToPhysiotherapists(setPhysios, () => {});
  }, []);

  React.useEffect(() => {
    return subscribeToSecretaries(setSecretaries, () => {});
  }, []);

  React.useEffect(() => {
    return subscribeToPhysicians(setPhysicians, () => {});
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
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const [patients,     setPatients]     = useState<Patient[]>([]);
  const [patientsLoading, setPatientsLoading] = useState(true);

  const [todayAppts,  setTodayAppts]  = useState<Appointment[]>([]);
  const [apptLoading, setApptLoading] = useState(true);

  // Live patient subscription — covers all roles (physioId, seniorEditorId, etc.)
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

  // Derive stats from live patient list
  const stats = {
    totalPatients:      patients.length,
    activePatients:     patients.filter((p) => p.status === "active").length,
    onHoldPatients:     patients.filter((p) => p.status === "on_hold").length,
    dischargedPatients: patients.filter((p) => p.status === "discharged").length,
  };

  useEffect(() => {
    setApptLoading(true);
    const today = toDateStr(new Date());
    // Juniors (non-senior, non-manager, non-secretary) see all clinic appointments
    // because their patients' appointments are booked under other physios' IDs
    const isJunior = !isManager && !isSecretary && !isSenior;
    const unsubscribe = subscribeToAppointmentsByDay(
      today,
      (isManager || isSecretary || isJunior) ? null : physio.uid,
      (data) => { setTodayAppts(data); setApptLoading(false); },
      ()     => setApptLoading(false)
    );
    return () => unsubscribe();
  }, [physio.uid, isManager, isSecretary, isSenior]);

  return (
    <>
      <style>{`
        .ph-ov-header { margin-bottom: 18px; }
        .ph-ov-title {
          font-family: 'Playfair Display', serif;
          font-size: 24px; font-weight: 500;
          color: #1a1a1a; letter-spacing: -0.02em; margin-bottom: 3px;
        }
        .ph-ov-sub { font-size: 13px; color: #9a9590; }
        .ph-ov-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 10px; margin-bottom: 18px;
        }
        @media (min-width: 600px) {
          .ph-ov-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); }
        }
        .ph-ov-stat {
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 14px; padding: 16px;
        }
        .ph-ov-stat.accent { border-top: 3px solid #2E8BC0; }
        .ph-ov-stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #c0bbb4; font-weight: 600; margin-bottom: 6px; }
        .ph-ov-stat-val {
          font-family: 'Playfair Display', serif;
          font-size: 30px; color: #1a1a1a; line-height: 1; margin-bottom: 3px;
        }
        .ph-ov-stat-val.loading { font-size: 24px; color: #c0bbb4; }
        .ph-ov-stat-sub { font-size: 11px; color: #9a9590; }
        .ph-ov-card {
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 14px; padding: 16px; margin-bottom: 12px;
        }
        .ph-ov-card-title { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #c0bbb4; font-weight: 600; margin-bottom: 12px; }
        .ph-ov-empty {
          text-align: center; padding: 24px; color: #c0bbb4;
          font-size: 13px;
        }
        @keyframes phShimmer { to { background-position: -200% 0; } }
      `}</style>

      <div className="ph-ov-header">
        <div className="ph-ov-title">
          {greeting}, {isManager ? "Manager" : physio.firstName} 👋
        </div>

        <div className="ph-ov-sub">
          {new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
        </div>
      </div>

      <div className="ph-ov-grid">
        {[
          { label: "Total Patients",  value: patientsLoading ? "…" : String(stats.totalPatients),      sub: "registered",       accent: true  },
          { label: "Active Patients", value: patientsLoading ? "…" : String(stats.activePatients),     sub: "in rehabilitation", accent: false },
          { label: "On Hold",         value: patientsLoading ? "…" : String(stats.onHoldPatients),     sub: "paused",           accent: false },
          { label: "Discharged",      value: patientsLoading ? "…" : String(stats.dischargedPatients), sub: "completed",        accent: false },
        ].map((s) => (
          <div key={s.label} className={`ph-ov-stat ${s.accent ? "accent" : ""}`}>
            <div className="ph-ov-stat-label">{s.label}</div>
            <div className={`ph-ov-stat-val ${patientsLoading ? "loading" : ""}`}>{s.value}</div>
            <div className="ph-ov-stat-sub">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="ph-ov-card">
        <div className="ph-ov-card-title" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span>Today&#39;s Schedule</span>
          <span style={{ fontSize: 11, color: "#c0bbb4", fontWeight: 400, textTransform: "none", letterSpacing: 0 }}>
            {new Date().toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}
          </span>
        </div>
        {apptLoading ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {[1,2,3].map((n) => (
              <div key={n} style={{ height: 48, borderRadius: 10, background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)", backgroundSize: "200% 100%", animation: "phShimmer 1.4s ease infinite" }} />
            ))}
          </div>
        ) : todayAppts.length === 0 ? (
          <div className="ph-ov-empty">No appointments scheduled for today.</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {todayAppts.map((a) => {
              const { label, color, textColor } = apptDisplayStatus(a.status);
              return (
                <div key={a.id} style={{
                  display: "flex", alignItems: "center", gap: 10,
                  padding: "11px 14px", borderRadius: 10,
                  background: "#f5f3ef", border: "1px solid #e5e0d8",
                  flexWrap: "wrap",
                }}>
                  <div style={{
                    minWidth: 58, textAlign: "center",
                    fontFamily: "'Playfair Display', serif",
                    fontSize: 15, fontWeight: 600, color: "#2E8BC0",
                    flexShrink: 0,
                  }}>
                    {fmtHour12(a.hour)}
                  </div>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{a.patientName}</div>
                    <div style={{ fontSize: 12, color: "#9a9590" }}>
                      {a.sessionType}{(isManager || isSecretary) && a.physioName ? ` · ${a.physioName}` : ""}
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 100,
                    background: color, color: textColor, whiteSpace: "nowrap", flexShrink: 0,
                  }}>
                    {label}
                  </span>
                  {a.patientId && onViewPatient && (
                    <button
                      onClick={() => onViewPatient(a.patientId)}
                      style={{
                        fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 100,
                        background: "transparent", border: "1px solid #2E8BC0", color: "#2E8BC0",
                        cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                      }}
                    >
                      View Sheet
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* My Patients — live list (hidden for manager who sees clinic-wide data) */}
      {!isManager && !isSecretary && (
        <div className="ph-ov-card">
          <div className="ph-ov-card-title">
            My Patients {!patientsLoading && patients.length > 0 && (
              <span style={{ marginLeft: 6, fontWeight: 400, color: "#9a9590", textTransform: "none", letterSpacing: 0 }}>
                ({patients.length})
              </span>
            )}
          </div>
          {patientsLoading ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {[1,2,3].map((n) => (
                <div key={n} style={{ height: 48, borderRadius: 10, background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)", backgroundSize: "200% 100%", animation: "phShimmer 1.4s ease infinite" }} />
              ))}
            </div>
          ) : patients.length === 0 ? (
            <div className="ph-ov-empty">No patients assigned yet.</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[...patients]
                .sort((a, b) => {
                  const order = { active: 0, on_hold: 1, discharged: 2 };
                  const diff = (order[a.status] ?? 3) - (order[b.status] ?? 3);
                  if (diff !== 0) return diff;
                  return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
                })
                .map((p) => {
                  const statusStyle: Record<string, { bg: string; text: string; label: string }> = {
                    active:     { bg: "#e6f4ea", text: "#2d7a3a", label: "Active" },
                    on_hold:    { bg: "#fff3e0", text: "#b45309", label: "On Hold" },
                    discharged: { bg: "#f0ede8", text: "#9a9590", label: "Discharged" },
                  };
                  const ss = statusStyle[p.status] ?? statusStyle.active;
                  const role = p.physioId === physio.uid ? "" : p.seniorEditorId === physio.uid ? "Senior Editor" : "";
                  return (
                    <div key={p.uid} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "10px 14px", borderRadius: 10,
                      background: "#f5f3ef", border: "1px solid #e5e0d8",
                      flexWrap: "wrap",
                    }}>
                      <div style={{
                        width: 34, height: 34, borderRadius: "50%",
                        background: "#2E8BC0", display: "flex", alignItems: "center", justifyContent: "center",
                        fontSize: 13, fontWeight: 700, color: "#fff", flexShrink: 0,
                      }}>
                        {p.firstName[0]}{p.lastName[0]}
                      </div>
                      <div style={{ flex: 1, minWidth: 120 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>
                          {p.firstName} {p.lastName}
                        </div>
                        <div style={{ fontSize: 12, color: "#9a9590" }}>
                          {p.phone || "No phone"}{role ? ` · ${role}` : ""}
                        </div>
                      </div>
                      <span style={{
                        fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 100,
                        background: ss.bg, color: ss.text, whiteSpace: "nowrap", flexShrink: 0,
                      }}>
                        {ss.label}
                      </span>
                      {onViewPatient && (
                        <button
                          onClick={() => onViewPatient(p.uid)}
                          style={{
                            fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 100,
                            background: "transparent", border: "1px solid #2E8BC0", color: "#2E8BC0",
                            cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
                          }}
                        >
                          View Sheet
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}
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

  // Live package-expiry alerts + daily unpaid-balance scan
  useEffect(() => {
    if (!user?.uid) return;
    runBackgroundScan(user.uid);
    return subscribeToPackageAlerts(user.uid);
  }, [user?.uid]);

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
    ...((isManager || isSenior) ? [{ id: "rehab" as Tab, label: "Online Rehab", icon: <IconRehab /> }] : []),
  ];

  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

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
        .phd-topbar-left { display: flex; align-items: center; gap: 8px; }
        .phd-topbar-logo { display: flex; align-items: center; justify-content: center; }
        .phd-topbar-right { display: flex; align-items: center; justify-content: flex-end; gap: 8px; }

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
        }
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
        .phd-nav-section {}
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

        /* ── MOBILE OVERLAY ── */
        .phd-overlay {
          display: none;
          position: fixed; inset: 0; z-index: 90;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(2px);
          animation: phdOvIn 0.2s ease both;
        }
        .phd-overlay.open { display: block; }
        @keyframes phdOvIn { from { opacity: 0; } to { opacity: 1; } }

        @media (min-width: 769px) {
          .phd-sidebar {
            display: flex !important;
            transform: none !important;
            position: sticky;
          }
        }

        /* ── Bottom nav bar — mobile only ── */
        .phd-bottom-nav {
          display: none; /* hidden by default; shown on mobile */
        }

        /* ── Desktop: sidebar visible, bottom nav hidden ── */
        @media (min-width: 769px) {
          .phd-sidebar { display: flex !important; }
          .phd-bottom-nav { display: none !important; }
          .phd-main { padding: 20px 18px; }
        }

        /* ── Mobile: sidebar hidden, bottom nav shown ── */
        @media (max-width: 768px) {
          .phd-body { grid-template-columns: 1fr; }
          .phd-sidebar { display: none !important; }
          .phd-logout-btn { padding: 8px; }
          .phd-logout-btn .phd-logout-text { display: none; }
          .phd-user-name { max-width: 90px; }
          .phd-user-chip { padding: 5px 10px; }
          .phd-main { padding: 14px 12px 80px; }

          .phd-bottom-nav {
            display: flex;
            position: fixed; bottom: 0; left: 0; right: 0; z-index: 200;
            background: #fff;
            border-top: 1px solid #e8e4de;
            box-shadow: 0 -4px 24px rgba(0,0,0,0.07);
            align-items: stretch;
            height: 60px;
            padding-bottom: env(safe-area-inset-bottom);
          }
          .phd-bn-item {
            flex: 1; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 2px;
            cursor: pointer; border: none; background: transparent;
            font-family: 'Outfit', sans-serif;
            color: #b0aba4; transition: color 0.15s;
            padding: 5px 2px 4px; min-width: 0; position: relative;
          }
          .phd-bn-item:hover { color: #2E8BC0; }
          .phd-bn-item.active { color: #2E8BC0; }
          .phd-bn-icon {
            width: 26px; height: 26px; border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            transition: background 0.15s;
          }
          .phd-bn-item.active .phd-bn-icon { background: #EAF5FC; }
          .phd-bn-label {
            font-size: 9.5px; font-weight: 600; letter-spacing: 0.01em;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            max-width: 52px;
          }
          .phd-bn-dot {
            position: absolute; top: 5px; right: calc(50% - 16px);
            width: 6px; height: 6px; border-radius: 50%;
            background: #5BC0BE; border: 2px solid #fff;
          }
        }
      `}</style>

      <div className="phd-root">
        {/* Topbar */}
        <header className="phd-topbar">
          {/* Left: user name chip */}
          <div className="phd-topbar-left">
            <div className="phd-user-chip">
              <div className="phd-user-name">
                {isManager ? physio.firstName : isSecretary ? physio.firstName : `Dr. ${physio.lastName}`}
              </div>
            </div>
          </div>

          {/* Centre: logo */}
          <div className="phd-topbar-logo">
            <img src={logo} alt="Physio+ Hub" style={{ height: 40, width: "auto", objectFit: "contain", display: "block" }} />
          </div>

          {/* Right: notifications + language + sign out */}
          <div className="phd-topbar-right">
            <NotificationPanel
              userId={user!.uid}
              onNavigateToPatient={(patientId) => {
                setViewingPatientId(patientId);
                setActiveTab(isManager ? "people" : "patients");
              }}
            />
            <button className="lang-toggle" onClick={toggleLang} title="Switch language">
              {lang === "en" ? "🌐 العربية" : "🌐 English"}
            </button>
            <button className="phd-logout-btn" onClick={() => setShowSignOutConfirm(true)}>
              <LogOut size={13} strokeWidth={2} color="currentColor" />
              <span className="phd-logout-text">{t("common.signOut")}</span>
            </button>
          </div>
        </header>


        {/* Body */}
        <div className="phd-body">
          {/* Sidebar */}
          <aside className="phd-sidebar">
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
                  onClick={() => { setActiveTab(tab.id); setViewingPatientId(null); setViewingPatientSection(undefined); }}
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
                {activeTab === "rehab" && (isManager || isSenior) && (
                  <OnlineRehabPage
                    physioId={physio.uid}
                    physioName={`Dr. ${physio.firstName} ${physio.lastName}`}
                    isManager={isManager}
                    isSenior={isSenior}
                  />
                )}
              </>
            )}
          </main>
        </div>

        {/* ── Bottom nav bar ── */}
        <nav className="phd-bottom-nav">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`phd-bn-item${isActive ? " active" : ""}`}
                onClick={() => {
                  setActiveTab(tab.id);
                  setViewingPatientId(null);
                  setViewingPatientSection(undefined);
                }}
              >
                <div className="phd-bn-icon">{tab.icon}</div>
                <span className="phd-bn-label">{tab.label}</span>
                {tab.badge ? <span className="phd-bn-dot" /> : null}
              </button>
            );
          })}
        </nav>
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
