// src/features/auth/LoginPage.tsx
import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login, sendPasswordReset, parseFirebaseError } from "../../services/authService";
import logo from "../../assets/physio-logo.svg";

type RoleTab = "patient" | "physiotherapist";

export default function LoginPage() {
  const navigate = useNavigate();

  const [role,      setRole]      = useState<RoleTab>("patient");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");
  const [showPw,    setShowPw]    = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [resetEmail,setResetEmail]= useState("");
  const [showReset, setShowReset] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const profile = await login(email, password);
      const isPhysioRole = profile.role === "physiotherapist" || profile.role === "clinic_manager";
      const tabMismatch  =
        (role === "patient"         && profile.role !== "patient") ||
        (role === "physiotherapist" && !isPhysioRole);
      if (tabMismatch) {
        setError(
          role === "patient"
            ? "This account is registered as a Physiotherapist. Please switch to the Physiotherapist tab."
            : "This account is registered as a Patient. Please switch to the Patient tab."
        );
        setLoading(false);
        return;
      }
      navigate(profile.role === "patient" ? "/patient" : "/physio");
    } catch (err) {
      setError(parseFirebaseError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordReset = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await sendPasswordReset(resetEmail);
      setResetSent(true);
    } catch (err) {
      setError(parseFirebaseError(err).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400;1,500&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

        .lp-wrap {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          font-family: 'DM Sans', sans-serif;
        }

        /* ── LEFT PANEL ── */
        .lp-left {
          background: #05172e;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          padding: 52px 56px;
          gap: 0;
        }

        .lp-left-bg {
          position: absolute;
          inset: 0;
          background:
            radial-gradient(ellipse 80% 60% at 10% 0%, rgba(46,139,192,0.22) 0%, transparent 65%),
            radial-gradient(ellipse 60% 50% at 90% 100%, rgba(91,192,190,0.15) 0%, transparent 60%),
            radial-gradient(ellipse 40% 40% at 50% 50%, rgba(12,60,96,0.4) 0%, transparent 70%);
        }

        .lp-left-dots {
          position: absolute;
          inset: 0;
          background-image: radial-gradient(circle, rgba(91,192,190,0.08) 1px, transparent 1px);
          background-size: 32px 32px;
        }

        .lp-left-lines {
          position: absolute;
          top: 0; left: 0; right: 0; bottom: 0;
          background-image:
            linear-gradient(rgba(91,192,190,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(91,192,190,0.04) 1px, transparent 1px);
          background-size: 64px 64px;
        }

        /* decorative accent line */
        .lp-accent-bar {
          position: absolute;
          top: 0; left: 56px;
          width: 2px; height: 120px;
          background: linear-gradient(180deg, #5BC0BE, transparent);
          border-radius: 0 0 2px 2px;
        }

        .lp-brand {
          position: relative;
          z-index: 1;
          margin-bottom: auto;
          padding-top: 4px;
        }
        .lp-brand-row {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 6px;
        }
        .lp-brand-icon {
          width: 34px; height: 34px;
          background: linear-gradient(135deg, #2E8BC0, #5BC0BE);
          border-radius: 9px;
          display: flex; align-items: center; justify-content: center;
          box-shadow: 0 4px 16px rgba(46,139,192,0.4);
        }
        .lp-brand-name {
          font-family: 'Cormorant Garamond', serif;
          font-size: 22px;
          font-weight: 600;
          color: #fff;
          letter-spacing: -0.01em;
        }
        .lp-brand-name span { color: #5BC0BE; }
        .lp-brand-tag {
          font-size: 11px;
          color: rgba(255,255,255,0.28);
          letter-spacing: 0.12em;
          text-transform: uppercase;
          padding-left: 2px;
        }

        .lp-left-body {
          position: relative;
          z-index: 1;
          margin-top: auto;
          margin-bottom: 52px;
        }

        .lp-left-eyebrow {
          font-size: 11px;
          font-weight: 500;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          color: #5BC0BE;
          margin-bottom: 16px;
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .lp-left-eyebrow::before {
          content: '';
          display: inline-block;
          width: 20px; height: 1.5px;
          background: #5BC0BE;
          border-radius: 2px;
        }

        .lp-left-heading {
          font-family: 'Cormorant Garamond', serif;
          font-size: 58px;
          font-weight: 500;
          color: #fff;
          line-height: 1.05;
          letter-spacing: -0.03em;
          margin-bottom: 22px;
        }
        .lp-left-heading em {
          color: #5BC0BE;
          font-style: italic;
        }
        .lp-left-sub {
          font-size: 14.5px;
          color: rgba(255,255,255,0.38);
          line-height: 1.75;
          max-width: 340px;
          margin-bottom: 44px;
        }

        .lp-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 10px;
        }
        .lp-stat {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(91,192,190,0.12);
          border-radius: 14px;
          padding: 18px 14px;
          backdrop-filter: blur(8px);
          transition: border-color 0.2s, background 0.2s;
        }
        .lp-stat:hover {
          background: rgba(255,255,255,0.07);
          border-color: rgba(91,192,190,0.25);
        }
        .lp-stat-num {
          font-family: 'Cormorant Garamond', serif;
          font-size: 30px;
          font-weight: 600;
          color: #fff;
          line-height: 1;
          margin-bottom: 4px;
          letter-spacing: -0.02em;
        }
        .lp-stat-accent { color: #5BC0BE; }
        .lp-stat-label {
          font-size: 10.5px;
          color: rgba(255,255,255,0.3);
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .lp-left-footer {
          position: relative;
          z-index: 1;
          font-size: 11px;
          color: rgba(255,255,255,0.16);
          letter-spacing: 0.04em;
        }

        /* ── RIGHT PANEL ── */
        .lp-right {
          background: #ffffff;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 52px 52px;
          position: relative;
        }
        .lp-right::before {
          content: '';
          position: absolute;
          top: 0; left: 0; right: 0;
          height: 3px;
          background: linear-gradient(90deg, #2E8BC0, #5BC0BE, #2E8BC0);
          background-size: 200% 100%;
          animation: shimmer 3s linear infinite;
        }
        @keyframes shimmer {
          0%   { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        .lp-form-box {
          width: 100%;
          max-width: 400px;
        }

        /* Top section */
        .lp-form-header {
          margin-bottom: 36px;
        }
        .lp-form-logo-row {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 28px;
        }
        .lp-form-logo {
          height: 42px;
          width: auto;
          filter: drop-shadow(0 2px 8px rgba(46,139,192,0.2));
        }
        .lp-form-logo-text {
          font-family: 'Cormorant Garamond', serif;
          font-size: 20px;
          font-weight: 600;
          color: #0d1f33;
          letter-spacing: -0.01em;
          line-height: 1;
        }
        .lp-form-logo-text span { color: #2E8BC0; }
        .lp-form-logo-sub {
          font-size: 11px;
          color: #b0aaa2;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          margin-top: 3px;
        }

        .lp-form-heading {
          font-family: 'Cormorant Garamond', serif;
          font-size: 38px;
          font-weight: 500;
          color: #0d1f33;
          letter-spacing: -0.025em;
          line-height: 1;
          margin-bottom: 8px;
        }
        .lp-form-sub {
          font-size: 14px;
          color: #a09890;
          line-height: 1.5;
        }

        /* Role tabs */
        .lp-role-tabs {
          display: flex;
          background: #f4f2ee;
          border-radius: 14px;
          padding: 5px;
          gap: 5px;
          margin-bottom: 28px;
        }
        .lp-role-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 11px 10px;
          border-radius: 10px;
          border: none;
          background: transparent;
          font-family: 'DM Sans', sans-serif;
          font-size: 13px;
          font-weight: 500;
          color: #a09890;
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }
        .lp-role-tab.active {
          background: #fff;
          color: #2E8BC0;
          box-shadow: 0 2px 8px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04);
        }
        .lp-role-tab-icon {
          width: 18px; height: 18px;
          border-radius: 50%;
          border: 1.5px solid currentColor;
          display: flex; align-items: center; justify-content: center;
          opacity: 0.6;
          flex-shrink: 0;
          transition: opacity 0.2s;
        }
        .lp-role-tab.active .lp-role-tab-icon { opacity: 1; }
        .lp-role-tab-icon-dot {
          width: 6px; height: 6px;
          border-radius: 50%;
          background: currentColor;
        }

        /* Fields */
        .lp-field { margin-bottom: 16px; }
        .lp-label {
          display: block;
          font-size: 11.5px;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.09em;
          color: #6b6560;
          margin-bottom: 7px;
        }
        .lp-input-wrap { position: relative; }
        .lp-input {
          width: 100%;
          padding: 13px 16px;
          border-radius: 12px;
          border: 1.5px solid #ebe7e1;
          background: #fafaf9;
          font-family: 'DM Sans', sans-serif;
          font-size: 14.5px;
          color: #0d1f33;
          outline: none;
          transition: border-color 0.18s, box-shadow 0.18s, background 0.18s;
          -webkit-appearance: none;
        }
        .lp-input:focus {
          border-color: #2E8BC0;
          background: #fff;
          box-shadow: 0 0 0 4px rgba(46,139,192,0.1);
        }
        .lp-input::placeholder { color: #cdc7be; }
        .lp-input.has-suffix { padding-right: 48px; }

        .lp-input-suffix {
          position: absolute;
          right: 13px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: #b0aaa2;
          display: flex;
          align-items: center;
          padding: 5px;
          border-radius: 6px;
          transition: color 0.15s, background 0.15s;
        }
        .lp-input-suffix:hover {
          color: #2E8BC0;
          background: rgba(46,139,192,0.08);
        }

        /* Forgot password row */
        .lp-forgot-row {
          display: flex;
          justify-content: flex-end;
          margin-top: -8px;
          margin-bottom: 22px;
        }

        /* Error */
        .lp-error {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 13px 15px;
          background: #fef2f2;
          border: 1px solid #fecaca;
          border-radius: 12px;
          margin-bottom: 18px;
          font-size: 13px;
          color: #b91c1c;
          line-height: 1.5;
          animation: shake 0.35s ease;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25%       { transform: translateX(-5px); }
          75%       { transform: translateX(5px); }
        }
        .lp-error-icon { flex-shrink: 0; margin-top: 1px; }

        /* Submit button */
        .lp-submit {
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: none;
          background: linear-gradient(135deg, #2E8BC0 0%, #3a9ecf 50%, #2E8BC0 100%);
          background-size: 200% 100%;
          color: #fff;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          margin-bottom: 0;
          letter-spacing: 0.01em;
          box-shadow: 0 2px 12px rgba(46,139,192,0.25);
          position: relative;
          overflow: hidden;
        }
        .lp-submit::after {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(180deg, rgba(255,255,255,0.1) 0%, transparent 100%);
          pointer-events: none;
        }
        .lp-submit:hover:not(:disabled) {
          background-position: 100% 0;
          transform: translateY(-1px);
          box-shadow: 0 6px 24px rgba(46,139,192,0.38);
        }
        .lp-submit:active:not(:disabled) {
          transform: translateY(0);
          box-shadow: 0 2px 8px rgba(46,139,192,0.2);
        }
        .lp-submit:disabled {
          opacity: 0.55;
          cursor: not-allowed;
          transform: none;
          box-shadow: none;
        }

        /* Spinner */
        .lp-spinner {
          width: 17px; height: 17px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.65s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Footer */
        .lp-form-footer {
          margin-top: 24px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 14px;
        }
        .lp-footer-main {
          font-size: 14px;
          color: #a09890;
        }
        .lp-footer-fine {
          font-size: 11px;
          color: #cdc7be;
          text-align: center;
          line-height: 1.6;
        }

        .lp-link {
          color: #2E8BC0;
          font-weight: 500;
          text-decoration: none;
          cursor: pointer;
          transition: color 0.15s;
          background: none;
          border: none;
          font-family: 'DM Sans', sans-serif;
          font-size: inherit;
          padding: 0;
        }
        .lp-link:hover { color: #0C3C60; text-decoration: underline; }
        .lp-link.sm { font-size: 13px; }

        /* Reset panel */
        .lp-reset-panel {
          background: linear-gradient(135deg, #f0f8ff 0%, #e8f4f8 100%);
          border: 1px solid #c8e4f4;
          border-radius: 16px;
          padding: 22px;
          margin-bottom: 22px;
          animation: slideDown 0.22s cubic-bezier(0.4,0,0.2,1);
        }
        @keyframes slideDown {
          from { opacity:0; transform:translateY(-10px); }
          to   { opacity:1; transform:translateY(0); }
        }
        .lp-reset-title {
          font-size: 14px;
          font-weight: 600;
          color: #0C3C60;
          margin-bottom: 5px;
        }
        .lp-reset-sub {
          font-size: 12.5px;
          color: #5a8fa8;
          margin-bottom: 16px;
          line-height: 1.5;
        }
        .lp-reset-row { display: flex; gap: 8px; }
        .lp-reset-btn {
          flex: 1; padding: 11px;
          border-radius: 10px;
          border: none;
          background: #2E8BC0;
          color: #fff;
          font-size: 13.5px;
          font-weight: 500;
          cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: background 0.15s;
        }
        .lp-reset-btn:hover:not(:disabled) { background: #0C3C60; }
        .lp-reset-cancel {
          padding: 11px 18px;
          border-radius: 10px;
          border: 1.5px solid #c8e4f4;
          background: transparent;
          font-size: 13.5px;
          cursor: pointer;
          color: #6b6560;
          font-family: 'DM Sans', sans-serif;
          transition: background 0.15s, border-color 0.15s;
        }
        .lp-reset-cancel:hover { background: #fff; border-color: #a8cfe4; }

        .lp-reset-success {
          text-align: center;
          padding: 4px 0;
          font-size: 13.5px;
          color: #2E8BC0;
          line-height: 1.6;
        }

        /* Divider */
        .lp-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin: 22px 0;
          color: #d6d0c8;
          font-size: 11.5px;
          letter-spacing: 0.04em;
        }
        .lp-divider::before, .lp-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #ede9e3;
        }

        /* Responsive */
        @media (max-width: 860px) {
          .lp-wrap { grid-template-columns: 1fr; }
          .lp-left { display: none; }
          .lp-right { padding: 40px 28px; }
        }
      `}</style>

      <div className="lp-wrap">
        {/* ── LEFT PANEL ── */}
        <div className="lp-left">
          <div className="lp-left-bg" />
          <div className="lp-left-dots" />
          <div className="lp-left-lines" />
          <div className="lp-accent-bar" />

          <div className="lp-brand">
            <div className="lp-brand-row">
              <div className="lp-brand-icon">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
              </div>
              <div>
                <div className="lp-brand-name">Physio<span>+</span> Hub</div>
              </div>
            </div>
            <div className="lp-brand-tag">Physiotherapy Management Platform</div>
          </div>

          <div className="lp-left-body">
            <div className="lp-left-eyebrow">Clinical Excellence</div>
            <div className="lp-left-heading">
              Your recovery,<br /><em>reimagined.</em>
            </div>
            <div className="lp-left-sub">
              A secure, clinical-grade platform connecting physiotherapists and patients — from initial assessment through to full rehabilitation.
            </div>
            <div className="lp-stats">
              {[
                { num: "2,400", accent: "+", label: "Active Patients" },
                { num: "340",   accent: "+", label: "Physiotherapists" },
                { num: "98",    accent: "%", label: "Satisfaction" },
              ].map((s) => (
                <div key={s.label} className="lp-stat">
                  <div className="lp-stat-num">{s.num}<span className="lp-stat-accent">{s.accent}</span></div>
                  <div className="lp-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-left-footer">© 2026 Physio+ Hub · HIPAA Compliant · End-to-End Encrypted</div>
        </div>

        {/* ── RIGHT PANEL ── */}
        <div className="lp-right">
          <div className="lp-form-box">

            <div className="lp-form-header">
              <div className="lp-form-logo-row">
                <img src={logo} alt="Physio+" className="lp-form-logo" />
                <div>
                  <div className="lp-form-logo-text">Physio<span>+</span> Clinic</div>
                  <div className="lp-form-logo-sub">Patient Portal</div>
                </div>
              </div>
              <div className="lp-form-heading">Welcome back</div>
              <div className="lp-form-sub">Sign in to your account to continue</div>
            </div>

            {/* Role tabs */}
            <div className="lp-role-tabs">
              {(["patient", "physiotherapist"] as RoleTab[]).map((r) => (
                <button
                  key={r}
                  className={`lp-role-tab ${role === r ? "active" : ""}`}
                  onClick={() => { setRole(r); setError(null); }}
                  type="button"
                >
                  <span className="lp-role-tab-icon">
                    <span className="lp-role-tab-icon-dot" />
                  </span>
                  {r === "patient" ? "Patient" : "Physiotherapist"}
                </button>
              ))}
            </div>

            {/* Password reset panel */}
            {showReset && (
              <div className="lp-reset-panel">
                {resetSent ? (
                  <div className="lp-reset-success">
                    ✓ Reset link sent to <strong>{resetEmail}</strong>.<br />Check your inbox.
                    <br />
                    <button className="lp-link" style={{ marginTop: 10, display: "inline-block" }} onClick={() => { setShowReset(false); setResetSent(false); }}>
                      Back to sign in
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="lp-reset-title">Reset your password</div>
                    <div className="lp-reset-sub">We'll send a reset link to your email address.</div>
                    <form onSubmit={handlePasswordReset}>
                      <input
                        className="lp-input"
                        type="email"
                        placeholder="Your email address"
                        value={resetEmail}
                        onChange={(e) => setResetEmail(e.target.value)}
                        required
                        style={{ marginBottom: 12 }}
                      />
                      <div className="lp-reset-row">
                        <button className="lp-reset-btn" type="submit" disabled={loading}>Send reset link</button>
                        <button className="lp-reset-cancel" type="button" onClick={() => setShowReset(false)}>Cancel</button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="lp-error" ref={(el) => el?.scrollIntoView({ behavior: "smooth", block: "nearest" })}>
                <svg className="lp-error-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
                {error}
              </div>
            )}

            {/* Login form */}
            {!showReset && (
              <form onSubmit={handleSubmit} noValidate>
                <div className="lp-field">
                  <label className="lp-label">Email address</label>
                  <input
                    className="lp-input"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError(null); }}
                    required
                    autoComplete="email"
                  />
                </div>

                <div className="lp-field">
                  <label className="lp-label">Password</label>
                  <div className="lp-input-wrap">
                    <input
                      className="lp-input has-suffix"
                      type={showPw ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError(null); }}
                      required
                      autoComplete="current-password"
                    />
                    <button className="lp-input-suffix" type="button" onClick={() => setShowPw(!showPw)} tabIndex={-1}>
                      {showPw
                        ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      }
                    </button>
                  </div>
                </div>

                <div className="lp-forgot-row">
                  <button type="button" className="lp-link sm" onClick={() => { setShowReset(true); setResetEmail(email); }}>
                    Forgot password?
                  </button>
                </div>

                <button className="lp-submit" type="submit" disabled={loading || !email || !password}>
                  {loading
                    ? <><div className="lp-spinner" />Signing in…</>
                    : `Sign in as ${role === "patient" ? "Patient" : "Physiotherapist"}`
                  }
                </button>
              </form>
            )}

            <div className="lp-form-footer">
              <div className="lp-footer-main">
                Don't have an account?{" "}
                <Link to="/register" className="lp-link">Create one</Link>
              </div>
              <div className="lp-footer-fine">
                By signing in you agree to our Terms of Service<br />and Privacy Policy
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
