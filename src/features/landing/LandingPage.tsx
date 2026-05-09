// FILE: src/features/landing/LandingPage.tsx
// Public marketing page — shown to unauthenticated visitors at /

import { useNavigate } from "react-router-dom";

const FEATURES = [
  {
    icon: "🦴",
    title: "Body Profile & Joint Assessment",
    desc:  "Comprehensive InBody-style assessments with ROM charts, muscle power tracking, and progress trends over time.",
  },
  {
    icon: "📋",
    title: "Session & Treatment Management",
    desc:  "Plan and document every session, track packages, manage billing, and send automated reminders.",
  },
  {
    icon: "📊",
    title: "Live Dashboard & Notifications",
    desc:  "Real-time alerts for expiring packages, new patients, and unpaid balances. Everything in one place.",
  },
  {
    icon: "🤝",
    title: "Partner & Referral Tracking",
    desc:  "Give gym and clinic partners read-only access to their referred patients' progress and earnings.",
  },
  {
    icon: "🏋️",
    title: "Exercise & Rehab Programs",
    desc:  "Assign personalised exercise libraries and online rehab programs. Patients track progress from their portal.",
  },
  {
    icon: "🔒",
    title: "Role-Based Access Control",
    desc:  "Manager, senior physio, junior, secretary, physician, and partner — each sees exactly what they need.",
  },
];

const PLANS = [
  {
    name:    "Starter",
    price:   "499",
    period:  "/mo",
    desc:    "Perfect for a solo physio or small practice.",
    limits:  ["2 physiotherapists", "30 active patients", "All core features"],
    cta:     "Start free trial",
    popular: false,
  },
  {
    name:    "Clinic",
    price:   "1,299",
    period:  "/mo",
    desc:    "For growing clinics with multiple physios.",
    limits:  ["10 physiotherapists", "200 active patients", "Partner portal", "Priority support"],
    cta:     "Start free trial",
    popular: true,
  },
  {
    name:    "Enterprise",
    price:   "Custom",
    period:  "",
    desc:    "Unlimited scale with white-label options.",
    limits:  ["Unlimited staff", "Unlimited patients", "Custom branding", "Dedicated support"],
    cta:     "Contact us",
    popular: false,
  },
];

