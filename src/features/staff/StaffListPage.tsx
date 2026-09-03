// FILE: src/features/staff/StaffListPage.tsx

import { useState, useEffect, useMemo } from "react";
import { Users, LogIn, LogOut } from "lucide-react";
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

function nowHHMM(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

const RANK_LABEL: Record<string, string> = {
  manager: "Manager", senior: "Senior", junior: "Junior", trainee: "Trainee",
};

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

  const roster = useMemo(
    () => [...physios].sort((a, b) => (caseCountByPhysio.get(b.uid) ?? 0) - (caseCountByPhysio.get(a.uid) ?? 0)),
    [physios, caseCountByPhysio]
  );

  const handleMark = async (physio: Physiotherapist, field: "checkIn" | "checkOut") => {
    setMarkingId(physio.uid + field);
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
        .sl-page { max-width: 880px; margin: 0 auto; padding: 4px 4px 60px; font-family: 'Outfit', sans-serif; }
        .sl-title { font-size: 22px; font-weight: 700; color: #0C3C60; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
        .sl-subtitle { font-size: 13.5px; color: #7a7570; margin: 0 0 24px; }

        .sl-row { display: flex; align-items: center; justify-content: space-between; gap: 14px; padding: 14px 16px; border-radius: 14px; border: 1.5px solid #e5e0d8; background: #fff; margin-bottom: 10px; cursor: pointer; }
        .sl-row:hover { border-color: #2E8BC0; }
        .sl-row-name { font-size: 14px; font-weight: 700; color: #0C3C60; display: flex; align-items: center; gap: 8px; }
        .sl-rank-badge { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; background: #e4eefc; color: #0C3C60; padding: 2px 8px; border-radius: 999px; }
        .sl-row-cases { font-size: 12.5px; color: #7a7570; margin-top: 3px; }

        .sl-attend { display: flex; align-items: center; gap: 8px; }
        .sl-attend-status { font-size: 12px; color: #7a7570; min-width: 96px; text-align: right; }
        .sl-attend-btn { display: flex; align-items: center; gap: 4px; padding: 7px 11px; border-radius: 8px; border: 1.5px solid #e5e0d8; background: #fafaf8; color: #5a5550; font-family: 'Outfit', sans-serif; font-size: 11.5px; font-weight: 600; cursor: pointer; }
        .sl-attend-btn:disabled { opacity: 0.5; cursor: not-allowed; }
        .sl-attend-btn.in { border-color: #b7d8b7; color: #1b4332; }
        .sl-attend-btn.out { border-color: #f0c4c4; color: #b91c1c; }

        .sl-empty { padding: 18px; border-radius: 12px; background: #f7f5f1; color: #9a9590; font-size: 13px; text-align: center; }
      `}</style>

      <h1 className="sl-title"><Users size={20} color="#2E8BC0" /> Staff</h1>
      <p className="sl-subtitle">Monthly case counts and daily attendance — visible only to manager and secretary.</p>

      {roster.length === 0 ? (
        <div className="sl-empty">No physiotherapists on file yet.</div>
      ) : (
        roster.map((p) => {
          const cases = caseCountByPhysio.get(p.uid) ?? 0;
          const att = attendanceByPhysio.get(p.uid);
          const status = att?.checkOut ? `Out ${att.checkOut}` : att?.checkIn ? `In ${att.checkIn}` : "Not arrived";
          return (
            <div key={p.uid} className="sl-row" onClick={() => setSelected(p)}>
              <div>
                <div className="sl-row-name">
                  {p.firstName} {p.lastName}
                  <span className="sl-rank-badge">{RANK_LABEL[p.rank] ?? p.rank}</span>
                </div>
                <div className="sl-row-cases">{cases} case{cases === 1 ? "" : "s"} this month</div>
              </div>
              <div className="sl-attend" onClick={(e) => e.stopPropagation()}>
                <div className="sl-attend-status">{status}</div>
                <button
                  className="sl-attend-btn in"
                  disabled={markingId === p.uid + "checkIn"}
                  onClick={() => handleMark(p, "checkIn")}
                >
                  <LogIn size={12} /> In
                </button>
                <button
                  className="sl-attend-btn out"
                  disabled={markingId === p.uid + "checkOut"}
                  onClick={() => handleMark(p, "checkOut")}
                >
                  <LogOut size={12} /> Out
                </button>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
