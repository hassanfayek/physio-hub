// FILE: src/features/staff/StaffSheetPage.tsx

import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Phone, Award, FileBadge, Briefcase, Calendar, Clock } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { formatPhoneDisplay } from "../../utils/phone";
import type { Physiotherapist } from "../../services/patientService";
import { subscribeToAppointmentsByMonth, fmtHour12, type Appointment } from "../../services/appointmentService";
import {
  subscribeToAttendanceForPhysio,
  upsertAttendance,
  type AttendanceRecord,
} from "../../services/attendanceService";

export interface StaffSheetPageProps {
  physio:  Physiotherapist;
  onBack:  () => void;
}

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function fmtDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const RANK_LABEL: Record<string, string> = {
  manager: "Manager", senior: "Senior", junior: "Junior", trainee: "Trainee",
};

export default function StaffSheetPage({ physio, onBack }: StaffSheetPageProps) {
  const { user } = useAuth();

  // ── Case history ────────────────────────────────────────────────────────────
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [monthAppts, setMonthAppts] = useState<Appointment[]>([]);

  useEffect(() => {
    return subscribeToAppointmentsByMonth(yearMonth, physio.uid, setMonthAppts, () => {});
  }, [yearMonth, physio.uid]);

  const completedCases = useMemo(
    () => monthAppts.filter((a) => a.status === "completed").sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : b.hour - a.hour)),
    [monthAppts]
  );

  // ── Attendance ───────────────────────────────────────────────────────────────
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [savingDate, setSavingDate] = useState<string | null>(null);
  const [editDate, setEditDate]     = useState(todayStr());
  const [editCheckIn, setEditCheckIn]   = useState("");
  const [editCheckOut, setEditCheckOut] = useState("");

  useEffect(() => {
    return subscribeToAttendanceForPhysio(physio.uid, setAttendance, () => {});
  }, [physio.uid]);

  const recentAttendance = useMemo(() => attendance.slice(0, 30), [attendance]);

  const handleSaveAttendance = async () => {
    if (!editDate) return;
    setSavingDate(editDate);
    await upsertAttendance(
      physio.uid,
      `${physio.firstName} ${physio.lastName}`,
      editDate,
      { checkIn: editCheckIn, checkOut: editCheckOut },
      user?.uid ?? ""
    );
    setSavingDate(null);
  };

  // When the edit-date changes, prefill from any existing record for that date
  useEffect(() => {
    const existing = attendance.find((a) => a.date === editDate);
    setEditCheckIn(existing?.checkIn ?? "");
    setEditCheckOut(existing?.checkOut ?? "");
  }, [editDate, attendance]);

  return (
    <div className="sf-page">
      <style>{`
        .sf-page { max-width: 880px; margin: 0 auto; padding: 4px 4px 60px; font-family: 'Outfit', sans-serif; }
        .sf-back { display: flex; align-items: center; gap: 6px; background: none; border: none; color: #2E8BC0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 16px; padding: 0; }

        .sf-header { border-radius: 18px; padding: 22px 24px; background: linear-gradient(135deg, #0C3C60 0%, #2E8BC0 100%); color: #fff; margin-bottom: 24px; }
        .sf-header-name { font-size: 21px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
        .sf-rank-badge { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; background: rgba(255,255,255,0.18); padding: 3px 10px; border-radius: 999px; }
        .sf-header-meta { margin-top: 12px; display: flex; flex-wrap: wrap; gap: 16px; font-size: 13px; opacity: 0.9; }
        .sf-header-meta span { display: flex; align-items: center; gap: 6px; }

        .sf-section-title { font-size: 15px; font-weight: 700; color: #0C3C60; margin: 28px 0 12px; display: flex; align-items: center; gap: 6px; }

        .sf-month-row { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; }
        .sf-month-input { padding: 8px 12px; border-radius: 10px; border: 1.5px solid #e5e0d8; font-family: 'Outfit', sans-serif; font-size: 13px; }
        .sf-case-count { font-size: 28px; font-weight: 800; color: #0C3C60; }
        .sf-case-count span { font-size: 13px; font-weight: 500; color: #7a7570; margin-left: 6px; }

        .sf-case-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #f0ede8; font-size: 13px; }
        .sf-case-row:last-child { border-bottom: none; }
        .sf-case-date { color: #9a9590; font-size: 11.5px; }

        .sf-attend-form { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; padding: 16px; border-radius: 14px; background: #f7f5f1; margin-bottom: 16px; }
        .sf-attend-field label { display: block; font-size: 11.5px; font-weight: 600; color: #7a7570; margin-bottom: 5px; }
        .sf-attend-field input { padding: 8px 10px; border-radius: 8px; border: 1.5px solid #e5e0d8; font-family: 'Outfit', sans-serif; font-size: 13px; }
        .sf-attend-save { padding: 9px 16px; border-radius: 9px; border: none; background: #2E8BC0; color: #fff; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; }
        .sf-attend-save:disabled { background: #e5e0d8; color: #9a9590; cursor: not-allowed; }

        .sf-attend-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #f0ede8; font-size: 13px; }
        .sf-attend-row:last-child { border-bottom: none; }
        .sf-attend-times { color: #3a3530; }
        .sf-attend-missing { color: #b91c1c; }

        .sf-empty { padding: 16px; border-radius: 12px; background: #f7f5f1; color: #9a9590; font-size: 13px; text-align: center; }
      `}</style>

      <button className="sf-back" onClick={onBack}><ArrowLeft size={15} /> Back to Staff</button>

      <div className="sf-header">
        <div className="sf-header-name">
          {physio.firstName} {physio.lastName}
          <span className="sf-rank-badge">{RANK_LABEL[physio.rank] ?? physio.rank}</span>
        </div>
        <div className="sf-header-meta">
          {physio.phone && <span><Phone size={13} /> {formatPhoneDisplay(physio.phone)}</span>}
          {physio.licenseNumber && <span><FileBadge size={13} /> License {physio.licenseNumber}</span>}
          {physio.clinicName && <span><Briefcase size={13} /> {physio.clinicName}</span>}
        </div>
        {physio.specializations?.length > 0 && (
          <div className="sf-header-meta" style={{ marginTop: 6 }}>
            <span><Award size={13} /> {physio.specializations.join(", ")}</span>
          </div>
        )}
      </div>

      <div className="sf-section-title"><Calendar size={16} /> Case History</div>
      <div className="sf-month-row">
        <div className="sf-case-count">{completedCases.length}<span>completed sessions</span></div>
        <input
          type="month" className="sf-month-input"
          value={yearMonth}
          onChange={(e) => setYearMonth(e.target.value)}
        />
      </div>
      {completedCases.length === 0 ? (
        <div className="sf-empty">No completed sessions in this month.</div>
      ) : (
        completedCases.map((a) => (
          <div key={a.id} className="sf-case-row">
            <div>{a.patientName || "Walk-in"} — {a.sessionType || "Session"}</div>
            <div className="sf-case-date">{a.date} · {fmtHour12(a.hour)}</div>
          </div>
        ))
      )}

      <div className="sf-section-title"><Clock size={16} /> Attendance</div>
      <div className="sf-attend-form">
        <div className="sf-attend-field">
          <label>Date</label>
          <input type="date" value={editDate} onChange={(e) => setEditDate(e.target.value)} />
        </div>
        <div className="sf-attend-field">
          <label>Check-In</label>
          <input type="time" value={editCheckIn} onChange={(e) => setEditCheckIn(e.target.value)} />
        </div>
        <div className="sf-attend-field">
          <label>Check-Out</label>
          <input type="time" value={editCheckOut} onChange={(e) => setEditCheckOut(e.target.value)} />
        </div>
        <button className="sf-attend-save" disabled={savingDate === editDate} onClick={handleSaveAttendance}>
          {savingDate === editDate ? "Saving…" : "Save"}
        </button>
      </div>

      {recentAttendance.length === 0 ? (
        <div className="sf-empty">No attendance recorded yet.</div>
      ) : (
        recentAttendance.map((a) => (
          <div key={a.id} className="sf-attend-row">
            <div>{fmtDateDisplay(a.date)}</div>
            <div className="sf-attend-times">
              In: {a.checkIn ? a.checkIn : <span className="sf-attend-missing">—</span>}
              {"  ·  "}
              Out: {a.checkOut ? a.checkOut : <span className="sf-attend-missing">—</span>}
            </div>
          </div>
        ))
      )}
    </div>
  );
}
