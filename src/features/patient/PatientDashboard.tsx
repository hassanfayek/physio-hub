import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";
import { subscribeToPatient, type Patient } from "../../services/patientService";
import type { PatientProfile } from "../../services/authService";
import PatientHomePage from "./PatientHomePage";
import ExercisesPage from "./ExercisesPage";
import AppointmentsPage from "./AppointmentsPage";
import PatientSheetPage from "./PatientSheetPage";
import FeedbackPage from "./FeedbackPage";
import logo from "../../assets/physio-logo.svg";

type Tab = "home" | "exercises" | "appointments" | "sheet" | "feedback";

const TABS: { id: Tab; label: string; icon: React.ReactNode; desc: string }[] = [
  {
    id: "home",
    label: "Home",
    desc: "Overview",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
        <polyline points="9 22 9 12 15 12 15 22"/>
      </svg>
    ),
  },
  {
    id: "exercises",
    label: "Exercises",
    desc: "4 assigned",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6.5 6.5h.01M17.5 6.5h.01M6.5 17.5h.01M17.5 17.5h.01"/>
        <path d="M3 6.5h3.5M17.5 6.5H21M3 17.5h3.5M17.5 17.5H21"/>
        <path d="M6.5 3v3.5M6.5 17.5V21M17.5 3v3.5M17.5 17.5V21"/>
        <rect x="6.5" y="6.5" width="11" height="11" rx="2"/>
      </svg>
    ),
  },
  {
    id: "appointments",
    label: "Appointments",
    desc: "2 upcoming",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="22" height="22" rx="2"/>
        <path d="M16 2v4M8 2v4M3 10h18"/>
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>
      </svg>
    ),
  },
  {
    id: "sheet",
    label: "Patient Sheet",
    desc: "View records",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
        <polyline points="14 2 14 8 20 8"/>
        <line x1="16" y1="13" x2="8" y2="13"/>
        <line x1="16" y1="17" x2="8" y2="17"/>
        <polyline points="10 9 9 9 8 9"/>
      </svg>
    ),
  },
  {
    id: "feedback",
    label: "Feedback",
    desc: "Rate session",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
  },
];

