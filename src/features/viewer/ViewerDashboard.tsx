// FILE: src/features/viewer/ViewerDashboard.tsx
// Read-only portal: today's schedule + active patient session balances

import { useState, useEffect } from "react";
import logo from "../../assets/physio-logo.svg";
import { Calendar, Users, LogOut, Clock, ChevronLeft, ChevronRight } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import {
  subscribeToAppointmentsByDay,
  toDateStr,
  fmtHour12,
  type Appointment,
} from "../../services/appointmentService";
import {
  subscribeToAllPatients,
  type Patient,
} from "../../services/patientService";
import {
  getDocs,
  collection,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../firebase";
import type { SessionPackage } from "../../services/priceService";
import type { ViewerProfile } from "../../services/authService";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function todayStr(): string {
  return toDateStr(new Date());
}

function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return toDateStr(new Date(y, m - 1, d + n));
}

function fmtDateLabel(dateStr: string): string {
  const today = todayStr();
  if (dateStr === today) return "Today";
  if (dateStr === addDays(today, 1)) return "Tomorrow";
  if (dateStr === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric",
  });
}

const STATUS_COLOR: Record<Appointment["status"], string> = {
  scheduled:   "#2E8BC0",
  in_progress: "#e8a44a",
  completed:   "#3aaa6c",
  cancelled:   "#e05050",
  rescheduled: "#9a9590",
};

