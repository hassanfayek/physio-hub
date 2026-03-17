// src/features/auth/LoginPage.tsx
import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { login, sendPasswordReset, parseFirebaseError } from "../../services/authService";

type RoleTab = "patient" | "physiotherapist";

export default function LoginPage() {
  const navigate = useNavigate();

  const [role,     setRole]     = useState<RoleTab>("patient");
  const [email,    setEmail]    = useState("");
  const [password, setPassword] = useState("");
  const [showPw,   setShowPw]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [resetSent,setResetSent]= useState(false);
  const [resetEmail,setResetEmail]=useState("");
  const [showReset,setShowReset]  = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const profile = await login(email, password);

      // Guard: ensure the logged-in role matches the selected tab
      if (profile.role !== role) {
        setError(
          role === "patient"
            ? "This account is registered as a Physiotherapist. Please use the Physiotherapist tab."
            : "This account is registered as a Patient. Please use the Patient tab."
        );
        setLoading(false);
        return;
      }

      navigate(role === "patient" ? "/patient" : "/physio");
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
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,400;0,500;0,600;1,400&family=DM+Sans:wght@300;400;500&display=swap');

        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'DM Sans', sans-serif; }

        .lp-wrap {
          min-height: 100vh;
          display: grid;
          grid-template-columns: 1fr 1fr;
          font-family: 'DM Sans', sans-serif;
        }

        /* ── LEFT PANEL ── */
        .lp-left {
          background: #071E3D;
          position: relative;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          padding: 48px;
        }
        .lp-left-grid {
          position: absolute;
          inset: 0;
          background-image:
            linear-gradient(rgba(82,183,136,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(82,183,136,0.04) 1px, transparent 1px);
          background-size: 48px 48px;
        }
        .lp-left-glow {
          position: absolute;
          border-radius: 50%;
          filter: blur(80px);
          pointer-events: none;
        }
        .lp-glow-1 { width: 400px; height: 400px; background: rgba(46,139,192,0.25); top: -100px; left: -100px; }
        .lp-glow-2 { width: 300px; height: 300px; background: rgba(91,192,190,0.12); bottom: 0; right: -60px; }

        .lp-brand {
          position: relative;
          z-index: 1;
        }
        .lp-brand-name {
          font-family: 'Cormorant Garamond', serif;
          font-size: 28px;
          font-weight: 600;
          color: #fff;
          letter-spacing: -0.02em;
          margin-bottom: 8px;
        }
        .lp-brand-name span { color: #5BC0BE; }
        .lp-brand-tag {
          font-size: 12px;
          color: rgba(255,255,255,0.35);
          letter-spacing: 0.1em;
          text-transform: uppercase;
        }

        .lp-left-body {
          position: relative;
          z-index: 1;
        }
        .lp-left-heading {
          font-family: 'Cormorant Garamond', serif;
          font-size: 52px;
          font-weight: 500;
          color: #fff;
          line-height: 1.1;
          letter-spacing: -0.03em;
          margin-bottom: 20px;
        }
        .lp-left-heading em { color: #5BC0BE; font-style: italic; }
        .lp-left-sub {
          font-size: 15px;
          color: rgba(255,255,255,0.45);
          line-height: 1.7;
          max-width: 360px;
          margin-bottom: 40px;
        }

        .lp-stats {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 12px;
        }
        .lp-stat {
          background: rgba(255,255,255,0.04);
          border: 1px solid rgba(82,183,136,0.15);
          border-radius: 12px;
          padding: 16px;
        }
        .lp-stat-num {
          font-family: 'Cormorant Garamond', serif;
          font-size: 28px;
          font-weight: 600;
          color: #5BC0BE;
          line-height: 1;
          margin-bottom: 4px;
        }
        .lp-stat-label { font-size: 11px; color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 0.08em; }

        .lp-left-footer {
          position: relative;
          z-index: 1;
          font-size: 11.5px;
          color: rgba(255,255,255,0.2);
          letter-spacing: 0.04em;
        }

        /* ── RIGHT PANEL ── */
        .lp-right {
          background: #f8f6f2;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 48px 40px;
        }
        .lp-form-box {
          width: 100%;
          max-width: 420px;
        }

        .lp-form-heading {
          font-family: 'Cormorant Garamond', serif;
          font-size: 36px;
          font-weight: 500;
          color: #1a1a1a;
          letter-spacing: -0.02em;
          margin-bottom: 6px;
        }
        .lp-form-sub {
          font-size: 14px;
          color: #9a9590;
          margin-bottom: 28px;
        }

        /* Role tabs */
        .lp-role-tabs {
          display: flex;
          background: #ede9e3;
          border-radius: 12px;
          padding: 4px;
          gap: 4px;
          margin-bottom: 28px;
        }
        .lp-role-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          padding: 10px;
          border-radius: 9px;
          border: none;
          background: transparent;
          font-family: 'DM Sans', sans-serif;
          font-size: 13.5px;
          font-weight: 500;
          color: #9a9590;
          cursor: pointer;
          transition: all 0.2s;
        }
        .lp-role-tab.active {
          background: #fff;
          color: #2E8BC0;
          box-shadow: 0 1px 6px rgba(0,0,0,0.08);
        }
        .lp-role-tab-dot {
          width: 7px; height: 7px;
          border-radius: 50%;
          background: currentColor;
          opacity: 0.5;
        }
        .lp-role-tab.active .lp-role-tab-dot { opacity: 1; }

        /* Form fields */
        .lp-field { margin-bottom: 14px; }
        .lp-label {
          display: block;
          font-size: 12px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #5a5550;
          margin-bottom: 6px;
        }
        .lp-input-wrap { position: relative; }
        .lp-input {
          width: 100%;
          padding: 12px 16px;
          border-radius: 10px;
          border: 1.5px solid #e5e0d8;
          background: #fff;
          font-family: 'DM Sans', sans-serif;
          font-size: 14.5px;
          color: #1a1a1a;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .lp-input:focus {
          border-color: #5BC0BE;
          box-shadow: 0 0 0 3px rgba(82,183,136,0.12);
        }
        .lp-input::placeholder { color: #c0bbb4; }
        .lp-input.has-suffix { padding-right: 44px; }
        .lp-input-suffix {
          position: absolute;
          right: 12px;
          top: 50%;
          transform: translateY(-50%);
          background: none;
          border: none;
          cursor: pointer;
          color: #9a9590;
          display: flex;
          align-items: center;
          padding: 4px;
          transition: color 0.15s;
        }
        .lp-input-suffix:hover { color: #2E8BC0; }

        /* Error banner */
        .lp-error {
          display: flex;
          align-items: flex-start;
          gap: 9px;
          padding: 12px 14px;
          background: #fff5f3;
          border: 1px solid #fecaca;
          border-radius: 10px;
          margin-bottom: 16px;
          font-size: 13px;
          color: #b91c1c;
          line-height: 1.5;
          animation: shake 0.3s ease;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          20%       { transform: translateX(-4px); }
          60%       { transform: translateX(4px); }
        }

        /* Submit */
        .lp-submit {
          width: 100%;
          padding: 14px;
          border-radius: 12px;
          border: none;
          background: #2E8BC0;
          color: #fff;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px;
          font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 16px;
          position: relative;
          overflow: hidden;
        }
        .lp-submit:hover:not(:disabled) {
          background: #0C3C60;
          transform: translateY(-1px);
          box-shadow: 0 4px 20px rgba(46,139,192,0.3);
        }
        .lp-submit:disabled {
          opacity: 0.65;
          cursor: not-allowed;
          transform: none;
        }

        /* Spinner */
        .lp-spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .lp-divider {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 16px;
          color: #c0bbb4;
          font-size: 12px;
        }
        .lp-divider::before, .lp-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: #e5e0d8;
        }

        .lp-footer-links {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 10px;
          font-size: 13.5px;
          color: #9a9590;
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
          font-size: 13.5px;
          padding: 0;
        }
        .lp-link:hover { color: #0C3C60; text-decoration: underline; }

        /* Reset panel */
        .lp-reset-panel {
          background: #f0f7f4;
          border: 1px solid #B3DEF0;
          border-radius: 14px;
          padding: 20px;
          margin-bottom: 20px;
          animation: fadeIn 0.2s ease;
        }
        @keyframes fadeIn { from { opacity:0; transform:translateY(-6px); } to { opacity:1; transform:translateY(0); } }
        .lp-reset-title { font-size: 14px; font-weight: 600; color: #0C3C60; margin-bottom: 4px; }
        .lp-reset-sub { font-size: 12.5px; color: #5BC0BE; margin-bottom: 14px; }
        .lp-reset-row { display: flex; gap: 8px; }
        .lp-reset-btn {
          flex: 1; padding: 10px; border-radius: 9px;
          border: none; background: #2E8BC0; color: #fff;
          font-size: 13.5px; cursor: pointer;
          font-family: 'DM Sans', sans-serif;
          transition: background 0.15s;
        }
        .lp-reset-btn:hover { background: #0C3C60; }
        .lp-reset-cancel {
          padding: 10px 16px; border-radius: 9px;
          border: 1px solid #B3DEF0; background: transparent;
          font-size: 13.5px; cursor: pointer; color: #5a5550;
          font-family: 'DM Sans', sans-serif;
          transition: background 0.15s;
        }
        .lp-reset-cancel:hover { background: #e6f4ed; }

        .lp-reset-success {
          text-align: center;
          padding: 8px 0;
          font-size: 13.5px;
          color: #2E8BC0;
        }

        /* Responsive */
        @media (max-width: 768px) {
          .lp-wrap { grid-template-columns: 1fr; }
          .lp-left { display: none; }
          .lp-right { padding: 32px 24px; }
        }
      `}</style>

      <div className="lp-wrap">
        {/* ── LEFT DECORATIVE PANEL ── */}
        <div className="lp-left">
          <div className="lp-left-grid" />
          <div className="lp-left-glow lp-glow-1" />
          <div className="lp-left-glow lp-glow-2" />

          <div className="lp-brand">
            <div className="lp-brand-name">Physio<span>+</span> Hub</div>
            <div className="lp-brand-tag">Physiotherapy Management Platform</div>
          </div>

          <div className="lp-left-body">
            <div className="lp-left-heading">
              Your recovery,<br /><em>reimagined.</em>
            </div>
            <div className="lp-left-sub">
              A secure, clinical-grade platform connecting physiotherapists and patients — from initial assessment through to full rehabilitation.
            </div>
            <div className="lp-stats">
              {[
                { num: "2,400+", label: "Patients" },
                { num: "340+",   label: "Physios" },
                { num: "98%",    label: "Satisfaction" },
              ].map((s) => (
                <div key={s.label} className="lp-stat">
                  <div className="lp-stat-num">{s.num}</div>
                  <div className="lp-stat-label">{s.label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="lp-left-footer">© 2026 Physio+ Hub · HIPAA Compliant · End-to-End Encrypted</div>
        </div>

        {/* ── RIGHT FORM PANEL ── */}
        <div className="lp-right">
          <div className="lp-form-box">
            <div className="lp-form-heading">Welcome back</div>
            <div className="lp-form-sub">Sign in to your Physio+ Hub account</div>

            {/* Role tabs */}
            <div className="lp-role-tabs">
              {(["patient", "physiotherapist"] as RoleTab[]).map((r) => (
                <button
                  key={r}
                  className={`lp-role-tab ${role === r ? "active" : ""}`}
                  onClick={() => { setRole(r); setError(null); }}
                  type="button"
                >
                  <span className="lp-role-tab-dot" />
                  {r === "patient" ? "Patient" : "Physiotherapist"}
                </button>
              ))}
            </div>

            {/* Password reset panel */}
            {showReset && (
              <div className="lp-reset-panel">
                {resetSent ? (
                  <div className="lp-reset-success">
                    ✓ Reset email sent to <strong>{resetEmail}</strong>. Check your inbox.
                    <br />
                    <button className="lp-link" style={{ marginTop: 8 }} onClick={() => { setShowReset(false); setResetSent(false); }}>Back to login</button>
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
                        style={{ marginBottom: 10 }}
                      />
                      <div className="lp-reset-row">
                        <button className="lp-reset-btn" type="submit" disabled={loading}>Send link</button>
                        <button className="lp-reset-cancel" type="button" onClick={() => setShowReset(false)}>Cancel</button>
                      </div>
                    </form>
                  </>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="lp-error">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}>
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
                    <button className="lp-input-suffix" type="button" onClick={() => setShowPw(!showPw)}>
                      {showPw
                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      }
                    </button>
                  </div>
                </div>

                <div style={{ textAlign: "right", marginBottom: 20, marginTop: -4 }}>
                  <button type="button" className="lp-link" style={{ fontSize: 13 }} onClick={() => { setShowReset(true); setResetEmail(email); }}>
                    Forgot password?
                  </button>
                </div>

                <button className="lp-submit" type="submit" disabled={loading || !email || !password}>
                  {loading
                    ? <><div className="lp-spinner" /> Signing in…</>
                    : `Sign in as ${role === "patient" ? "Patient" : "Physiotherapist"}`
                  }
                </button>
              </form>
            )}

            <div className="lp-divider">or</div>

            <div className="lp-footer-links">
              <span>
                Don't have an account?{" "}
                <Link to="/register" className="lp-link">Create one</Link>
              </span>
              <span style={{ fontSize: 11.5, color: "#c0bbb4" }}>
                By signing in you agree to our Terms of Service and Privacy Policy
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
