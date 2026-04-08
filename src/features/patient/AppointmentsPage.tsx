// FILE: src/features/patient/AppointmentsPage.tsx
// Booking UI is fully wired to the shared `appointments` Firestore collection.
// • Real physio picker loaded from `physiotherapists` collection
// • Day picker generates real YYYY-MM-DD dates (next 5 days from today)
// • Slot availability checked live against existing appointments
// • bookPatientAppointment() enforces capacity before writing
// • Cancel deletes from `appointments`, immediately removing from clinic schedule
// All CSS classes and JSX structure are unchanged from the original design.

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "../../hooks/useAuth";
import {
  subscribeToPatientAppointments,
  subscribeToPatientAllAppointments,
  bookPatientAppointment,
  cancelPatientAppointment,
  subscribeToClinicSettings,
  fmtHour12,
  toDateStr,
  type Appointment as FSAppt,
  type ClinicSettings,
} from "../../services/appointmentService";
import {
  subscribeToPhysiotherapists,
  subscribeToPatient,
  type Physiotherapist,
  type Patient,
} from "../../services/patientService";
import type { PatientProfile } from "../../services/authService";
import { collection, query, where, onSnapshot as fsOnSnapshot } from "firebase/firestore";
import { db } from "../../firebase";
import { Check, Clock } from "lucide-react";
import { subscribeToPatientPackages, subscribeToSessionPrices, type SessionPackage } from "../../services/priceService";

// ─── Constants ────────────────────────────────────────────────────────────────

const SESSION_TYPES = [
  "Physiotherapy Session",
  "Recovery Session",
  "Assessment Session",
  "Rehabilitation Session",
  "Online Assessment Session",
];

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS  = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDateBadge(dateStr: string): { day: number; month: string } {
  const [, m, d] = dateStr.split("-");
  return { day: parseInt(d, 10), month: MONTH_NAMES[parseInt(m, 10) - 1] ?? "" };
}

/** Build the next `count` days starting from today */
function buildDays(count = 5): { label: string; dateStr: string }[] {
  const days: { label: string; dateStr: string }[] = [];
  const d = new Date();
  while (days.length < count) {
    days.push({ label: `${DAY_LABELS[d.getDay()]} ${d.getDate()}`, dateStr: toDateStr(d) });
    d.setDate(d.getDate() + 1);
  }
  return days;
}

const DAYS = buildDays(5);