const STATUS_LABEL: Record<Appointment["status"], string> = {
  scheduled:   "Scheduled",
  in_progress: "In progress",
  completed:   "Completed",
  cancelled:   "Cancelled",
  rescheduled: "Rescheduled",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ViewerDashboard() {
  const { user, logout } = useAuth();
  const profile = user as ViewerProfile | null;

  const [tab,          setTab]          = useState<"schedule" | "patients">("schedule");
  const [dateStr,      setDateStr]      = useState(todayStr());
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptLoading,  setApptLoading]  = useState(true);
  const [patients,     setPatients]     = useState<Patient[]>([]);
  const [pkgMap,       setPkgMap]       = useState<Map<string, SessionPackage>>(new Map());
  const [patientsLoading, setPatientsLoading] = useState(true);

  // ── Schedule subscription ──────────────────────────────────────────────────
  useEffect(() => {
    setApptLoading(true);
    const unsub = subscribeToAppointmentsByDay(
      dateStr,
      null,  // all physios
      (appts) => { setAppointments(appts); setApptLoading(false); },
      ()     => setApptLoading(false),
    );
    return unsub;
  }, [dateStr]);

  // ── Patients + packages subscription ──────────────────────────────────────
  useEffect(() => {
    const unsub = subscribeToAllPatients((pts) => {
      setPatients(pts.filter((p) => p.status === "active"));
      setPatientsLoading(false);
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (patients.length === 0) return;
    getDocs(query(collection(db, "patientPackages"), where("active", "==", true)))
      .then((snap) => {
        const map = new Map<string, SessionPackage>();
        snap.docs.forEach((d) => {
          const data = d.data();
          const pid = data.patientId as string;
          const pkg: SessionPackage = {
            id:              d.id,
            patientId:       pid,
            packageSize:     data.packageSize     ?? 0,
            pricePerSession: data.pricePerSession ?? 0,
            totalAmount:     data.totalAmount     ?? 0,
            paidAmount:      data.paidAmount      ?? 0,
            startDate:       data.startDate       ?? "",
            sessionsUsed:    data.sessionsUsed    ?? 0,
            active:          true,
            notes:           data.notes           ?? "",
            createdAt:       data.createdAt       ?? null,
          };
          // keep the most recent active package per patient
          const existing = map.get(pid);
          if (!existing || (pkg.createdAt?.toMillis() ?? 0) > (existing.createdAt?.toMillis() ?? 0)) {
            map.set(pid, pkg);
          }
        });
        setPkgMap(map);
      })
      .catch(() => {});
  }, [patients]);

  const activeAppts = appointments.filter((a) => a.status !== "cancelled");

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f2", fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        .vd-header {
          background: #fff; border-bottom: 1px solid #e8e3dc;
          padding: 0 32px; height: 60px;
          display: flex; align-items: center; justify-content: space-between;
        }
        .vd-logo { display: flex; align-items: center; gap: 10px; }
        .vd-logo-name { font-size: 15px; font-weight: 700; color: #0C3C60; line-height: 1.2; }
        .vd-logo-sub  { font-size: 11px; font-weight: 500; color: #9a9590; letter-spacing: 0.02em; }
        .vd-user { display: flex; align-items: center; gap: 12px; }
        .vd-user-name { font-size: 14px; color: #5a5550; }
        .vd-logout {
          display: flex; align-items: center; gap: 6px;
          padding: 6px 12px; border-radius: 8px;
          border: 1px solid #e5e0d8; background: #fff;
          font-size: 13px; font-weight: 500; color: #5a5550;
          cursor: pointer; font-family: 'Outfit', sans-serif; transition: all 0.15s;
        }
        .vd-logout:hover { border-color: #e05050; color: #e05050; }

        .vd-tabs {
          display: flex; gap: 0; background: #fff;
          border-bottom: 1px solid #e8e3dc; padding: 0 32px;
        }
        .vd-tab {
          display: flex; align-items: center; gap: 8px;
          padding: 14px 20px; font-size: 14px; font-weight: 500;
          color: #9a9590; border-bottom: 2px solid transparent;
          cursor: pointer; transition: all 0.15s; background: none; border-top: none;
          border-left: none; border-right: none; font-family: 'Outfit', sans-serif;
        }
        .vd-tab.active { color: #0C3C60; border-bottom-color: #2E8BC0; }
        .vd-tab:hover:not(.active) { color: #0C3C60; }

        .vd-body { padding: 28px 32px; max-width: 1000px; margin: 0 auto; }

        .vd-date-nav {
          display: flex; align-items: center; gap: 12px; margin-bottom: 20px;
        }
        .vd-date-btn {
          width: 32px; height: 32px; border-radius: 8px;
          border: 1px solid #e5e0d8; background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; transition: all 0.15s; color: #5a5550;
        }
        .vd-date-btn:hover { border-color: #2E8BC0; color: #2E8BC0; }
        .vd-date-label { font-size: 18px; font-weight: 700; color: #0C3C60; }
        .vd-date-sub { font-size: 13px; color: #9a9590; margin-left: 4px; }
        .vd-today-btn {
          padding: 5px 12px; border-radius: 6px; font-size: 12px; font-weight: 600;
          border: 1px solid #d0dae8; background: #fff; color: #2E8BC0;
          cursor: pointer; font-family: 'Outfit', sans-serif; margin-left: 4px; transition: all 0.15s;
        }
        .vd-today-btn:hover { background: #2E8BC0; color: #fff; border-color: #2E8BC0; }

        .vd-card {
          background: #fff; border: 1px solid #e8e3dc; border-radius: 14px;
          overflow: hidden;
        }
        .vd-empty {
          padding: 48px; text-align: center; color: #9a9590; font-size: 14px;
        }

        .vd-appt-row {
          display: flex; align-items: center; gap: 16px;
          padding: 14px 20px; border-bottom: 1px solid #f0ede8;
        }
        .vd-appt-row:last-child { border-bottom: none; }
        .vd-appt-time {
          min-width: 80px; font-size: 14px; font-weight: 600; color: #0C3C60;
          display: flex; align-items: center; gap: 6px;
        }
        .vd-appt-info { flex: 1; }
        .vd-appt-name { font-size: 14px; font-weight: 600; color: #1a1a1a; }
        .vd-appt-sub { font-size: 12px; color: #9a9590; margin-top: 2px; }
        .vd-appt-status {
          font-size: 11px; font-weight: 700; padding: 3px 10px;
          border-radius: 100px; text-transform: uppercase; letter-spacing: 0.05em;
        }

        .vd-section-title {
          font-size: 13px; font-weight: 700; color: #9a9590;
          text-transform: uppercase; letter-spacing: 0.08em;
          padding: 12px 20px 8px; border-bottom: 1px solid #f0ede8;
        }

        .vd-patient-row {
          display: flex; align-items: center; gap: 16px;
          padding: 12px 20px; border-bottom: 1px solid #f0ede8;
        }
        .vd-patient-row:last-child { border-bottom: none; }
        .vd-patient-avatar {
          width: 36px; height: 36px; border-radius: 50%; flex-shrink: 0;
          background: #D6EEF8; display: flex; align-items: center; justify-content: center;
          font-size: 13px; font-weight: 700; color: #0C3C60;
        }
        .vd-patient-info { flex: 1; }
        .vd-patient-name { font-size: 14px; font-weight: 600; color: #1a1a1a; }
        .vd-patient-sub { font-size: 12px; color: #9a9590; margin-top: 2px; }
        .vd-sessions-badge {
          display: flex; flex-direction: column; align-items: center;
          min-width: 56px; text-align: center;
        }
        .vd-sessions-num { font-size: 20px; font-weight: 800; line-height: 1; }
        .vd-sessions-label { font-size: 10px; color: #9a9590; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }

        .vd-stat-strip {
          display: grid; grid-template-columns: repeat(3, 1fr);
          gap: 14px; margin-bottom: 20px;
        }
        .vd-stat {
          background: #fff; border: 1px solid #e8e3dc; border-radius: 12px;
          padding: 16px 20px;
        }
        .vd-stat-num { font-size: 28px; font-weight: 800; color: #0C3C60; }
        .vd-stat-label { font-size: 12px; color: #9a9590; margin-top: 4px; }

        @media (max-width: 640px) {
          .vd-header { padding: 0 16px; }
          .vd-tabs  { padding: 0 16px; }
          .vd-body  { padding: 16px; }
          .vd-stat-strip { grid-template-columns: repeat(2, 1fr); }
          .vd-user-name { display: none; }
          .vd-logo-sub { display: none; }
          .vd-logo-name { font-size: 13px; }
          .vd-logo img { height: 28px !important; }
          .vd-logo { gap: 7px; }
        }
      `}</style>

      {/* Header */}
      <header className="vd-header">
        <div className="vd-logo">
          <img src={logo} alt="Physio+ Clinic" style={{ height: 36, width: "auto", objectFit: "contain", display: "block" }} />
          <div>
            <div className="vd-logo-name">Physio+ Clinic</div>
            <div className="vd-logo-sub">Management Portal</div>
          </div>
        </div>
        <div className="vd-user">
          {profile && (
            <span className="vd-user-name">
              {profile.firstName} {profile.lastName}
            </span>
          )}
          <button className="vd-logout" onClick={logout}>
            <LogOut size={13} /> Log out
          </button>
        </div>
      </header>

      {/* Tabs */}
      <div className="vd-tabs">
        <button
          className={`vd-tab ${tab === "schedule" ? "active" : ""}`}
          onClick={() => setTab("schedule")}
        >
          <Calendar size={16} /> Schedule
        </button>
        <button
          className={`vd-tab ${tab === "patients" ? "active" : ""}`}
          onClick={() => setTab("patients")}
        >
          <Users size={16} /> Patients
        </button>
      </div>

      <div className="vd-body">

        {/* ── Schedule tab ── */}
        {tab === "schedule" && (
          <>
            {/* Date navigation */}
            <div className="vd-date-nav">
              <button className="vd-date-btn" onClick={() => setDateStr(addDays(dateStr, -1))}>
                <ChevronLeft size={16} />
              </button>
              <span className="vd-date-label">{fmtDateLabel(dateStr)}</span>
              <span className="vd-date-sub">{dateStr}</span>
              <button className="vd-date-btn" onClick={() => setDateStr(addDays(dateStr, 1))}>
                <ChevronRight size={16} />
              </button>
              {dateStr !== todayStr() && (
                <button className="vd-today-btn" onClick={() => setDateStr(todayStr())}>Today</button>
              )}
            </div>

            {/* Stats strip */}
            <div className="vd-stat-strip">
              <div className="vd-stat">
                <div className="vd-stat-num">{activeAppts.length}</div>
                <div className="vd-stat-label">Total appointments</div>
              </div>
              <div className="vd-stat">
                <div className="vd-stat-num">
                  {activeAppts.filter((a) => a.status === "completed").length}
                </div>
                <div className="vd-stat-label">Completed</div>
              </div>
              <div className="vd-stat">
                <div className="vd-stat-num">
                  {activeAppts.filter((a) => a.status === "scheduled" || a.status === "in_progress").length}
                </div>
                <div className="vd-stat-label">Remaining</div>
              </div>
            </div>

            {/* Appointment list */}
            <div className="vd-card">
              {apptLoading ? (
                <div className="vd-empty">Loading…</div>
              ) : activeAppts.length === 0 ? (
                <div className="vd-empty">No appointments for {fmtDateLabel(dateStr).toLowerCase()}.</div>
              ) : (
                activeAppts.map((a) => (
                  <div key={a.id} className="vd-appt-row">
                    <div className="vd-appt-time">
                      <Clock size={14} style={{ color: "#9a9590", flexShrink: 0 }} />
                      {fmtHour12(a.hour)}
                    </div>
                    <div className="vd-appt-info">
                      <div className="vd-appt-name">{a.patientName}</div>
                      <div className="vd-appt-sub">
                        {a.physioName}{a.sessionType ? ` · ${a.sessionType}` : ""}
                      </div>
                    </div>
                    <span
                      className="vd-appt-status"
                      style={{
                        background: STATUS_COLOR[a.status] + "1a",
                        color:      STATUS_COLOR[a.status],
                      }}
                    >
                      {STATUS_LABEL[a.status]}
                    </span>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {/* ── Patients tab ── */}
        {tab === "patients" && (
          <>
            <div className="vd-stat-strip">
              <div className="vd-stat">
                <div className="vd-stat-num">{patients.length}</div>
                <div className="vd-stat-label">Active patients</div>
              </div>
              <div className="vd-stat">
                <div className="vd-stat-num">{pkgMap.size}</div>
                <div className="vd-stat-label">With active package</div>
              </div>
              <div className="vd-stat">
                <div className="vd-stat-num">
                  {[...pkgMap.values()].filter((p) => (p.packageSize - p.sessionsUsed) <= 2).length}
                </div>
                <div className="vd-stat-label">≤ 2 sessions left</div>
              </div>
            </div>

            <div className="vd-card">
              {patientsLoading ? (
                <div className="vd-empty">Loading…</div>
              ) : patients.length === 0 ? (
                <div className="vd-empty">No active patients.</div>
              ) : (
                <>
                  <div className="vd-section-title">
                    {patients.length} active patient{patients.length !== 1 ? "s" : ""}
                  </div>
                  {patients
                    .slice()
                    .sort((a, b) => {
                      // patients with packages first, sorted by sessions remaining (ascending)
                      const pa = pkgMap.get(a.uid);
                      const pb = pkgMap.get(b.uid);
                      if (pa && !pb) return -1;
                      if (!pa && pb) return 1;
                      if (pa && pb) {
                        return (pa.packageSize - pa.sessionsUsed) - (pb.packageSize - pb.sessionsUsed);
                      }
                      return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
                    })
                    .map((p) => {
                      const pkg = pkgMap.get(p.uid);
                      const remaining = pkg ? pkg.packageSize - pkg.sessionsUsed : null;
                      const color =
                        remaining === null ? "#9a9590" :
                        remaining <= 1     ? "#e05050" :
                        remaining <= 2     ? "#e8a44a" :
                                             "#3aaa6c";
                      const initials = `${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase();
                      return (
                        <div key={p.uid} className="vd-patient-row">
                          <div className="vd-patient-avatar">{initials}</div>
                          <div className="vd-patient-info">
                            <div className="vd-patient-name">{p.firstName} {p.lastName}</div>
                            <div className="vd-patient-sub">
                              {p.occupation || "—"}
                            </div>
                          </div>
                          <div className="vd-sessions-badge">
                            {remaining !== null ? (
                              <>
                                <span className="vd-sessions-num" style={{ color }}>
                                  {remaining}
                                </span>
                                <span className="vd-sessions-label">sessions left</span>
                              </>
                            ) : (
                              <span style={{ fontSize: 12, color: "#c0bbb5" }}>No package</span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
