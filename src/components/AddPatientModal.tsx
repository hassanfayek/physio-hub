// FILE: src/components/AddPatientModal.tsx

import { useState, useEffect, type FormEvent, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { createPatient, type CreatePatientPayload, type Physiotherapist } from "../services/patientService";
import type { Patient } from "../services/patientService";
import { subscribeToPhysicians, type Physician } from "../services/physicianService";
import { X, AlertCircle, Copy, Check } from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddPatientModalProps {
  physioId:  string;
  physios?:  Physiotherapist[];
  onClose:   () => void;
  onCreated: (patient: Patient) => void;
}


// ─── Component ────────────────────────────────────────────────────────────────

export default function AddPatientModal({
  physioId,
  physios = [],
  onClose,
  onCreated,
}: AddPatientModalProps) {
  const isManager = physios.length > 0;

  const [firstName,   setFirstName]   = useState("");
  const [lastName,    setLastName]    = useState("");
  const [occupation,  setOccupation]  = useState("");
  const [age,         setAge]         = useState("");
  const [phone,       setPhone]       = useState("");
  const [referredBy,  setReferredBy]  = useState("");
  const [referredByPhysicianId, setReferredByPhysicianId] = useState("");
  const [physicians,  setPhysicians]  = useState<Physician[]>([]);
  const [assignedPhysioId, setAssignedPhysioId] = useState(physioId);

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // After creation — show the access code
  const [createdCode,    setCreatedCode]    = useState<string | null>(null);
  const [createdPatient, setCreatedPatient] = useState<Patient | null>(null);
  const [copied,         setCopied]         = useState(false);

  useEffect(() => {
    return subscribeToPhysicians(setPhysicians, () => {});
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const isValid = firstName.trim() && lastName.trim();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const payload: CreatePatientPayload = {
      firstName:  firstName.trim(),
      lastName:   lastName.trim(),
      occupation: occupation.trim(),
      physioId:   isManager ? assignedPhysioId : physioId,
      age,
      phone,
      referredBy:            referredBy.trim(),
      referredByPhysicianId: referredByPhysicianId || undefined,
    };

    const result = await createPatient(payload);
    setLoading(false);

    if ("error" in result) {
      setError(result.error ?? null);
      return;
    }

    setCreatedCode(result.code);
    setCreatedPatient(result.patient);
  };

  const handleCopy = () => {
    if (!createdCode) return;
    navigator.clipboard.writeText(createdCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleDone = () => {
    if (createdPatient) onCreated(createdPatient);
    onClose();
  };

  return createPortal(
    <>
      <style>{`

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
          width: 100%; max-width: 460px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04);
          animation: apmModalIn 0.25s cubic-bezier(0.16,1,0.3,1) both;
          overflow: hidden; font-family: 'Outfit', sans-serif;
        }
        @keyframes apmModalIn {
          from { opacity:0; transform: scale(0.94) translateY(16px); }
          to   { opacity:1; transform: scale(1) translateY(0); }
        }

        .apm-header {
          padding: 24px 24px 0;
          display: flex; align-items: flex-start; justify-content: space-between;
          margin-bottom: 20px;
        }
        .apm-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 3px 10px; border-radius: 100px;
          background: #d8f3dc; color: #1b4332;
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 8px;
        }
        .apm-title { font-size: 22px; font-weight: 600; color: #1a1a1a; margin-bottom: 3px; }
        .apm-subtitle { font-size: 13px; color: #9a9590; }
        .apm-close {
          width: 34px; height: 34px; border-radius: 50%;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #9a9590; transition: all 0.15s; flex-shrink: 0;
        }
        .apm-close:hover { background: #f0ede8; color: #1a1a1a; }

        .apm-body { padding: 0 24px 4px; }
        .apm-footer { padding: 16px 24px 24px; display: flex; gap: 10px; }

        .apm-field { margin-bottom: 14px; }
        .apm-label {
          display: block; font-size: 12px; font-weight: 600;
          color: #5a5550; text-transform: uppercase; letter-spacing: 0.06em;
          margin-bottom: 6px;
        }
        .apm-input, .apm-select {
          width: 100%; padding: 11px 14px;
          border: 1.5px solid #e5e0d8; border-radius: 10px;
          font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
          background: #fff; outline: none; transition: border-color 0.15s;
          min-height: 44px;
        }
        .apm-input:focus, .apm-select:focus { border-color: #52b788; box-shadow: 0 0 0 3px rgba(82,183,136,0.1); }
        .apm-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .apm-select-wrap { position: relative; }
        .apm-select { appearance: none; padding-right: 36px; }
        .apm-select-wrap::after {
          content: "▾"; position: absolute; right: 13px; top: 50%;
          transform: translateY(-50%); color: #9a9590; pointer-events: none; font-size: 13px;
        }

        .apm-error {
          display: flex; align-items: flex-start; gap: 8px;
          padding: 12px 14px; background: #fff5f3; border: 1px solid #fecaca;
          border-radius: 10px; font-size: 13px; color: #b91c1c; margin-bottom: 14px;
        }

        /* Code reveal screen */
        .apm-code-screen { padding: 0 24px 4px; text-align: center; }
        .apm-code-icon {
          width: 64px; height: 64px; border-radius: 50%;
          background: #d8f3dc; display: flex; align-items: center; justify-content: center;
          margin: 0 auto 16px; font-size: 28px;
        }
        .apm-code-title { font-size: 20px; font-weight: 600; color: #1a1a1a; margin-bottom: 6px; }
        .apm-code-sub { font-size: 13.5px; color: #5a5550; margin-bottom: 24px; line-height: 1.5; }
        .apm-code-box {
          display: flex; align-items: center; justify-content: space-between;
          background: #f5f3ef; border: 2px dashed #c0bbb4; border-radius: 14px;
          padding: 16px 20px; margin-bottom: 12px;
        }
        .apm-code-value {
          font-size: 28px; font-weight: 700; letter-spacing: 0.15em;
          color: #0C3C60; font-family: 'Courier New', monospace;
        }
        .apm-copy-btn {
          display: flex; align-items: center; gap: 6px;
          padding: 8px 14px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 13px;
          color: #5a5550; cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .apm-copy-btn:hover { background: #f0ede8; border-color: #c0bbb4; }
        .apm-copy-btn.copied { background: #d8f3dc; border-color: #52b788; color: #1b4332; }
        .apm-code-warning {
          font-size: 12px; color: #9a9590; margin-bottom: 20px;
          display: flex; align-items: center; gap: 6px; justify-content: center;
        }

        .apm-btn-cancel {
          flex: 1; padding: 12px; border-radius: 12px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          color: #5a5550; cursor: pointer; transition: all 0.15s;
        }
        .apm-btn-cancel:hover { background: #f5f3ef; }
        .apm-btn-submit {
          flex: 2; padding: 12px; border-radius: 12px; border: none;
          background: #2d6a4f; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .apm-btn-submit:hover:not(:disabled) { background: #1b4332; }
        .apm-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .apm-spinner {
          width: 16px; height: 16px;
          border: 2px solid rgba(255,255,255,0.35);
          border-top-color: #fff; border-radius: 50%;
          animation: apmSpin 0.7s linear infinite;
        }
        @keyframes apmSpin { to { transform: rotate(360deg); } }

        @media (max-width: 520px) {
          .apm-overlay { padding: 0; align-items: flex-start; }
          .apm-modal { border-radius: 0 0 22px 22px; max-width: 100%; }
          .apm-grid2 { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="apm-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="apm-modal" role="dialog" aria-modal="true">

          <div className="apm-header">
            <div>
              <div className="apm-badge">{createdCode ? "✓ Patient Created" : "New Patient"}</div>
              <div className="apm-title">{createdCode ? "Access Code Generated" : "Add Patient"}</div>
              <div className="apm-subtitle">
                {createdCode
                  ? `${firstName} ${lastName} — share this code with the patient`
                  : "Fill in the patient's details to create their account"
                }
              </div>
            </div>
            <button className="apm-close" onClick={onClose} aria-label="Close">
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* ── Code reveal screen ── */}
          {createdCode ? (
            <>
              <div className="apm-code-screen">
                <div className="apm-code-icon">🔑</div>
                <div className="apm-code-title">Patient Login Code</div>
                <div className="apm-code-sub">
                  Share this code with <strong>{firstName} {lastName}</strong>.<br />
                  They will use it to log in to their patient portal.
                </div>
                <div className="apm-code-box">
                  <div className="apm-code-value">{createdCode}</div>
                  <button className={`apm-copy-btn ${copied ? "copied" : ""}`} onClick={handleCopy} type="button">
                    {copied ? <><Check size={13} strokeWidth={2.5} /> Copied!</> : <><Copy size={13} strokeWidth={2} /> Copy</>}
                  </button>
                </div>
                <div className="apm-code-warning">
                  ⚠️ Save this code — it won't be shown again after you close this window.
                </div>
              </div>
              <div className="apm-footer">
                <button className="apm-btn-submit" onClick={handleDone} type="button">Done</button>
              </div>
            </>
          ) : (
            /* ── Patient form ── */
            <form onSubmit={handleSubmit} noValidate>
              <div className="apm-body">
                {error && (
                  <div className="apm-error">
                    <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
                    {error}
                  </div>
                )}

                <div className="apm-grid2">
                  <div className="apm-field">
                    <label className="apm-label">First Name</label>
                    <input className="apm-input" placeholder="Alex" value={firstName}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => { setFirstName(e.target.value); setError(null); }}
                      required autoFocus />
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">Last Name</label>
                    <input className="apm-input" placeholder="Johnson" value={lastName}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => { setLastName(e.target.value); setError(null); }}
                      required />
                  </div>
                </div>

                <div className="apm-grid2">
                  <div className="apm-field">
                    <label className="apm-label">Age</label>
                    <input className="apm-input" type="number" min="0" max="120" placeholder="e.g. 35" value={age}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setAge(e.target.value)} />
                  </div>
                  <div className="apm-field">
                    <label className="apm-label">Phone</label>
                    <input className="apm-input" type="tel" placeholder="+20 100 000 0000" value={phone}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)} />
                  </div>
                </div>

                <div className="apm-field">
                  <label className="apm-label">Occupation</label>
                  <input className="apm-input" placeholder="e.g. Teacher, Engineer…" value={occupation}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setOccupation(e.target.value)} />
                </div>

                <div className="apm-field">
                  <label className="apm-label">Referred By</label>
                  <input className="apm-input" placeholder="e.g. Dr. Ahmed, Google, Word of mouth…" value={referredBy}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => setReferredBy(e.target.value)} />
                </div>

                {physicians.length > 0 && (
                  <div className="apm-field">
                    <label className="apm-label">Referring Physician (optional)</label>
                    <div className="apm-select-wrap">
                      <select className="apm-select" value={referredByPhysicianId}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => setReferredByPhysicianId(e.target.value)}>
                        <option value="">— None —</option>
                        {physicians.map((p) => (
                          <option key={p.uid} value={p.uid}>Dr. {p.firstName} {p.lastName}{p.specialization ? ` · ${p.specialization}` : ""}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}

                {isManager && (
                  <div className="apm-field">
                    <label className="apm-label">Assign Physiotherapist</label>
                    <div className="apm-select-wrap">
                      <select className="apm-select" value={assignedPhysioId}
                        onChange={(e: ChangeEvent<HTMLSelectElement>) => setAssignedPhysioId(e.target.value)}>
                        <option value="">— Unassigned —</option>
                        {physios.map((p) => (
                          <option key={p.uid} value={p.uid}>{p.firstName} {p.lastName}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="apm-footer">
                <button type="button" className="apm-btn-cancel" onClick={onClose}>Cancel</button>
                <button className="apm-btn-submit" type="submit" disabled={!isValid || loading}>
                  {loading
                    ? <><div className="apm-spinner" /> Creating…</>
                    : "Create Patient"
                  }
                </button>
              </div>
            </form>
          )}

        </div>
      </div>
    </>,
    document.body
  );
}
