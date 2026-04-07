import React, { useState, useEffect } from "react";
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
import { Home, Dumbbell, CalendarDays, FileText, MessageSquare, ChevronRight, LogOut, ChevronLeft, History } from "lucide-react";
import { useLang } from "../../contexts/LanguageContext";

type Tab = "home" | "exercises" | "appointments" | "sheet" | "feedback";

function IconHome()         { return <Home         size={18} strokeWidth={1.8} color="currentColor" />; }
function IconExercises()    { return <Dumbbell      size={18} strokeWidth={1.8} color="currentColor" />; }
function IconAppointments() { return <CalendarDays  size={18} strokeWidth={1.8} color="currentColor" />; }
function IconSheet()        { return <FileText      size={18} strokeWidth={1.8} color="currentColor" />; }
function IconFeedback()     { return <MessageSquare size={18} strokeWidth={1.8} color="currentColor" />; }

const TABS: { id: Tab; label: string; icon: React.ReactNode; desc: string }[] = [
  { id: "home",         label: "Home",         desc: "Overview",     icon: <IconHome /> },
  { id: "exercises",    label: "Exercises",    desc: "4 assigned",   icon: <IconExercises /> },
  { id: "appointments", label: "Appointments", desc: "2 upcoming",   icon: <IconAppointments /> },
  { id: "sheet",        label: "Sheet",        desc: "View records", icon: <IconSheet /> },
  { id: "feedback",     label: "Feedback",     desc: "Rate session", icon: <IconFeedback /> },
];

