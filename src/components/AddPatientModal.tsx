// FILE: src/components/AddPatientModal.tsx

import { useState, useEffect, type FormEvent, type ChangeEvent } from "react";
import { createPatient, type CreatePatientPayload, type Physiotherapist } from "../services/patientService";
import type { Patient } from "../services/patientService";
import { X, AlertCircle, Eye, EyeOff, ArrowLeft, ArrowRight } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddPatientModalProps {
  physioId:  string;
  physios?:  Physiotherapist[]; // clinic manager passes full list for assignment
  onClose:   () => void;
  onCreated: (patient: Patient) => void;
}

type FieldKey = "firstName" | "lastName" | "email" | "condition" | "password";

interface FormState {
  firstName:       string;
  lastName:        string;
  email:           string;
  condition:       string;
  password:        string;
  assignedPhysioId: string;
}

const INITIAL: FormState = {
  firstName:        "",
  lastName:         "",
  email:            "",
  condition:        "",
  password:         "",
  assignedPhysioId: "",
};

const CONDITIONS = [
  "ACL / Knee Injury",
  "Lower Back Pain",
  "Shoulder Impingement",
  "Rotator Cuff Tear",
  "Cervical Spondylosis",
  "Hip Replacement — Post-Op",
  "Ankle Sprain",
  "Achilles Tendinopathy",
  "Plantar Fasciitis",
  "Sciatica",
  "Post-Stroke Rehabilitation",
  "Other",
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddPatientModal({
  physioId,
  physios = [],
  onClose,
  onCreated,
}: AddPatientModalProps) {
  const [form,    setForm]    = useState<FormState>({ ...INITIAL, assignedPhysioId: physioId });
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [showPw,  setShowPw]  = useState(false);
  const [step,    setStep]    = useState<1 | 2>(1);

  // isManager = caller passed a physios list and physioId is not a real physio uid
  const isManager = physios.length > 0;

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const set = (k: FieldKey) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError(null);
  };

  const setPhysio = (e: ChangeEvent<HTMLSelectElement>) => {
    setForm((f) => ({ ...f, assignedPhysioId: e.target.value }));
    setError(null);
  };

  const step1Valid = form.firstName.trim() && form.lastName.trim() && form.email.trim();
  const step2Valid = form.condition && form.password.length >= 6;
  const isValid    = step === 1 ? step1Valid : step2Valid;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (step === 1) { setStep(2); return; }

    setLoading(true);
    setError(null);

    const payload: CreatePatientPayload = {
      firstName: form.firstName.trim(),
      lastName:  form.lastName.trim(),
      email:     form.email.trim(),
      condition: form.condition,
      password:  form.password,
      // Use the selected physio if manager, otherwise use the prop physioId
      physioId:  isManager ? form.assignedPhysioId : physioId,
    };

    const result = await createPatient(payload);
    setLoading(false);

    if ("error" in result) {
      setError(result.error ?? null);
      setStep(1);
      return;
    }

    onCreated(result.patient);
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;500&family=Outfit:wght@300;400;500;600&display=swap');

        .apm-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(10,15,10,0.55);
          backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          animation: apmOverlayIn 0.2s ease both;
        }
        @keyframes apmOverlayIn { from { opacity:0; } to { opacity:1; } }

        .apm-modal {
          background: #fff; border-radius: 24px;
          width: 100%; max-width: 480px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04);
          animation: apmModalIn 0.25s cubic-bezier(0.16,1,0.3,1) both;
          overflow: hidden; font-family: 'Outfit', sans-serif;
        }
        @keyframes apmModalIn {
          from { opacity:0; transform: scale(0.94) translateY(16px); }
          to   { opacity:1; transform: scale(1) translateY(0); }
        }

        .apm-header {
          padding: 24px 28px 0;
          display: flex; align-items: flex-start; justify-content: space-between;
          margin-bottom: 20px;
        }
        .apm-step-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 3px 10px; border-radius: 100px;
          background: #d8f3dc; color: #1b4332;
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 8px;
        }
        .apm-title {
          font-family: 'Playfair Display', serif;
          font-size: 24px; font-weight: 500; color: #1a1a1a;
          letter-spacing: -0.02em; margin-bottom: 2px;
        }
        .apm-subtitle { font-size: 13px; color: #9a9590; }

        .apm-close {
          width: 34px; height: 34px; border-radius: 50%;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #9a9590; transition: all 0.15s;
          flex-shrink: 0; margin-top: 2px;
        }
        .apm-close:hover { background: #f0ede8; color: #1a1a1a; border-color: #c0bbb4; }

        .apm-progress {
          display: flex; align-items: center;
          padding: 0 28px; margin-bottom: 24px;
        }
        .apm-prog-step { display: flex; align-items: center; gap: 8px; }
        .apm-prog-dot {
          width: 28px; height: 28px; border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 12px; font-weight: 600; border: 2px solid;
          transition: all 0.2s; flex-shrink: 0;
        }
        .apm-prog-dot.done   { background: #2d6a4f; border-color: #2d6a4f; color: #fff; }
        .apm-prog-dot.active { background: #fff; border-color: #2d6a4f; color: #2d6a4f; }
        .apm-prog-dot.idle   { background: #fff; border-color: #e5e0d8; color: #c0bbb4; }
        .apm-prog-label { font-size: 13px; font-weight: 500; color: #c0bbb4; }
        .apm-prog-label.active { color: #1a1a1a; }
        .apm-prog-line {
          flex: 1; height: 2px; background: #e5e0d8; margin: 0 12px; border-radius: 2px;
        }
        .apm-prog-line.done { background: #2d6a4f; }

        .apm-body { padding: 0 28px; display: flex; flex-direction: column; gap: 16px; }

        .apm-error {
          display: flex; align-items: flex-start; gap: 8px;
          background: #fff5f3; border: 1px solid #fecaca;
          border-radius: 10px; padding: 12px 14px;
          font-size: 13.5px; color: #b91c1c;
        }

        .apm-info-box {
          display: flex; align-items: flex-start; gap: 10px;
          background: #f0fdf4; border: 1px solid #bbf7d0;
          border-radius: 10px; padding: 12px 14px;
          font-size: 13px; color: #166534; line-height: 1.5;
        }

        .apm-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .apm-field { display: flex; flex-direction: column; gap: 6px; }
        .apm-label {
          font-size: 12px; font-weight: 600; color: #5a5550;
          text-transform: uppercase; letter-spacing: 0.07em;
        }
        .apm-input {
          font-family: 'Outfit', sans-serif;
          padding: 10px 14px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-size: 14px; color: #1a1a1a; outline: none;
          transition: border-color 0.15s;
          width: 100%;
        }
        .apm-input:focus { border-color: #2d6a4f; background: #fff; box-shadow: 0 0 0 3px rgba(45,106,79,0.08); }

        .apm-select-wrap { position: relative; }
        .apm-select {
          font-family: 'Outfit', sans-serif;
          width: 100%; padding: 10px 14px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-size: 14px; color: #1a1a1a; outline: none;
          appearance: none; -webkit-appearance: none;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239a9590' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center;
          cursor: pointer; transition: border-color 0.15s;
        }
        .apm-select:focus { border-color: #2d6a4f; background-color: #fff; box-shadow: 0 0 0 3px rgba(45,106,79,0.08); }

        .apm-pw-wrap { position: relative; }
        .apm-pw-btn {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #9a9590;
          display: flex; align-items: center; padding: 4px;
        }
        .apm-pw-hint { font-size: 12px; color: #9a9590; }

        .apm-footer {
          padding: 20px 28px 24px;
          display: flex; align-items: center; gap: 10px;
          border-top: 1px solid #f5f3ef; margin-top: 20px;
        }

        .apm-cancel {
          padding: 11px 16px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          color: #5a5550; cursor: pointer; transition: all 0.15s;
        }
        .apm-cancel:hover { background: #f0ede8; }

        .apm-back {
          padding: 11px 16px; border-radius: 10px;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          color: #5a5550; cursor: pointer;
          display: flex; align-items: center; gap: 6px; transition: all 0.15s;
        }
        .apm-back:hover { background: #f0ede8; }

        .apm-submit {
          flex: 1; padding: 12px; border-radius: 10px; border: none;
          background: #2d6a4f; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14.5px; font-weight: 500;
          cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .apm-submit:hover:not(:disabled) { background: #1b4332; box-shadow: 0 4px 16px rgba(45,106,79,0.25); }
        .apm-submit:disabled { opacity: 0.5; cursor: not-allowed; }

        .apm-spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: #fff; border-radius: 50%;
          animation: apmSpin 0.7s linear infinite;
        }
        @keyframes apmSpin { to { transform: rotate(360deg); } }

        .apm-input { min-height: 44px; }
        .apm-select { min-height: 44px; }
        .apm-cancel { min-height: 48px; }
        .apm-back { min-height: 48px; }
        .apm-submit { min-height: 48px; }

        @media (max-width: 520px) {
          .apm-overlay { padding: 0; align-items: flex-end; }
          .apm-modal { border-radius: 22px 22px 0 0; max-width: 100%; }
          @keyframes apmModalIn {
            from { opacity:0; transform: translateY(100%); }
            to   { opacity:1; transform: translateY(0); }
          }
          .apm-header { padding: 20px 16px 0; }
          .apm-progress { padding: 0 16px; }
          .apm-body { padding: 0 16px; }
          .apm-footer { padding: 16px 16px 24px; }
          .apm-grid2 { grid-template-columns: 1fr; }
          .apm-input, .apm-select { font-size: 15px; }
        }
      `}</style>

      <div className="apm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="apm-modal" role="dialog" aria-modal="true" aria-label="Add patient">

          <div className="apm-header">
            <div>
              <div className="apm-step-badge">New Patient</div>
              <div className="apm-title">{step === 1 ? "Patient Details" : "Account Setup"}</div>
              <div className="apm-subtitle">
                {step === 1 ? "Enter the patient's basic information" : "Set condition and login credentials"}
              </div>
            </div>
            <button className="apm-close" onClick={onClose} aria-label="Close">
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>

          <div className="apm-progress">
            <div className="apm-prog-step">
              <div className={`apm-prog-dot ${step > 1 ? "done" : "active"}`}>{step > 1 ? "✓" : "1"}</div>
              <span className={`apm-prog-label ${step === 1 ? "active" : ""}`}>Details</span>
            </div>
            <div className={`apm-prog-line ${step > 1 ? "done" : ""}`} />
            <div className="apm-prog-step">
              <div className={`apm-prog-dot ${step === 2 ? "active" : "idle"}`}>2</div>
              <span className={`apm-prog-label ${step === 2 ? "active" : ""}`}>Account</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="apm-body">
              {error && (
                <div className="apm-error">
                  <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0, marginTop: 2 }} />
                  {error}
                </div>
              )}

              {step === 1 && (
                <>
                  <div className="apm-grid2">
                    <div className="apm-field">
                      <label className="apm-label">First Name</label>
                      <input className="apm-input" placeholder="Alex" value={form.firstName} onChange={set("firstName")} required autoFocus />
                    </div>
                    <div className="apm-field">
                      <label className="apm-label">Last Name</label>
                      <input className="apm-input" placeholder="Johnson" value={form.lastName} onChange={set("lastName")} required />
                    </div>
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">Email Address</label>
                    <input className="apm-input" type="email" placeholder="patient@example.com" value={form.email} onChange={set("email")} required />
                  </div>

                  {/* Physio assignment — only shown to clinic managers */}
                  {isManager && (
                    <div className="apm-field">
                      <label className="apm-label">Assign Physiotherapist</label>
                      <div className="apm-select-wrap">
                        <select className="apm-select" value={form.assignedPhysioId} onChange={setPhysio}>
                          <option value="">— Unassigned —</option>
                          {physios.map((p) => (
                            <option key={p.uid} value={p.uid}>
                              {p.firstName} {p.lastName}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}
                </>
              )}

              {step === 2 && (
                <>
                  <div className="apm-info-box">
                    <AlertCircle size={15} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                    <span>
                      A login account will be created for <strong>{form.firstName} {form.lastName}</strong> using <strong>{form.email}</strong>. Share the password securely.
                    </span>
                  </div>

                  <div className="apm-field">
                    <label className="apm-label">Primary Condition</label>
                    <div className="apm-select-wrap">
                      <select className="apm-select" value={form.condition} onChange={set("condition")} required>
                        <option value="" disabled>Select a condition…</option>
                        {CONDITIONS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="apm-field">
                    <label className="apm-label">Temporary Password</label>
                    <div className="apm-pw-wrap">
                      <input
                        className="apm-input"
                        type={showPw ? "text" : "password"}
                        placeholder="Min. 6 characters"
                        value={form.password}
                        onChange={set("password")}
                        required
                        style={{ paddingRight: 40 }}
                      />
                      <button type="button" className="apm-pw-btn" onClick={() => setShowPw(!showPw)}>
                        {showPw
                          ? <EyeOff size={15} strokeWidth={2} />
                          : <Eye size={15} strokeWidth={2} />
                        }
                      </button>
                    </div>
                    <div className="apm-pw-hint">The patient will use this to first log in.</div>
                  </div>
                </>
              )}
            </div>

            <div className="apm-footer">
              {step === 1
                ? <button type="button" className="apm-cancel" onClick={onClose}>Cancel</button>
                : <button type="button" className="apm-back" onClick={() => setStep(1)}>
                    <ArrowLeft size={13} strokeWidth={2.5} />
                    Back
                  </button>
              }
              <button className="apm-submit" type="submit" disabled={!isValid || loading}>
                {loading
                  ? <><div className="apm-spinner" /> Creating…</>
                  : step === 1
                    ? <>Continue <ArrowRight size={13} strokeWidth={2.5} /></>
                    : <>Create Patient Account</>
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
