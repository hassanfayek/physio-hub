// FILE: src/features/physio/PhysioDashboard.tsx

import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LayoutDashboard, Users, Calendar, Dumbbell, BarChart2, Plus, ChevronDown, ChevronRight, Pencil, LogOut, Menu, ArrowLeft } from "lucide-react";
import { doc, getDoc, deleteDoc, setDoc, updateDoc, serverTimestamp, getFirestore } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../hooks/useAuth";
import PatientsTab      from "./PatientsTab";
import PatientSheetPage from "../patient/PatientSheetPage";
import SchedulePage        from "../schedule/SchedulePage";
import ExerciseLibraryPage from "../exercises/ExerciseLibraryPage";
import {
  subscribeToDashboardStats,
  subscribeTodayAppointments,
  type DashboardStats,
  type TodayAppointment,
} from "../../services/dashboardService";
import { fmtHour12 } from "../../services/appointmentService";
import type { PhysioProfile } from "../../services/authService";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { secondaryAuth } from "../../firebase";
import logo from "../../assets/physio-logo.svg";
import { subscribeToPhysiotherapists, type Physiotherapist } from "../../services/patientService";


// ─── Tab definitions ──────────────────────────────────────────────────────────

type Tab = "overview" | "patients" | "team" | "schedule" | "exercises" | "reports";

interface TabDef {
  id:    Tab;
  label: string;
  icon:  React.ReactNode;
  badge?: number;
}

function IconOverview()  { return <LayoutDashboard size={17} strokeWidth={1.8} color="white" />; }
function IconPatients()  { return <Users size={17} strokeWidth={1.8} color="white" />; }
function IconSchedule()  { return <Calendar size={17} strokeWidth={1.8} color="white" />; }
function IconExercises() { return <Dumbbell size={17} strokeWidth={1.8} color="white" />; }
function IconReports()   { return <BarChart2 size={17} strokeWidth={1.8} color="white" />; }
function IconTeam()      { return <Users size={17} strokeWidth={1.8} color="white" />; }
function IconAdd()       { return <Plus size={14} strokeWidth={2.5} color="white" />; }

// ─── Team tab (manager only) ─────────────────────────────────────────────────

interface AddPhysioForm {
  firstName: string; lastName: string; email: string; password: string;
  licenseNumber: string; clinicName: string; phone: string; specializations: string;
  rank: string;
}

const EMPTY_PHYSIO_FORM: AddPhysioForm = {
  firstName: "", lastName: "", email: "", password: "",
  licenseNumber: "", clinicName: "", phone: "", specializations: "", rank: "junior",
};

