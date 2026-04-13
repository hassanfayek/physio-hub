// FILE: src/features/physician/PhysicianDashboard.tsx
// Physician portal — read-only view of referred patients and their exercise programs.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { LogOut, Users, Dumbbell, User, ChevronDown, ChevronRight } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { subscribeToPhysicianPatients, type Patient } from "../../services/patientService";
import { subscribeToPatientExercises, type PatientExercise } from "../../services/exerciseService";
import type { PhysicianProfile } from "../../services/authService";
import logo from "../../assets/physio-logo.svg";
import { createPortal } from "react-dom";

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = "patients" | "exercises";

// ─── Patient exercises panel ─────────────────────────────────────────────────

function PatientExercisesPanel({ patient, onClose }: { patient: Patient; onClose: () => void }) {
  const [exercises, setExercises] = useState<PatientExercise[]>([]);
  const [loading, setLoading]     = useState(true);

  useEffect(() => {
    setLoading(true);
    return subscribeToPatientExercises(
      patient.uid,
      (data) => { setExercises(data); setLoading(false); },
      () => setLoading(false)
    );
  }, [patient.uid]);

  const clinic = exercises.filter((e) => e.programType === "clinic");
  const home   = exercises.filter((e) => e.programType === "home");

  return createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(10,15,10,0.5)", backdropFilter: "blur(3px)",
      display: "flex", alignItems: "center", justifyContent: "center", padding: 24,
    }} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{
        background: "#fff", borderRadius: 20, padding: 28,
        width: "min(600px, 100%)", maxHeight: "85vh", overflowY: "auto",
        boxShadow: "0 24px 80px rgba(0,0,0,0.18)", fontFamily: "'Outfit', sans-serif",
      }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 500, color: "#1a1a1a" }}>
              {patient.firstName} {patient.lastName}
            </div>
            <div style={{ fontSize: 12, color: "#9a9590", marginTop: 2 }}>Exercise Program</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: "50%", border: "1.5px solid #e5e0d8", background: "#fafaf8", cursor: "pointer", fontSize: 14, color: "#9a9590" }}>✕</button>
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#c0bbb4" }}>Loading…</div>
        ) : exercises.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#c0bbb4", fontSize: 14 }}>No exercises assigned yet.</div>
        ) : (
          <>
            {[{ label: "Clinic Exercises", items: clinic }, { label: "Home Program", items: home }].map(({ label, items }) =>
              items.length > 0 ? (
                <div key={label} style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.1em", color: "#c0bbb4", marginBottom: 10 }}>{label}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {items.map((ex) => (
                      <div key={ex.id} style={{ background: "#f5f3ef", border: "1px solid #e5e0d8", borderRadius: 12, padding: "12px 14px" }}>
                        <div style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a", marginBottom: 4 }}>{ex.name}</div>
                        {ex.description && <div style={{ fontSize: 12, color: "#9a9590", marginBottom: 6 }}>{ex.description}</div>}
                        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                          {ex.sets  ? <span style={{ fontSize: 11, background: "#EAF5FC", color: "#2E8BC0", borderRadius: 100, padding: "2px 8px", fontWeight: 600 }}>{ex.sets} sets</span>   : null}
                          {ex.reps  ? <span style={{ fontSize: 11, background: "#EAF5FC", color: "#2E8BC0", borderRadius: 100, padding: "2px 8px", fontWeight: 600 }}>{ex.reps} reps</span>   : null}
                          {ex.hold  ? <span style={{ fontSize: 11, background: "#EAF5FC", color: "#2E8BC0", borderRadius: 100, padding: "2px 8px", fontWeight: 600 }}>{ex.hold}s hold</span>  : null}
                          <span style={{ fontSize: 11, background: ex.completed ? "#d8f3dc" : "#f5f3ef", color: ex.completed ? "#1b4332" : "#9a9590", borderRadius: 100, padding: "2px 8px", fontWeight: 600, border: "1px solid #e5e0d8" }}>
                            {ex.completed ? "✓ Done" : "Pending"}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

export default function PhysicianDashboard() {
  const navigate  = useNavigate();
  const { user, logout } = useAuth();
  const physician = user as unknown as PhysicianProfile | null;

  const [activeTab, setActiveTab]   = useState<Tab>("patients");
  const [patients,  setPatients]    = useState<Patient[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [expanded,  setExpanded]    = useState<string | null>(null);
  const [viewExercises, setViewExercises] = useState<Patient | null>(null);
  const [showSignOutConfirm, setShowSignOutConfirm] = useState(false);

  useEffect(() => {
    if (!physician?.uid) return;
    setLoading(true);
    return subscribeToPhysicianPatients(
      physician.uid,
      (data) => { setPatients(data); setLoading(false); },
      () => setLoading(false)
    );
  }, [physician?.uid]);

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  if (!physician) return null;

  const active     = patients.filter((p) => p.status === "active");
  const discharged = patients.filter((p) => p.status === "discharged");
  const onHold     = patients.filter((p) => p.status === "on_hold");

  const statusStyle: Record<string, { bg: string; text: string; label: string }> = {
    active:     { bg: "#e6f4ea", text: "#2d7a3a", label: "Active" },
    on_hold:    { bg: "#fff3e0", text: "#b45309", label: "On Hold" },
    discharged: { bg: "#f0ede8", text: "#9a9590", label: "Discharged" },
  };

  return (
    <>
      <style>{`
        .phd-wrap { min-height: 100vh; background: #f8f6f2; font-family: 'Outfit', sans-serif; }
        .phd-header {
          position: sticky; top: 0; z-index: 100;
          background: #fff; border-bottom: 1px solid #e5e0d8;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 24px; height: 60px;
        }
        .phd-header-left { display: flex; align-items: center; gap: 12px; }
        .phd-logo { height: 32px; }
        .phd-header-title { font-family: 'Playfair Display', serif; font-size: 18px; color: #0C3C60; font-weight: 500; }
        .phd-role-badge { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; background: #e8f4fd; color: #2E8BC0; padding: 3px 8px; border-radius: 100px; }
        .phd-logout-btn {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 9px; border: 1.5px solid #e5e0d8;
          background: #fff; font-family: 'Outfit', sans-serif; font-size: 13px;
          font-weight: 500; color: #5a5550; cursor: pointer; transition: all 0.15s;
        }
        .phd-logout-btn:hover { background: #fee2e2; border-color: #fca5a5; color: #b91c1c; }
        @media (max-width: 540px) {
          .phd-logout-btn { padding: 8px; }
          .phd-logout-text { display: none; }
        }

        .phd-nav {
          display: flex; gap: 4px; padding: 16px 24px 0;
          border-bottom: 1px solid #e5e0d8; background: #fff; overflow-x: auto;
        }
        .phd-nav-tab {
          display: inline-flex; align-items: center; gap: 7px;
          padding: 10px 16px; border-radius: 10px 10px 0 0;
          font-family: 'Outfit', sans-serif; font-size: 13.5px; font-weight: 500;
          cursor: pointer; border: none; background: transparent; color: #9a9590;
          border-bottom: 2px solid transparent; transition: all 0.15s; white-space: nowrap;
        }
        .phd-nav-tab:hover { color: #2E8BC0; }
        .phd-nav-tab.active { color: #2E8BC0; border-bottom-color: #2E8BC0; font-weight: 600; }

        .phd-content { padding: 24px; max-width: 900px; margin: 0 auto; }

        .phd-stats { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin-bottom: 24px; }
        .phd-stat { background: #fff; border: 1px solid #e5e0d8; border-radius: 14px; padding: 16px; }
        .phd-stat.accent { border-top: 3px solid #2E8BC0; }
        .phd-stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #c0bbb4; font-weight: 600; margin-bottom: 6px; }
        .phd-stat-val { font-family: 'Playfair Display', serif; font-size: 30px; color: #1a1a1a; line-height: 1; margin-bottom: 3px; }
        .phd-stat-sub { font-size: 11px; color: #9a9590; }

        .phd-card { background: #fff; border: 1px solid #e5e0d8; border-radius: 14px; overflow: hidden; margin-bottom: 8px; transition: border-color 0.15s; }
        .phd-card:hover { border-color: #B3DEF0; }
        .phd-card-row { display: flex; align-items: center; gap: 12px; padding: 14px 16px; cursor: pointer; }
        .phd-avatar { width: 40px; height: 40px; border-radius: 50%; background: linear-gradient(135deg,#2E8BC0,#5BC0BE); display: flex; align-items: center; justify-content: center; font-size: 14px; font-weight: 700; color: #fff; flex-shrink: 0; }
        .phd-card-name { font-size: 14px; font-weight: 600; color: #1a1a1a; }
        .phd-card-sub  { font-size: 12px; color: #9a9590; margin-top: 1px; }
        .phd-empty { text-align: center; padding: 48px 20px; color: #c0bbb4; font-size: 14px; }

        .phd-detail { border-top: 1px solid #f0ede8; padding: 14px 16px; background: #fafaf8; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .phd-detail-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #c0bbb4; margin-bottom: 2px; }
        .phd-detail-val { font-size: 13px; font-weight: 500; color: #1a1a1a; }
        .phd-ex-btn {
          display: inline-flex; align-items: center; gap: 5px;
          padding: 6px 12px; border-radius: 8px; border: 1.5px solid #B3DEF0;
          background: #EAF5FC; color: #2E8BC0; font-family: 'Outfit', sans-serif;
          font-size: 12px; font-weight: 500; cursor: pointer; transition: all 0.15s; margin-top: 8px;
        }
        .phd-ex-btn:hover { background: #D6EEF8; }

        .phd-section-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.12em; color: #9a9590; font-weight: 700; margin-bottom: 10px; margin-top: 20px; }

        /* Confirm overlay */
        .phd-confirm-overlay { position: fixed; inset: 0; z-index: 2000; background: rgba(10,15,10,0.5); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 24px; }
        .phd-confirm-modal { background: #fff; border-radius: 16px; padding: 28px; width: min(360px,100%); box-shadow: 0 16px 60px rgba(0,0,0,0.18); font-family: 'Outfit', sans-serif; text-align: center; }
        .phd-confirm-title { font-size: 17px; font-weight: 600; color: #1a1a1a; margin-bottom: 8px; }
        .phd-confirm-sub { font-size: 13px; color: #9a9590; margin-bottom: 22px; }
        .phd-confirm-actions { display: flex; gap: 8px; justify-content: center; }
        .phd-confirm-yes { padding: 10px 22px; border-radius: 10px; border: none; background: #b91c1c; color: #fff; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600; cursor: pointer; }
        .phd-confirm-yes:hover { background: #991b1b; }
        .phd-confirm-no  { padding: 10px 22px; border-radius: 10px; border: 1.5px solid #e5e0d8; background: #fff; font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500; color: #5a5550; cursor: pointer; }
      `}</style>

      <div className="phd-wrap">
        {/* Header */}
        <header className="phd-header">
          <div className="phd-header-left">
            <img src={logo} alt="Physio+ Hub" className="phd-logo" />
            <div>
              <div className="phd-header-title">Dr. {physician.firstName} {physician.lastName}</div>
              <div className="phd-role-badge">Physician Portal</div>
            </div>
          </div>
          <button className="phd-logout-btn" onClick={() => setShowSignOutConfirm(true)}>
            <LogOut size={15} strokeWidth={2} />
            <span className="phd-logout-text">Sign Out</span>
          </button>
        </header>

        {/* Nav tabs */}
        <nav className="phd-nav">
          <button className={`phd-nav-tab ${activeTab === "patients" ? "active" : ""}`} onClick={() => setActiveTab("patients")}>
            <Users size={15} strokeWidth={1.8} /> My Referred Patients
          </button>
          <button className={`phd-nav-tab ${activeTab === "exercises" ? "active" : ""}`} onClick={() => setActiveTab("exercises")}>
            <Dumbbell size={15} strokeWidth={1.8} /> Exercise Programs
          </button>
        </nav>

        <div className="phd-content">
          {activeTab === "patients" && (
            <>
              {/* Stats */}
              <div className="phd-stats">
                {[
                  { label: "Total Referred", value: patients.length,     sub: "patients", accent: true },
                  { label: "Active",          value: active.length,      sub: "in rehab" },
                  { label: "On Hold",         value: onHold.length,      sub: "paused" },
                  { label: "Discharged",      value: discharged.length,  sub: "completed" },
                ].map((s) => (
                  <div key={s.label} className={`phd-stat ${s.accent ? "accent" : ""}`}>
                    <div className="phd-stat-label">{s.label}</div>
                    <div className="phd-stat-val">{loading ? "…" : s.value}</div>
                    <div className="phd-stat-sub">{s.sub}</div>
                  </div>
                ))}
              </div>

              {loading ? (
                <div className="phd-empty">Loading patients…</div>
              ) : patients.length === 0 ? (
                <div className="phd-empty">
                  <User size={40} strokeWidth={1.2} style={{ margin: "0 auto 12px", opacity: 0.3 }} />
                  No patients referred by you yet.
                </div>
              ) : (
                <>
                  {[
                    { title: `Active (${active.length})`,         list: active },
                    { title: `On Hold (${onHold.length})`,        list: onHold },
                    { title: `Discharged (${discharged.length})`, list: discharged },
                  ].filter((g) => g.list.length > 0).map(({ title, list }) => (
                    <div key={title}>
                      <div className="phd-section-label">{title}</div>
                      {list.map((p) => {
                        const ss = statusStyle[p.status] ?? statusStyle.active;
                        const isExpanded = expanded === p.uid;
                        return (
                          <div key={p.uid} className="phd-card">
                            <div className="phd-card-row" onClick={() => setExpanded(isExpanded ? null : p.uid)}>
                              <div className="phd-avatar">{p.firstName[0]}{p.lastName[0]}</div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="phd-card-name">{p.firstName} {p.lastName}</div>
                                <div className="phd-card-sub">{p.phone || "No phone"}{p.occupation ? ` · ${p.occupation}` : ""}</div>
                              </div>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 100, background: ss.bg, color: ss.text, whiteSpace: "nowrap", flexShrink: 0, marginRight: 4 }}>
                                {ss.label}
                              </span>
                              {isExpanded ? <ChevronDown size={14} strokeWidth={2.5} color="#c0bbb4" /> : <ChevronRight size={14} strokeWidth={2.5} color="#c0bbb4" />}
                            </div>
                            {isExpanded && (
                              <div className="phd-detail">
                                <div>
                                  <div className="phd-detail-label">Referred By (note)</div>
                                  <div className="phd-detail-val">{p.referredBy || "—"}</div>
                                </div>
                                <div>
                                  <div className="phd-detail-label">Status</div>
                                  <div className="phd-detail-val">{ss.label}</div>
                                </div>
                                <div style={{ gridColumn: "1 / -1" }}>
                                  <button className="phd-ex-btn" onClick={() => setViewExercises(p)}>
                                    <Dumbbell size={12} strokeWidth={2} /> View Exercise Program
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ))}
                </>
              )}
            </>
          )}

          {activeTab === "exercises" && (
            <>
              {loading ? (
                <div className="phd-empty">Loading…</div>
              ) : patients.length === 0 ? (
                <div className="phd-empty">No referred patients yet.</div>
              ) : (
                <>
                  <div style={{ fontSize: 13, color: "#9a9590", marginBottom: 16 }}>
                    Exercise programs for all {patients.length} patient{patients.length !== 1 ? "s" : ""} referred by you.
                  </div>
                  {patients.map((p) => {
                    const ss = statusStyle[p.status] ?? statusStyle.active;
                    return (
                      <div key={p.uid} className="phd-card" style={{ marginBottom: 8 }}>
                        <div className="phd-card-row" style={{ cursor: "default" }}>
                          <div className="phd-avatar">{p.firstName[0]}{p.lastName[0]}</div>
                          <div style={{ flex: 1 }}>
                            <div className="phd-card-name">{p.firstName} {p.lastName}</div>
                            <div className="phd-card-sub">{p.phone || "No phone"}</div>
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 9px", borderRadius: 100, background: ss.bg, color: ss.text, whiteSpace: "nowrap", flexShrink: 0, marginRight: 8 }}>
                            {ss.label}
                          </span>
                          <button className="phd-ex-btn" onClick={() => setViewExercises(p)}>
                            <Dumbbell size={12} strokeWidth={2} /> View Program
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Exercise panel */}
      {viewExercises && (
        <PatientExercisesPanel patient={viewExercises} onClose={() => setViewExercises(null)} />
      )}

      {/* Sign-out confirm */}
      {showSignOutConfirm && createPortal(
        <div className="phd-confirm-overlay">
          <div className="phd-confirm-modal">
            <div className="phd-confirm-title">Sign Out?</div>
            <div className="phd-confirm-sub">You will be returned to the login screen.</div>
            <div className="phd-confirm-actions">
              <button className="phd-confirm-no" onClick={() => setShowSignOutConfirm(false)}>Cancel</button>
              <button className="phd-confirm-yes" onClick={handleLogout}>Sign Out</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
