// FILE: src/components/AddPhysioModal.tsx

import { useState, useEffect, type FormEvent, type ChangeEvent } from "react";
import { createPortal } from "react-dom";
import { X, AlertCircle, Copy, Check } from "lucide-react";
import { createPhysio } from "../services/physioService";

// ─── Temp-password generator ──────────────────────────────────────────────────

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let pw = "Dr-";
  for (let i = 0; i < 6; i++) pw += chars[Math.floor(Math.random() * chars.length)];
  return pw;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface AddPhysioModalProps {
  onClose:   () => void;
  onCreated: (fullName: string) => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AddPhysioModal({ onClose, onCreated }: AddPhysioModalProps) {
  const [firstName,       setFirstName]       = useState("");
  const [lastName,        setLastName]        = useState("");
  const [email,           setEmail]           = useState("");
  const [rank,            setRank]            = useState("junior");
  const [licenseNumber] = useState("");
  const [phone,           setPhone]           = useState("");
  const [clinicName,      setClinicName]      = useState("");
  const [specializations, setSpecializations] = useState("");

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // After creation reveal state
  const [createdEmail,    setCreatedEmail]    = useState<string | null>(null);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  const [copiedEmail,     setCopiedEmail]     = useState(false);
  const [copiedPass,      setCopiedPass]      = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, []);

  const isValid = firstName.trim() && lastName.trim() && email.trim();

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const tempPassword = generateTempPassword();

    const result = await createPhysio({
      firstName:       firstName.trim(),
      lastName:        lastName.trim(),
      email:           email.trim(),
      password:        tempPassword,
      licenseNumber:   licenseNumber.trim(),
      phone:           phone.trim(),
      clinicName:      clinicName.trim() || "Physio+ Clinic",
      specializations: specializations.split(",").map((s) => s.trim()).filter(Boolean),
      rank,
    });

    setLoading(false);

    if ("error" in result) {
      setError(result.error ?? "An unexpected error occurred.");
      return;
    }

    setCreatedEmail(email.trim());
    setCreatedPassword(tempPassword);
  };

  const copyEmail = () => {
    if (!createdEmail) return;
    navigator.clipboard.writeText(createdEmail).then(() => {
      setCopiedEmail(true);
      setTimeout(() => setCopiedEmail(false), 2000);
    });
  };

  const copyPass = () => {
    if (!createdPassword) return;
    navigator.clipboard.writeText(createdPassword).then(() => {
      setCopiedPass(true);
      setTimeout(() => setCopiedPass(false), 2000);
    });
  };

  const handleDone = () => {
    onCreated(`${firstName.trim()} ${lastName.trim()}`);
    onClose();
  };

  return createPortal(
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap');

        .aph-overlay {
          position: fixed; inset: 0; z-index: 1000;
          background: rgba(10,15,10,0.55); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center;
          padding: 24px; animation: aphOverlayIn 0.2s ease both;
        }
        @keyframes aphOverlayIn { from { opacity:0; } to { opacity:1; } }

        .aph-modal {
          background: #fff; border-radius: 24px;
          width: 100%; max-width: 480px;
          box-shadow: 0 24px 80px rgba(0,0,0,0.18), 0 0 0 1px rgba(0,0,0,0.04);
          animation: aphModalIn 0.25s cubic-bezier(0.16,1,0.3,1) both;
          overflow: hidden; font-family: 'Outfit', sans-serif;
          max-height: 90vh; display: flex; flex-direction: column;
        }
        @keyframes aphModalIn {
          from { opacity:0; transform: scale(0.94) translateY(16px); }
          to   { opacity:1; transform: scale(1) translateY(0); }
        }

        .aph-header {
          padding: 24px 24px 16px; flex-shrink: 0;
          display: flex; align-items: flex-start; justify-content: space-between;
          border-bottom: 1px solid #f0ede8;
        }
        .aph-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 3px 10px; border-radius: 100px;
          background: #dbeafe; color: #1e40af;
          font-size: 11px; font-weight: 600;
          letter-spacing: 0.06em; text-transform: uppercase; margin-bottom: 8px;
        }
        .aph-title    { font-size: 21px; font-weight: 600; color: #1a1a1a; margin-bottom: 3px; }
        .aph-subtitle { font-size: 13px; color: #9a9590; }
        .aph-close {
          width: 34px; height: 34px; border-radius: 50%; flex-shrink: 0;
          border: 1.5px solid #e5e0d8; background: #fafaf8;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #9a9590; transition: all 0.15s;
        }
        .aph-close:hover { background: #f0ede8; color: #1a1a1a; }

        .aph-scroll { overflow-y: auto; flex: 1; }
        .aph-body   { padding: 20px 24px 4px; }
        .aph-footer { padding: 16px 24px 24px; display: flex; gap: 10px; flex-shrink: 0; border-top: 1px solid #f0ede8; }

        .aph-field { margin-bottom: 14px; }
        .aph-label {
          display: block; font-size: 12px; font-weight: 600;
          color: #5a5550; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px;
        }
        .aph-input, .aph-select {
          width: 100%; padding: 11px 14px; box-sizing: border-box;
          border: 1.5px solid #e5e0d8; border-radius: 10px;
          font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
          background: #fff; outline: none; transition: border-color 0.15s; min-height: 44px;
        }
        .aph-input:focus, .aph-select:focus {
          border-color: #2E8BC0; box-shadow: 0 0 0 3px rgba(46,139,192,0.1);
        }
        .aph-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .aph-select {
          appearance: none; cursor: pointer;
          background-image: url("data:image/svg+xml,%3Csvg width='10' height='6' viewBox='0 0 10 6' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%239a9590' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
          background-repeat: no-repeat; background-position: right 12px center; padding-right: 36px;
        }
        .aph-error {
          display: flex; align-items: flex-start; gap: 8px;
          padding: 12px 14px; background: #fff5f3; border: 1px solid #fecaca;
          border-radius: 10px; font-size: 13px; color: #b91c1c; margin-bottom: 14px;
        }

        /* Credentials reveal */
        .aph-cred-body { padding: 20px 24px 4px; }
        .aph-cred-icon {
          width: 64px; height: 64px; border-radius: 50%;
          background: #dbeafe; display: flex; align-items: center; justify-content: center;
          margin: 0 auto 14px; font-size: 28px;
        }
        .aph-cred-title { font-size: 19px; font-weight: 600; color: #1a1a1a; margin-bottom: 6px; text-align: center; }
        .aph-cred-sub   { font-size: 13px; color: #5a5550; margin-bottom: 22px; line-height: 1.5; text-align: center; }
        .aph-cred-row {
          display: flex; align-items: center; justify-content: space-between; gap: 10px;
          background: #f5f3ef; border: 2px dashed #c0bbb4; border-radius: 14px;
          padding: 14px 18px; margin-bottom: 10px;
        }
        .aph-cred-lbl   { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9a9590; margin-bottom: 4px; }
        .aph-cred-val   { font-size: 17px; font-weight: 700; letter-spacing: 0.06em; color: #0C3C60; font-family: 'Courier New', monospace; word-break: break-all; }
        .aph-copy-btn {
          display: flex; align-items: center; gap: 6px; flex-shrink: 0;
          padding: 7px 12px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 12px;
          color: #5a5550; cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .aph-copy-btn:hover { background: #f0ede8; border-color: #c0bbb4; }
        .aph-copy-btn.copied { background: #dbeafe; border-color: #93c5fd; color: #1e40af; }
        .aph-cred-warn {
          font-size: 12px; color: #9a9590; margin-bottom: 20px;
          display: flex; align-items: center; gap: 6px; justify-content: center;
        }

        .aph-btn-cancel {
          flex: 1; padding: 12px; border-radius: 12px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 500;
          color: #5a5550; cursor: pointer; transition: all 0.15s;
        }
        .aph-btn-cancel:hover { background: #f5f3ef; }
        .aph-btn-submit {
          flex: 2; padding: 12px; border-radius: 12px; border: none;
          background: #2E8BC0; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .aph-btn-submit:hover:not(:disabled) { background: #0C3C60; }
        .aph-btn-submit:disabled { opacity: 0.5; cursor: not-allowed; }
        .aph-spinner {
          width: 16px; height: 16px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.35); border-top-color: #fff;
          animation: aphSpin 0.7s linear infinite;
        }
        @keyframes aphSpin { to { transform: rotate(360deg); } }

        @media (max-width: 520px) {
          .aph-overlay { padding: 0; align-items: flex-end; }
          .aph-modal   { border-radius: 22px 22px 0 0; max-width: 100%; max-height: 96vh; }
          .aph-grid2   { grid-template-columns: 1fr; }
        }
      `}</style>

      <div className="aph-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="aph-modal" role="dialog" aria-modal="true">

          {/* Header */}
          <div className="aph-header">
            <div>
              <div className="aph-badge">{createdEmail ? "✓ Account Created" : "New Physiotherapist"}</div>
              <div className="aph-title">{createdEmail ? "Login Credentials" : "Add Physiotherapist"}</div>
              <div className="aph-subtitle">
                {createdEmail
                  ? `Dr. ${firstName} ${lastName} — share these credentials once`
                  : "Fill in the details to create their staff account"
                }
              </div>
            </div>
            <button className="aph-close" onClick={onClose} aria-label="Close">
              <X size={14} strokeWidth={2.5} />
            </button>
          </div>

          {/* ── Credentials reveal ── */}
          {createdEmail ? (
            <>
              <div className="aph-scroll">
                <div className="aph-cred-body">
                  <div className="aph-cred-icon">🔐</div>
                  <div className="aph-cred-title">Account Ready</div>
                  <div className="aph-cred-sub">
                    Share these credentials with <strong>Dr. {firstName} {lastName}</strong>.<br />
                    They will use them to sign in to the staff portal.
                  </div>

                  <div className="aph-cred-row">
                    <div>
                      <div className="aph-cred-lbl">Email</div>
                      <div className="aph-cred-val" style={{ fontSize: 14 }}>{createdEmail}</div>
                    </div>
                    <button className={`aph-copy-btn ${copiedEmail ? "copied" : ""}`} onClick={copyEmail} type="button">
                      {copiedEmail ? <><Check size={12} strokeWidth={2.5} /> Copied</> : <><Copy size={12} strokeWidth={2} /> Copy</>}
                    </button>
                  </div>

                  <div className="aph-cred-row">
                    <div>
                      <div className="aph-cred-lbl">Temporary Password</div>
                      <div className="aph-cred-val">{createdPassword}</div>
                    </div>
                    <button className={`aph-copy-btn ${copiedPass ? "copied" : ""}`} onClick={copyPass} type="button">
                      {copiedPass ? <><Check size={12} strokeWidth={2.5} /> Copied</> : <><Copy size={12} strokeWidth={2} /> Copy</>}
                    </button>
                  </div>

                  <div className="aph-cred-warn">
                    ⚠️ Save these credentials — they won't be shown again after closing.
                  </div>
                </div>
              </div>
              <div className="aph-footer">
                <button className="aph-btn-submit" onClick={handleDone} type="button">Done</button>
              </div>
            </>
          ) : (
            /* ── Physio form ── */
            <form onSubmit={handleSubmit} noValidate style={{ display: "contents" }}>
              <div className="aph-scroll">
                <div className="aph-body">
                  {error && (
                    <div className="aph-error">
                      <AlertCircle size={14} strokeWidth={2} style={{ flexShrink: 0 }} />
                      {error}
                    </div>
                  )}

                  <div className="aph-grid2">
                    <div className="aph-field">
                      <label className="aph-label">First Name</label>
                      <input className="aph-input" placeholder="Ahmed" value={firstName} autoFocus required
                        onChange={(e: ChangeEvent<HTMLInputElement>) => { setFirstName(e.target.value); setError(null); }} />
                    </div>
                    <div className="aph-field">
                      <label className="aph-label">Last Name</label>
                      <input className="aph-input" placeholder="Hassan" value={lastName} required
                        onChange={(e: ChangeEvent<HTMLInputElement>) => { setLastName(e.target.value); setError(null); }} />
                    </div>
                  </div>

                  <div className="aph-field">
                    <label className="aph-label">Email Address</label>
                    <input className="aph-input" type="email" placeholder="dr.ahmed@clinic.com" value={email} required
                      onChange={(e: ChangeEvent<HTMLInputElement>) => { setEmail(e.target.value); setError(null); }} />
                  </div>

                  <div className="aph-field">
                    <label className="aph-label">Rank / Level</label>
                    <select className="aph-select" value={rank}
                      onChange={(e: ChangeEvent<HTMLSelectElement>) => setRank(e.target.value)}>
                      <option value="senior">Senior Physiotherapist</option>
                      <option value="junior">Junior Physiotherapist</option>
                      <option value="trainee">Trainee Physiotherapist</option>
                    </select>
                  </div>

                  <div className="aph-field">
                    <label className="aph-label">Phone</label>
                    <input className="aph-input" type="tel" placeholder="+20 100 000 0000" value={phone}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setPhone(e.target.value)} />
                  </div>

                  <div className="aph-field">
                    <label className="aph-label">Clinic Name</label>
                    <input className="aph-input" placeholder="Physio+ Clinic" value={clinicName}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setClinicName(e.target.value)} />
                  </div>

                  <div className="aph-field">
                    <label className="aph-label">Specializations (comma-separated)</label>
                    <input className="aph-input" placeholder="Sports Rehab, Orthopaedics" value={specializations}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => setSpecializations(e.target.value)} />
                  </div>
                </div>
              </div>

              <div className="aph-footer">
                <button type="button" className="aph-btn-cancel" onClick={onClose}>Cancel</button>
                <button className="aph-btn-submit" type="submit" disabled={!isValid || loading}>
                  {loading
                    ? <><div className="aph-spinner" /> Creating…</>
                    : "Create Account"
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