function TeamTab() {
  const [physios,        setPhysios]        = React.useState<Physiotherapist[]>([]);
  const [showAddPhysio,  setShowAddPhysio]  = React.useState(false);
  const [physioForm,     setPhysioForm]     = React.useState<AddPhysioForm>(EMPTY_PHYSIO_FORM);
  const [saving,         setSaving]         = React.useState(false);
  const [expandedUid,    setExpandedUid]    = React.useState<string | null>(null);
  const [deletingUid,    setDeletingUid]    = React.useState<string | null>(null);
  const [editingPhysio,  setEditingPhysio]  = React.useState<typeof physios[0] | null>(null);
  const [editForm,       setEditForm]       = React.useState<{
    firstName: string; lastName: string; rank: string;
    licenseNumber: string; clinicName: string; phone: string; specializations: string;
  }>({ firstName: "", lastName: "", rank: "junior", licenseNumber: "", clinicName: "", phone: "", specializations: "" });
  const [editSaving,     setEditSaving]     = React.useState(false);
  const [editError,      setEditError]      = React.useState<string | null>(null);
  const [saveError,      setSaveError]      = React.useState<string | null>(null);
  const [saveSuccess,    setSaveSuccess]    = React.useState<string | null>(null);

  React.useEffect(() => {
    return subscribeToPhysiotherapists(setPhysios, () => {});
  }, []);

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
        updatedAt: serverTimestamp(),
      });
      setEditingPhysio(null);
    } catch (err: unknown) {
      setEditError((err as { message?: string }).message ?? "Failed to save changes.");
    }
    setEditSaving(false);
  };

  const handleAddPhysio = async () => {
    if (!physioForm.email || !physioForm.password || !physioForm.firstName || !physioForm.lastName) {
      setSaveError("First name, last name, email and password are required."); return;
    }
    setSaving(true); setSaveError(null);
    try {
      // IMPORTANT: use secondaryAuth — this keeps the manager logged in
      // createUserWithEmailAndPassword on the main auth would sign out the manager
      const credential = await createUserWithEmailAndPassword(
        secondaryAuth, physioForm.email, physioForm.password
      );
      const newUser = credential.user;
      const displayName = `Dr. ${physioForm.firstName} ${physioForm.lastName}`;

      // Update display name on the secondary auth user
      await updateProfile(newUser, { displayName });

      const now = serverTimestamp();

      // Use secondaryDb so the new physio's token authorises the writes (isOwner passes)
      const secondaryDb = getFirestore(secondaryAuth.app);
      await setDoc(doc(secondaryDb, "users", newUser.uid), {
        email:       physioForm.email,
        role:        "physiotherapist",
        displayName,
        createdAt:   now,
        updatedAt:   now,
      });

      await setDoc(doc(secondaryDb, "physiotherapists", newUser.uid), {
        firstName:       physioForm.firstName,
        lastName:        physioForm.lastName,
        licenseNumber:   physioForm.licenseNumber,
        clinicName:      physioForm.clinicName || "Physio+ Clinic",
        phone:           physioForm.phone,
        specializations: physioForm.specializations.split(",").map((t) => t.trim()).filter(Boolean),
        rank:            physioForm.rank || "junior",
        createdAt:       now,
      });

      // Sign the secondary auth user out — does NOT affect main auth/manager session
      await secondaryAuth.signOut();

      setSaveSuccess(`Dr. ${physioForm.firstName} ${physioForm.lastName} added successfully.`);
      setPhysioForm(EMPTY_PHYSIO_FORM);
      setShowAddPhysio(false);
      setTimeout(() => setSaveSuccess(null), 4000);
    } catch (err: unknown) {
      const msg = (err as { message?: string }).message ?? "";
      setSaveError(
        msg.includes("email-already-in-use")
          ? "This email is already registered."
          : msg || "Failed to add physiotherapist."
      );
    }
    setSaving(false);
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
      <div className="tm-sub">Manage your physiotherapy team. Add or remove physiotherapist accounts.</div>

      {saveSuccess && <div className="tm-success">✓ {saveSuccess}</div>}

      <div className="tm-action-row">
        <button className="tm-add-btn physio" onClick={() => { setShowAddPhysio(true); setSaveError(null); }}>
          <IconAdd /> Add Physiotherapist
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

      {/* Edit Physio Modal */}
      {editingPhysio && (
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
        </div>
      )}

      {/* Add Physio Modal */}
      {showAddPhysio && (
        <div className="tm-modal-overlay" onClick={() => !saving && setShowAddPhysio(false)}>
          <div className="tm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="tm-modal-title">Add Physiotherapist</div>
            <div className="tm-modal-sub">Create a new physiotherapist account. They will use this email and password to log in.</div>
            <div className="tm-field-row">
              <div className="tm-field"><label className="tm-label">First Name</label><input className="tm-input" value={physioForm.firstName} onChange={(e) => setPhysioForm({ ...physioForm, firstName: e.target.value })} placeholder="Ahmed" /></div>
              <div className="tm-field"><label className="tm-label">Last Name</label><input className="tm-input" value={physioForm.lastName} onChange={(e) => setPhysioForm({ ...physioForm, lastName: e.target.value })} placeholder="Hassan" /></div>
            </div>
            <div className="tm-field"><label className="tm-label">Email Address</label><input className="tm-input" type="email" value={physioForm.email} onChange={(e) => setPhysioForm({ ...physioForm, email: e.target.value })} placeholder="dr.ahmed@clinic.com" /></div>
            <div className="tm-field"><label className="tm-label">Password</label><input className="tm-input" type="password" value={physioForm.password} onChange={(e) => setPhysioForm({ ...physioForm, password: e.target.value })} placeholder="Min. 6 characters" /></div>
            <div className="tm-field-row">
              <div className="tm-field"><label className="tm-label">License Number</label><input className="tm-input" value={physioForm.licenseNumber} onChange={(e) => setPhysioForm({ ...physioForm, licenseNumber: e.target.value })} placeholder="PT-12345" /></div>
              <div className="tm-field"><label className="tm-label">Phone</label><input className="tm-input" value={physioForm.phone} onChange={(e) => setPhysioForm({ ...physioForm, phone: e.target.value })} placeholder="+20 100 000 0000" /></div>
            </div>
            <div className="tm-field"><label className="tm-label">Clinic Name</label><input className="tm-input" value={physioForm.clinicName} onChange={(e) => setPhysioForm({ ...physioForm, clinicName: e.target.value })} placeholder="Physio+ Clinic" /></div>
            <div className="tm-field">
              <label className="tm-label">Rank / Level</label>
              <select className="tm-input" value={physioForm.rank}
                onChange={(e) => setPhysioForm({ ...physioForm, rank: e.target.value })}
                style={{ cursor: "pointer" }}>
                <option value="senior">Senior Physiotherapist</option>
                <option value="junior">Junior Physiotherapist</option>
                <option value="trainee">Trainee Physiotherapist</option>
              </select>
            </div>
            <div className="tm-field"><label className="tm-label">Specializations (comma separated)</label><input className="tm-input" value={physioForm.specializations} onChange={(e) => setPhysioForm({ ...physioForm, specializations: e.target.value })} placeholder="Sports Rehab, Orthopaedics" /></div>
            {saveError && <div className="tm-modal-error">{saveError}</div>}
            <div className="tm-modal-actions">
              <button className="tm-modal-cancel" onClick={() => setShowAddPhysio(false)}>Cancel</button>
              <button className="tm-modal-save" disabled={saving} onClick={handleAddPhysio}>
                {saving ? "Creating account…" : "Create Account"}
              </button>
            </div>
          </div>
        </div>
      )}


    </>
  );
}

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ physio, isManager }: { physio: PhysioProfile; isManager: boolean }) {
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const [stats,        setStats]        = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [todayAppts,  setTodayAppts]  = useState<TodayAppointment[]>([]);
  const [apptLoading, setApptLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToDashboardStats(
      isManager ? "__all__" : physio.uid,
      (data) => { setStats(data); setStatsLoading(false); },
      ()     => setStatsLoading(false)
    );
    return () => unsubscribe();
  }, [physio.uid, isManager]);

  useEffect(() => {
    setApptLoading(true);
    const unsubscribe = subscribeTodayAppointments(
      isManager ? "__all__" : physio.uid,
      (data) => { setTodayAppts(data); setApptLoading(false); },
      ()     => setApptLoading(false)
    );
    return () => unsubscribe();
  }, [physio.uid, isManager]);

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
          { label: "Total Patients",  value: statsLoading ? "…" : String(stats?.totalPatients      ?? 0), sub: "registered",      accent: true  },
          { label: "Active Patients", value: statsLoading ? "…" : String(stats?.activePatients     ?? 0), sub: "in rehabilitation", accent: false },
          { label: "On Hold",         value: statsLoading ? "…" : String(stats?.onHoldPatients     ?? 0), sub: "paused",          accent: false },
          { label: "Discharged",      value: statsLoading ? "…" : String(stats?.dischargedPatients ?? 0), sub: "completed",       accent: false },
        ].map((s) => (
          <div key={s.label} className={`ph-ov-stat ${s.accent ? "accent" : ""}`}>
            <div className="ph-ov-stat-label">{s.label}</div>
            <div className={`ph-ov-stat-val ${statsLoading ? "loading" : ""}`}>{s.value}</div>
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
            {todayAppts.map((a) => (
              <div key={a.id} style={{
                display: "flex", alignItems: "center", gap: 14,
                padding: "11px 14px", borderRadius: 10,
                background: "#f5f3ef", border: "1px solid #e5e0d8",
              }}>
                <div style={{
                  minWidth: 58, textAlign: "center",
                  fontFamily: "'Playfair Display', serif",
                  fontSize: 15, fontWeight: 600, color: "#2E8BC0",
                }}>
                  {fmtHour12(a.hour)}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>{a.patientName}</div>
                  <div style={{ fontSize: 12, color: "#9a9590" }}>
                    {a.sessionType}{isManager && a.physioName ? ` · ${a.physioName}` : ""}
                  </div>
                </div>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 100,
                  background: a.status === "completed" ? "#d8f3dc" : a.status === "cancelled" ? "#fee2e2" : "#D6EEF8",
                  color:      a.status === "completed" ? "#1b4332" : a.status === "cancelled" ? "#b91c1c" : "#0C3C60",
                }}>
                  {a.status === "completed" ? "Done" : a.status === "cancelled" ? "Cancelled" : "Scheduled"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div style={{ textAlign: "center", padding: "80px 24px" }}>
      <div style={{ fontSize: 40, marginBottom: 16 }}>🚧</div>
      <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, color: "#1a1a1a", marginBottom: 8 }}>
        {label} — Coming Soon
      </div>
      <div style={{ fontSize: 14, color: "#9a9590" }}>This section is under development.</div>
    </div>
  );
}