export default function PatientDashboard() {
  const [activeTab,   setActiveTab]   = useState<Tab>("home");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate("/", { replace: true });
  };

  // Load patient name from Firestore
  const { user, logout } = useAuth();
  const authPatient = user as PatientProfile | null;
  const [patientData, setPatientData] = useState<Patient | null>(null);

  useEffect(() => {
    if (!authPatient?.uid) return;
    return subscribeToPatient(
      authPatient.uid,
      (p) => setPatientData(p),
      () => {}
    );
  }, [authPatient?.uid]);

  const patientFullName = patientData
    ? `${patientData.firstName} ${patientData.lastName}`.trim()
    : authPatient?.firstName
      ? `${authPatient.firstName} ${authPatient.lastName ?? ""}`.trim()
      : "Loading...";
  const patientInitials = patientData
    ? `${patientData.firstName[0] ?? ""}${patientData.lastName[0] ?? ""}`
    : authPatient?.firstName?.[0] ?? "P";
  // const patientCondition = patientData?.condition ?? "";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500;600&family=Outfit:wght@300;400;500;600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        body {
          background: #f5f3ef;
          font-family: 'Outfit', sans-serif;
          color: #1a1a1a;
          -webkit-font-smoothing: antialiased;
        }

        .pd2-root {
          min-height: 100vh;
          background: #f5f3ef;
          display: grid;
          grid-template-rows: 72px 1fr;
          grid-template-columns: 1fr;
        }

        /* ── TOPBAR ── */
        .pd2-topbar {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          padding: 0 28px;
          background: #fff;
          border-bottom: 1px solid #e8e4de;
          position: sticky;
          top: 0;
          z-index: 100;
          box-shadow: 0 2px 12px rgba(0,0,0,0.04);
        }
        .pd2-topbar-left {
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .pd2-topbar-logo {
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .pd2-topbar-right {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
        }
        .pd2-user-chip {
          display: flex;
          align-items: center;
          padding: 8px 16px;
          border-radius: 100px;
          background: #f5f3ef;
          border: 1px solid #e5e0d8;
          cursor: pointer;
          transition: background 0.15s;
        }
        .pd2-user-chip:hover { background: #ede9e3; }

        .pd2-user-name { font-size: 15px; font-weight: 500; color: #2E8BC0; }

        .pd2-logout {
          background: none;
          border: 1px solid #e5e0d8;
          color: #9a9590;
          padding: 10px 18px;
          border-radius: 8px;
          font-size: 14px;
          min-height: 48px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .pd2-logout:hover { border-color: #c0bbb4; color: #5a5550; }

        /* ── BODY LAYOUT ── */
        .pd2-body {
          display: grid;
          grid-template-columns: 280px 1fr;
          min-height: calc(100vh - 72px);
        }

        /* ── SIDEBAR ── */
        .pd2-sidebar {
          background: #0C3C60;
          border-right: 1px solid #0a3254;
          padding: 20px 14px;
          display: flex;
          flex-direction: column;
          gap: 6px;
          position: sticky;
          top: 72px;
          height: calc(100vh - 72px);
          overflow-y: auto;
        }

        /* Nav section */
        .pd2-nav-section {}
        .pd2-nav-label {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: rgba(255,255,255,0.35);
          font-weight: 700;
          padding: 0 10px;
          margin-bottom: 4px;
          margin-top: 16px;
        }
        .pd2-nav-label:first-child { margin-top: 4px; }
        .pd2-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 11px 10px;
          border-radius: 10px;
          cursor: pointer;
          transition: all 0.14s;
          margin-bottom: 1px;
          border: 1px solid transparent;
          text-decoration: none;
          color: rgba(255,255,255,0.8);
        }
        .pd2-nav-item:hover {
          background: rgba(46,139,192,0.5);
          color: #fff;
        }
        .pd2-nav-item.active {
          background: #5BC0BE;
          border-color: #5BC0BE;
          color: #fff;
        }
        .pd2-nav-icon {
          width: 34px; height: 34px;
          border-radius: 8px;
          display: flex; align-items: center; justify-content: center;
          background: rgba(255,255,255,0.08);
          flex-shrink: 0;
          transition: background 0.14s;
        }
        .pd2-nav-item.active .pd2-nav-icon {
          background: rgba(255,255,255,0.2);
          color: #fff;
        }
        .pd2-nav-text { flex: 1; }
        .pd2-nav-title { font-size: 14px; font-weight: 500; line-height: 1; margin-bottom: 1px; }
        .pd2-nav-desc { font-size: 11px; color: rgba(255,255,255,0.4); }
        .pd2-nav-item.active .pd2-nav-desc { color: rgba(255,255,255,0.75); }
        .pd2-nav-arrow { opacity: 0; transition: opacity 0.15s; }
        .pd2-nav-item:hover .pd2-nav-arrow { opacity: 1; }

        /* Progress section */
        .pd2-rehab-section {
          background: rgba(255,255,255,0.05);
          border-radius: 12px;
          padding: 14px;
          margin-top: 8px;
          border: 1px solid rgba(255,255,255,0.07);
        }

        /* Sign out in sidebar */
        .pd2-sidebar-signout {
          margin-top: auto;
          padding-top: 12px;
          border-top: 1px solid rgba(255,255,255,0.08);
        }
        .pd2-sidebar-signout-btn {
          display: flex; align-items: center; gap: 10px;
          width: 100%; padding: 11px 10px; border-radius: 10px;
          border: 1px solid rgba(255,255,255,0.1);
          background: transparent; cursor: pointer;
          font-family: 'Outfit', sans-serif; font-size: 14px;
          font-weight: 500; color: rgba(255,255,255,0.55);
          transition: all 0.15s; text-align: left;
        }
        .pd2-sidebar-signout-btn:hover {
          background: rgba(224,122,95,0.15);
          border-color: rgba(224,122,95,0.3);
          color: #fca5a5;
        }
        .pd2-rehab-title {
          font-size: 12px;
          font-weight: 600;
          color: rgba(255,255,255,0.6);
          margin-bottom: 12px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .pd2-rehab-bar-row { margin-bottom: 10px; }
        .pd2-rehab-bar-top {
          display: flex;
          justify-content: space-between;
          font-size: 12px;
          color: rgba(255,255,255,0.7);
          margin-bottom: 5px;
        }
        .pd2-rehab-bar-top span:last-child { color: #5BC0BE; font-weight: 600; }
        .pd2-rehab-bar-track {
          height: 5px;
          border-radius: 5px;
          background: rgba(255,255,255,0.15);
          overflow: hidden;
        }
        .pd2-rehab-bar-fill {
          height: 100%;
          border-radius: 5px;
          background: linear-gradient(90deg, #2d6a4f, #52b788);
          transition: width 0.8s cubic-bezier(0.34, 1.2, 0.64, 1);
        }

        /* ── PAGE CONTAINER ── */
        .pd2-page-wrap {
          max-width: 1100px;
          margin: 0 auto;
          width: 100%;
        }

        /* ── BACK BUTTON ── */
        .pd2-back-btn {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          font-family: 'Outfit', sans-serif;
          font-size: 15px;
          font-weight: 500;
          color: #5a5550;
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px 0;
          margin-bottom: 20px;
          transition: color 0.15s;
        }
        .pd2-back-btn:hover { color: #2E8BC0; }

        /* ── MAIN ── */
        .pd2-main {
          padding: 32px 36px;
          min-height: calc(100vh - 72px);
          animation: fadeSlide 0.3s ease both;
        }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── HAMBURGER (hidden on desktop) ── */
        .pd2-hamburger {
          display: none;
          align-items: center; justify-content: center;
          width: 48px; height: 48px;
          border: 1px solid #e5e0d8; border-radius: 10px;
          background: #f5f3ef; cursor: pointer;
          color: #5a5550; transition: background 0.15s;
          flex-shrink: 0;
        }
        .pd2-hamburger:hover { background: #ede9e3; }

        /* ── OVERLAY (mobile only) ── */
        .pd2-overlay {
          display: none;
          position: fixed; inset: 0; z-index: 90;
          background: rgba(0,0,0,0.4);
          backdrop-filter: blur(2px);
        }
        .pd2-overlay.open { display: block; }

        /* ── RESPONSIVE ── */

        /* Desktop: sidebar always visible regardless of sidebarOpen state */
        @media (min-width: 769px) {
          .pd2-sidebar {
            display: flex !important;
            transform: none !important;
            position: sticky;
          }
        }

        @media (max-width: 768px) {
          /* Show hamburger button */
          .pd2-hamburger { display: flex; }

          /* Body collapses to single column */
          .pd2-body { grid-template-columns: 1fr; }

          /* Sidebar: display:none by default (fully hidden, no layout impact) */
          /* slides in as a drawer when .open class is added               */
          .pd2-sidebar {
            display: none;
            position: fixed;
            top: 0; left: 0;
            height: 100vh;
            width: 280px;
            z-index: 100;
            transform: translateX(0);
            transition: none;
            background: #0C3C60;
          }
          .pd2-sidebar.open {
            display: flex;
            box-shadow: 4px 0 24px rgba(0,0,0,0.15);
          }

          .pd2-main { padding: 24px 20px; }
          .pd2-logout { display: none; }
        }
      `}</style>

      <div className="pd2-root">
        {/* Topbar */}
        <header className="pd2-topbar">
          {/* Left: hamburger (mobile) */}
          <div className="pd2-topbar-left">
            <button
              className="pd2-hamburger"
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

          {/* Centre: logo — truly centred via grid */}
          <div className="pd2-topbar-logo">
            <img src={logo} alt="Physio+ Hub" style={{ height: 40, width: "auto", objectFit: "contain", display: "block" }} />
          </div>

          {/* Right: user chip + sign out */}
          <div className="pd2-topbar-right">
            <div className="pd2-user-chip" onClick={() => navigate("/patient/profile")}>
<div className="pd2-user-name">{patientFullName}</div>
            </div>
            <button className="pd2-logout" onClick={handleLogout}>Sign out</button>
          </div>
        </header>

        {/* Overlay: closes sidebar on mobile when tapped */}
        <div
          className={`pd2-overlay ${sidebarOpen ? "open" : ""}`}
          onClick={() => setSidebarOpen(false)}
        />

        {/* Body */}
        <div className="pd2-body">
          {/* Sidebar */}
          <aside className={`pd2-sidebar ${sidebarOpen ? "open" : ""}`}>
            
            {/* Navigation */}
            <div className="pd2-nav-section">
              <div className="pd2-nav-label">My Portal</div>
              {TABS.map((tab) => (
                <div
                  key={tab.id}
                  className={`pd2-nav-item ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
                >
                  <div className="pd2-nav-icon">{tab.icon}</div>
                  <div className="pd2-nav-text">
                    <div className="pd2-nav-title">{tab.label}</div>
                    <div className="pd2-nav-desc">{tab.desc}</div>
                  </div>
                  <div className="pd2-nav-arrow">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 18l6-6-6-6"/>
                    </svg>
                  </div>
                </div>
              ))}
            </div>

            {/* Rehab Progress */}
            <div className="pd2-rehab-section">
              <div className="pd2-rehab-title">Rehab Progress</div>
              {[
                { label: "Quad Strength", pct: 62 },
                { label: "Range of Motion", pct: 78 },
                { label: "Functional Score", pct: 55 },
              ].map((p) => (
                <div key={p.label} className="pd2-rehab-bar-row">
                  <div className="pd2-rehab-bar-top">
                    <span>{p.label}</span>
                    <span>{p.pct}%</span>
                  </div>
                  <div className="pd2-rehab-bar-track">
                    <div className="pd2-rehab-bar-fill" style={{ width: `${p.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Sign out */}
            <div className="pd2-sidebar-signout">
              <button className="pd2-sidebar-signout-btn" onClick={handleLogout}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
                  <polyline points="16 17 21 12 16 7"/>
                  <line x1="21" y1="12" x2="9" y2="12"/>
                </svg>
                Sign out
              </button>
            </div>
          </aside>

          {/* Tab Content */}
          <main className="pd2-main" key={activeTab}>
            {activeTab !== "home" && (
              <button className="pd2-back-btn" onClick={() => setActiveTab("home")}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
                Back
              </button>
            )}
            <div className="pd2-page-wrap">
              {activeTab === "home"         && <PatientHomePage onNavigate={(tab: string) => setActiveTab(tab as Tab)} />}
              {activeTab === "exercises"    && <ExercisesPage />}
              {activeTab === "appointments" && <AppointmentsPage />}
              {activeTab === "sheet"        && <PatientSheetPage />}
              {activeTab === "feedback"     && <FeedbackPage />}
            </div>
          </main>
        </div>
      </div>
    </>
  );
}
