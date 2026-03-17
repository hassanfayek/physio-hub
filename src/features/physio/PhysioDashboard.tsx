// FILE: src/features/physio/PhysioDashboard.tsx

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../hooks/useAuth";
import PatientsTab      from "./PatientsTab";
import PatientSheetPage from "../patient/PatientSheetPage";
import SchedulePage        from "../schedule/SchedulePage";
import ExerciseLibraryPage from "../exercises/ExerciseLibraryPage";
import {
  subscribeToDashboardStats,
  type DashboardStats,
} from "../../services/dashboardService";
import type { PhysioProfile } from "../../services/authService";
import logo from "../../assets/physio-logo.svg";

// ─── Tab definitions ──────────────────────────────────────────────────────────

type Tab = "overview" | "patients" | "schedule" | "exercises" | "reports";

interface TabDef {
  id:    Tab;
  label: string;
  icon:  React.ReactNode;
  badge?: number;
}

function IconOverview()  { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>; }
function IconPatients()  { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>; }
function IconSchedule()  { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>; }
function IconExercises() { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 6.5h.01M17.5 6.5h.01M6.5 17.5h.01M17.5 17.5h.01"/><path d="M3 6.5h3.5M17.5 6.5H21M3 17.5h3.5M17.5 17.5H21"/><path d="M6.5 3v3.5M6.5 17.5V21M17.5 3v3.5M17.5 17.5V21"/><rect x="6.5" y="6.5" width="11" height="11" rx="2"/></svg>; }
function IconReports()   { return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>; }

// ─── Overview tab ─────────────────────────────────────────────────────────────

function OverviewTab({ physio, isManager }: { physio: PhysioProfile; isManager: boolean }) {
  const hour     = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";

  const [stats,        setStats]        = useState<DashboardStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  useEffect(() => {
    // Managers see clinic-wide stats — pass a sentinel so dashboardService
    // returns totals across all patients (it already queries the full collection
    // when physioId is "__all__").
    // For regular physios pass their own uid as before.
    const unsubscribe = subscribeToDashboardStats(
      isManager ? "__all__" : physio.uid,
      (data) => { setStats(data); setStatsLoading(false); },
      ()     => setStatsLoading(false)
    );
    return () => unsubscribe();
  }, [physio.uid, isManager]);

  return (
    <>
      <style>{`
        .ph-ov-header { margin-bottom: 28px; }
        .ph-ov-title {
          font-family: 'Playfair Display', serif;
          font-size: 30px; font-weight: 500;
          color: #1a1a1a; letter-spacing: -0.02em; margin-bottom: 4px;
        }
        .ph-ov-sub { font-size: 14px; color: #9a9590; }
        .ph-ov-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 14px; margin-bottom: 28px;
        }
        .ph-ov-stat {
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 16px; padding: 22px;
        }
        .ph-ov-stat.accent { border-top: 3px solid #2E8BC0; }
        .ph-ov-stat-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #c0bbb4; font-weight: 600; margin-bottom: 8px; }
        .ph-ov-stat-val {
          font-family: 'Playfair Display', serif;
          font-size: 36px; color: #1a1a1a; line-height: 1; margin-bottom: 4px;
        }
        .ph-ov-stat-val.loading { font-size: 28px; color: #c0bbb4; }
        .ph-ov-stat-sub { font-size: 12px; color: #9a9590; }
        .ph-ov-card {
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 16px; padding: 22px; margin-bottom: 16px;
        }
        .ph-ov-card-title { font-size: 12px; text-transform: uppercase; letter-spacing: 0.1em; color: #c0bbb4; font-weight: 600; margin-bottom: 16px; }
        .ph-ov-empty {
          text-align: center; padding: 32px; color: #c0bbb4;
          font-size: 13.5px;
        }
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
        <div className="ph-ov-card-title">Today's Schedule</div>
        <div className="ph-ov-empty">
          Schedule feature coming soon. Your appointments will appear here.
        </div>
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

  // ── Resolve clinic manager role ───────────────────────────────────────────
  // The /users/{uid} document stores the role. If role === "manager" the user
  // sees all patients and can reassign them. We read this once on mount.
  const [isManager, setIsManager] = useState(false);

  useEffect(() => {
    if (!user?.uid) return;
    getDoc(doc(db, "users", user.uid)).then((snap) => {
      if (snap.exists()) {
        const role = snap.data().role as string | undefined;
        setIsManager(role === "manager" || role === "clinic_manager");
      }
    });
  }, [user?.uid]);

  const physio = user as PhysioProfile | null;
  if (!physio) return null;

  const TABS: TabDef[] = [
    { id: "overview",  label: "Overview",         icon: <IconOverview /> },
    { id: "patients",  label: "Patients",         icon: <IconPatients /> },
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
          display: grid; grid-template-rows: 62px 1fr;
        }

        .phd-root {
          min-height: 100vh; background: #f5f3ef;
          font-family: 'Outfit', sans-serif;
          display: grid; grid-template-rows: 72px 1fr;
        }

        .phd-topbar {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          padding: 0 28px;
          background: #fff;
          border-bottom: 1px solid #e8e4de;
          position: sticky; top: 0; z-index: 100;
          box-shadow: 0 2px 12px rgba(0,0,0,0.04);
        }
        .phd-topbar-left { display: flex; align-items: center; gap: 10px; }
        .phd-topbar-logo { display: flex; align-items: center; justify-content: center; }
        .phd-topbar-right { display: flex; align-items: center; justify-content: flex-end; gap: 10px; }

        .phd-user-chip {
          display: flex; align-items: center; gap: 9px;
          padding: 6px 14px; border-radius: 100px;
          background: #f5f3ef; border: 1px solid #e5e0d8;
          cursor: pointer; transition: background 0.15s;
        }
        .phd-user-chip:hover { background: #ede9e3; }

        .phd-user-name { font-size: 14px; font-weight: 500; color: #2E8BC0; }

        .phd-logout-btn {
          padding: 8px 16px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 13px;
          color: #9a9590; cursor: pointer; min-height: 40px;
          transition: all 0.15s; display: flex; align-items: center; gap: 6px;
        }
        .phd-logout-btn:hover { border-color: #c0bbb4; color: #5a5550; }

        .phd-body {
          display: grid; grid-template-columns: 260px 1fr;
          min-height: calc(100vh - 72px);
        }

        /* Dark sidebar — matches patient portal */
        .phd-sidebar {
          background: #0C3C60;
          border-right: 1px solid #0a3254;
          padding: 20px 14px;
          display: flex; flex-direction: column; gap: 6px;
          position: sticky; top: 72px;
          height: calc(100vh - 72px); overflow-y: auto;
        }

        /* Profile card inside dark sidebar */
        .phd-profile {
          background: rgba(46,139,192,0.25);
          border: 1px solid rgba(91,192,190,0.2);
          border-radius: 14px; padding: 16px;
          position: relative; overflow: hidden;
          margin-bottom: 6px;
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

        .phd-main {
          padding: 32px 36px; overflow-y: auto;
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
          width: 34px; height: 34px;
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

        @media (max-width: 768px) {
          .phd-hamburger { display: flex; }
          .phd-topbar { grid-template-columns: auto 1fr auto; }

          .phd-body { grid-template-columns: 1fr; }

          /* Sidebar becomes a fixed drawer on mobile */
          .phd-sidebar {
            position: fixed;
            top: 0; left: 0;
            height: 100vh;
            width: 260px;
            z-index: 100;
            transform: translateX(-100%);
            transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
            box-shadow: none;
          }
          .phd-sidebar.open {
            transform: translateX(0);
            box-shadow: 4px 0 24px rgba(0,0,0,0.15);
          }

          .phd-main { padding: 20px 16px; }

          /* Shrink user chip on mobile */
          .phd-user-name { display: none; }
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
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="3" y1="6"  x2="21" y2="6"/>
                <line x1="3" y1="12" x2="21" y2="12"/>
                <line x1="3" y1="18" x2="21" y2="18"/>
              </svg>
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
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                <polyline points="16 17 21 12 16 7"/>
                <line x1="21" y1="12" x2="9" y2="12"/>
              </svg>
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
                  ) : null}
                </div>
              ))}
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
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="19" y1="12" x2="5" y2="12"/>
                    <polyline points="12 19 5 12 12 5"/>
                  </svg>
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
                {activeTab === "exercises" && (
                  <ExerciseLibraryPage
                    physioId={physio.uid}
                    firstName={physio.firstName}
                    lastName={physio.lastName}
                    isManager={isManager}
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
