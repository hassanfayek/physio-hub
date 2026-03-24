import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import type { PatientProfile } from "../../services/authService";
import {
  collection, query, where, orderBy, onSnapshot,
  addDoc, serverTimestamp, type Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { Check, ChevronDown } from "lucide-react";

// ── Firestore types ───────────────────────────────────────────────────────────

interface Appointment {
  id:          string;
  patientId:   string;
  physioId:    string;
  physioName:  string;
  date:        string;   // YYYY-MM-DD
  hour:        number;
  sessionType: string;
}

interface SessionFeedback {
  id:            string;
  appointmentId: string;
  patientId:     string;
  physioId:      string;
  sessionDate:   string;
  painLevel:     number;
  difficulty:    string;
  energyLevel:   string;
  rating:        number;
  comments:      string;
  createdAt:     Timestamp | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const MONTH_NAMES = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function fmtDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${parseInt(d, 10)} ${MONTH_NAMES[parseInt(m, 10) - 1] ?? ""}`;
}

function fmtHour(h: number): string {
  return `${String(h).padStart(2,"0")}:00`;
}

const DIFFICULTY_OPTIONS = [
  { id: "too_easy",   label: "Too Easy",   emoji: "😴" },
  { id: "just_right", label: "Just Right", emoji: "✅" },
  { id: "hard",       label: "Challenging",emoji: "💪" },
  { id: "too_hard",   label: "Too Hard",   emoji: "😤" },
];

const ENERGY_OPTIONS = [
  { id: "low",      label: "Low",      emoji: "🪫" },
  { id: "moderate", label: "Moderate", emoji: "⚡" },
  { id: "high",     label: "High",     emoji: "🔋" },
];

const PAIN_DESCRIPTORS = ["None", "Mild", "Mild", "Mild-Mod", "Moderate", "Moderate", "Mod-Sev", "Severe", "Severe", "Very Sev.", "Worst"];
const PAIN_COLORS = [
  "#22c55e","#4ade80","#86efac","#fde047","#facc15",
  "#fb923c","#f97316","#ef4444","#dc2626","#b91c1c","#7f1d1d"
];

export default function FeedbackPage() {
  const { user } = useAuth();
  const patient = user as PatientProfile | null;

  // ── Form state ────────────────────────────────────────────────────────────
  const [painLevel,    setPainLevel]    = useState(3);
  const [difficulty,   setDifficulty]   = useState<string | null>(null);
  const [energy,       setEnergy]       = useState<string | null>(null);
  const [rating,       setRating]       = useState(0);
  const [hoverRating,  setHoverRating]  = useState(0);
  const [comment,      setComment]      = useState("");
  const [submitted,    setSubmitted]    = useState(false);
  const [showHistory,  setShowHistory]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [saveError,    setSaveError]    = useState<string | null>(null);

  // ── Session selection ─────────────────────────────────────────────────────
  const [selectedAppt,  setSelectedAppt]  = useState<Appointment | null>(null);

  // ── Firestore data ────────────────────────────────────────────────────────
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [feedbackList, setFeedbackList] = useState<SessionFeedback[]>([]);
  const [dataLoading,  setDataLoading]  = useState(true);

  // Load past appointments — with error handler to prevent crashes
  useEffect(() => {
    if (!patient?.uid) return;
    setDataLoading(true);
    const q = query(
      collection(db, "appointments"),
      where("patientId", "==", patient.uid),
      orderBy("date", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setAppointments(snap.docs.map((d) => ({
          id:          d.id,
          patientId:   (d.data().patientId   as string) ?? "",
          physioId:    (d.data().physioId    as string) ?? "",
          physioName:  (d.data().physioName  as string) ?? "",
          date:        (d.data().date        as string) ?? "",
          hour:        (d.data().hour        as number) ?? 0,
          sessionType: (d.data().sessionType as string) ?? "",
        })));
        setDataLoading(false);
      },
      (err) => {
        // Index missing or permission error — degrade gracefully
        console.warn("FeedbackPage appointments:", err.message);
        setDataLoading(false);
      }
    );
    return unsub;
  }, [patient?.uid]);

  // Load all feedback submitted by this patient (realtime)
  useEffect(() => {
    if (!patient?.uid) return;
    const q = query(
      collection(db, "sessionFeedback"),
      where("patientId", "==", patient.uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setFeedbackList(snap.docs.map((d) => ({
          id:            d.id,
          appointmentId: (d.data().appointmentId as string) ?? "",
          patientId:     (d.data().patientId     as string) ?? "",
          physioId:      (d.data().physioId      as string) ?? "",
          sessionDate:   (d.data().sessionDate   as string) ?? "",
          painLevel:     (d.data().painLevel     as number) ?? 0,
          difficulty:    (d.data().difficulty    as string) ?? "",
          energyLevel:   (d.data().energyLevel   as string) ?? "",
          rating:        (d.data().rating        as number) ?? 0,
          comments:      (d.data().comments      as string) ?? "",
          createdAt:     (d.data().createdAt     as Timestamp | null) ?? null,
        })));
      },
      (err) => {
        // Index missing or permission error — degrade gracefully
        console.warn("FeedbackPage sessionFeedback:", err.message);
      }
    );
    return unsub;
  }, [patient?.uid]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const submittedApptIds = new Set(feedbackList.map((f) => f.appointmentId));

  const resetForm = () => {
    setPainLevel(3);
    setDifficulty(null);
    setEnergy(null);
    setRating(0);
    setHoverRating(0);
    setComment("");
    setSaveError(null);
  };

  const handleSelectSession = (appt: Appointment) => {
    setSelectedAppt(appt);
    resetForm();
    setSubmitted(false);
  };

  // ── Save to Firestore ─────────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!difficulty || !energy || rating === 0 || !selectedAppt || !patient?.uid) return;
    setSaving(true);
    setSaveError(null);
    try {
      await addDoc(collection(db, "sessionFeedback"), {
        appointmentId: selectedAppt.id,
        patientId:     patient.uid,
        physioId:      selectedAppt.physioId,
        sessionDate:   selectedAppt.date,
        painLevel,
        difficulty,
        energyLevel:   energy,
        rating,
        comments:      comment.trim(),
        createdAt:     serverTimestamp(),
      });
      setSubmitted(true);
    } catch {
      setSaveError("Failed to save feedback. Please try again.");
    }
    setSaving(false);
  };

  if (submitted && selectedAppt) {
    return (
      <>
        <style>{`
          .fb-success {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            min-height: 60vh;
            text-align: center;
            animation: fadeSlide 0.4s ease both;
          }
          @keyframes fadeSlide {
            from { opacity: 0; transform: translateY(20px); }
            to   { opacity: 1; transform: translateY(0); }
          }
          .fb-success-icon {
            width: 90px; height: 90px;
            border-radius: 50%;
            background: linear-gradient(135deg, #d8f3dc, #b7e4c7);
            display: flex; align-items: center; justify-content: center;
            font-size: 40px;
            margin-bottom: 24px;
            box-shadow: 0 8px 32px rgba(45,106,79,0.2);
          }
          .fb-success-title {
            font-family: 'Playfair Display', serif;
            font-size: 28px;
            color: #1a1a1a;
            margin-bottom: 10px;
          }
          .fb-success-sub { font-size: 15px; color: #9a9590; max-width: 360px; line-height: 1.6; margin-bottom: 28px; }
          .fb-success-btn {
            padding: 12px 28px;
            border-radius: 12px;
            border: none;
            background: #2d6a4f;
            color: #fff;
            font-size: 15px;
            font-weight: 500;
            cursor: pointer;
            font-family: 'Outfit', sans-serif;
          }
        `}</style>
        <div className="fb-success">
          <div className="fb-success-icon">✓</div>
          <div className="fb-success-title">Thank you for your feedback.</div>
          <div className="fb-success-sub">
            Your feedback for <strong>{selectedAppt.sessionType}</strong> on {fmtDate(selectedAppt.date)} has been recorded.
            {selectedAppt.physioName ? ` ${selectedAppt.physioName} will review it before your next session.` : ""}
          </div>
          <button className="fb-success-btn" onClick={() => { setSubmitted(false); setSelectedAppt(null); }}>
            Back to Sessions
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <style>{`
        .fb-title {
          font-family: 'Playfair Display', serif;
          font-size: 22px;
          font-weight: 500;
          color: #1a1a1a;
          letter-spacing: -0.02em;
          margin-bottom: 3px;
        }
        .fb-sub { font-size: 13px; color: #9a9590; margin-bottom: 16px; }

        .fb-session-banner {
          display: flex;
          align-items: center;
          gap: 12px;
          background: linear-gradient(135deg, #f0f7f4, #e6f4ed);
          border: 1px solid #b7e4c7;
          border-radius: 14px;
          padding: 14px 16px;
          margin-bottom: 16px;
        }
        .fb-session-icon {
          width: 44px; height: 44px;
          border-radius: 10px;
          background: #2d6a4f;
          display: flex; align-items: center; justify-content: center;
          color: #fff;
          font-size: 20px;
          flex-shrink: 0;
        }
        .fb-session-label { font-size: 12px; color: #52b788; text-transform: uppercase; letter-spacing: 0.08em; font-weight: 600; margin-bottom: 2px; }
        .fb-session-name { font-size: 15px; font-weight: 600; color: #1b4332; }
        .fb-session-meta { font-size: 13px; color: #52b788; }

        /* Section card */
        .fb-section {
          background: #fff;
          border: 1px solid #e5e0d8;
          border-radius: 14px;
          padding: 16px;
          margin-bottom: 12px;
        }
        .fb-section-title {
          font-size: 15px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 3px;
        }
        .fb-section-sub { font-size: 13px; color: #9a9590; margin-bottom: 14px; }

        /* Pain slider */
        .fb-pain-display {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 12px;
        }
        .fb-pain-badge {
          width: 64px; height: 64px;
          border-radius: 50%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          border: 3px solid;
          transition: all 0.3s;
        }
        .fb-pain-num { font-size: 22px; font-weight: 700; font-family: 'Playfair Display', serif; line-height: 1; }
        .fb-pain-desc { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; margin-top: 2px; }
        .fb-pain-track { flex: 1; }

        .fb-slider {
          width: 100%;
          -webkit-appearance: none;
          height: 8px;
          border-radius: 8px;
          outline: none;
          cursor: pointer;
          margin-bottom: 8px;
        }
        .fb-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 24px; height: 24px;
          border-radius: 50%;
          background: #fff;
          border: 3px solid currentColor;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          cursor: pointer;
          transition: transform 0.15s;
        }
        .fb-slider::-webkit-slider-thumb:hover { transform: scale(1.2); }

        .fb-scale-ticks {
          display: flex;
          justify-content: space-between;
          font-size: 10px;
          color: #c0bbb4;
          padding: 0 2px;
        }

        /* Options grid */
        .fb-options-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        @media (min-width: 400px) {
          .fb-options-grid { grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); }
        }
        .fb-option {
          padding: 14px 8px;
          border-radius: 12px;
          border: 1.5px solid #e5e0d8;
          background: #fff;
          text-align: center;
          cursor: pointer;
          transition: all 0.15s;
          font-family: 'Outfit', sans-serif;
          min-height: 80px;
          display: flex; flex-direction: column; align-items: center; justify-content: center;
        }
        .fb-option:hover { border-color: #b7e4c7; }
        .fb-option.selected {
          background: #f0f7f4;
          border-color: #52b788;
          box-shadow: 0 0 0 3px rgba(82,183,136,0.15);
        }
        .fb-option-emoji { font-size: 24px; display: block; margin-bottom: 6px; }
        .fb-option-label { font-size: 13px; font-weight: 500; color: #1a1a1a; }
        .fb-option.selected .fb-option-label { color: #2d6a4f; }

        /* Star rating */
        .fb-stars {
          display: flex;
          gap: 10px;
          margin-top: 4px;
        }
        .fb-star {
          cursor: pointer;
          transition: transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1);
          font-size: 36px;
          filter: grayscale(1) opacity(0.3);
        }
        .fb-star.lit { filter: none; }
        .fb-star:hover { transform: scale(1.3); filter: none; }

        .fb-star-labels {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: #c0bbb4;
          margin-top: 8px;
          max-width: 250px;
        }

        /* Textarea */
        .fb-textarea {
          width: 100%;
          background: #fafaf8;
          border: 1.5px solid #e5e0d8;
          border-radius: 12px;
          padding: 16px;
          color: #1a1a1a;
          font-family: 'Outfit', sans-serif;
          font-size: 14px;
          resize: vertical;
          min-height: 110px;
          outline: none;
          transition: border-color 0.2s;
          line-height: 1.6;
        }
        .fb-textarea:focus { border-color: #52b788; background: #fff; }
        .fb-textarea::placeholder { color: #c0bbb4; }
        .fb-char-count { font-size: 11px; color: #c0bbb4; text-align: right; margin-top: 4px; }

        /* Submit */
        .fb-submit-row {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-top: 4px;
        }
        .fb-required-note { font-size: 12px; color: #c0bbb4; }
        .fb-submit-btn {
          width: 100%; padding: 15px 20px;
          border-radius: 12px;
          border: none;
          background: #2d6a4f;
          color: #fff;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          font-family: 'Outfit', sans-serif;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          min-height: 52px;
        }
        .fb-submit-btn:hover { background: #1b4332; box-shadow: 0 4px 16px rgba(45,106,79,0.25); }
        .fb-submit-btn:disabled { background: #e5e0d8; color: #c0bbb4; cursor: not-allowed; box-shadow: none; }

        /* History */
        .fb-history-toggle {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: #fff;
          border: 1px solid #e5e0d8;
          border-radius: 14px;
          cursor: pointer;
          margin-bottom: 12px;
          transition: background 0.15s;
        }
        .fb-history-toggle:hover { background: #fafaf8; }
        .fb-history-label { font-size: 14px; font-weight: 600; color: #1a1a1a; }
        .fb-hist-card {
          background: #fff;
          border: 1px solid #f0ede8;
          border-radius: 12px;
          padding: 16px 18px;
          margin-bottom: 8px;
          animation: fadeSlide2 0.2s ease both;
        }
        @keyframes fadeSlide2 { from { opacity:0; transform: translateY(-4px); } to { opacity:1; transform: translateY(0); } }
        .fb-hist-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 8px;
        }
        .fb-hist-session { font-size: 13px; font-weight: 600; color: #2d6a4f; }
        .fb-hist-date { font-size: 12px; color: #9a9590; }
        .fb-hist-chips { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 8px; }
        .fb-hist-chip {
          font-size: 11.5px; padding: 3px 10px;
          border-radius: 100px; background: #f5f3ef;
          color: #5a5550; border: 1px solid #e5e0d8;
        }
        .fb-hist-comment { font-size: 13px; color: #5a5550; font-style: italic; line-height: 1.5; }
        .fb-hist-stars { color: #fbbf24; font-size: 13px; }

        /* ── SESSION LIST ── */
        .fb-session-list-title {
          font-size: 13px; font-weight: 600; color: #9a9590;
          text-transform: uppercase; letter-spacing: 0.08em;
          margin-bottom: 12px;
        }
        .fb-session-item {
          display: flex; align-items: center; gap: 14px;
          background: #fff; border: 1.5px solid #e5e0d8;
          border-radius: 14px; padding: 16px 18px;
          margin-bottom: 8px; cursor: pointer;
          transition: all 0.15s;
        }
        .fb-session-item:hover { border-color: #B3DEF0; box-shadow: 0 2px 12px rgba(46,139,192,0.08); }
        .fb-session-item.has-feedback { opacity: 0.65; cursor: default; }
        .fb-session-item.has-feedback:hover { border-color: #e5e0d8; box-shadow: none; }
        .fb-session-item-icon {
          width: 42px; height: 42px; flex-shrink: 0;
          border-radius: 10px; background: #EAF5FC;
          display: flex; align-items: center; justify-content: center;
          font-size: 18px;
        }
        .fb-session-item-info { flex: 1; }
        .fb-session-item-type { font-size: 14px; font-weight: 600; color: #1a1a1a; margin-bottom: 3px; }
        .fb-session-item-meta { font-size: 12.5px; color: #9a9590; }
        .fb-session-item-badge {
          font-size: 11.5px; font-weight: 600; padding: 3px 10px;
          border-radius: 100px; white-space: nowrap;
        }
        .fb-session-item-badge.done { background: #d8f3dc; color: #1b4332; }
        .fb-session-item-badge.pending { background: #D6EEF8; color: #0C3C60; }
        .fb-skel {
          border-radius: 14px; height: 74px;
          background: linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%);
          background-size: 200% 100%; animation: fbShimmer 1.4s ease infinite;
          margin-bottom: 8px;
        }
        @keyframes fbShimmer { to { background-position: -200% 0; } }
        .fb-save-error {
          font-size: 13px; color: #b91c1c;
          margin-top: 8px;
        }
      `}</style>

      <div className="fb-title">Session Feedback</div>
      <div className="fb-sub">
        {selectedAppt
          ? `Providing feedback for ${selectedAppt.sessionType} — ${fmtDate(selectedAppt.date)}`
          : "Select a session to leave feedback"}
      </div>

      {/* Auth not ready yet — avoids flicker */}
      {!patient?.uid && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "#9a9590", fontSize: 14 }}>
          Loading…
        </div>
      )}

      {/* ── Session list (shown when no session selected) ── */}
      {patient?.uid && !selectedAppt && (
        <div style={{ marginBottom: 28 }}>
          <div className="fb-session-list-title">Session History</div>
          {dataLoading ? (
            <><div className="fb-skel" /><div className="fb-skel" /><div className="fb-skel" /></>
          ) : appointments.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", color: "#9a9590", fontSize: 14 }}>
              No sessions found. Sessions will appear here after your first appointment.
            </div>
          ) : (
            appointments.map((appt) => {
              const done = submittedApptIds.has(appt.id);
              return (
                <div
                  key={appt.id}
                  className={`fb-session-item${done ? " has-feedback" : ""}`}
                  onClick={() => !done && handleSelectSession(appt)}
                  title={done ? "Feedback already submitted" : `Leave feedback for ${appt.sessionType}`}
                >
                  <div className="fb-session-item-icon">📋</div>
                  <div className="fb-session-item-info">
                    <div className="fb-session-item-type">{appt.sessionType}</div>
                    <div className="fb-session-item-meta">
                      {fmtDate(appt.date)} — {fmtHour(appt.hour)}
                      {appt.physioName ? ` · ${appt.physioName}` : ""}
                    </div>
                  </div>
                  <span className={`fb-session-item-badge ${done ? "done" : "pending"}`}>
                    {done ? "✓ Submitted" : "Leave Feedback"}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* ── Session banner + form (shown when session is selected) ── */}
      {patient?.uid && selectedAppt && (
        <>
          <div className="fb-session-banner">
            <div className="fb-session-icon">📋</div>
            <div>
              <div className="fb-session-label">Leaving Feedback For</div>
              <div className="fb-session-name">{selectedAppt.sessionType}</div>
              <div className="fb-session-meta">
                {fmtDate(selectedAppt.date)} — {fmtHour(selectedAppt.hour)}
                {selectedAppt.physioName ? ` · ${selectedAppt.physioName}` : ""}
              </div>
            </div>
            <button
              onClick={() => { setSelectedAppt(null); resetForm(); }}
              style={{ marginLeft: "auto", background: "none", border: "1px solid #b7e4c7", borderRadius: 8, padding: "6px 14px", fontSize: 13, color: "#2d6a4f", cursor: "pointer", fontFamily: "'Outfit', sans-serif" }}
            >
              ← Back
            </button>
          </div>

      {/* 1. Pain Level */}
      <div className="fb-section">
        <div className="fb-section-title">Pain Level</div>
        <div className="fb-section-sub">Rate your pain during or after today's session (0 = no pain, 10 = worst imaginable)</div>

        <div className="fb-pain-display">
          <div
            className="fb-pain-badge"
            style={{
              color: PAIN_COLORS[painLevel],
              borderColor: PAIN_COLORS[painLevel],
              background: `${PAIN_COLORS[painLevel]}15`,
            }}
          >
            <span className="fb-pain-num" style={{ color: PAIN_COLORS[painLevel] }}>{painLevel}</span>
            <span className="fb-pain-desc" style={{ color: PAIN_COLORS[painLevel] }}>{PAIN_DESCRIPTORS[painLevel]}</span>
          </div>

          <div className="fb-pain-track">
            <input
              type="range" min={0} max={10}
              value={painLevel}
              onChange={(e) => setPainLevel(Number(e.target.value))}
              className="fb-slider"
              style={{
                background: `linear-gradient(to right, ${PAIN_COLORS[painLevel]} 0%, ${PAIN_COLORS[painLevel]} ${painLevel * 10}%, #e5e0d8 ${painLevel * 10}%, #e5e0d8 100%)`,
                color: PAIN_COLORS[painLevel],
              }}
            />
            <div className="fb-scale-ticks">
              {Array.from({ length: 11 }, (_, i) => <span key={i}>{i}</span>)}
            </div>
          </div>
        </div>
      </div>

      {/* 2. Difficulty */}
      <div className="fb-section">
        <div className="fb-section-title">Exercise Difficulty</div>
        <div className="fb-section-sub">How did the exercises feel overall during this session?</div>
        <div className="fb-options-grid">
          {DIFFICULTY_OPTIONS.map((o) => (
            <div
              key={o.id}
              className={`fb-option ${difficulty === o.id ? "selected" : ""}`}
              onClick={() => setDifficulty(o.id)}
            >
              <span className="fb-option-emoji">{o.emoji}</span>
              <span className="fb-option-label">{o.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 3. Energy */}
      <div className="fb-section">
        <div className="fb-section-title">Energy Level</div>
        <div className="fb-section-sub">How was your energy coming into today's session?</div>
        <div className="fb-options-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
          {ENERGY_OPTIONS.map((o) => (
            <div
              key={o.id}
              className={`fb-option ${energy === o.id ? "selected" : ""}`}
              onClick={() => setEnergy(o.id)}
            >
              <span className="fb-option-emoji">{o.emoji}</span>
              <span className="fb-option-label">{o.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* 4. Star Rating */}
      <div className="fb-section">
        <div className="fb-section-title">Overall Session Rating</div>
        <div className="fb-section-sub">How would you rate today's session overall?</div>
        <div className="fb-stars">
          {[1, 2, 3, 4, 5].map((s) => (
            <span
              key={s}
              className={`fb-star ${(hoverRating || rating) >= s ? "lit" : ""}`}
              onClick={() => setRating(s)}
              onMouseEnter={() => setHoverRating(s)}
              onMouseLeave={() => setHoverRating(0)}
            >⭐</span>
          ))}
        </div>
        {rating > 0 && (
          <div style={{ marginTop: 8, fontSize: 13, color: "#52b788", fontWeight: 500 }}>
            {["", "Poor", "Fair", "Good", "Very Good", "Excellent"][rating]} session
          </div>
        )}
      </div>

      {/* 5. Comments */}
      <div className="fb-section">
        <div className="fb-section-title">Additional Comments</div>
        <div className="fb-section-sub">Share any observations, concerns, or highlights — optional but very helpful for Dr. Malik</div>
        <textarea
          className="fb-textarea"
          placeholder="e.g. The quad sets felt easier than last week. I noticed some swelling after the step-ups. I have a question about the ankle pumps frequency..."
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          maxLength={500}
        />
        <div className="fb-char-count">{comment.length}/500</div>
      </div>

        {/* Submit */}
        <div className="fb-submit-row">
          <div className="fb-required-note">
            {!difficulty || !energy || rating === 0
              ? "Please complete: difficulty, energy, and rating to submit"
              : "All required fields completed ✓"}
          </div>
          <button
            className="fb-submit-btn"
            disabled={!difficulty || !energy || rating === 0 || saving}
            onClick={handleSubmit}
          >
            <Check size={16} strokeWidth={2.5} />
            {saving ? "Saving…" : "Submit Feedback"}
          </button>
        </div>
        {saveError && <div className="fb-save-error">{saveError}</div>}
        </>
      )}

      {/* Previous feedback — from Firestore */}
      <div style={{ marginTop: 32 }}>
        <div className="fb-history-toggle" onClick={() => setShowHistory(!showHistory)}>
          <span className="fb-history-label">Previous Feedback ({feedbackList.length} session{feedbackList.length !== 1 ? "s" : ""})</span>
          <ChevronDown
            size={18} strokeWidth={2} color="#9a9590"
            style={{ transform: showHistory ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}
          />
        </div>

        {showHistory && (
          feedbackList.length === 0 ? (
            <div style={{ textAlign: "center", padding: "24px 0", color: "#9a9590", fontSize: 13 }}>
              No feedback submitted yet.
            </div>
          ) : (
            feedbackList.map((f) => (
              <div key={f.id} className="fb-hist-card">
                <div className="fb-hist-header">
                  <span className="fb-hist-session">{f.sessionDate ? fmtDate(f.sessionDate) : "—"}</span>
                  <span className="fb-hist-date">{f.sessionDate}</span>
                </div>
                <div className="fb-hist-chips">
                  <span className="fb-hist-chip">Pain: {f.painLevel}/10</span>
                  <span className="fb-hist-chip">{f.difficulty}</span>
                  <span className="fb-hist-chip">{f.energyLevel} energy</span>
                  <span className="fb-hist-stars">{"⭐".repeat(Math.max(0, Math.min(5, f.rating ?? 0)))}</span>
                </div>
                {f.comments && <div className="fb-hist-comment">"{f.comments}"</div>}
              </div>
            ))
          )
        )}
      </div>
    </>
  );
}
