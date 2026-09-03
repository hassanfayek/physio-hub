// FILE: src/features/staff/StaffListPage.tsx

import { useState, useEffect, useMemo } from "react";
import { Trophy, Clock, LogIn, LogOut, ChevronRight } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { subscribeToPhysiotherapists, type Physiotherapist } from "../../services/patientService";
import { subscribeToAppointmentsByMonth, type Appointment } from "../../services/appointmentService";
import {
  subscribeToAttendanceForDate,
  upsertAttendance,
  type AttendanceRecord,
} from "../../services/attendanceService";
import StaffSheetPage from "./StaffSheetPage";

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function currentMonthLabel(): string {
  return new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function initials(p: Physiotherapist): string {
  return `${p.firstName[0] ?? ""}${p.lastName[0] ?? ""}`.toUpperCase();
}

const RANK_LABEL: Record<string, string> = {
  manager: "Manager", senior: "Senior", junior: "Junior", trainee: "Trainee",
};

const MEDALS = ["#E8A93B", "#B7C0C8", "#C08552"]; // gold, silver, bronze — rank 1/2/3 avatar rings

export default function StaffListPage() {
  const { user } = useAuth();
  const [physios, setPhysios] = useState<Physiotherapist[]>([]);
  const [monthAppts, setMonthAppts] = useState<Appointment[]>([]);
  const [todayAttendance, setTodayAttendance] = useState<AttendanceRecord[]>([]);
  const [selected, setSelected] = useState<Physiotherapist | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const today = todayStr();
  const yearMonth = currentYearMonth();

  useEffect(() => subscribeToPhysiotherapists(setPhysios, () => {}), []);
  useEffect(() => subscribeToAppointmentsByMonth(yearMonth, null, setMonthAppts, () => {}), [yearMonth]);
  useEffect(() => subscribeToAttendanceForDate(today, setTodayAttendance, () => {}), [today]);

  const caseCountByPhysio = useMemo(() => {
    const counts = new Map<string, number>();
    monthAppts
      .filter((a) => a.status === "completed")
      .forEach((a) => counts.set(a.physioId, (counts.get(a.physioId) ?? 0) + 1));
    return counts;
  }, [monthAppts]);

  const attendanceByPhysio = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    todayAttendance.forEach((a) => map.set(a.physioId, a));
    return map;
  }, [todayAttendance]);

  const ranked = useMemo(
    () => [...physios].sort((a, b) => (caseCountByPhysio.get(b.uid) ?? 0) - (caseCountByPhysio.get(a.uid) ?? 0)),
    [physios, caseCountByPhysio]
  );
  const topCount = caseCountByPhysio.get(ranked[0]?.uid ?? "") ?? 0;

  const handleMark = async (physio: Physiotherapist, field: "checkIn" | "checkOut") => {
    setMarkingId(physio.uid);
    await upsertAttendance(
      physio.uid,
      `${physio.firstName} ${physio.lastName}`,
      today,
      { [field]: nowHHMM() },
      user?.uid ?? ""
    );
    setMarkingId(null);
  };

  if (selected) {
    return <StaffSheetPage physio={selected} onBack={() => setSelected(null)} />;
  }

  return (
    <div className="sl-page">
      <style>{`
        .sl-page { max-width: 960px; margin: 0 auto; padding: 4px 4px 60px; font-family: 'Outfit', sans-serif; }
        .sl-title { font-size: 22px; font-weight: 700; color: #0C3C60; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
        .sl-subtitle { font-size: 13.5px; color: #7a7570; margin: 0 0 28px; }

        .sl-section-title { font-size: 15px; font-weight: 700; color: #0C3C60; display: flex; align-items: center; gap: 7px; margin-bottom: 4px; }
        .sl-section-sub { font-size: 12.5px; color: #9a9590; margin-bottom: 14px; }

        /* ── Leaderboard ── */
        .sl-board { display: grid; grid-template-columns: 1fr; gap: 10px; margin-bottom: 36px; }
        @media (min-width: 640px) { .sl-board { grid-template-columns: repeat(2, 1fr); } }

        .sl-card {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 16px; border-radius: 16px;
          border: 1.5px solid #e5e0d8; background: #fff;
          cursor: pointer; transition: border-color 0.15s, transform 0.15s;
        }
        .sl-card:hover { border-color: #2E8BC0; transform: translateY(-1px); }
        .sl-card.top { border-color: #E8A93B; box-shadow: 0 0 0 3px rgba(232,169,59,0.10); }

        .sl-rank {
          width: 26px; height: 26px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 800; color: #7a7570; background: #f0ede8;
        }
        .sl-avatar {
          width: 42px; height: 42px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 15px; font-weight: 700; color: #fff; background: #0C3C60;
          border: 3px solid #fff; box-shadow: 0 0 0 2px #e5e0d8;
        }
        .sl-card-body { flex: 1; min-width: 0; }
        .sl-card-name { font-size: 14px; font-weight: 700; color: #0C3C60; display: flex; align-items: center; gap: 7px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sl-rank-tag { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; background: #e4eefc; color: #0C3C60; padding: 2px 7px; border-radius: 999px; flex-shrink: 0; }
        .sl-card-bar-track { height: 5px; border-radius: 999px; background: #f0ede8; margin-top: 8px; overflow: hidden; }
        .sl-card-bar-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #2E8BC0, #5BC0BE); }
        .sl-card.top .sl-card-bar-fill { background: linear-gradient(90deg, #F4C542, #E8A93B); }

        .sl-case-stat { text-align: right; flex-shrink: 0; }
        .sl-case-num { font-size: 22px; font-weight: 800; color: #0C3C60; line-height: 1; }
        .sl-case-label { font-size: 10.5px; color: #9a9590; margin-top: 2px; }

        /* ── Attendance ── */
        .sl-attend-list { display: flex; flex-direction: column; gap: 8px; }
        .sl-attend-row {
          display: flex; align-items: center; gap: 12px;
          padding: 11px 14px; border-radius: 13px;
          border: 1.5px solid #e5e0d8; background: #fff;
        }
        .sl-attend-avatar {
          width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 700; color: #fff; background: #5a5550;
        }
        .sl-attend-name { font-size: 13.5px; font-weight: 600; color: #3a3530; flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .sl-attend-pill { font-size: 11.5px; font-weight: 600; padding: 4px 10px; border-radius: 999px; white-space: nowrap; }
        .sl-attend-pill.pending { background: #f0ede8; color: #9a9590; }
        .sl-attend-pill.in      { background: #dff3df; color: #1b4332; }
        .sl-attend-pill.out     { background: #e4eefc; color: #0C3C60; }
        .sl-attend-action {
          display: flex; align-items: center; gap: 5px;
          padding: 7px 12px; border-radius: 9px; border: none;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer;
          white-space: nowrap; flex-shrink: 0;
        }
        .sl-attend-action.in  { background: #1b4332; color: #fff; }
        .sl-attend-action.out { background: #0C3C60; color: #fff; }
        .sl-attend-action:disabled { opacity: 0.5; cursor: not-allowed; }
        .sl-attend-view { color: #9a9590; display: flex; align-items: center; flex-shrink: 0; }

        .sl-empty { padding: 18px; border-radius: 12px; background: #f7f5f1; color: #9a9590; font-size: 13px; text-align: center; }
      `}</style>

      <h1 className="sl-title"><Trophy size={20} color="#E8A93B" /> Staff</h1>
      <p className="sl-subtitle">Monthly case leaderboard and daily attendance — visible only to manager and secretary.</p>

      <div className="sl-section-title"><Trophy size={15} /> Case Leaderboard</div>
      <div className="sl-section-sub">Completed sessions in {currentMonthLabel()}</div>

      {ranked.length === 0 ? (
        <div className="sl-empty">No physiotherapists on file yet.</div>
      ) : (
        <div className="sl-board">
          {ranked.map((p, i) => {
            const count = caseCountByPhysio.get(p.uid) ?? 0;
            const pct = topCount > 0 ? Math.max(4, Math.round((count / topCount) * 100)) : 0;
            const medal = MEDALS[i];
            return (
              <div key={p.uid} className={`sl-card ${i === 0 && count > 0 ? "top" : ""}`} onClick={() => setSelected(p)}>
                <div className="sl-rank" style={medal ? { background: medal, color: "#fff" } : undefined}>{i + 1}</div>
                <div className="sl-avatar">{initials(p)}</div>
                <div className="sl-card-body">
                  <div className="sl-card-name">
                    {p.firstName} {p.lastName}
                    <span className="sl-rank-tag">{RANK_LABEL[p.rank] ?? p.rank}</span>
                  </div>
                  <div className="sl-card-bar-track"><div className="sl-card-bar-fill" style={{ width: `${pct}%` }} /></div>
                </div>
                <div className="sl-case-stat">
                  <div className="sl-case-num">{count}</div>
                  <div className="sl-case-label">case{count === 1 ? "" : "s"}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="sl-section-title"><Clock size={15} /> Today's Attendance</div>
      <div className="sl-section-sub">Mark each doctor's arrival and departure as it happens.</div>

      {ranked.length === 0 ? (
        <div className="sl-empty">No physiotherapists on file yet.</div>
      ) : (
        <div className="sl-attend-list">
          {ranked.map((p) => {
            const att = attendanceByPhysio.get(p.uid);
            const saving = markingId === p.uid;
            return (
              <div key={p.uid} className="sl-attend-row">
                <div className="sl-attend-avatar">{initials(p)}</div>
                <div className="sl-attend-name">{p.firstName} {p.lastName}</div>

                {!att?.checkIn && (
                  <>
                    <span className="sl-attend-pill pending">Not arrived</span>
                    <button className="sl-attend-action in" disabled={saving} onClick={() => handleMark(p, "checkIn")}>
                      <LogIn size={13} /> Mark Arrived
                    </button>
                  </>
                )}
                {att?.checkIn && !att?.checkOut && (
                  <>
                    <span className="sl-attend-pill in">In {att.checkIn}</span>
                    <button className="sl-attend-action out" disabled={saving} onClick={() => handleMark(p, "checkOut")}>
                      <LogOut size={13} /> Mark Departed
                    </button>
                  </>
                )}
                {att?.checkIn && att?.checkOut && (
                  <span className="sl-attend-pill out">In {att.checkIn} · Out {att.checkOut}</span>
                )}

                <div className="sl-attend-view" onClick={() => setSelected(p)}>
                  <ChevronRight size={16} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
