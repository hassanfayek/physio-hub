// FILE: src/features/staff/StaffSheetPage.tsx

import { useState, useEffect, useMemo } from "react";
import { ArrowLeft, Phone, Award, FileBadge, Briefcase, Calendar, Clock, Plus, AlertTriangle, Printer } from "lucide-react";
import { collection, query, where, getDocs } from "firebase/firestore";
import { db } from "../../firebase";
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

function monthLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "short" });
}

function fmtDateDisplay(dateStr: string): string {
  if (!dateStr) return "";
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function dayOfWeekShort(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short" });
}

function monthYearLabel(yearMonth: string): string {
  const [y, m] = yearMonth.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
}

// Every "YYYY-MM-DD" in a given month, the 1st through the last day, in order.
function allDaysInMonth(yearMonth: string): string[] {
  const [y, m] = yearMonth.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const out: string[] = [];
  for (let d = 1; d <= lastDay; d++) {
    out.push(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`);
  }
  return out;
}

// Trailing N "YYYY-MM" strings ending at the current month, oldest first.
function trailingMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const dd = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${dd.getFullYear()}-${String(dd.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

const RANK_LABEL: Record<string, string> = {
  manager: "Manager", senior: "Senior", junior: "Junior", trainee: "Trainee",
};

export default function StaffSheetPage({ physio, onBack }: StaffSheetPageProps) {
  const { user } = useAuth();

  // ── Case history: current month (live) ─────────────────────────────────────
  const [yearMonth, setYearMonth] = useState(currentYearMonth());
  const [monthAppts, setMonthAppts] = useState<Appointment[]>([]);

  useEffect(() => {
    return subscribeToAppointmentsByMonth(yearMonth, physio.uid, setMonthAppts, () => {});
  }, [yearMonth, physio.uid]);

  const completedCases = useMemo(
    () => monthAppts.filter((a) => a.status === "completed").sort((a, b) => (a.date !== b.date ? b.date.localeCompare(a.date) : b.hour - a.hour)),
    [monthAppts]
  );

  // ── Case history: trailing 6-month trend (one-time fetch, past months are static) ──
  const [trend, setTrend] = useState<Map<string, number>>(new Map());
  const months6 = useMemo(() => trailingMonths(6), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const start = `${months6[0]}-01`;
      const end   = `${months6[months6.length - 1]}-32`;
      // Query by date range only (no physioId in the query) — same pattern as
      // subscribeToAppointmentsByMonth, avoids needing a new composite index.
      const snap = await getDocs(query(
        collection(db, "appointments"),
        where("date", ">=", start),
        where("date", "<=", end)
      ));
      if (cancelled) return;
      const counts = new Map<string, number>();
      months6.forEach((m) => counts.set(m, 0));
      snap.docs.forEach((d) => {
        const data = d.data();
        if (data.physioId !== physio.uid || data.status !== "completed") return;
        const ym = String(data.date ?? "").slice(0, 7);
        if (counts.has(ym)) counts.set(ym, (counts.get(ym) ?? 0) + 1);
      });
      setTrend(counts);
    })();
    return () => { cancelled = true; };
  }, [physio.uid, months6]);

  const trendMax = Math.max(1, ...Array.from(trend.values()));
  const currentMonthCount = trend.get(currentYearMonth()) ?? completedCases.length;

  // ── Attendance: full calendar month (1st → last day), not "recent N" ─────────
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [attendanceMonth, setAttendanceMonth] = useState(currentYearMonth());
  const [showEntry, setShowEntry] = useState(false);
  const [entryDate, setEntryDate] = useState(todayStr());
  const [entryCheckIn, setEntryCheckIn] = useState("");
  const [entryCheckOut, setEntryCheckOut] = useState("");
  const [entrySaving, setEntrySaving] = useState(false);

  useEffect(() => {
    return subscribeToAttendanceForPhysio(physio.uid, setAttendance, () => {});
  }, [physio.uid]);

  const attendanceByDate = useMemo(() => {
    const map = new Map<string, AttendanceRecord>();
    attendance.forEach((a) => map.set(a.date, a));
    return map;
  }, [attendance]);

  // Every day of the selected month, filled in with a record where one exists —
  // a printable monthly sheet needs the gaps to show, not just the recorded days.
  const monthDays = useMemo(() => allDaysInMonth(attendanceMonth), [attendanceMonth]);
  const monthAttendanceRows = useMemo(
    () => monthDays.map((date) => ({ date, record: attendanceByDate.get(date) ?? null })),
    [monthDays, attendanceByDate]
  );

  const openEntry = (date: string) => {
    const existing = attendance.find((a) => a.date === date);
    setEntryDate(date);
    setEntryCheckIn(existing?.checkIn ?? "");
    setEntryCheckOut(existing?.checkOut ?? "");
    setShowEntry(true);
  };

  // Opening "Add / Edit Entry" defaults to today only if today is inside the
  // month currently being viewed — otherwise the select's value wouldn't
  // match any option in monthDays.
  const openEntryDefault = () => openEntry(monthDays.includes(todayStr()) ? todayStr() : monthDays[0]);

  const handleSaveAttendance = async () => {
    setEntrySaving(true);
    await upsertAttendance(
      physio.uid,
      `${physio.firstName} ${physio.lastName}`,
      entryDate,
      { checkIn: entryCheckIn, checkOut: entryCheckOut },
      user?.uid ?? ""
    );
    setEntrySaving(false);
    setShowEntry(false);
  };

  const isPastIncomplete = (date: string, record: AttendanceRecord | null) =>
    date < todayStr() && !!record?.checkIn && !record?.checkOut;

  const handlePrint = () => window.print();

  return (
    <div className="sf-page">
      <style>{`
        .sf-page { max-width: 880px; margin: 0 auto; padding: 4px 4px 60px; font-family: 'Outfit', sans-serif; }
        .sf-back { display: flex; align-items: center; gap: 6px; background: none; border: none; color: #2E8BC0; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; margin-bottom: 16px; padding: 0; }

        .sf-header { border-radius: 18px; padding: 22px 24px; background: linear-gradient(135deg, #0C3C60 0%, #2E8BC0 100%); color: #fff; margin-bottom: 24px; }
        .sf-header-top { display: flex; align-items: center; gap: 14px; }
        .sf-header-avatar { width: 52px; height: 52px; border-radius: 50%; flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-size: 18px; font-weight: 700; background: rgba(255,255,255,0.15); border: 2px solid rgba(255,255,255,0.3); }
        .sf-header-name { font-size: 19px; font-weight: 700; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .sf-rank-badge { font-size: 10.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; background: rgba(255,255,255,0.18); padding: 3px 10px; border-radius: 999px; }
        .sf-header-meta { margin-top: 14px; display: flex; flex-wrap: wrap; gap: 14px 20px; font-size: 12.5px; opacity: 0.88; }
        .sf-header-meta span { display: flex; align-items: center; gap: 6px; }

        .sf-section-title { font-size: 15px; font-weight: 700; color: #0C3C60; margin: 30px 0 4px; display: flex; align-items: center; gap: 6px; }
        .sf-section-sub { font-size: 12.5px; color: #9a9590; margin-bottom: 14px; }

        /* ── Case history: hero stat + trend ── */
        .sf-case-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; padding: 18px 20px; border-radius: 16px; background: #fff; border: 1.5px solid #e5e0d8; margin-bottom: 16px; flex-wrap: wrap; }
        .sf-hero-num { font-size: 48px; font-weight: 800; color: #0C3C60; line-height: 1; }
        .sf-hero-label { font-size: 12.5px; color: #7a7570; margin-top: 4px; }
        .sf-trend { display: flex; align-items: flex-end; gap: 6px; height: 56px; }
        .sf-trend-bar-wrap { display: flex; flex-direction: column; align-items: center; gap: 5px; }
        .sf-trend-bar { width: 18px; border-radius: 4px 4px 0 0; background: #d7e6f0; transition: height 0.3s ease; }
        .sf-trend-bar.current { background: linear-gradient(180deg, #F4C542, #E8A93B); }
        .sf-trend-month { font-size: 9.5px; color: #9a9590; font-weight: 600; }

        .sf-month-row { display: flex; align-items: center; justify-content: flex-end; margin-bottom: 10px; }
        .sf-month-input { padding: 8px 12px; border-radius: 10px; border: 1.5px solid #e5e0d8; font-family: 'Outfit', sans-serif; font-size: 13px; }

        .sf-case-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 0; border-bottom: 1px solid #f0ede8; font-size: 13px; }
        .sf-case-row:last-child { border-bottom: none; }
        .sf-case-date { color: #9a9590; font-size: 11.5px; flex-shrink: 0; }

        /* ── Attendance ── */
        .sf-attend-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 14px; }
        .sf-add-entry-btn { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 9px; border: none; background: #2E8BC0; color: #fff; font-family: 'Outfit', sans-serif; font-size: 12.5px; font-weight: 600; cursor: pointer; }
        .sf-print-btn { display: flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 9px; border: 1.5px solid #e5e0d8; background: #fff; color: #5a5550; font-family: 'Outfit', sans-serif; font-size: 12.5px; font-weight: 600; cursor: pointer; }

        .sf-attend-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 10px 0; border-bottom: 1px solid #f0ede8; font-size: 13px; }
        .sf-attend-row:last-child { border-bottom: none; }
        .sf-attend-row.clickable { cursor: pointer; }
        .sf-attend-dow { color: #9a9590; font-size: 11px; }
        .sf-attend-times { color: #3a3530; display: flex; align-items: center; gap: 6px; }
        .sf-attend-missing { color: #b91c1c; }
        .sf-warn-icon { color: #d97706; flex-shrink: 0; }

        .sf-empty { padding: 16px; border-radius: 12px; background: #f7f5f1; color: #9a9590; font-size: 13px; text-align: center; }

        /* ── Print-only monthly sheet ── */
        .print-only { display: none; }
        @media print {
          .no-print { display: none !important; }
          .print-only { display: block !important; }
          .sf-page { max-width: none; padding: 0; }
          .sf-print-header { margin-bottom: 18px; text-align: center; }
          .sf-print-clinic { font-size: 12px; letter-spacing: 0.06em; text-transform: uppercase; color: #5a5550; margin-bottom: 4px; }
          .sf-print-title { font-size: 18px; font-weight: 700; color: #000; margin-bottom: 4px; }
          .sf-print-sub { font-size: 12px; color: #333; }
          .sf-print-table { width: 100%; border-collapse: collapse; font-size: 12px; }
          .sf-print-table th, .sf-print-table td { border: 1px solid #999; padding: 6px 10px; text-align: left; }
          .sf-print-table th { background: #eee; font-weight: 700; }
        }

        /* ── Entry modal ── */
        .sf-modal-overlay { position: fixed; inset: 0; z-index: 1002; background: rgba(10,15,10,0.5); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 24px; }
        .sf-modal { background: #fff; border-radius: 18px; padding: 26px; max-width: 360px; width: 100%; }
        .sf-modal-title { font-size: 15px; font-weight: 700; color: #0C3C60; margin-bottom: 14px; }
        .sf-modal-label { display: block; font-size: 12px; font-weight: 600; color: #7a7570; margin: 12px 0 6px; }
        .sf-modal-input { width: 100%; padding: 10px 12px; border-radius: 10px; border: 1.5px solid #e5e0d8; font-family: 'Outfit', sans-serif; font-size: 14px; box-sizing: border-box; }
        .sf-modal-actions { display: flex; gap: 10px; margin-top: 20px; }
        .sf-modal-btn-cancel { flex: 1; padding: 10px; border-radius: 10px; border: 1.5px solid #e5e0d8; background: #fff; color: #5a5550; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; }
        .sf-modal-btn-save { flex: 1; padding: 10px; border-radius: 10px; border: none; background: #2E8BC0; color: #fff; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; }
        .sf-modal-btn-save:disabled { background: #e5e0d8; color: #9a9590; cursor: not-allowed; }
      `}</style>

      <div className="no-print">
      <button className="sf-back" onClick={onBack}><ArrowLeft size={15} /> Back to Staff</button>

      <div className="sf-header">
        <div className="sf-header-top">
          <div className="sf-header-avatar">{physio.firstName[0]}{physio.lastName[0]}</div>
          <div>
            <div className="sf-header-name">
              {physio.firstName} {physio.lastName}
              <span className="sf-rank-badge">{RANK_LABEL[physio.rank] ?? physio.rank}</span>
            </div>
          </div>
        </div>
        <div className="sf-header-meta">
          {physio.phone && <span><Phone size={13} /> {formatPhoneDisplay(physio.phone)}</span>}
          {physio.licenseNumber && <span><FileBadge size={13} /> License {physio.licenseNumber}</span>}
          {physio.clinicName && <span><Briefcase size={13} /> {physio.clinicName}</span>}
          {physio.specializations?.length > 0 && <span><Award size={13} /> {physio.specializations.join(", ")}</span>}
        </div>
      </div>

      <div className="sf-section-title"><Calendar size={16} /> Case History</div>
      <div className="sf-section-sub">Completed sessions, by month</div>

      <div className="sf-case-hero">
        <div>
          <div className="sf-hero-num">{currentMonthCount}</div>
          <div className="sf-hero-label">completed sessions this month</div>
        </div>
        <div className="sf-trend">
          {months6.map((m) => {
            const c = trend.get(m) ?? 0;
            const h = Math.round((c / trendMax) * 48) + (c > 0 ? 4 : 2);
            return (
              <div key={m} className="sf-trend-bar-wrap">
                <div className={`sf-trend-bar ${m === currentYearMonth() ? "current" : ""}`} style={{ height: `${h}px` }} title={`${c} in ${monthLabel(m)}`} />
                <div className="sf-trend-month">{monthLabel(m)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="sf-month-row">
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
      <div className="sf-section-sub">The full calendar month — tap any day to add or correct it.</div>

      <div className="sf-attend-toolbar">
        <input
          type="month" className="sf-month-input"
          value={attendanceMonth}
          onChange={(e) => setAttendanceMonth(e.target.value)}
        />
        <button className="sf-add-entry-btn" onClick={openEntryDefault}>
          <Plus size={14} /> Add / Edit Entry
        </button>
        <button className="sf-print-btn" onClick={handlePrint}>
          <Printer size={14} /> Print This Month
        </button>
      </div>

      {monthAttendanceRows.map(({ date, record }) => (
        <div key={date} className="sf-attend-row clickable" onClick={() => openEntry(date)}>
          <div>{fmtDateDisplay(date)} <span className="sf-attend-dow">{dayOfWeekShort(date)}</span></div>
          <div className="sf-attend-times">
            {isPastIncomplete(date, record) && <AlertTriangle size={13} className="sf-warn-icon" />}
            In: {record?.checkIn ? record.checkIn : <span className="sf-attend-missing">—</span>}
            {"  ·  "}
            Out: {record?.checkOut ? record.checkOut : <span className="sf-attend-missing">—</span>}
          </div>
        </div>
      ))}
      </div>

      {/* ── Print-only monthly sheet — hidden on screen, shown via @media print ── */}
      <div className="print-only sf-print-sheet">
        <div className="sf-print-header">
          <div className="sf-print-clinic">Physio+ Clinic</div>
          <div className="sf-print-title">Attendance Sheet — {monthYearLabel(attendanceMonth)}</div>
          <div className="sf-print-sub">
            {physio.firstName} {physio.lastName} · {RANK_LABEL[physio.rank] ?? physio.rank}
            {physio.licenseNumber ? ` · License ${physio.licenseNumber}` : ""}
          </div>
        </div>
        <table className="sf-print-table">
          <thead>
            <tr><th>Date</th><th>Day</th><th>Check-In</th><th>Check-Out</th></tr>
          </thead>
          <tbody>
            {monthAttendanceRows.map(({ date, record }) => (
              <tr key={date}>
                <td>{fmtDateDisplay(date)}</td>
                <td>{dayOfWeekShort(date)}</td>
                <td>{record?.checkIn || "—"}</td>
                <td>{record?.checkOut || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showEntry && (
        <div className="sf-modal-overlay no-print" onClick={(e) => { if (e.target === e.currentTarget) setShowEntry(false); }}>
          <div className="sf-modal">
            <div className="sf-modal-title">Attendance Entry</div>
            <label className="sf-modal-label">Date</label>
            <select className="sf-modal-input" value={entryDate} onChange={(e) => openEntry(e.target.value)}>
              {monthDays.map((d) => (
                <option key={d} value={d}>{fmtDateDisplay(d)} — {dayOfWeekShort(d)}</option>
              ))}
            </select>
            <label className="sf-modal-label">Check-In</label>
            <input type="time" className="sf-modal-input" value={entryCheckIn} onChange={(e) => setEntryCheckIn(e.target.value)} />
            <label className="sf-modal-label">Check-Out</label>
            <input type="time" className="sf-modal-input" value={entryCheckOut} onChange={(e) => setEntryCheckOut(e.target.value)} />
            <div className="sf-modal-actions">
              <button className="sf-modal-btn-cancel" onClick={() => setShowEntry(false)}>Cancel</button>
              <button className="sf-modal-btn-save" disabled={entrySaving} onClick={handleSaveAttendance}>
                {entrySaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
