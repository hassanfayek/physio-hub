// src/features/auth/RegisterPage.tsx
import { useState, type FormEvent, type ChangeEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { AlertCircle, User, Stethoscope, Eye, EyeOff, Check, X, ArrowRight, ArrowLeft } from "lucide-react";
import { useLang } from "../../contexts/LanguageContext";
import {
  registerPatient,
  registerPhysio,
  parseFirebaseError,
  type RegisterPatientData,
  type RegisterPhysioData,
} from "../../services/authService";

type RoleTab = "patient" | "physiotherapist";
type Step = 1 | 2;

const SPECIALIZATIONS = [
  "Sports Physiotherapy",
  "Neurological Rehabilitation",
  "Orthopaedic",
  "Paediatrics",
  "Cardiorespiratory",
  "Women's Health",
  "Geriatrics",
  "Musculoskeletal",
];

// ─── shared field components ──────────────────────────────────────────────────

function Field({
  label, children, hint,
}: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <div className="rp-field">
      <label className="rp-label">{label}</label>
      {children}
      {hint && <div className="rp-hint">{hint}</div>}
    </div>
  );
}

function Input({
  type = "text", ...rest
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="rp-input" type={type} {...rest} />;
}

// ─── password strength ────────────────────────────────────────────────────────

function passwordStrength(pw: string): { score: number; label: string; color: string } {
  let score = 0;
  if (pw.length >= 8)  score++;
  if (/[A-Z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  const levels = [
    { label: "",        color: "#e5e0d8" },
    { label: "Weak",    color: "#ef4444" },
    { label: "Fair",    color: "#f97316" },
    { label: "Good",    color: "#eab308" },
    { label: "Strong",  color: "#22c55e" },
  ];
  return { score, ...levels[score] };
}

// ─── main component ───────────────────────────────────────────────────────────

export default function RegisterPage() {
  const navigate = useNavigate();
  const { lang, toggleLang } = useLang();

  const [role,    setRole]    = useState<RoleTab>("patient");
  const [step,    setStep]    = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [showPw,  setShowPw]  = useState(false);

  // ── Patient fields ──
  const [pat, setPat] = useState<RegisterPatientData>({
    email: "", password: "", firstName: "", lastName: "",
    dateOfBirth: "", phone: "",
  });

  // ── Physio fields ──
  const [phy, setPhy] = useState<RegisterPhysioData>({
    email: "", password: "", firstName: "", lastName: "",
    licenseNumber: "", specializations: [], clinicName: "", phone: "",
  });

  const [confirmPw, setConfirmPw] = useState("");

  // ── helpers ──
  const patSet = (k: keyof RegisterPatientData) => (e: ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setPat((p) => ({ ...p, [k]: e.target.value }));

  const phySet = (k: keyof RegisterPhysioData) => (e: ChangeEvent<HTMLInputElement>) =>
    setPhy((p) => ({ ...p, [k]: e.target.value }));

  const toggleSpec = (s: string) =>
    setPhy((p) => ({
      ...p,
      specializations: p.specializations.includes(s)
        ? p.specializations.filter((x) => x !== s)
        : [...p.specializations, s],
    }));

  const currentPassword = role === "patient" ? pat.password : phy.password;
  const pwStrength = passwordStrength(currentPassword);

  // ── step-1 validation ──
  const step1Valid = role === "patient"
    ? pat.firstName && pat.lastName && pat.email && pat.password && pat.password === confirmPw && pat.password.length >= 6
    : phy.firstName && phy.lastName && phy.email && phy.password && phy.password === confirmPw && phy.password.length >= 6;

  // ── step-2 validation ──
  const step2Valid = role === "patient"
    ? pat.dateOfBirth && pat.phone
    : phy.licenseNumber && phy.clinicName && phy.phone && phy.specializations.length > 0;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (step === 1) { setStep(2); return; }

    setError(null);
    setLoading(true);
    try {
      if (role === "patient") {
        await registerPatient(pat);
        navigate("/patient");
      } else {
        await registerPhysio(phy);
        navigate("/physio");
      }
    } catch (err) {
      setError(parseFirebaseError(err).message);
      setStep(1); // send back to step 1 on auth errors
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

        .rp-wrap {
          min-height: 100vh;
          background: #f8f6f2;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          padding: 48px 24px;
          font-family: 'DM Sans', sans-serif;
        }

        .rp-box {
          width: 100%;
          max-width: 540px;
        }

        /* Top brand row */
        .rp-brand-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 36px;
        }
        .rp-brand {
          font-family: 'Cormorant Garamond', serif;
          font-size: 22px;
          font-weight: 600;
          color: #1a1a1a;
          letter-spacing: -0.02em;
          text-decoration: none;
        }
        .rp-brand span { color: #2d6a4f; }
        .rp-login-link {
          font-size: 13.5px;
          color: #9a9590;
        }
        .rp-link {
          color: #2d6a4f;
          font-weight: 500;
          text-decoration: none;
          margin-left: 4px;
          transition: color 0.15s;
        }
        .rp-link:hover { color: #1b4332; }

        /* Stepper */
        .rp-stepper {
          display: flex;
          align-items: center;
          gap: 0;
          margin-bottom: 32px;
        }
        .rp-step {
          display: flex;
          align-items: center;
          gap: 10px;
          flex: 1;
        }
        .rp-step-circle {
          width: 32px; height: 32px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px;
          font-weight: 600;
          flex-shrink: 0;
          border: 2px solid;
          transition: all 0.2s;
        }
        .rp-step-circle.done   { background: #2d6a4f; border-color: #2d6a4f; color: #fff; }
        .rp-step-circle.active { background: #fff; border-color: #2d6a4f; color: #2d6a4f; box-shadow: 0 0 0 4px rgba(45,106,79,0.1); }
        .rp-step-circle.idle   { background: #fff; border-color: #e5e0d8; color: #c0bbb4; }
        .rp-step-text { font-size: 13px; font-weight: 500; color: #9a9590; }
        .rp-step-text.active { color: #1a1a1a; }
        .rp-step-line { flex: 1; height: 2px; background: #e5e0d8; margin: 0 12px; }
        .rp-step-line.done { background: #2d6a4f; }

        /* Card */
        .rp-card {
          background: #fff;
          border: 1px solid #e5e0d8;
          border-radius: 20px;
          padding: 36px;
          box-shadow: 0 2px 20px rgba(0,0,0,0.06);
          animation: fadeUp 0.3s ease both;
        }
        @keyframes fadeUp { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }

        .rp-card-title {
          font-family: 'Cormorant Garamond', serif;
          font-size: 28px;
          font-weight: 500;
          color: #1a1a1a;
          letter-spacing: -0.02em;
          margin-bottom: 4px;
        }
        .rp-card-sub { font-size: 13.5px; color: #9a9590; margin-bottom: 24px; }

        /* Role tabs */
        .rp-role-tabs {
          display: flex;
          background: #f0ede8;
          border-radius: 12px;
          padding: 4px;
          gap: 4px;
          margin-bottom: 24px;
        }
        .rp-role-tab {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px;
          border-radius: 9px;
          border: none;
          font-family: 'DM Sans', sans-serif;
          font-size: 13.5px;
          font-weight: 500;
          color: #9a9590;
          background: transparent;
          cursor: pointer;
          transition: all 0.2s;
        }
        .rp-role-tab.active { background: #fff; color: #2d6a4f; box-shadow: 0 1px 6px rgba(0,0,0,0.07); }

        /* Fields */
        .rp-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
        .rp-field { margin-bottom: 14px; }
        .rp-label {
          display: block;
          font-size: 11.5px;
          font-weight: 500;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #5a5550;
          margin-bottom: 6px;
        }
        .rp-input {
          width: 100%;
          padding: 11px 14px;
          border-radius: 10px;
          border: 1.5px solid #e5e0d8;
          background: #fafaf8;
          font-family: 'DM Sans', sans-serif;
          font-size: 14px;
          color: #1a1a1a;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .rp-input:focus { border-color: #52b788; box-shadow: 0 0 0 3px rgba(82,183,136,0.1); background: #fff; }
        .rp-input::placeholder { color: #c0bbb4; }
        .rp-hint { font-size: 11.5px; color: #b0aaa5; margin-top: 4px; }

        .rp-pw-wrap { position: relative; }
        .rp-pw-toggle {
          position: absolute; right: 12px; top: 50%;
          transform: translateY(-50%);
          background: none; border: none;
          cursor: pointer; color: #9a9590;
          display: flex; align-items: center; padding: 4px;
          transition: color 0.15s;
        }
        .rp-pw-toggle:hover { color: #2d6a4f; }

        /* Password strength */
        .rp-strength { margin-top: 6px; }
        .rp-strength-bars { display: flex; gap: 4px; margin-bottom: 4px; }
        .rp-strength-bar {
          flex: 1; height: 4px; border-radius: 4px;
          background: #e5e0d8;
          transition: background 0.3s;
        }
        .rp-strength-label { font-size: 11.5px; }

        .rp-pw-match {
          font-size: 11.5px;
          margin-top: 4px;
          display: flex;
          align-items: center;
          gap: 5px;
        }

        /* Specializations */
        .rp-spec-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        .rp-spec-item {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 9px 12px;
          border-radius: 9px;
          border: 1.5px solid #e5e0d8;
          background: #fafaf8;
          cursor: pointer;
          transition: all 0.15s;
          font-size: 13px;
          color: #5a5550;
        }
        .rp-spec-item:hover { border-color: #b7e4c7; }
        .rp-spec-item.selected {
          border-color: #52b788;
          background: #f0f7f4;
          color: #2d6a4f;
        }
        .rp-spec-check {
          width: 16px; height: 16px;
          border-radius: 4px;
          border: 1.5px solid #e5e0d8;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          transition: all 0.15s;
        }
        .rp-spec-item.selected .rp-spec-check {
          background: #2d6a4f;
          border-color: #2d6a4f;
        }

        /* Terms */
        .rp-terms {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          padding: 14px;
          background: #f8f6f2;
          border: 1px solid #e5e0d8;
          border-radius: 10px;
          margin-bottom: 16px;
          font-size: 12.5px;
          color: #5a5550;
          line-height: 1.5;
          cursor: pointer;
        }
        .rp-terms-check {
          width: 18px; height: 18px;
          border-radius: 5px;
          border: 1.5px solid #c0bbb4;
          display: flex; align-items: center; justify-content: center;
          flex-shrink: 0;
          margin-top: 1px;
          transition: all 0.15s;
          background: #fff;
        }
        .rp-terms-check.checked { background: #2d6a4f; border-color: #2d6a4f; }

        /* Error */
        .rp-error {
          display: flex; align-items: flex-start; gap: 9px;
          padding: 12px 14px;
          background: #fff5f3; border: 1px solid #fecaca;
          border-radius: 10px; margin-bottom: 16px;
          font-size: 13px; color: #b91c1c; line-height: 1.5;
        }

        /* Actions */
        .rp-actions { display: flex; gap: 10px; margin-top: 4px; }
        .rp-back-btn {
          padding: 13px 20px; border-radius: 12px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'DM Sans', sans-serif;
          font-size: 14.5px; font-weight: 500;
          color: #5a5550; cursor: pointer;
          transition: all 0.15s;
          display: flex; align-items: center; gap: 6px;
        }
        .rp-back-btn:hover { background: #f5f3ef; border-color: #c0bbb4; }
        .rp-submit {
          flex: 1; padding: 13px;
          border-radius: 12px; border: none;
          background: #2d6a4f; color: #fff;
          font-family: 'DM Sans', sans-serif;
          font-size: 15px; font-weight: 500;
          cursor: pointer;
          transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
        }
        .rp-submit:hover:not(:disabled) { background: #1b4332; box-shadow: 0 4px 20px rgba(45,106,79,0.25); }
        .rp-submit:disabled { opacity: 0.55; cursor: not-allowed; }

        .rp-spinner {
          width: 18px; height: 18px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #fff;
          border-radius: 50%;
          animation: spin 0.7s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        /* Role badge for step 2 */
        .rp-role-badge {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 4px 12px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 500;
          background: #d8f3dc;
          color: #1b4332;
          margin-bottom: 20px;
        }

        .rp-input { min-height: 44px; }
        .rp-submit { min-height: 52px; }
        .rp-back-btn { min-height: 52px; }
        .rp-role-tab { min-height: 44px; }
        .rp-spec-item { min-height: 44px; }

        @media (max-width: 540px) {
          .rp-grid-2 { grid-template-columns: 1fr; }
          .rp-spec-grid { grid-template-columns: 1fr; }
          .rp-card { padding: 20px 16px; border-radius: 16px; }
          .rp-wrap { padding: 20px 14px; }
          .rp-brand-row { margin-bottom: 20px; }
          .rp-stepper { margin-bottom: 20px; }
          .rp-card-title { font-size: 22px; }
          .rp-card-sub { margin-bottom: 16px; }
          .rp-input { font-size: 15px; }
          .rp-actions { flex-direction: column; }
          .rp-back-btn { justify-content: center; }
        }
      `}</style>

      <div className="rp-wrap">
        <div className="rp-box">
          {/* Brand row */}
          <div className="rp-brand-row">
            <Link to="/" className="rp-brand">Physio<span>+</span> Hub</Link>
            <span className="rp-login-link">
              Already registered?
              <Link to="/" className="rp-link">Sign in</Link>
            </span>
            <button className="lang-toggle" onClick={toggleLang} title="Switch language" style={{ marginLeft: 8 }}>
              {lang === "en" ? "🌐 العربية" : "🌐 English"}
            </button>
          </div>

          {/* Stepper */}
          <div className="rp-stepper">
            <div className="rp-step">
              <div className={`rp-step-circle ${step > 1 ? "done" : step === 1 ? "active" : "idle"}`}>
                {step > 1 ? "✓" : "1"}
              </div>
              <span className={`rp-step-text ${step === 1 ? "active" : ""}`}>Account</span>
            </div>
            <div className={`rp-step-line ${step > 1 ? "done" : ""}`} />
            <div className="rp-step">
              <div className={`rp-step-circle ${step === 2 ? "active" : "idle"}`}>2</div>
              <span className={`rp-step-text ${step === 2 ? "active" : ""}`}>Profile</span>
            </div>
          </div>

          <div className="rp-card" key={`step-${step}`}>
            {/* Error */}
            {error && (
              <div className="rp-error">
                <AlertCircle size={16} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                {error}
              </div>
            )}

            {/* ── STEP 1 ── */}
            {step === 1 && (
              <>
                <div className="rp-card-title">Create your account</div>
                <div className="rp-card-sub">Set up your Physio+ Hub login credentials</div>

                {/* Role selector */}
                <div className="rp-role-tabs">
                  {(["patient", "physiotherapist"] as RoleTab[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`rp-role-tab ${role === r ? "active" : ""}`}
                      onClick={() => { setRole(r); setError(null); }}
                    >
                      {r === "patient"
                        ? <User size={15} strokeWidth={2} />
                        : <Stethoscope size={15} strokeWidth={2} />
                      }
                      {r === "patient" ? "Patient" : "Physiotherapist"}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleSubmit} noValidate>
                  <div className="rp-grid-2">
                    <Field label="First name">
                      <Input
                        placeholder="Alex"
                        value={role === "patient" ? pat.firstName : phy.firstName}
                        onChange={role === "patient" ? patSet("firstName") : phySet("firstName")}
                        required
                      />
                    </Field>
                    <Field label="Last name">
                      <Input
                        placeholder="Johnson"
                        value={role === "patient" ? pat.lastName : phy.lastName}
                        onChange={role === "patient" ? patSet("lastName") : phySet("lastName")}
                        required
                      />
                    </Field>
                  </div>

                  <Field label="Email address">
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={role === "patient" ? pat.email : phy.email}
                      onChange={role === "patient" ? patSet("email") : phySet("email")}
                      required
                      autoComplete="email"
                    />
                  </Field>

                  <Field label="Password">
                    <div className="rp-pw-wrap">
                      <Input
                        type={showPw ? "text" : "password"}
                        placeholder="Minimum 6 characters"
                        value={currentPassword}
                        onChange={role === "patient" ? patSet("password") : phySet("password")}
                        required
                        style={{ paddingRight: 40 }}
                      />
                      <button type="button" className="rp-pw-toggle" onClick={() => setShowPw(!showPw)}>
                        {showPw
                          ? <EyeOff size={15} strokeWidth={2} />
                          : <Eye size={15} strokeWidth={2} />
                        }
                      </button>
                    </div>
                    {currentPassword && (
                      <div className="rp-strength">
                        <div className="rp-strength-bars">
                          {[1,2,3,4].map((n) => (
                            <div
                              key={n}
                              className="rp-strength-bar"
                              style={{ background: n <= pwStrength.score ? pwStrength.color : "#e5e0d8" }}
                            />
                          ))}
                        </div>
                        <div className="rp-strength-label" style={{ color: pwStrength.color }}>
                          {pwStrength.label}
                        </div>
                      </div>
                    )}
                  </Field>

                  <Field label="Confirm password">
                    <Input
                      type={showPw ? "text" : "password"}
                      placeholder="Re-enter password"
                      value={confirmPw}
                      onChange={(e) => setConfirmPw(e.target.value)}
                      required
                    />
                    {confirmPw && (
                      <div className="rp-pw-match" style={{ color: currentPassword === confirmPw ? "#22c55e" : "#ef4444" }}>
                        {currentPassword === confirmPw
                          ? <><Check size={13} strokeWidth={2.5} /> Passwords match</>
                          : <><X size={13} strokeWidth={2.5} /> Passwords do not match</>
                        }
                      </div>
                    )}
                  </Field>

                  <div className="rp-actions">
                    <button className="rp-submit" type="submit" disabled={!step1Valid}>
                      Continue
                      <ArrowRight size={16} strokeWidth={2.5} />
                    </button>
                  </div>
                </form>
              </>
            )}

            {/* ── STEP 2 ── */}
            {step === 2 && (
              <>
                <div className="rp-card-title">Complete your profile</div>
                <div className="rp-card-sub">We need a few more details to set up your account</div>

                <div className="rp-role-badge">
                  {role === "patient"
                    ? <><User size={13} strokeWidth={2} /> Patient Account</>
                    : <><Stethoscope size={13} strokeWidth={2} /> Physiotherapist Account</>
                  }
                </div>

                <form onSubmit={handleSubmit} noValidate>
                  {/* ── PATIENT STEP 2 ── */}
                  {role === "patient" && (
                    <>
                      <div className="rp-grid-2">
                        <Field label="Date of birth">
                          <Input
                            type="date"
                            value={pat.dateOfBirth}
                            onChange={patSet("dateOfBirth")}
                            required
                          />
                        </Field>
                        <Field label="Phone number">
                          <Input
                            type="tel"
                            placeholder="+44 7700 000000"
                            value={pat.phone}
                            onChange={patSet("phone")}
                            required
                          />
                        </Field>
                      </div>
                    </>
                  )}

                  {/* ── PHYSIO STEP 2 ── */}
                  {role === "physiotherapist" && (
                    <>
                      <div className="rp-grid-2">
                        <Field label="HCPC / License number">
                          <Input
                            placeholder="PH12345"
                            value={phy.licenseNumber}
                            onChange={phySet("licenseNumber")}
                            required
                          />
                        </Field>
                        <Field label="Phone number">
                          <Input
                            type="tel"
                            placeholder="+44 7700 000000"
                            value={phy.phone}
                            onChange={phySet("phone")}
                            required
                          />
                        </Field>
                      </div>
                      <Field label="Clinic / practice name">
                        <Input
                          placeholder="Physio+ Clinic"
                          value={phy.clinicName}
                          onChange={phySet("clinicName")}
                          required
                        />
                      </Field>
                      <div className="rp-field">
                        <label className="rp-label">Specializations <span style={{ color: "#c0bbb4", fontWeight: 400 }}>(select all that apply)</span></label>
                        <div className="rp-spec-grid">
                          {SPECIALIZATIONS.map((s) => {
                            const isSelected = phy.specializations.includes(s);
                            return (
                              <div
                                key={s}
                                className={`rp-spec-item ${isSelected ? "selected" : ""}`}
                                onClick={() => toggleSpec(s)}
                              >
                                <div className={`rp-spec-check ${isSelected ? "checked" : ""}`}>
                                  {isSelected && (
                                    <Check size={10} strokeWidth={3} color="white" />
                                  )}
                                </div>
                                {s}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </>
                  )}

                  <div className="rp-actions">
                    <button type="button" className="rp-back-btn" onClick={() => setStep(1)}>
                      <ArrowLeft size={14} strokeWidth={2.5} />
                      Back
                    </button>
                    <button className="rp-submit" type="submit" disabled={!step2Valid || loading}>
                      {loading
                        ? <><div className="rp-spinner" /> Creating account…</>
                        : "Create Account"
                      }
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