const STATUS_META: Record<string, { color: string; bg: string; label: string }> = {
  confirmed: { color: "#2E8BC0", bg: "#D6EEF8", label: "Confirmed" },
  pending:   { color: "#92400e", bg: "#fef3c7", label: "Pending"   },
  cancelled: { color: "#991b1b", bg: "#fee2e2", label: "Cancelled" },
  completed: { color: "#374151", bg: "#f3f4f6", label: "Completed" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AppointmentsPage() {
  const { user } = useAuth();
  const patient = user as PatientProfile | null;

  // ── Booking form state ────────────────────────────────────────────────────
  const [selectedDay,    setSelectedDay]    = useState(DAYS[0].label);
  const [selectedSlot,   setSelectedSlot]   = useState<number | null>(null);
  const [sessionType,    setSessionType]    = useState(SESSION_TYPES[0]);
  const [selectedPhysio, setSelectedPhysio] = useState<Physiotherapist | null>(null);

  // ── Data state ────────────────────────────────────────────────────────────
  const [physios,        setPhysios]        = useState<Physiotherapist[]>([]);
  const [clinicSettings, setClinicSettings] = useState<ClinicSettings>({ maxPatientsPerHour: 4, openingHour: 12, closingHour: 24 });
  const [patientDoc,     setPatientDoc]     = useState<Patient | null>(null);

  // Derive the subtitle name:
  //   1. Senior physio assigned to this patient (seniorEditorName)
  //   2. Assigned physio by uid match
  //   3. First physio in list (fallback — likely clinic manager)
  const seniorName = patientDoc?.seniorEditorName
    ?? null;
  const assignedPhysio = physios.find((p) => p.uid === (patientDoc?.physioId ?? patient?.assignedPhysioId))
    ?? physios[0]
    ?? null;
  // Find clinic manager in physio list as default fallback
  const managerPhysio = physios.find((p) => p.firstName?.toLowerCase().includes("hassan") || p.lastName?.toLowerCase().includes("fayek"))
    ?? physios[0]
    ?? null;
  const defaultName = managerPhysio
    ? `Dr. ${managerPhysio.firstName} ${managerPhysio.lastName}`
    : "Dr. Hassan Fayek";

  const assignedPhysioName = seniorName
    ? seniorName
    : assignedPhysio
      ? `Dr. ${assignedPhysio.firstName} ${assignedPhysio.lastName}`
      : defaultName;
  const [slotCounts,     setSlotCounts]     = useState<Record<number, number>>({});
  const [upcoming,       setUpcoming]       = useState<FSAppt[]>([]);
  const [apptLoading,    setApptLoading]    = useState(true);
  const [history,        setHistory]        = useState<FSAppt[]>([]);
  const [histLoading,    setHistLoading]    = useState(true);

  // ── UI state ──────────────────────────────────────────────────────────────
  const [booking,           setBooking]           = useState(false);
  const [bookError,         setBookError]         = useState<string | null>(null);
  const [booked,            setBooked]            = useState(false);
  const [confirmedAppt,     setConfirmedAppt]     = useState<{ date: string; hour: number; sessionType: string; physioName: string } | null>(null);
  const [cancelTarget,      setCancelTarget]      = useState<FSAppt | null>(null);
  const [cancelling,        setCancelling]        = useState(false);
  const [cancelError,       setCancelError]       = useState<string | null>(null);

  // ── Package exhaustion check ───────────────────────────────────────────────
  const [packages,          setPackages]          = useState<SessionPackage[]>([]);
  const [packagedSessionIds, setPackagedSessionIds] = useState<Set<string>>(new Set());

  // ── Load clinic settings (realtime) ──────────────────────────────────────
  useEffect(() => subscribeToClinicSettings(setClinicSettings), []);

  // ── Load patient Firestore doc (for seniorEditorName + physioId) ──────────
  useEffect(() => {
    if (!patient?.uid) return;
    return subscribeToPatient(patient.uid, setPatientDoc, () => {});
  }, [patient?.uid]);

  // ── Load physio list (realtime) ───────────────────────────────────────────
  useEffect(() => {
    return subscribeToPhysiotherapists((data) => {
      setPhysios(data);
      // Don't auto-select — user must choose explicitly
    });
  }, []);

  // ── Load slot counts for selected day — realtime via onSnapshot ───────────
  const selectedDayObj = DAYS.find((d) => d.label === selectedDay) ?? DAYS[0];


  // Live slot availability — updates instantly when any appointment is added/removed
  useEffect(() => {
    setSelectedSlot(null);
    setBookError(null);
    const q = query(
      collection(db, "appointments"),
      where("date", "==", selectedDayObj.dateStr)
    );
    const unsub = fsOnSnapshot(q, (snap) => {
      const counts: Record<number, number> = {};
      snap.forEach((d) => {
        const h = (d.data().hour as number) ?? -1;
        if (h >= 0) counts[h] = (counts[h] ?? 0) + 1;
      });
      setSlotCounts(counts);
    });
    return unsub;
  }, [selectedDayObj.dateStr]);

  // ── Realtime upcoming appointments ───────────────────────────────────────
  useEffect(() => {
    if (!patient?.uid) return;
    setApptLoading(true);
    return subscribeToPatientAppointments(
      patient.uid,
      (data) => { setUpcoming(data); setApptLoading(false); },
      ()     => setApptLoading(false)
    );
  }, [patient?.uid]);

  // ── Realtime session history (all past appointments) ──────────────────────
  useEffect(() => {
    if (!patient?.uid) return;
    setHistLoading(true);
    return subscribeToPatientAllAppointments(
      patient.uid,
      (data) => {
        const today = toDateStr(new Date());
        setHistory(data.filter((a) => a.date < today));
        setHistLoading(false);
      },
      () => setHistLoading(false)
    );
  }, [patient?.uid]);

  // ── Subscribe to packages + session prices for exhaustion check ─────────
  useEffect(() => {
    if (!patient?.uid) return;
    return subscribeToPatientPackages(patient.uid, setPackages);
  }, [patient?.uid]);

  useEffect(() => {
    if (!patient?.uid) return;
    return subscribeToSessionPrices(patient.uid, (prices) => {
      setPackagedSessionIds(new Set(prices.filter((p) => p.packageId).map((p) => p.appointmentId)));
    });
  }, [patient?.uid]);

  // ── Live clock — re-filters upcoming list every minute ───────────────────
  const [currentHour, setCurrentHour] = useState(new Date().getHours());
  useEffect(() => {
    const id = setInterval(() => setCurrentHour(new Date().getHours()), 60_000);
    return () => clearInterval(id);
  }, []);

  const todayStr    = toDateStr(new Date());
  const upcomingNow = upcoming.filter(
    (a) => a.date !== todayStr || a.hour >= currentHour
  );

  const nextAppt = upcomingNow[0] ?? null;

  // ── Build slots from clinic hours ─────────────────────────────────────────
  const slots: { hour: number; label: string; available: boolean }[] = [];
  for (let h = clinicSettings.openingHour; h < clinicSettings.closingHour; h++) {
    slots.push({
      hour:      h,
      label:     fmtHour12(h),
      available: (slotCounts[h] ?? 0) < clinicSettings.maxPatientsPerHour,
    });
  }

  // ── Package exhaustion: find active package where sessionsUsed >= packageSize ─
  // sessionsUsed is incremented when a session price is linked to the package.
  // We also count upcoming (scheduled/in_progress) appointments already linked
  // to this package to prevent booking beyond the limit.
  const exhaustedPackage: SessionPackage | null = (() => {
    const active = packages.filter((p) => p.active);
    if (!active.length) return null;
    // Count upcoming appointments that consume from a package
    const upcomingPackaged = upcoming.filter((a) => packagedSessionIds.has(a.id)).length;
    for (const pkg of active) {
      if (pkg.sessionsUsed + upcomingPackaged >= pkg.packageSize) return pkg;
    }
    return null;
  })();

  // ── Book appointment ──────────────────────────────────────────────────────
  const handleBook = async () => {
    if (selectedSlot === null || !patient?.uid || !selectedPhysio) return;
    setBooking(true);
    setBookError(null);

    const patientName = `${patient.firstName ?? ""} ${patient.lastName ?? ""}`.trim()
      || (patient as PatientProfile & { displayName?: string }).displayName
      || "Patient";
    const physioName = `${selectedPhysio.firstName} ${selectedPhysio.lastName}`.trim();

    const result = await bookPatientAppointment({
      patientId:   patient.uid,
      patientName,
      physioId:    selectedPhysio.uid,
      physioName,
      date:        selectedDayObj.dateStr,
      hour:        selectedSlot,
      sessionType,
    });

    setBooking(false);

    if ("error" in result && result.error) {
      setBookError(result.error);
      return;
    }

    setSelectedSlot(null);
    setBooked(true);
    setTimeout(() => setBooked(false), 3500);

    // Show confirmation modal
    setConfirmedAppt({
      date:        selectedDayObj.dateStr,
      hour:        selectedSlot,
      sessionType,
      physioName:  `Dr. ${physioName}`,
    });
  };

  // ── Cancel appointment ────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!cancelTarget) return;
    setCancelling(true);
    setCancelError(null);
    try {
      const result = await cancelPatientAppointment(cancelTarget.id);
      if (result.error) {
        setCancelError(result.error);
        setCancelling(false);
        return;
      }
      setCancelling(false);
      setCancelTarget(null);
    } catch (err) {
      console.error("Cancel error:", err);
      setCancelError("Failed to cancel. Please try again.");
      setCancelling(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <>
      <style>{`
        .ap-title {
          font-family: 'Playfair Display', serif;
          font-size: 22px; font-weight: 500; color: #1a1a1a;
          letter-spacing: -0.02em; margin-bottom: 3px;
        }
        .ap-sub { font-size: 13px; color: #9a9590; margin-bottom: 16px; }

        .ap-book-card {
          background: #fff; border: 1px solid #e5e0d8;
          border-radius: 16px; padding: 16px; margin-bottom: 16px;
          box-shadow: 0 2px 12px rgba(0,0,0,0.04);
        }
        .ap-section-title {
          font-size: 11px; font-weight: 600; text-transform: uppercase;
          letter-spacing: 0.1em; color: #9a9590; margin-bottom: 12px;
        }

        .ap-day-row {
          display: grid; grid-template-columns: repeat(5, 1fr);
          gap: 6px; margin-bottom: 14px;
        }
        .ap-day-btn {
          padding: 10px 4px; border-radius: 10px; border: 1px solid #e5e0d8;
          background: #fff; text-align: center; cursor: pointer;
          transition: all 0.15s; font-family: 'Outfit', sans-serif; min-height: 54px;
        }
        .ap-day-btn:hover { border-color: #B3DEF0; }
        .ap-day-btn.selected { background: #2E8BC0; border-color: #2E8BC0; color: #fff; }
        .ap-day-label { font-size: 12px; font-weight: 600; }
        .ap-day-date  { font-size: 10px; color: #9a9590; margin-top: 1px; }
        .ap-day-btn.selected .ap-day-date { color: rgba(255,255,255,0.7); }

        .ap-slots-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
          gap: 6px; margin-bottom: 14px;
        }
        .ap-slot {
          padding: 11px 6px; border-radius: 10px; border: 1px solid #e5e0d8;
          text-align: center; font-size: 13px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; min-height: 44px;
          font-family: 'Outfit', sans-serif; color: #1a1a1a; background: #fff;
          display: flex; align-items: center; justify-content: center;
          user-select: none; -webkit-user-select: none;
        }
        .ap-slot:hover:not(.unavailable) { border-color: #5BC0BE; color: #2E8BC0; }
        .ap-slot.selected   { background: #2E8BC0; border-color: #2E8BC0; color: #fff; }
        .ap-slot.unavailable { background: #f5f3ef; color: #c0bbb4; cursor: not-allowed; text-decoration: line-through; }

        .ap-book-btn {
          display: flex; align-items: center; justify-content: center; gap: 8px;
          width: 100%; padding: 15px; border-radius: 12px; border: none;
          background: #2E8BC0; color: #fff; font-size: 15px; font-weight: 500;
          cursor: pointer; transition: all 0.2s; font-family: 'Outfit', sans-serif;
          min-height: 52px;
        }
        .ap-book-btn:hover    { background: #0C3C60; }
        .ap-book-btn:disabled { background: #e5e0d8; color: #c0bbb4; cursor: not-allowed; }

        .ap-success-toast {
          background: #D6EEF8; border: 1px solid #B3DEF0; color: #0C3C60;
          border-radius: 12px; padding: 14px 16px; font-size: 14px; font-weight: 500;
          display: flex; align-items: center; gap: 10px;
          margin-bottom: 14px; animation: slideIn 0.3s ease;
        }
        @keyframes slideIn { from { opacity: 0; transform: translateY(-8px); } to { opacity: 1; transform: translateY(0); } }

        .ap-book-error {
          background: #fff5f3; border: 1px solid #fecaca;
          border-radius: 10px; padding: 12px 14px;
          font-size: 13px; color: #b91c1c; margin-bottom: 12px;
        }
        .ap-pkg-exhausted {
          display: flex; align-items: flex-start; gap: 8px;
          background: #fefce8; border: 1px solid #fde68a;
          border-radius: 10px; padding: 12px 14px;
          font-size: 13px; color: #92400e; margin-bottom: 12px; line-height: 1.5;
        }

        .ap-select {
          width: 100%; padding: 12px 12px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 15px; color: #1a1a1a;
          margin-bottom: 14px; outline: none; cursor: pointer; transition: border-color 0.15s;
          min-height: 48px;
        }
        .ap-select:focus { border-color: #2E8BC0; background: #fff; }

        .ap-upcoming-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px; }
        .ap-appt-card {
          display: flex; align-items: flex-start; gap: 12px;
          padding: 14px 14px; background: #fff; border: 1px solid #e5e0d8;
          border-radius: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); transition: box-shadow 0.2s;
        }
        .ap-appt-card:hover    { box-shadow: 0 4px 20px rgba(0,0,0,0.08); }
        .ap-appt-card.cancelled { opacity: 0.5; }

        .ap-date-badge {
          width: 48px; height: 54px; border-radius: 10px;
          background: linear-gradient(145deg,#f0f7f4,#e0f0ea);
          border: 1px solid #B3DEF0;
          display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .ap-date-day   { font-size: 20px; font-weight: 700; color: #2E8BC0; font-family: 'Playfair Display', serif; line-height: 1; }
        .ap-date-month { font-size: 10px; text-transform: uppercase; color: #5BC0BE; letter-spacing: 0.05em; }

        .ap-appt-info { flex: 1; min-width: 0; }
        .ap-appt-type { font-size: 14px; font-weight: 600; color: #1a1a1a; margin-bottom: 3px; }
        .ap-appt-meta { display: flex; gap: 8px; flex-wrap: wrap; font-size: 12px; color: #9a9590; margin-bottom: 6px; }
        .ap-appt-meta-item { display: flex; align-items: center; gap: 4px; }

        .ap-appt-actions { display: flex; flex-direction: column; align-items: flex-end; gap: 6px; flex-shrink: 0; }
        .ap-status-chip  { font-size: 11px; font-weight: 500; padding: 3px 9px; border-radius: 100px; }
        .ap-action-row   { display: flex; gap: 5px; }
        .ap-action-btn {
          padding: 7px 12px; border-radius: 8px; border: 1px solid #e5e0d8;
          background: #fff; font-size: 12px; color: #5a5550; cursor: pointer;
          transition: all 0.15s; font-family: 'Outfit', sans-serif; min-height: 36px;
        }
        .ap-action-btn:hover         { border-color: #c0bbb4; }
        .ap-action-btn.danger        { color: #e07a5f; }
        .ap-action-btn.danger:hover  { border-color: #e07a5f; background: #fff5f3; }

        /* Booking confirmation modal */
        .ap-confirm-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.35);
          display: flex; align-items: flex-end; justify-content: center;
          z-index: 300; backdrop-filter: blur(3px);
          animation: modalIn 0.2s ease;
        }
        @media (min-width: 480px) {
          .ap-confirm-overlay { align-items: center; }
        }
        .ap-confirm-modal {
          background: #fff; border-radius: 22px 22px 0 0; padding: 28px 20px;
          width: 100%; max-width: 440px; box-shadow: 0 24px 80px rgba(0,0,0,0.18);
          text-align: center; animation: modalIn 0.25s cubic-bezier(0.16,1,0.3,1);
        }
        @media (min-width: 480px) {
          .ap-confirm-modal { border-radius: 22px; padding: 28px 24px; width: min(400px, 92vw); }
        }
        .ap-confirm-icon {
          width: 60px; height: 60px; border-radius: 50%;
          background: linear-gradient(135deg, #D6EEF8, #EAF5FC);
          border: 2px solid #B3DEF0;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 16px; font-size: 24px;
        }
        .ap-confirm-title {
          font-family: 'Playfair Display', serif;
          font-size: 22px; font-weight: 500; color: #1a1a1a;
          margin-bottom: 6px;
        }
        .ap-confirm-sub {
          font-size: 13px; color: #5a5550; line-height: 1.6; margin-bottom: 16px;
        }
        .ap-confirm-detail-row {
          display: flex; align-items: center; gap: 10px;
          background: #f5f3ef; border-radius: 10px; padding: 10px 14px;
          margin-bottom: 8px; text-align: left;
        }
        .ap-confirm-detail-label { font-size: 11px; color: #9a9590; flex-shrink: 0; width: 64px; }
        .ap-confirm-detail-val   { font-size: 14px; font-weight: 500; color: #1a1a1a; }
        .ap-confirm-close {
          margin-top: 16px; width: 100%; padding: 14px;
          border-radius: 12px; border: none;
          background: #2E8BC0; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 500;
          cursor: pointer; transition: background 0.15s; min-height: 52px;
        }
        .ap-confirm-close:hover { background: #0C3C60; }

        .ap-modal-overlay {
          position: fixed; inset: 0; background: rgba(0,0,0,0.3);
          display: flex; align-items: center; justify-content: center;
          z-index: 200; backdrop-filter: blur(2px);
        }
        .ap-modal {
          background: #fff; border-radius: 20px; padding: 28px;
          width: min(380px,90vw); box-shadow: 0 20px 60px rgba(0,0,0,0.15);
          animation: modalIn 0.2s ease;
        }
        @keyframes modalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
        .ap-modal-title   { font-family: 'Playfair Display', serif; font-size: 20px; margin-bottom: 8px; }
        .ap-modal-body    { font-size: 14px; color: #5a5550; line-height: 1.6; margin-bottom: 24px; }
        .ap-modal-actions { display: flex; gap: 10px; justify-content: flex-end; }
        .ap-modal-keep {
          padding: 9px 20px; border-radius: 10px;
          border: 1px solid #e5e0d8; background: #fff;
          font-size: 14px; cursor: pointer; font-family: 'Outfit', sans-serif; transition: background 0.15s;
        }
        .ap-modal-keep:hover { background: #f5f3ef; }
        .ap-modal-confirm {
          padding: 9px 20px; border-radius: 10px; border: none;
          background: #e07a5f; color: #fff; font-size: 14px;
          cursor: pointer; font-family: 'Outfit', sans-serif; transition: background 0.15s;
        }
        .ap-modal-confirm:hover     { background: #c0513a; }
        .ap-modal-confirm:disabled  { opacity: 0.6; cursor: not-allowed; }

        .ap-history-card {
          display: flex; align-items: center; gap: 14px;
          padding: 14px 18px; background: #fff;
          border: 1px solid #f0ede8; border-radius: 12px; margin-bottom: 8px;
        }
        .ap-hist-date {
          width: 44px; height: 46px; border-radius: 10px; background: #f5f3ef;
          display: flex; flex-direction: column; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .ap-hist-day   { font-size: 16px; font-weight: 700; color: #5a5550; line-height: 1; }
        .ap-hist-month { font-size: 9px; text-transform: uppercase; color: #9a9590; }
        .ap-hist-info  { flex: 1; }
        .ap-hist-type  { font-size: 14px; font-weight: 500; color: #1a1a1a; }
        .ap-hist-sub   { font-size: 12px; color: #9a9590; }

        @keyframes apShimmer { to { background-position: -200% 0; } }
      `}</style>

      <div className="ap-title">Appointments</div>
      <div className="ap-sub">Book sessions and manage your schedule{assignedPhysioName !== "Your Physiotherapist" ? ` with ${assignedPhysioName}` : ""}</div>

      {booked && (
        <div className="ap-success-toast">
          <Check size={18} strokeWidth={2.5} color="#2E8BC0" />
          Appointment booked! It now appears in the clinic schedule.
        </div>
      )}

      {/* ── Booking section ── */}
      <div className="ap-book-card">
        <div className="ap-section-title">Book a New Session</div>

        {/* Physiotherapist selector */}
        <div className="ap-section-title" style={{ marginBottom: 8 }}>Select Physiotherapist</div>
        <select
          className="ap-select"
          value={selectedPhysio?.uid ?? ""}
          onChange={(e) => {
            const found = physios.find((p) => p.uid === e.target.value);
            setSelectedPhysio(found ?? null);
          }}
          style={{ borderColor: !selectedPhysio && physios.length > 0 ? "#fca5a5" : undefined }}
        >
          {physios.length === 0
            ? <option value="">Loading physiotherapists…</option>
            : <option value="" disabled>— Select a physiotherapist —</option>
          }
          {physios.map((p) => <option key={p.uid} value={p.uid}>Dr. {p.firstName} {p.lastName}</option>)}
        </select>
        {!selectedPhysio && physios.length > 0 && (
          <div style={{ fontSize: 12.5, color: "#e07a5f", marginTop: -10, marginBottom: 14 }}>
            Please select a physiotherapist to continue.
          </div>
        )}

        {/* Session type selector */}
        <div className="ap-section-title" style={{ marginBottom: 8 }}>Session Type</div>
        <select className="ap-select" value={sessionType} onChange={(e) => setSessionType(e.target.value)}>
          {SESSION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>

        {/* Day picker — real YYYY-MM-DD dates */}
        <div className="ap-section-title" style={{ marginBottom: 10 }}>Select a Date</div>
        <div className="ap-day-row">
          {DAYS.map((d) => (
            <div key={d.label} className={`ap-day-btn ${selectedDay === d.label ? "selected" : ""}`}
              onClick={() => { setSelectedDay(d.label); setSelectedSlot(null); setBookError(null); }}
            >
              <div className="ap-day-label">{d.label}</div>
              <div className="ap-day-date">{d.dateStr.slice(5).replace("-", "/")}</div>
            </div>
          ))}
        </div>

        {/* Time slots — live availability */}
        <div className="ap-section-title" style={{ marginBottom: 10 }}>Available Times</div>
        <div className="ap-slots-grid">
          {slots.map((s) => (
            <div key={s.hour}
              className={`ap-slot ${!s.available ? "unavailable" : selectedSlot === s.hour ? "selected" : ""}`}
              onClick={() => { if (!s.available) return; setSelectedSlot(s.hour); setBookError(null); }}
            >
              {s.label}
            </div>
          ))}
        </div>

        {bookError && <div className="ap-book-error">{bookError}</div>}

        {exhaustedPackage && (
          <div className="ap-pkg-exhausted">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            Your {exhaustedPackage.packageSize}-session package is fully used ({exhaustedPackage.sessionsUsed}/{exhaustedPackage.packageSize} sessions). Please contact the clinic to renew or add a new package.
          </div>
        )}

        <button className="ap-book-btn" disabled={selectedSlot === null || booking || !selectedPhysio || physios.length === 0 || !!exhaustedPackage} onClick={handleBook}>
          {booking
            ? "Booking…"
            : selectedSlot !== null
              ? `Book — ${selectedDayObj.label}, ${fmtHour12(selectedSlot)}`
              : "Select a time slot to continue"
          }
        </button>
      </div>

      {/* ── Next Appointment banner ── */}
      {!apptLoading && nextAppt && (() => {
        const { day, month } = parseDateBadge(nextAppt.date);
        return (
          <div style={{ background: "linear-gradient(135deg,#2E8BC0,#0C3C60)", borderRadius: 18, padding: "18px 22px", marginBottom: 20, display: "flex", alignItems: "center", gap: 18, color: "#fff" }}>
            <div style={{ width: 52, height: 56, background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)", borderRadius: 12, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1 }}>{day}</div>
              <div style={{ fontSize: 10, textTransform: "uppercase", opacity: 0.75, letterSpacing: "0.05em" }}>{month}</div>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", opacity: 0.7, marginBottom: 3 }}>Next Appointment</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{fmtHour12(nextAppt.hour)} — {nextAppt.sessionType}</div>
              <div style={{ fontSize: 12.5, opacity: 0.8, marginTop: 2 }}>{nextAppt.physioName}</div>
            </div>
          </div>
        );
      })()}

      {/* ── Upcoming Appointments (Firestore) ── */}
      <div className="ap-section-title">Upcoming Appointments</div>
      <div className="ap-upcoming-list">
        {apptLoading ? (
          [1, 2].map((n) => (
            <div key={n} style={{ height: 80, borderRadius: 16, background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)", backgroundSize: "200% 100%", animation: "apShimmer 1.4s ease infinite" }} />
          ))
        ) : upcomingNow.length === 0 ? (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#9a9590", fontSize: 14 }}>No upcoming appointments scheduled.</div>
        ) : (
          upcomingNow.map((a) => {
            const { day, month } = parseDateBadge(a.date);
            return (
              <div key={a.id} className="ap-appt-card">
                <div className="ap-date-badge">
                  <div className="ap-date-day">{day}</div>
                  <div className="ap-date-month">{month}</div>
                </div>
                <div className="ap-appt-info">
                  <div className="ap-appt-type">{a.sessionType}</div>
                  <div className="ap-appt-meta">
                    <span className="ap-appt-meta-item">
                      <Clock size={12} strokeWidth={2} />
                      {fmtHour12(a.hour)}
                    </span>
                    <span>{a.physioName}</span>
                  </div>
                </div>
                <div className="ap-appt-actions">
                  <span className="ap-status-chip" style={{ background: STATUS_META.confirmed.bg, color: STATUS_META.confirmed.color }}>
                    {STATUS_META.confirmed.label}
                  </span>
                  <div className="ap-action-row">
                    <button className="ap-action-btn danger" onClick={() => { setCancelTarget(a); setCancelError(null); }}>Cancel</button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Session History (live from Firestore) ── */}
      <div className="ap-section-title">Session History</div>
      {histLoading ? (
        [1, 2, 3].map((n) => (
          <div key={n} style={{ height: 64, borderRadius: 12, marginBottom: 8, background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)", backgroundSize: "200% 100%", animation: "apShimmer 1.4s ease infinite" }} />
        ))
      ) : history.length === 0 ? (
        <div style={{ textAlign: "center", padding: "28px 0", color: "#9a9590", fontSize: 14 }}>No past sessions yet.</div>
      ) : (
        history.map((a) => {
          const [, m, d] = a.date.split("-");
          const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
          const statusKey = (a.status ?? "completed") as keyof typeof STATUS_META;
          const meta = STATUS_META[statusKey] ?? STATUS_META.completed;
          return (
            <div key={a.id} className="ap-history-card">
              <div className="ap-hist-date">
                <div className="ap-hist-day">{parseInt(d, 10)}</div>
                <div className="ap-hist-month">{MONTHS[parseInt(m, 10) - 1] ?? ""}</div>
              </div>
              <div className="ap-hist-info">
                <div className="ap-hist-type">{a.sessionType}</div>
                <div className="ap-hist-sub">{fmtHour12(a.hour)} · {a.physioName}</div>
              </div>
              <span className="ap-status-chip" style={{ background: meta.bg, color: meta.color }}>{meta.label}</span>
            </div>
          );
        })
      )}

      {/* ── Booking confirmation modal ── */}
      {confirmedAppt && createPortal(
        <div className="ap-confirm-overlay" onClick={() => setConfirmedAppt(null)}>
          <div className="ap-confirm-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ap-confirm-icon">✓</div>
            <div className="ap-confirm-title">Appointment Booked!</div>
            <div className="ap-confirm-sub">
              Your session has been confirmed and added to the clinic schedule.
            </div>
            {[
              { label: "Date",    val: (() => { const [,m,d] = confirmedAppt.date.split("-"); const MONTHS=["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"]; return `${parseInt(d,10)} ${MONTHS[parseInt(m,10)-1]??""}`; })() },
              { label: "Time",    val: fmtHour12(confirmedAppt.hour) },
              { label: "Session", val: confirmedAppt.sessionType },
              { label: "With",    val: confirmedAppt.physioName },
            ].map((row) => (
              <div key={row.label} className="ap-confirm-detail-row">
                <span className="ap-confirm-detail-label">{row.label}</span>
                <span className="ap-confirm-detail-val">{row.val}</span>
              </div>
            ))}
            <button className="ap-confirm-close" onClick={() => setConfirmedAppt(null)}>
              Done
            </button>
          </div>
        </div>,
        document.body
      )}

      {/* ── Cancel modal ── */}
      {cancelTarget && createPortal(
        <div className="ap-modal-overlay" onClick={() => !cancelling && setCancelTarget(null)}>
          <div className="ap-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ap-modal-title">Cancel Appointment?</div>
            <div className="ap-modal-body">
              {(() => {
                const { day, month } = parseDateBadge(cancelTarget.date);
                return `Cancel your ${cancelTarget.sessionType} on ${day} ${month} at ${fmtHour12(cancelTarget.hour)} with ${cancelTarget.physioName}? This will remove it from the clinic schedule immediately.`;
              })()}
            </div>
            {cancelError && (
              <div style={{ background: "#fee2e2", border: "1px solid #fca5a5", borderRadius: 10, padding: "10px 14px", fontSize: 13, color: "#b91c1c", marginBottom: 14 }}>
                {cancelError}
              </div>
            )}
            <div className="ap-modal-actions">
              <button className="ap-modal-keep" disabled={cancelling} onClick={() => { setCancelTarget(null); setCancelError(null); }}>Keep Appointment</button>
              <button className="ap-modal-confirm" disabled={cancelling} onClick={handleCancel}>
                {cancelling ? "Cancelling…" : "Yes, Cancel"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
