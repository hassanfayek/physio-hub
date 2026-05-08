// FILE: src/features/auth/ClinicRegistrationPage.tsx
// Self-service clinic signup — creates clinic doc + manager auth account

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  createUserWithEmailAndPassword,
  updateProfile,
} from "firebase/auth";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../firebase";
import {
  createClinic,
  nameToSlug,
  isSlugAvailable,
  type ClinicPlan,
} from "../../services/clinicService";

type Step = "clinic" | "account" | "done";

export default function ClinicRegistrationPage() {
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>("clinic");

  const [clinicName,    setClinicName]    = useState("");
  const [slug,          setSlug]          = useState("");
  const [slugEdited,    setSlugEdited]    = useState(false);
  const [slugOk,        setSlugOk]        = useState<boolean | null>(null);
  const [slugChecking,  setSlugChecking]  = useState(false);
  const [phone,         setPhone]         = useState("");
  const [plan,          setPlan]          = useState<ClinicPlan>("starter");

  const [firstName, setFirstName] = useState("");
  const [lastName,  setLastName]  = useState("");
  const [email,     setEmail]     = useState("");
  const [password,  setPassword]  = useState("");

  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!slugEdited && clinicName) setSlug(nameToSlug(clinicName));
  }, [clinicName, slugEdited]);

  useEffect(() => {
    if (!slug || slug.length < 3) { setSlugOk(null); return; }
    setSlugChecking(true);
    const t = setTimeout(async () => {
      setSlugOk(await isSlugAvailable(slug));
      setSlugChecking(false);
    }, 600);
    return () => clearTimeout(t);
  }, [slug]);

  const handleSubmit = async () => {
    if (!firstName.trim() || !lastName.trim() || !email.trim() || password.length < 6) return;
    setLoading(true);
    setError(null);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      const { user }   = credential;
      const displayName = `${firstName.trim()} ${lastName.trim()}`;
      await updateProfile(user, { displayName });

      const clinic = await createClinic({
        slug:       slug.trim(),
        name:       clinicName.trim(),
        plan,
        ownerUid:   user.uid,
        ownerEmail: email.trim(),
        phone:      phone.trim(),
      });

      await setDoc(doc(db, "users", user.uid), {
        email:       email.trim(),
        role:        "clinic_manager",
        displayName,
        clinicId:    clinic.id,
        clinicSlug:  clinic.slug,
        createdAt:   serverTimestamp(),
        updatedAt:   serverTimestamp(),
      });

      await setDoc(doc(db, "physiotherapists", user.uid), {
        firstName:       firstName.trim(),
        lastName:        lastName.trim(),
        licenseNumber:   "",
        specializations: [],
        clinicName:      clinicName.trim(),
        phone:           phone.trim(),
        clinicId:        clinic.id,
        clinicSlug:      clinic.slug,
        createdAt:       serverTimestamp(),
      });

      setStep("done");
    } catch (err) {
      const e = err as { message?: string; code?: string };
      setError(
        e.code === "auth/email-already-in-use"
          ? "This email is already registered. Try logging in instead."
          : e.message ?? "Registration failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc", fontFamily: "'Outfit', sans-serif", display: "flex", flexDirection: "column" }}>
      <style>{`
        .cr-wrap {
          flex: 1; display: flex; align-items: center; justify-content: center;
          padding: 40px 20px;
        }
        .cr-card {
          background: #fff; border-radius: 24px; padding: 40px;
          width: 100%; max-width: 480px;
          box-shadow: 0 8px 40px rgba(0,0,0,0.08);
        }
        .cr-back {
          display: inline-flex; align-items: center; gap: 6px;
          font-size: 13px; color: #9a9590; cursor: pointer;
          margin-bottom: 28px; background: none; border: none; padding: 0;
        }
        .cr-back:hover { color: #2E8BC0; }
        .cr-logo { display: flex; align-items: center; gap: 8px; margin-bottom: 28px; }
        .cr-logo-icon {
          width: 32px; height: 32px; border-radius: 8px;
          background: linear-gradient(135deg, #0C3C60, #2E8BC0);
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-size: 16px;
        }
        .cr-logo-name { font-size: 17px; font-weight: 700; color: #0C3C60; }
        .cr-steps { display: flex; gap: 8px; margin-bottom: 28px; }
        .cr-step {
          height: 4px; border-radius: 100px; flex: 1;
          background: #e5e0d8; transition: background 0.3s;
        }
        .cr-step.active { background: #2E8BC0; }
        .cr-step.done   { background: #0C3C60; }
        .cr-title { font-size: 22px; font-weight: 700; color: #0C3C60; margin-bottom: 6px; }
        .cr-sub   { font-size: 14px; color: #9a9590; margin-bottom: 28px; }
        .cr-field { margin-bottom: 16px; }
        .cr-label {
          display: block; font-size: 12px; font-weight: 600; color: #5a5550;
          text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 6px;
        }
        .cr-input {
          width: 100%; padding: 11px 14px; border: 1.5px solid #e5e0d8;
          border-radius: 10px; font-family: 'Outfit', sans-serif; font-size: 14px;
          color: #1a1a1a; background: #fff; outline: none;
          transition: border-color 0.15s; box-sizing: border-box;
        }
        .cr-input:focus { border-color: #2E8BC0; }
        .cr-input.error   { border-color: #ef4444; }
        .cr-input.success { border-color: #22c55e; }
        .cr-slug-wrap { position: relative; }
        .cr-slug-prefix {
          position: absolute; left: 14px; top: 50%; transform: translateY(-50%);
          font-size: 12px; color: #9a9590; pointer-events: none; white-space: nowrap;
        }
        .cr-slug-input { padding-left: 126px !important; }
        .cr-slug-hint { font-size: 12px; margin-top: 5px; }
        .cr-slug-hint.ok      { color: #16a34a; }
        .cr-slug-hint.err     { color: #dc2626; }
        .cr-slug-hint.neutral { color: #9a9590; }
        .cr-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .cr-plan-grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px; margin-top: 6px; }
        .cr-plan-btn {
          padding: 10px 6px; border-radius: 10px; border: 1.5px solid #e5e0d8;
          background: #fafaf8; cursor: pointer; transition: all 0.15s; text-align: center;
          font-family: 'Outfit', sans-serif;
        }
        .cr-plan-btn.selected { border-color: #2E8BC0; background: #EAF5FC; }
        .cr-plan-btn-name  { font-size: 13px; font-weight: 700; color: #0C3C60; }
        .cr-plan-btn-price { font-size: 11px; color: #9a9590; margin-top: 2px; }
        .cr-error {
          background: #fff5f3; border: 1px solid #fecaca; border-radius: 10px;
          padding: 11px 14px; font-size: 13px; color: #b91c1c; margin-bottom: 16px;
        }
        .cr-btn-primary {
          width: 100%; padding: 13px; border-radius: 12px; border: none;
          background: linear-gradient(135deg, #0C3C60, #2E8BC0);
          color: #fff; font-family: 'Outfit', sans-serif; font-size: 15px;
          font-weight: 600; cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .cr-btn-primary:hover:not(:disabled) { opacity: 0.9; transform: translateY(-1px); }
        .cr-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
        .cr-spinner {
          width: 16px; height: 16px; border: 2px solid rgba(255,255,255,0.35);
          border-top-color: #fff; border-radius: 50%;
          animation: crSpin 0.7s linear infinite;
        }
        @keyframes crSpin { to { transform: rotate(360deg); } }
        .cr-login-link { text-align: center; font-size: 13px; color: #9a9590; margin-top: 16px; }
        .cr-login-link a { color: #2E8BC0; font-weight: 600; cursor: pointer; text-decoration: none; }
        .cr-success-icon  { font-size: 56px; text-align: center; margin-bottom: 20px; }
        .cr-success-title { font-size: 24px; font-weight: 700; color: #0C3C60; text-align: center; margin-bottom: 10px; }
        .cr-success-sub   { font-size: 15px; color: #5a5550; text-align: center; line-height: 1.6; margin-bottom: 28px; }
      `}</style>

      <div className="cr-wrap">
        <div className="cr-card">
          <button className="cr-back" onClick={() => step === "account" ? setStep("clinic") : navigate("/")}>
            ← {step === "account" ? "Back" : "Home"}
          </button>

          <div className="cr-logo">
            <div className="cr-logo-icon">🦴</div>
            <span className="cr-logo-name">Physio+</span>
          </div>

          {step !== "done" && (
            <div className="cr-steps">
              <div className={`cr-step ${step === "clinic" ? "active" : "done"}`} />
              <div className={`cr-step ${step === "account" ? "active" : step === "done" ? "done" : ""}`} />
            </div>
          )}

          {step === "clinic" && (
            <>
              <div className="cr-title">Set up your clinic</div>
              <div className="cr-sub">This is how your clinic will appear on the platform.</div>

              <div className="cr-field">
                <label className="cr-label">Clinic Name *</label>
                <input
                  className="cr-input" placeholder="e.g. Cairo Physio Center"
                  value={clinicName}
                  onChange={(e) => setClinicName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="cr-field">
                <label className="cr-label">Clinic URL</label>
                <div className="cr-slug-wrap">
                  <span className="cr-slug-prefix">physioplus.app/c/</span>
                  <input
                    className={`cr-input cr-slug-input ${slugOk === true ? "success" : slugOk === false ? "error" : ""}`}
                    value={slug}
                    onChange={(e) => { setSlug(nameToSlug(e.target.value)); setSlugEdited(true); }}
                    placeholder="your-clinic"
                  />
                </div>
                {slugChecking && <div className="cr-slug-hint neutral">Checking availability…</div>}
                {!slugChecking && slugOk === true  && <div className="cr-slug-hint ok">✓ Available</div>}
                {!slugChecking && slugOk === false && <div className="cr-slug-hint err">✗ Already taken — try another</div>}
              </div>

              <div className="cr-field">
                <label className="cr-label">Phone (optional)</label>
                <input className="cr-input" placeholder="+20 100 000 0000" value={phone}
                  onChange={(e) => setPhone(e.target.value)} />
              </div>

              <div className="cr-field">
                <label className="cr-label">Plan</label>
                <div className="cr-plan-grid">
                  {(["starter", "clinic", "enterprise"] as ClinicPlan[]).map((p) => (
                    <button
                      key={p} type="button"
                      className={`cr-plan-btn ${plan === p ? "selected" : ""}`}
                      onClick={() => setPlan(p)}
                    >
                      <div className="cr-plan-btn-name">{p.charAt(0).toUpperCase() + p.slice(1)}</div>
                      <div className="cr-plan-btn-price">
                        {p === "starter" ? "Free trial" : p === "clinic" ? "EGP 1,299" : "Custom"}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <button
                className="cr-btn-primary"
                disabled={!clinicName.trim() || slug.length < 3 || slugOk !== true}
                onClick={() => setStep("account")}
              >
                Continue →
              </button>
            </>
          )}

          {step === "account" && (
            <>
              <div className="cr-title">Create your account</div>
              <div className="cr-sub">You'll be the clinic manager for <strong>{clinicName}</strong>.</div>

              {error && <div className="cr-error">{error}</div>}

              <div className="cr-grid2">
                <div className="cr-field">
                  <label className="cr-label">First Name *</label>
                  <input className="cr-input" placeholder="Ahmed" value={firstName}
                    onChange={(e) => setFirstName(e.target.value)} autoFocus />
                </div>
                <div className="cr-field">
                  <label className="cr-label">Last Name *</label>
                  <input className="cr-input" placeholder="Hassan" value={lastName}
                    onChange={(e) => setLastName(e.target.value)} />
                </div>
              </div>

              <div className="cr-field">
                <label className="cr-label">Email *</label>
                <input className="cr-input" type="email" placeholder="you@clinic.com" value={email}
                  onChange={(e) => setEmail(e.target.value)} />
              </div>

              <div className="cr-field">
                <label className="cr-label">Password *</label>
                <input className="cr-input" type="password" placeholder="At least 6 characters" value={password}
                  onChange={(e) => setPassword(e.target.value)} />
              </div>

              <button
                className="cr-btn-primary"
                disabled={!firstName.trim() || !lastName.trim() || !email.trim() || password.length < 6 || loading}
                onClick={handleSubmit}
              >
                {loading ? <><div className="cr-spinner" /> Creating clinic…</> : "Create clinic & sign in"}
              </button>

              <div className="cr-login-link">
                Already have an account?{" "}
                <a onClick={() => navigate("/login")}>Log in</a>
              </div>
            </>
          )}

          {step === "done" && (
            <>
              <div className="cr-success-icon">🎉</div>
              <div className="cr-success-title">Welcome to Physio+!</div>
              <div className="cr-success-sub">
                Your clinic <strong>{clinicName}</strong> is ready.<br />
                Your 14-day free trial has started.
              </div>
              <button className="cr-btn-primary" onClick={() => navigate("/login")}>
                Go to your dashboard →
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