// ─── Dashboard shell ──────────────────────────────────────────────────────────

export default function PhysioDashboard() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [activeTab,        setActiveTab]        = useState<Tab>("overview");
  const [sidebarOpen,      setSidebarOpen]      = useState(false);
  const [viewingPatientId, setViewingPatientId] = useState<string | null>(null);

  // ── Resolve clinic manager role + senior status ──────────────────────────
  const [isManager, setIsManager] = useState(false);
  const [isSenior,  setIsSenior]  = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const role = snap.data().role as string | undefined;
        setIsManager(role === "manager" || role === "clinic_manager");
      }
    });
    // Read rank from physiotherapists collection
    getDoc(doc(db, "physiotherapists", user.uid)).then((snap) => {
      if (snap.exists()) {
        const rank = snap.data().rank as string | undefined;
        setIsSenior(rank === "senior");
      }
    });
  }, [user?.uid]);

  const physio = user as PhysioProfile | null;
  if (!physio) return null;

  const TABS: TabDef[] = [
    { id: "overview",  label: "Overview",         icon: <IconOverview /> },
    { id: "patients",  label: "Patients",         icon: <IconPatients /> },
    ...(isManager ? [{ id: "team" as Tab, label: "Team",    icon: <IconTeam /> }] : []),
    { id: "schedule",  label: "Schedule",         icon: <IconSchedule /> },
    { id: "exercises", label: "Exercise Library", icon: <IconExercises /> },
    { id: "reports",   label: "Reports",          icon: <IconReports /> },
  ];

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Outfit:wght@300;400;500;600&display=swap');

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
        .phd-logout-btn:hover { border-color: #c0bbb4; color: #5a5550; }

        .phd-body {
          display: grid; grid-template-columns: 240px 1fr;
          min-height: calc(100vh - 56px);
        }

        /* Dark sidebar — matches patient portal */
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
          to   { opacity: 1; transform: translateY(0); }
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

        @media (max-width: 768px) {
          .phd-hamburger { display: flex; }

          /* Body collapses to single column */
          .phd-body { grid-template-columns: 1fr; }

          /* Sidebar: display:none by default, slides in as drawer when .open */
          .phd-sidebar {
            display: none;
            position: fixed;
            top: 0; left: 0;
            height: 100vh;
            width: 260px;
            z-index: 100;
            transform: translateX(0);
            transition: none;
            background: #0C3C60;
          }
          .phd-sidebar.open {
            display: flex;
            box-shadow: 4px 0 24px rgba(0,0,0,0.15);
          }

          .phd-main { padding: 14px 12px; }
          .phd-logout-btn { display: none; }
          .phd-user-name { max-width: 90px; }
          .phd-user-chip { padding: 5px 10px; }
        }
      `}</style>

      <div className="phd-root">
        {/* Topbar */}
        <header className="phd-topbar">
          {/* Left: hamburger (mobile only) */}
          <div className="phd-topbar-left">
            <button
              className="phd-hamburger"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open menu"
            >
              <Menu size={22} strokeWidth={2} color="#5a5550" />
            </button>
          </div>

          {/* Centre: logo */}
          <div className="phd-topbar-logo">
            <img src={logo} alt="Physio+ Hub" style={{ height: 40, width: "auto", objectFit: "contain", display: "block" }} />
          </div>

          {/* Right: user + sign out */}
          <div className="phd-topbar-right">
            <div className="phd-user-chip">
              <div className="phd-user-name">
                {isManager ? physio.firstName : `Dr. ${physio.lastName}`}
              </div>
            </div>
            <button className="phd-logout-btn" onClick={handleLogout}>
              <LogOut size={13} strokeWidth={2} color="#9a9590" />
              Sign out
            </button>
          </div>
        </header>

        {/* Mobile overlay */}
        <div
          className={`phd-overlay ${sidebarOpen ? "open" : ""}`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* Body */}
        <div className="phd-body">
          {/* Sidebar */}
          <aside className={`phd-sidebar ${sidebarOpen ? "open" : ""}`}>
            <div className="phd-profile">
              <div className="phd-p-avatar">
                {physio.firstName[0]}{physio.lastName[0]}
              </div>
              <div className="phd-p-name">
                {isManager ? physio.firstName : `Dr. ${physio.firstName}`} {physio.lastName}
              </div>
              <div className="phd-p-role">
                {isManager ? "Clinic Manager" : (physio.specializations?.[0] ?? "Physiotherapist")}
              </div>
              {[
                ["Clinic",  physio.clinicName    || "—"],
                ["License", physio.licenseNumber || "—"],
              ].map(([k, v]) => (
                <div key={k} className="phd-p-stat-row">
                  <span>{k}</span><span>{v}</span>
                </div>
              ))}
            </div>

            <div className="phd-nav-section">
              <div className="phd-nav-label">Navigation</div>
              {TABS.map((tab) => (
                <div
                  key={tab.id}
                  className={`phd-nav-item ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
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
                Sign out
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
                  onBack={() => setViewingPatientId(null)}
                />
              </>
            ) : (
              <>
                {activeTab === "overview"  && <OverviewTab physio={physio} isManager={isManager} />}
                {activeTab === "patients"  && (
                  <PatientsTab
                    physioId={physio.uid}
                    isManager={isManager}
                    isSenior={isSenior}
                    onViewPatient={(id) => setViewingPatientId(id)}
                  />
                )}
                {activeTab === "schedule"  && (
                  <SchedulePage
                    physioId={physio.uid}
                    firstName={physio.firstName}
                    lastName={physio.lastName}
                    isManager={isManager}
                  />
                )}
                {activeTab === "team"      && isManager && <TeamTab />}
                {activeTab === "exercises" && (
                  <ExerciseLibraryPage
                    physioId={physio.uid}
                    firstName={physio.firstName}
                    lastName={physio.lastName}
                    isManager={isManager}
                    isSenior={isSenior}
                  />
                )}
                {activeTab === "reports"   && <ComingSoon label="Reports" />}
              </>
            )}
          </main>
        </div>
      </div>
    </>
  );
}
