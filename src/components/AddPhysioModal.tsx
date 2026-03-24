// FILE: src/components/AddPhysioModal.tsx

import { useState, useEffect, type FormEvent, type ChangeEvent } from "react";
import { createPhysio, type CreatePhysioPayload } from "../services/physioService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddPhysioModalProps {
  onClose:   () => void;
  onCreated: (uid: string) => void;
}

interface FormState {
  firstName:       string;
  lastName:        string;
  email:           string;
  password:        string;
  licenseNumber:   string;
  phone:           string;
  clinicName:      string;
  specializationInput: string; // working field for the tag input
  specializations: string[];
}

const INITIAL: FormState = {
  firstName:           "",
  lastName:            "",
  email:               "",
  password:            "",
  licenseNumber:       "",
  phone:               "",
  clinicName:          "",
  specializationInput: "",
  specializations:     [],
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddPhysioModal({ onClose, onCreated }: AddPhysioModalProps) {
  const [form,    setForm]    = useState<FormState>(INITIAL);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [showPw,  setShowPw]  = useState(false);
  const [step,    setStep]    = useState<1 | 2>(1);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const set = (k: keyof FormState) => (e: ChangeEvent<HTMLInputElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setError(null);
  };

  // Add specialization tag on Enter or comma
  const handleSpecInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      const val = form.specializationInput.trim().replace(/,$/, "");
      if (val && !form.specializations.includes(val)) {
        setForm((f) => ({ ...f, specializations: [...f.specializations, val], specializationInput: "" }));
      }
    }
  };

  const removeSpec = (spec: string) => {
    setForm((f) => ({ ...f, specializations: f.specializations.filter((s) => s !== spec) }));
  };

  const step1Valid =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.email.trim() &&
    form.password.length >= 6;

  const step2Valid =
    form.licenseNumber.trim() &&
    form.clinicName.trim();

  const isValid = step === 1 ? step1Valid : step2Valid;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();

    if (step === 1) { setStep(2); return; }

    setLoading(true);
    setError(null);

    const payload: CreatePhysioPayload = {
      firstName:       form.firstName.trim(),
      lastName:        form.lastName.trim(),
      email:           form.email.trim(),
      password:        form.password,
      licenseNumber:   form.licenseNumber.trim(),
      phone:           form.phone.trim(),
      clinicName:      form.clinicName.trim(),
      specializations: form.specializations,
    };

    const result = await createPhysio(payload);
    setLoading(false);

    if ("error" in result) {
      setError(result.error ?? null);
      setStep(1);
      return;
    }

    onCreated(result.uid);
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
          width: 100%; max-width: 500px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04);
          animation: apmModalIn 0.25s cubic-bezier(0.16,1,0.3,1) both;
          overflow: hidden; font-family: 'Outfit', sans-serif;
          max-height: 90vh; overflow-y: auto;
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
          background: #ede9fe; color: #5b21b6;
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
        .apm-prog-dot.done   { background: #5b21b6; border-color: #5b21b6; color: #fff; }
        .apm-prog-dot.active { background: #fff; border-color: #5b21b6; color: #5b21b6; }
        .apm-prog-dot.idle   { background: #fff; border-color: #e5e0d8; color: #c0bbb4; }
        .apm-prog-label { font-size: 13px; font-weight: 500; color: #c0bbb4; }
        .apm-prog-label.active { color: #1a1a1a; }
        .apm-prog-line { flex: 1; height: 2px; background: #e5e0d8; margin: 0 12px; border-radius: 2px; }
        .apm-prog-line.done { background: #5b21b6; }

        .apm-body { padding: 0 28px; display: flex; flex-direction: column; gap: 16px; }

        .apm-error {
          display: flex; align-items: flex-start; gap: 8px;
          background: #fff5f3; border: 1px solid #fecaca;
          border-radius: 10px; padding: 12px 14px;
          font-size: 13.5px; color: #b91c1c;
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
          transition: border-color 0.15s; width: 100%;
        }
        .apm-input:focus { border-color: #5b21b6; background: #fff; box-shadow: 0 0 0 3px rgba(91,33,182,0.08); }

        .apm-pw-wrap { position: relative; }
        .apm-pw-btn {
          position: absolute; right: 10px; top: 50%; transform: translateY(-50%);
          background: none; border: none; cursor: pointer; color: #9a9590;
          display: flex; align-items: center; padding: 4px;
        }
        .apm-pw-hint { font-size: 12px; color: #9a9590; }

        /* Specialization tags */
        .apm-tags-wrap {
          border: 1.5px solid #e5e0d8; border-radius: 10px;
          background: #fafaf8; padding: 8px 10px;
          display: flex; flex-wrap: wrap; gap: 6px;
          min-height: 44px; align-items: flex-start;
          transition: border-color 0.15s;
        }
        .apm-tags-wrap:focus-within { border-color: #5b21b6; background: #fff; box-shadow: 0 0 0 3px rgba(91,33,182,0.08); }
        .apm-tag {
          display: inline-flex; align-items: center; gap: 5px;
          background: #ede9fe; color: #5b21b6;
          border-radius: 100px; padding: 3px 10px;
          font-size: 12.5px; font-weight: 500;
        }
        .apm-tag-remove {
          background: none; border: none; cursor: pointer; color: #7c3aed;
          padding: 0; display: flex; align-items: center; line-height: 1;
          font-size: 14px;
        }
        .apm-tag-input {
          border: none; outline: none; background: transparent;
          font-family: 'Outfit', sans-serif; font-size: 13.5px; color: #1a1a1a;
          flex: 1; min-width: 120px; padding: 2px 4px;
        }
        .apm-tags-hint { font-size: 12px; color: #9a9590; }

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
          background: #5b21b6; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14.5px; font-weight: 500;
          cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .apm-submit:hover:not(:disabled) { background: #4c1d95; box-shadow: 0 4px 16px rgba(91,33,182,0.25); }
        .apm-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .apm-spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: #fff; border-radius: 50%;
          animation: apmSpin 0.7s linear infinite;
        }
        @keyframes apmSpin { to { transform: rotate(360deg); } }

        .apm-input { min-height: 44px; }
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
          .apm-input { font-size: 15px; }
        }
      `}</style>

      <div className="apm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="apm-modal" role="dialog" aria-modal="true" aria-label="Add physiotherapist">

          <div className="apm-header">
            <div>
              <div className="apm-step-badge">New Physiotherapist</div>
              <div className="apm-title">{step === 1 ? "Personal Details" : "Professional Details"}</div>
              <div className="apm-subtitle">
                {step === 1 ? "Enter name, email and password" : "License, clinic and specializations"}
              </div>
            </div>
            <button className="apm-close" onClick={onClose} aria-label="Close">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div className="apm-progress">
            <div className="apm-prog-step">
              <div className={`apm-prog-dot ${step > 1 ? "done" : "active"}`}>{step > 1 ? "✓" : "1"}</div>
              <span className={`apm-prog-label ${step === 1 ? "active" : ""}`}>Personal</span>
            </div>
            <div className={`apm-prog-line ${step > 1 ? "done" : ""}`} />
            <div className="apm-prog-step">
              <div className={`apm-prog-dot ${step === 2 ? "active" : "idle"}`}>2</div>
              <span className={`apm-prog-label ${step === 2 ? "active" : ""}`}>Professional</span>
            </div>
          </div>

          <form onSubmit={handleSubmit} noValidate>
            <div className="apm-body">
              {error && (
                <div className="apm-error">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}>
                    <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                  </svg>
                  {error}
                </div>
              )}

              {step === 1 && (
                <>
                  <div className="apm-grid2">
                    <div className="apm-field">
                      <label className="apm-label">First Name</label>
                      <input className="apm-input" placeholder="Sarah" value={form.firstName} onChange={set("firstName")} required autoFocus />
                    </div>
                    <div className="apm-field">
                      <label className="apm-label">Last Name</label>
                      <input className="apm-input" placeholder="Malik" value={form.lastName} onChange={set("lastName")} required />
                    </div>
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">Email Address</label>
                    <input className="apm-input" type="email" placeholder="physio@clinic.com" value={form.email} onChange={set("email")} required />
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
                          ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                          : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                        }
                      </button>
                    </div>
                    <div className="apm-pw-hint">Share this password with the physiotherapist securely.</div>
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <div className="apm-grid2">
                    <div className="apm-field">
                      <label className="apm-label">License Number</label>
                      <input className="apm-input" placeholder="PT-12345" value={form.licenseNumber} onChange={set("licenseNumber")} required autoFocus />
                    </div>
                    <div className="apm-field">
                      <label className="apm-label">Phone</label>
                      <input className="apm-input" placeholder="+1 555 000 0000" value={form.phone} onChange={set("phone")} />
                    </div>
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">Clinic Name</label>
                    <input className="apm-input" placeholder="City Physiotherapy Centre" value={form.clinicName} onChange={set("clinicName")} required />
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">Specializations</label>
                    <div className="apm-tags-wrap">
                      {form.specializations.map((s) => (
                        <span key={s} className="apm-tag">
                          {s}
                          <button type="button" className="apm-tag-remove" onClick={() => removeSpec(s)}>×</button>
                        </span>
                      ))}
                      <input
                        className="apm-tag-input"
                        placeholder={form.specializations.length === 0 ? "Type and press Enter…" : "Add another…"}
                        value={form.specializationInput}
                        onChange={set("specializationInput")}
                        onKeyDown={handleSpecInput}
                      />
                    </div>
                    <div className="apm-tags-hint">Press Enter or comma to add each specialization.</div>
                  </div>
                </>
              )}
            </div>

            <div className="apm-footer">
              {step === 1
                ? <button type="button" className="apm-cancel" onClick={onClose}>Cancel</button>
                : <button type="button" className="apm-back" onClick={() => setStep(1)}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 12H5M12 19l-7-7 7-7"/>
                    </svg>
                    Back
                  </button>
              }
              <button className="apm-submit" type="submit" disabled={!isValid || loading}>
                {loading
                  ? <><div className="apm-spinner" /> Creating…</>
                  : step === 1
                    ? <>Continue <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg></>
                    : <>Create Physiotherapist Account</>
                }
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