export default function LandingPage() {
  const navigate = useNavigate();

  return (
    <div style={{ fontFamily: "'Outfit', sans-serif", color: "#1a1a1a", background: "#fff" }}>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }

        .lp-nav {
          position: sticky; top: 0; z-index: 100;
          background: rgba(255,255,255,0.92); backdrop-filter: blur(12px);
          border-bottom: 1px solid #f0ede8;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 40px; height: 64px;
        }
        .lp-logo { display: flex; align-items: center; gap: 10px; }
        .lp-logo-icon {
          width: 36px; height: 36px; border-radius: 10px;
          background: linear-gradient(135deg, #0C3C60, #2E8BC0);
          display: flex; align-items: center; justify-content: center;
          color: #fff; font-size: 18px;
        }
        .lp-logo-name { font-size: 18px; font-weight: 700; color: #0C3C60; }
        .lp-nav-right { display: flex; align-items: center; gap: 12px; }
        .lp-btn-ghost {
          padding: 8px 16px; border-radius: 8px; border: 1.5px solid #e5e0d8;
          background: #fff; font-family: 'Outfit', sans-serif; font-size: 14px;
          font-weight: 500; color: #5a5550; cursor: pointer; transition: all 0.15s;
        }
        .lp-btn-ghost:hover { border-color: #2E8BC0; color: #2E8BC0; }
        .lp-btn-primary {
          padding: 9px 20px; border-radius: 8px; border: none;
          background: #0C3C60; color: #fff;
          font-family: 'Outfit', sans-serif; font-size: 14px; font-weight: 600;
          cursor: pointer; transition: all 0.15s;
        }
        .lp-btn-primary:hover { background: #2E8BC0; }

        .lp-hero {
          padding: 100px 40px 80px;
          text-align: center;
          background: linear-gradient(180deg, #f0f8ff 0%, #fff 100%);
        }
        .lp-badge {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 4px 14px; border-radius: 100px;
          background: #D6EEF8; color: #0C3C60;
          font-size: 12px; font-weight: 700; letter-spacing: 0.06em;
          text-transform: uppercase; margin-bottom: 24px;
        }
        .lp-h1 {
          font-size: clamp(36px, 5vw, 60px); font-weight: 700;
          line-height: 1.12; color: #0C3C60; max-width: 800px; margin: 0 auto 20px;
        }
        .lp-h1 span { color: #2E8BC0; }
        .lp-sub {
          font-size: 18px; color: #5a5550; max-width: 560px;
          margin: 0 auto 40px; line-height: 1.6;
        }
        .lp-hero-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
        .lp-btn-hero-primary {
          padding: 14px 32px; border-radius: 12px; border: none;
          background: linear-gradient(135deg, #0C3C60, #2E8BC0);
          color: #fff; font-family: 'Outfit', sans-serif;
          font-size: 16px; font-weight: 600; cursor: pointer;
          box-shadow: 0 4px 20px rgba(46,139,192,0.3); transition: all 0.2s;
        }
        .lp-btn-hero-primary:hover { transform: translateY(-2px); box-shadow: 0 8px 28px rgba(46,139,192,0.4); }
        .lp-btn-hero-ghost {
          padding: 14px 32px; border-radius: 12px;
          border: 1.5px solid #d0dae8; background: #fff;
          color: #0C3C60; font-family: 'Outfit', sans-serif;
          font-size: 16px; font-weight: 600; cursor: pointer; transition: all 0.15s;
        }
        .lp-btn-hero-ghost:hover { border-color: #2E8BC0; }

        .lp-trial-note { font-size: 13px; color: #9a9590; margin-top: 14px; }

        .lp-section { padding: 80px 40px; max-width: 1100px; margin: 0 auto; }
        .lp-section-label {
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.12em; color: #2E8BC0; margin-bottom: 12px;
        }
        .lp-section-title {
          font-size: clamp(28px, 3vw, 40px); font-weight: 700;
          color: #0C3C60; margin-bottom: 14px; line-height: 1.2;
        }
        .lp-section-sub { font-size: 16px; color: #5a5550; max-width: 520px; line-height: 1.6; }

        .lp-features-grid {
          display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
          gap: 20px; margin-top: 48px;
        }
        .lp-feature-card {
          background: #fafaf8; border: 1px solid #e5e0d8; border-radius: 16px;
          padding: 24px; transition: all 0.2s;
        }
        .lp-feature-card:hover { border-color: #B3DEF0; box-shadow: 0 4px 20px rgba(46,139,192,0.08); transform: translateY(-2px); }
        .lp-feature-icon { font-size: 28px; margin-bottom: 14px; }
        .lp-feature-title { font-size: 16px; font-weight: 700; color: #0C3C60; margin-bottom: 8px; }
        .lp-feature-desc { font-size: 14px; color: #5a5550; line-height: 1.6; }

        .lp-pricing-section { background: #f5f8fc; padding: 80px 40px; }
        .lp-pricing-inner { max-width: 1000px; margin: 0 auto; }
        .lp-pricing-header { text-align: center; margin-bottom: 48px; }
        .lp-plans { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; }
        .lp-plan-card {
          background: #fff; border: 1.5px solid #e5e0d8; border-radius: 20px;
          padding: 32px; display: flex; flex-direction: column; position: relative;
          transition: all 0.2s;
        }
        .lp-plan-card.popular { border-color: #2E8BC0; box-shadow: 0 8px 32px rgba(46,139,192,0.12); }
        .lp-popular-badge {
          position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
          background: #2E8BC0; color: #fff; font-size: 11px; font-weight: 700;
          padding: 3px 14px; border-radius: 100px; letter-spacing: 0.06em;
          text-transform: uppercase; white-space: nowrap;
        }
        .lp-plan-name { font-size: 14px; font-weight: 700; color: #9a9590; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
        .lp-plan-price { display: flex; align-items: baseline; gap: 4px; margin-bottom: 8px; }
        .lp-plan-price-num { font-size: 40px; font-weight: 800; color: #0C3C60; }
        .lp-plan-price-egp { font-size: 16px; font-weight: 600; color: #5a5550; }
        .lp-plan-price-period { font-size: 14px; color: #9a9590; }
        .lp-plan-desc { font-size: 14px; color: #5a5550; margin-bottom: 24px; line-height: 1.5; }
        .lp-plan-limits { list-style: none; padding: 0; margin-bottom: 28px; display: flex; flex-direction: column; gap: 10px; }
        .lp-plan-limits li { font-size: 14px; color: #1a1a1a; display: flex; align-items: center; gap: 8px; }
        .lp-plan-limits li::before { content: "✓"; color: #2E8BC0; font-weight: 700; flex-shrink: 0; }
        .lp-plan-cta {
          margin-top: auto; padding: 13px; border-radius: 10px; border: none;
          background: #0C3C60; color: #fff; font-family: 'Outfit', sans-serif;
          font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.15s;
        }
        .lp-plan-cta:hover { background: #2E8BC0; }
        .lp-plan-card.popular .lp-plan-cta { background: #2E8BC0; }
        .lp-plan-card.popular .lp-plan-cta:hover { background: #0C3C60; }

        .lp-footer {
          background: #0C3C60; color: rgba(255,255,255,0.7);
          padding: 40px; text-align: center; font-size: 14px;
        }
        .lp-footer strong { color: #fff; }

        @media (max-width: 640px) {
          .lp-nav { padding: 0 20px; }
          .lp-hero { padding: 60px 20px; }
          .lp-section { padding: 60px 20px; }
          .lp-pricing-section { padding: 60px 20px; }
        }
      `}</style>

      {/* Nav */}
      <nav className="lp-nav">
        <div className="lp-logo">
          <div className="lp-logo-icon">🦴</div>
          <span className="lp-logo-name">Physio+</span>
        </div>
        <div className="lp-nav-right">
          <button className="lp-btn-ghost" onClick={() => navigate("/login")}>Log in</button>
          <button className="lp-btn-primary" onClick={() => navigate("/signup")}>Start free trial</button>
        </div>
      </nav>

      {/* Hero */}
      <section className="lp-hero">
        <div className="lp-badge">🚀 Physio+ SaaS — Preview Build v1</div>
        <h1 className="lp-h1">
          The complete platform for<br />
          <span>sports rehabilitation</span> clinics
        </h1>
        <p className="lp-sub">
          Manage patients, sessions, billing, body profiles, and your entire team — all in one place. Start your 14-day free trial today.
        </p>
        <div className="lp-hero-btns">
          <button className="lp-btn-hero-primary" onClick={() => navigate("/signup")}>
            Start free trial — no card required
          </button>
          <button className="lp-btn-hero-ghost" onClick={() => navigate("/login")}>
            Log in to your clinic
          </button>
        </div>
        <p className="lp-trial-note">14 days free · No credit card · Cancel anytime</p>
      </section>

      {/* Features */}
      <div className="lp-section">
        <div className="lp-section-label">Features</div>
        <h2 className="lp-section-title">Everything your clinic needs</h2>
        <p className="lp-section-sub">
          From the first assessment to discharge — every workflow in one connected system.
        </p>
        <div className="lp-features-grid">
          {FEATURES.map((f) => (
            <div key={f.title} className="lp-feature-card">
              <div className="lp-feature-icon">{f.icon}</div>
              <div className="lp-feature-title">{f.title}</div>
              <div className="lp-feature-desc">{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Pricing */}
      <section className="lp-pricing-section">
        <div className="lp-pricing-inner">
          <div className="lp-pricing-header">
            <div className="lp-section-label">Pricing</div>
            <h2 className="lp-section-title" style={{ textAlign: "center" }}>Simple, transparent pricing</h2>
            <p className="lp-section-sub" style={{ margin: "0 auto", textAlign: "center" }}>
              All plans include a 14-day free trial. No hidden fees.
            </p>
          </div>
          <div className="lp-plans">
            {PLANS.map((plan) => (
              <div key={plan.name} className={`lp-plan-card ${plan.popular ? "popular" : ""}`}>
                {plan.popular && <div className="lp-popular-badge">Most popular</div>}
                <div className="lp-plan-name">{plan.name}</div>
                <div className="lp-plan-price">
                  {plan.price === "Custom" ? (
                    <span className="lp-plan-price-num" style={{ fontSize: 32 }}>Custom</span>
                  ) : (
                    <>
                      <span className="lp-plan-price-egp">EGP</span>
                      <span className="lp-plan-price-num">{plan.price}</span>
                      <span className="lp-plan-price-period">{plan.period}</span>
                    </>
                  )}
                </div>
                <div className="lp-plan-desc">{plan.desc}</div>
                <ul className="lp-plan-limits">
                  {plan.limits.map((l) => <li key={l}>{l}</li>)}
                </ul>
                <button
                  className="lp-plan-cta"
                  onClick={() => navigate(plan.cta === "Contact us" ? "/login" : "/signup")}
                >
                  {plan.cta}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="lp-footer">
        <p>© 2026 <strong>Physio+ Hub</strong> · Sports & Rehabilitation Management Platform</p>
        <p style={{ marginTop: 6 }}>Questions? Contact us at <strong>hello@physioplus.app</strong></p>
      </footer>
    </div>
  );
}
