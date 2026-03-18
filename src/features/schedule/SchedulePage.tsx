// FILE: src/features/schedule/SchedulePage.tsx

import React, { useState, useEffect } from "react";
import {
  subscribeToClinicSettings,
  saveClinicSettings,
  toDateStr,
  getWeekStart,
  type ClinicSettings,
} from "../../services/appointmentService";
import {
  subscribeToPatients,
  subscribeToAllPatients,
  subscribeToPhysiotherapists,
  type Patient,
  type Physiotherapist,
} from "../../services/patientService";
import MonthView from "./MonthView";
import WeekView  from "./WeekView";
import DayView   from "./DayView";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SchedulePageProps {
  physioId:   string;
  firstName:  string;
  lastName:   string;
  isManager:  boolean;
}

type ViewMode = "month" | "week" | "day";

const MONTH_NAMES = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

// ─── Settings panel (manager only) ───────────────────────────────────────────

interface SettingsPanelProps {
  settings:  ClinicSettings;
  onSaved:   (s: ClinicSettings) => void;
}

function SettingsPanel({ settings, onSaved }: SettingsPanelProps) {
  const [open,    setOpen]    = useState(false);
  const [form,    setForm]    = useState(settings);
  const [saving,  setSaving]  = useState(false);
  const [saved,   setSaved]   = useState(false);

  useEffect(() => { setForm(settings); }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    await saveClinicSettings(form);
    setSaving(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onSaved(form);
    setOpen(false);
  };

  if (!open) {
    return (
      <button className="sp-toggle" onClick={() => setOpen(true)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="3"/>
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
        </svg>
        {saved ? "Saved!" : "Clinic Settings"}
      </button>
    );
  }

  return (
    <div className="sp-panel">
      <div className="sp-panel-header">
        <span className="sp-panel-title">Clinic Schedule Settings</span>
        <button className="sp-panel-close" onClick={() => setOpen(false)}>×</button>
      </div>
      <div className="sp-panel-body">
        <div className="sp-field">
          <label className="sp-label">Max Patients / Hour</label>
          <input
            className="sp-input"
            type="number" min={1} max={20}
            value={form.maxPatientsPerHour}
            onChange={(e) => setForm((f) => ({ ...f, maxPatientsPerHour: +e.target.value }))}
          />
        </div>
        <div className="sp-row2">
          <div className="sp-field">
            <label className="sp-label">Opening Hour</label>
            <input
              className="sp-input"
              type="number" min={0} max={23}
              value={form.openingHour}
              onChange={(e) => setForm((f) => ({ ...f, openingHour: +e.target.value }))}
            />
          </div>
          <div className="sp-field">
            <label className="sp-label">Closing Hour</label>
            <input
              className="sp-input"
              type="number" min={1} max={24}
              value={form.closingHour}
              onChange={(e) => setForm((f) => ({ ...f, closingHour: +e.target.value }))}
            />
          </div>
        </div>
        <button className="sp-save" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Settings"}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function SchedulePage({
  physioId,
  firstName,
  lastName,
  isManager,
}: SchedulePageProps) {
  // ── State ─────────────────────────────────────────────────────────────────
  const today     = new Date();
  const [view,    setView]    = useState<ViewMode>("month");
  const [cursor,  setCursor]  = useState(today);       // month/week navigator
  const [dayDate, setDayDate] = useState<string | null>(null);

  const [settings,  setSettings]  = useState<ClinicSettings>({ maxPatientsPerHour: 4, openingHour: 9, closingHour: 21 });
  const [patients,  setPatients]  = useState<Patient[]>([]);
  const [physios,   setPhysios]   = useState<Physiotherapist[]>([]);

  const currentPhysio = { uid: physioId, firstName, lastName };

  // ── Realtime subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    return subscribeToClinicSettings(setSettings);
  }, []);

  useEffect(() => {
    const unsub = isManager
      ? subscribeToAllPatients(setPatients)
      : subscribeToPatients(physioId, setPatients);
    return () => unsub();
  }, [physioId, isManager]);

  useEffect(() => {
    return subscribeToPhysiotherapists(setPhysios);
  }, []);

  // ── Navigation helpers ────────────────────────────────────────────────────

  const moveMonth = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c);
      d.setMonth(d.getMonth() + delta);
      return d;
    });
  };

  const moveWeek = (delta: number) => {
    setCursor((c) => {
      const d = new Date(c);
      d.setDate(d.getDate() + delta * 7);
      return d;
    });
  };

  const openDay = (date: string) => {
    setDayDate(date);
    setView("day");
  };

  const goToday = () => {
    setCursor(new Date());
    if (view === "day") setDayDate(toDateStr(new Date()));
  };

  // ── Header label ──────────────────────────────────────────────────────────

  const headerLabel = (() => {
    if (view === "day" && dayDate) {
      return new Date(dayDate + "T00:00:00").toLocaleDateString("en-GB", {
        day: "numeric", month: "long", year: "numeric",
      });
    }
    if (view === "week") {
      const mon = getWeekStart(cursor);
      const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
      const mStr = mon.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      const sStr = sun.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      return `${mStr} – ${sStr}`;
    }
    return `${MONTH_NAMES[cursor.getMonth()]} ${cursor.getFullYear()}`;
  })();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Outfit:wght@400;500;600&display=swap');

        .sc-root { font-family: 'Outfit', sans-serif; }

        /* Page header */
        .sc-header {
          display: flex; align-items: flex-end; justify-content: space-between;
          margin-bottom: 24px; flex-wrap: wrap; gap: 12px;
        }
        .sc-title {
          font-family: 'Playfair Display', serif;
          font-size: 28px; font-weight: 500; color: #1a1a1a;
          letter-spacing: -0.02em; margin-bottom: 4px;
        }
        .sc-sub { font-size: 13.5px; color: #9a9590; }

        /* Toolbar */
        .sc-toolbar {
          display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
          margin-bottom: 20px;
        }

        /* View toggle */
        .sc-view-group {
          display: flex; align-items: center;
          background: #f5f3ef; border-radius: 10px; padding: 3px; gap: 2px;
        }
        .sc-view-btn {
          padding: 7px 14px; border-radius: 8px; border: none;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; color: #9a9590; background: transparent;
          display: flex; align-items: center; gap: 5px;
        }
        .sc-view-btn.active { background: #fff; color: #2E8BC0; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
        .sc-view-btn:hover:not(.active) { color: #5a5550; }

        /* Navigation */
        .sc-nav { display: flex; align-items: center; gap: 6px; }
        .sc-nav-btn {
          width: 32px; height: 32px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #5a5550; transition: all 0.15s;
        }
        .sc-nav-btn:hover { background: #f0ede8; border-color: #c0bbb4; }
        .sc-nav-label {
          font-size: 14.5px; font-weight: 600; color: #1a1a1a; min-width: 160px; text-align: center;
        }

        .sc-today-btn {
          padding: 7px 14px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          color: #5a5550; cursor: pointer; transition: all 0.15s;
        }
        .sc-today-btn:hover { background: #f0ede8; }

        /* Spacer */
        .sc-spacer { flex: 1; }

        /* Settings panel */
        .sp-toggle {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 7px 14px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          color: #5a5550; cursor: pointer; transition: all 0.15s;
        }
        .sp-toggle:hover { background: #f0ede8; }

        .sp-panel {
          background: #fff; border: 1px solid #e5e0d8; border-radius: 16px;
          padding: 0; overflow: hidden; margin-bottom: 16px;
          box-shadow: 0 4px 24px rgba(0,0,0,0.06);
        }
        .sp-panel-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 14px 20px; border-bottom: 1px solid #f0ede8; background: #fafaf8;
        }
        .sp-panel-title { font-size: 14px; font-weight: 600; color: #1a1a1a; }
        .sp-panel-close {
          width: 28px; height: 28px; border-radius: 50%;
          border: 1.5px solid #e5e0d8; background: #fff;
          cursor: pointer; font-size: 18px; color: #9a9590;
          display: flex; align-items: center; justify-content: center;
          transition: all 0.15s;
        }
        .sp-panel-close:hover { background: #f0ede8; color: #1a1a1a; }
        .sp-panel-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 14px; }
        .sp-row2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .sp-field { display: flex; flex-direction: column; gap: 5px; }
        .sp-label {
          font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em;
          font-weight: 600; color: #9a9590;
        }
        .sp-input {
          font-family: 'Outfit', sans-serif;
          padding: 8px 12px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-size: 14px; color: #1a1a1a; outline: none;
          transition: border-color 0.15s; width: 100%;
        }
        .sp-input:focus { border-color: #2E8BC0; background: #fff; box-shadow: 0 0 0 3px rgba(46,139,192,0.08); }
        .sp-save {
          padding: 10px; border-radius: 10px; border: none;
          background: #2E8BC0; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          cursor: pointer; transition: all 0.2s;
        }
        .sp-save:hover:not(:disabled) { background: #0C3C60; }
        .sp-save:disabled { opacity: 0.5; cursor: not-allowed; }

        /* Content wrapper */
        .sc-content { animation: scFadeIn 0.2s ease both; }
        @keyframes scFadeIn { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform: translateY(0); } }
      `}</style>

      <div className="sc-root">
        {/* Page title */}
        <div className="sc-header">
          <div>
            <div className="sc-title">Schedule</div>
            <div className="sc-sub">
              {isManager ? "Clinic-wide schedule" : "Your appointment schedule"}
            </div>
          </div>
        </div>

        {/* Settings panel — manager only */}
        {isManager && (
          <SettingsPanel settings={settings} onSaved={setSettings} />
        )}

        {/* Toolbar */}
        <div className="sc-toolbar">
          {/* View toggle */}
          <div className="sc-view-group">
            {([
              { id: "month", label: "Month", icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
              { id: "week",  label: "Week",  icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="14" x2="8" y2="18"/><line x1="12" y1="14" x2="12" y2="18"/><line x1="16" y1="14" x2="16" y2="18"/></svg> },
              { id: "day",   label: "Day",   icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
            ] as { id: ViewMode; label: string; icon: React.ReactNode }[]).map((v) => (
              <button
                key={v.id}
                className={`sc-view-btn ${view === v.id ? "active" : ""}`}
                onClick={() => {
                  setView(v.id);
                  if (v.id === "day" && !dayDate) setDayDate(toDateStr(new Date()));
                }}
              >
                {v.icon} {v.label}
              </button>
            ))}
          </div>

          {/* Navigation */}
          <div className="sc-nav">
            <button
              className="sc-nav-btn"
              onClick={() => {
                if (view === "month") moveMonth(-1);
                else if (view === "week") moveWeek(-1);
                else if (view === "day" && dayDate) {
                  const d = new Date(dayDate + "T00:00:00");
                  d.setDate(d.getDate() - 1);
                  setDayDate(toDateStr(d));
                }
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6"/>
              </svg>
            </button>
            <span className="sc-nav-label">{headerLabel}</span>
            <button
              className="sc-nav-btn"
              onClick={() => {
                if (view === "month") moveMonth(1);
                else if (view === "week") moveWeek(1);
                else if (view === "day" && dayDate) {
                  const d = new Date(dayDate + "T00:00:00");
                  d.setDate(d.getDate() + 1);
                  setDayDate(toDateStr(d));
                }
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </button>
          </div>

          <button className="sc-today-btn" onClick={goToday}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: "inline-block", verticalAlign: "middle", marginRight: 5 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Today
          </button>
        </div>

        {/* View content */}
        <div className="sc-content" key={`${view}-${view === "day" ? dayDate : view === "week" ? toDateStr(getWeekStart(cursor)) : `${cursor.getFullYear()}-${cursor.getMonth()}`}`}>
          {view === "month" && (
            <MonthView
              year={cursor.getFullYear()}
              month={cursor.getMonth() + 1}
              settings={settings}
              physioId={isManager ? null : physioId}
              onDayClick={openDay}
            />
          )}

          {view === "week" && (
            <WeekView
              referenceDate={cursor}
              settings={settings}
              patients={patients}
              physios={physios}
              currentPhysio={currentPhysio}
              isManager={isManager}
              onDayClick={openDay}
            />
          )}

          {view === "day" && dayDate && (
            <DayView
              date={dayDate}
              settings={settings}
              patients={patients}
              physios={physios}
              currentPhysio={currentPhysio}
              isManager={isManager}
              onBack={() => setView("week")}
            />
          )}
        </div>
      </div>
    </>
  );
}