export default function PatientDashboard() {
  const [activeTab,    setActiveTab]    = useState<Tab>("home");
  const [sheetSection, setSheetSection] = useState<string | undefined>(undefined);
  const navigate = useNavigate();
  const { lang, toggleLang, t } = useLang();

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

  return (
    <>
      <style>{`
        

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
          grid-template-rows: 56px 1fr;
          grid-template-columns: 1fr;
        }

        /* ── TOPBAR ── */
        .pd2-topbar {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center;
          padding: 0 16px;
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
          gap: 8px;
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
          gap: 8px;
        }
        .pd2-user-chip {
          display: flex;
          align-items: center;
          padding: 6px 12px;
          border-radius: 100px;
          background: #f5f3ef;
          border: 1px solid #e5e0d8;
          cursor: pointer;
          transition: background 0.15s;
        }
        .pd2-user-chip:hover { background: #ede9e3; }

        .pd2-user-name { font-size: 13px; font-weight: 500; color: #2E8BC0; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

        .pd2-logout {
          background: none;
          border: 1px solid #e5e0d8;
          color: #9a9590;
          padding: 8px 14px;
          border-radius: 8px;
          font-size: 13px;
          min-height: 44px;
          cursor: pointer;
          transition: all 0.15s;
        }
        .pd2-logout:hover { border-color: #c0bbb4; color: #5a5550; }

        /* ── BODY LAYOUT ── */
        .pd2-body {
          display: grid;
          grid-template-columns: 260px 1fr;
          min-height: calc(100vh - 56px);
        }

        /* ── SIDEBAR — desktop only ── */
        .pd2-sidebar {
          background: #0C3C60;
          border-right: 1px solid #0a3254;
          padding: 16px 12px;
          display: flex;
          flex-direction: column;
          gap: 4px;
          position: sticky;
          top: 56px;
          height: calc(100vh - 56px);
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
          padding: 0 8px;
          margin-bottom: 3px;
          margin-top: 12px;
        }
        .pd2-nav-label:first-child { margin-top: 2px; }
        .pd2-nav-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 8px;
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
          font-size: 14px;
          font-weight: 500;
          color: #5a5550;
          background: none;
          border: none;
          cursor: pointer;
          padding: 8px 0;
          margin-bottom: 14px;
          min-height: 44px;
          transition: color 0.15s;
        }
        .pd2-back-btn:hover { color: #2E8BC0; }

        /* ── MAIN ── */
        .pd2-main {
          padding: 20px 18px;
          min-height: calc(100vh - 56px);
          animation: fadeSlide 0.3s ease both;
          overflow-x: hidden;
        }
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        /* ── Bottom nav bar — hidden by default (desktop) ── */
        .pd2-bottom-nav {
          display: none;
        }

        /* ── Desktop: sidebar visible, bottom nav hidden ── */
        @media (min-width: 769px) {
          .pd2-sidebar { display: flex !important; }
          .pd2-bottom-nav { display: none !important; }
          .pd2-main { padding: 20px 18px; }
          .pd2-logout { display: block; }
        }

        /* ── Mobile: no sidebar, bottom nav instead ── */
        @media (max-width: 768px) {
          .pd2-body { grid-template-columns: 1fr; }
          .pd2-sidebar { display: none !important; }
          .pd2-logout { display: none; }
          .pd2-user-name { max-width: 90px; }

          .pd2-main { padding: 14px 12px 80px; }

          .pd2-bottom-nav {
            display: flex;
            position: fixed; bottom: 0; left: 0; right: 0; z-index: 200;
            background: #fff;
            border-top: 1px solid #e8e4de;
            box-shadow: 0 -2px 16px rgba(0,0,0,0.07);
            height: 60px;
            padding-bottom: env(safe-area-inset-bottom);
          }
          .pd2-bn-item {
            flex: 1; display: flex; flex-direction: column;
            align-items: center; justify-content: center; gap: 2px;
            background: none; border: none;
            font-family: 'Outfit', sans-serif;
            color: #5a5550; cursor: pointer;
            padding: 5px 2px 4px; min-width: 0; position: relative;
          }
          .pd2-bn-item:hover { color: #2E8BC0; }
          .pd2-bn-item.active { color: #2E8BC0; }
          .pd2-bn-icon {
            width: 26px; height: 26px; border-radius: 8px;
            display: flex; align-items: center; justify-content: center;
            transition: background 0.15s;
          }
          .pd2-bn-item.active .pd2-bn-icon { background: #EAF5FC; }
          .pd2-bn-label {
            font-size: 9.5px; font-weight: 600; letter-spacing: 0.01em;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
            max-width: 52px;
          }
        }
      `}</style>

      <div className="pd2-root">
        {/* Topbar */}
        <header className="pd2-topbar">
          {/* Left: user name */}
          <div className="pd2-topbar-left">
            <div className="pd2-user-chip" onClick={() => navigate("/patient/profile")}>
              <div className="pd2-user-name">{patientFullName}</div>
            </div>
          </div>

          {/* Centre: logo */}
          <div className="pd2-topbar-logo">
            <img src={logo} alt="Physio+ Hub" style={{ height: 40, width: "auto", objectFit: "contain", display: "block" }} />
          </div>

          {/* Right: language + sign out */}
          <div className="pd2-topbar-right">
            <button className="lang-toggle" onClick={toggleLang} title="Switch language">
              {lang === "en" ? "🌐 العربية" : "🌐 English"}
            </button>
            <button className="pd2-logout" onClick={handleLogout}>Sign out</button>
          </div>
        </header>

        {/* Body */}
        <div className="pd2-body">
          {/* Sidebar — desktop only */}
          <aside className="pd2-sidebar">
            {/* Navigation */}
            <div className="pd2-nav-section">
              <div className="pd2-nav-label">{t("nav.myPortal")}</div>
              {TABS.map((tab) => (
                <div
                  key={tab.id}
                  className={`pd2-nav-item ${activeTab === tab.id ? "active" : ""}`}
                  onClick={() => { setActiveTab(tab.id); setSheetSection(undefined); }}
                >
                  <div className="pd2-nav-icon">{tab.icon}</div>
                  <div className="pd2-nav-text">
                    <div className="pd2-nav-title">{t(`nav.${tab.id === "sheet" ? "patientSheet" : tab.id}`)}</div>
                    <div className="pd2-nav-desc">{t(`nav.${tab.id === "sheet" ? "patientSheet" : tab.id}.desc`)}</div>
                  </div>
                  <div className="pd2-nav-arrow">
                    <ChevronRight size={14} strokeWidth={2} color="currentColor" />
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Links */}
            <div className="pd2-nav-section">
              <div className="pd2-nav-label">Quick Access</div>
              <div
                className={`pd2-nav-item ${activeTab === "sheet" && sheetSection === "session-history" ? "active" : ""}`}
                onClick={() => {
                  setSheetSection("session-history");
                  setActiveTab("sheet");
                }}
              >
                <div className="pd2-nav-icon">
                  <History size={18} strokeWidth={1.8} color="currentColor" />
                </div>
                <div className="pd2-nav-text">
                  <div className="pd2-nav-title">Session History</div>
                  <div className="pd2-nav-desc">Past sessions</div>
                </div>
                <div className="pd2-nav-arrow">
                  <ChevronRight size={14} strokeWidth={2} color="currentColor" />
                </div>
              </div>
            </div>

            {/* Sign out */}
            <div className="pd2-sidebar-signout">
              <button className="pd2-sidebar-signout-btn" onClick={handleLogout}>
                <LogOut size={16} strokeWidth={2} color="rgba(255,255,255,0.55)" />
                {t("common.signOut")}
              </button>
            </div>
          </aside>

          {/* Tab Content */}
          <main className="pd2-main" key={activeTab}>
            {activeTab !== "home" && (
              <button className="pd2-back-btn" onClick={() => setActiveTab("home")}>
                <ChevronLeft size={14} strokeWidth={2.5} />
                {t("nav.back")}
              </button>
            )}
            <div className="pd2-page-wrap">
              {activeTab === "home"         && <PatientHomePage onNavigate={(tab: string) => setActiveTab(tab as Tab)} />}
              {activeTab === "exercises"    && <ExercisesPage />}
              {activeTab === "appointments" && <AppointmentsPage />}
              {activeTab === "sheet"        && <PatientSheetPage key={sheetSection ?? "sheet"} initialSection={sheetSection} />}
              {activeTab === "feedback"     && <FeedbackPage />}
            </div>
          </main>
        </div>

        {/* ── Bottom nav bar — mobile only ── */}
        <nav className="pd2-bottom-nav">
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                className={`pd2-bn-item${isActive ? " active" : ""}`}
                onClick={() => { setActiveTab(tab.id); setSheetSection(undefined); }}
              >
                <div className="pd2-bn-icon">{tab.icon}</div>
                <span className="pd2-bn-label">{tab.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </>
  );
}
