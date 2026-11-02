// FILE: src/features/schedule/SchedulePage.tsx

import { useState, useEffect } from "react";
import { Settings, Calendar, CalendarDays, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import {
  subscribeToClinicSettings,
  fmtHour12,
  saveClinicSettings,
  toDateStr,
  getWeekStart,
  type ClinicSettings,
} from "../../services/appointmentService";
import {
  subscribeToAllPatients,
  subscribeToPhysioPatients,
  subscribeToPhysiotherapists,
  type Patient,
  type Physiotherapist,
} from "../../services/patientService";
import MonthView from "./MonthView";
import WeekView  from "./WeekView";
import DayView   from "./DayView";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SchedulePageProps {
  physioId:              string;
  firstName:             string;
  lastName:              string;
  isManager:             boolean;
  isSecretary?:          boolean;
  canBook?:              boolean;  // false for juniors
  onViewPatient?:        (patientId: string) => void;
  onViewPatientSection?: (patientId: string, section: string) => void;
  /** Open straight into this day (YYYY-MM-DD), e.g. from a price sheet's "Go to day". */
  initialDayDate?:       string;
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
  onClose:   () => void;
}

function SettingsPanel({ settings, onSaved, onClose }: SettingsPanelProps) {
  const [form,    setForm]    = useState(settings);
  const [saving,  setSaving]  = useState(false);

  useEffect(() => { setForm(settings); }, [settings]);

  const handleSave = async () => {
    setSaving(true);
    await saveClinicSettings(form);
    setSaving(false);
    onSaved(form);
    onClose();
  };

  return (
    <div className="sp-panel">
      <div className="sp-panel-header">
        <span className="sp-panel-title">Clinic Schedule Settings</span>
        <button className="sp-panel-close" onClick={onClose}>×</button>
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
            <select
              className="sp-input"
              value={form.openingHour}
              onChange={(e) => setForm((f) => ({ ...f, openingHour: +e.target.value }))}
            >
              {Array.from({ length: 24 }, (_, h) => <option key={h} value={h}>{fmtHour12(h)}</option>)}
            </select>
          </div>
          <div className="sp-field">
            <label className="sp-label">Closing Hour</label>
            <select
              className="sp-input"
              value={form.closingHour}
              onChange={(e) => setForm((f) => ({ ...f, closingHour: +e.target.value }))}
            >
              {Array.from({ length: 24 }, (_, i) => i + 1).map((h) => <option key={h} value={h}>{h === 24 ? "12:00 AM (midnight)" : fmtHour12(h)}</option>)}
            </select>
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
  isSecretary = false,
  canBook = true,
  onViewPatient,
  onViewPatientSection,
  initialDayDate,
}: SchedulePageProps) {
  // Juniors see all clinic appointments but cannot book
  const showAll = isManager || isSecretary || !canBook;
  // Changing/deleting/assigning bookings and booking for anyone: manager + secretary only.
  const canManage = isManager || isSecretary;
  // ── State ─────────────────────────────────────────────────────────────────
  const today     = new Date();
  const [view,    setView]    = useState<ViewMode>(initialDayDate ? "day" : "month");
  const [cursor,  setCursor]  = useState(initialDayDate ? new Date(initialDayDate + "T00:00:00") : today);       // month/week navigator
  const [dayDate, setDayDate] = useState<string | null>(initialDayDate ?? null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Intercept Android/browser back button when in day view — go back to week instead of crashing
  useEffect(() => {
    if (view === "day") {
      window.history.pushState({ scheduleDay: true }, "");
      const onPop = () => setView("week");
      window.addEventListener("popstate", onPop);
      return () => window.removeEventListener("popstate", onPop);
    }
  }, [view]);

  const [settings,  setSettings]  = useState<ClinicSettings>({ maxPatientsPerHour: 4, openingHour: 9, closingHour: 21 });
  const [patients,  setPatients]  = useState<Patient[]>([]);
  const [physios,   setPhysios]   = useState<Physiotherapist[]>([]);

  const currentPhysio = { uid: physioId, firstName, lastName };

  // ── Realtime subscriptions ────────────────────────────────────────────────
  useEffect(() => {
    return subscribeToClinicSettings(setSettings);
  }, []);

  useEffect(() => {
    const unsub = showAll
      ? subscribeToAllPatients(setPatients)
      : subscribeToPhysioPatients(physioId, setPatients);
    return () => unsub();
  }, [physioId, showAll]);

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
        weekday: "long", day: "numeric", month: "long", year: "numeric",
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

        .sc-root { font-family: 'Outfit', sans-serif; }

        /* Toolbar */
        .sc-bar {
          display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap;
          background: #fff; border: 1px solid #e5e0d8; border-radius: 18px; padding: 14px 16px;
          margin-bottom: 14px; box-shadow: 0 1px 3px rgba(12,60,96,0.04);
        }
        .sc-bar-left { min-width: 0; }
        .sc-kicker { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9a9590; }
        .sc-range { font-family: 'Playfair Display', serif; font-size: 22px; font-weight: 600; color: #0C3C60; letter-spacing: -0.01em; margin-top: 2px; }
        .sc-bar-right { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }

        /* View toggle */
        .sc-view-group { display: flex; align-items: center; background: #f3f1ed; border-radius: 12px; padding: 3px; gap: 2px; }
        .sc-view-btn {
          padding: 7px 13px; border-radius: 9px; border: none;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600;
          cursor: pointer; transition: all 0.15s; color: #7a7570; background: transparent;
          display: flex; align-items: center; gap: 6px; min-height: 36px;
        }
        .sc-view-btn.active { background: #fff; color: #0C3C60; box-shadow: 0 1px 4px rgba(12,60,96,0.12); }
        .sc-view-btn:hover:not(.active) { color: #1a1a1a; }

        /* Navigation */
        .sc-nav { display: flex; align-items: center; border: 1.5px solid #e5e0d8; border-radius: 12px; overflow: hidden; background: #fff; }
        .sc-nav-btn {
          width: 38px; height: 38px; border: none; background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #5a5550; transition: background 0.15s;
        }
        .sc-nav-btn:hover { background: #f3f1ed; }
        .sc-today-btn {
          height: 38px; padding: 0 14px; border: none; border-left: 1.5px solid #e5e0d8; border-right: 1.5px solid #e5e0d8;
          background: #fff; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600;
          color: #2E8BC0; cursor: pointer; transition: background 0.15s;
        }
        .sc-today-btn:hover { background: #EAF5FC; }
        .sc-icon-btn {
          width: 40px; height: 40px; border-radius: 12px; border: 1.5px solid #e5e0d8; background: #fff;
          display: flex; align-items: center; justify-content: center; color: #5a5550; cursor: pointer; transition: all 0.15s;
        }
        .sc-icon-btn:hover, .sc-icon-btn.on { background: #EAF5FC; border-color: #B3DEF0; color: #2E8BC0; }

        /* Settings panel */
        .sp-toggle {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 12px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          color: #5a5550; cursor: pointer; transition: all 0.15s; min-height: 40px;
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
        @keyframes scFadeIn { from { opacity:0; transform: translateY(6px); } to { opacity:1; transform: none; } }

        @media (max-width: 640px) {
          .sc-bar { padding: 12px; border-radius: 16px; }
          .sc-range { font-size: 18px; }
          .sc-bar-right { width: 100%; }
          .sc-view-group { flex: 1; }
          .sc-view-btn { flex: 1; justify-content: center; padding: 7px 4px; font-size: 12px; }
        }
      `}</style>

      <div className="sc-root">
        {/* Toolbar: title + range on the left, view / navigation / settings on the right */}
        <div className="sc-bar">
          <div className="sc-bar-left">
            <div className="sc-kicker">{showAll ? "Clinic-wide schedule" : "Your schedule"}</div>
            <div className="sc-range">{headerLabel}</div>
          </div>
          <div className="sc-bar-right">
            <div className="sc-view-group" role="tablist">
              {([
                { id: "month", label: "Month", Icon: Calendar },
                { id: "week",  label: "Week",  Icon: CalendarDays },
                { id: "day",   label: "Day",   Icon: Clock },
              ] as { id: ViewMode; label: string; Icon: typeof Calendar }[]).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={view === id}
                  className={`sc-view-btn ${view === id ? "active" : ""}`}
                  onClick={() => {
                    setView(id);
                    if (id === "day" && !dayDate) setDayDate(toDateStr(new Date()));
                  }}
                >
                  <Icon size={14} strokeWidth={2} /> {label}
                </button>
              ))}
            </div>

            <div className="sc-nav">
              <button className="sc-nav-btn" aria-label="Previous" onClick={() => {
                if (view === "month") moveMonth(-1);
                else if (view === "week") moveWeek(-1);
                else if (view === "day" && dayDate) {
                  const d = new Date(dayDate + "T00:00:00");
                  d.setDate(d.getDate() - 1);
                  setDayDate(toDateStr(d));
                }
              }}><ChevronLeft size={16} strokeWidth={2.5} /></button>
              <button className="sc-today-btn" onClick={goToday}>Today</button>
              <button className="sc-nav-btn" aria-label="Next" onClick={() => {
                if (view === "month") moveMonth(1);
                else if (view === "week") moveWeek(1);
                else if (view === "day" && dayDate) {
                  const d = new Date(dayDate + "T00:00:00");
                  d.setDate(d.getDate() + 1);
                  setDayDate(toDateStr(d));
                }
              }}><ChevronRight size={16} strokeWidth={2.5} /></button>
            </div>

            {isManager && (
              <button className={`sc-icon-btn ${settingsOpen ? "on" : ""}`} title="Clinic schedule settings" onClick={() => setSettingsOpen(!settingsOpen)}>
                <Settings size={16} strokeWidth={2} />
              </button>
            )}
          </div>
        </div>

        {/* Settings panel — manager only (not secretary) */}
        {isManager && settingsOpen && (
          <SettingsPanel settings={settings} onSaved={setSettings} onClose={() => setSettingsOpen(false)} />
        )}

        {/* View content */}
        <div className="sc-content" key={`${view}-${view === "day" ? dayDate : view === "week" ? toDateStr(getWeekStart(cursor)) : `${cursor.getFullYear()}-${cursor.getMonth()}`}`}>
          {view === "month" && (
            <MonthView
              year={cursor.getFullYear()}
              month={cursor.getMonth() + 1}
              settings={settings}
              physioId={showAll ? null : physioId}
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
              isManager={canManage}
              showAll={showAll}
              canBook={canBook}
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
              isManager={canManage}
              showAll={showAll}
              canBook={canBook}
              canEditSessionInfo={canManage}
              onBack={() => setView("week")}
              onViewPatient={onViewPatient}
              onViewPatientSection={onViewPatientSection}
            />
          )}
        </div>
      </div>
    </>
  );
}
