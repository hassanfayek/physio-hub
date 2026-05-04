// FILE: src/features/auth/ClinicSetupPage.tsx
// One-time wizard for existing clinic managers who pre-date the SaaS migration.
// Shown when a clinic_manager logs in and has no clinicId in their user doc.

import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "../../firebase";
import { useAuth } from "../../hooks/useAuth";
import {
  createClinic,
  nameToSlug,
  isSlugAvailable,
  type ClinicPlan,
} from "../../services/clinicService";

export default function ClinicSetupPage() {
  const navigate  = useNavigate();
  const { user }  = useAuth();

  const [clinicName, setClinicName] = useState("");
  const [slug,       setSlug]       = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [slugOk,     setSlugOk]     = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);
  const [plan,       setPlan]       = useState<ClinicPlan>("clinic");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState<string | null>(null);

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

  const handleSave = async () => {
    if (!user || !clinicName.trim() || slugOk !== true) return;
    setLoading(true);
    setError(null);
    try {
      const clinic = await createClinic({
        slug:       slug.trim(),
        name:       clinicName.trim(),
        plan,
        ownerUid:   user.uid,
        ownerEmail: user.email ?? "",
      });

      // Back-fill clinicId + clinicSlug onto the manager's user doc
      await updateDoc(doc(db, "users", user.uid), {
        clinicId:   clinic.id,
        clinicSlug: clinic.slug,
        updatedAt:  serverTimestamp(),
      });

      // Force a full page reload so the auth listener re-reads the updated profile
      window.location.href = `/c/${clinic.slug}/physio`;
    } catch (err) {
      setError((err as { message?: string }).message ?? "Setup failed. Please try again.");
      setLoading(false);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc", fontFamily: "'Outfit', sans-serif", display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
      <div style={{ background: "#fff", borderRadius: 24, padding: 40, width: "100%", maxWidth: 460, boxShadow: "0 8px 40px rgba(0,0,0,0.08)" }}>
        <div style={{ fontSize: 36, textAlign: "center", marginBottom: 16 }}>🏥</div>
        <h1 style={{ fontSize: 24, fontWeight: 700, color: "#0C3C60", textAlign: "center", marginBottom: 8 }}>
          Set up your clinic profile
        </h1>
        <p style={{ fontSize: 14, color: "#9a9590", textAlign: "center", marginBottom: 32, lineHeight: 1.6 }}>
          We've upgraded to a multi-clinic platform. Set up your clinic profile once to continue.
        </p>

        {error && (
          <div style={{ background: "#fff5f3", border: "1px solid #fecaca", borderRadius: 10, padding: "11px 14px", fontSize: 13, color: "#b91c1c", marginBottom: 16 }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5a5550", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Clinic Name *
          </label>
          <input
            style={{ width: "100%", padding: "11px 14px", border: "1.5px solid #e5e0d8", borderRadius: 10, fontFamily: "'Outfit', sans-serif", fontSize: 14, color: "#1a1a1a", outline: "none", boxSizing: "border-box" }}
            placeholder="e.g. Cairo Physio Center"
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            autoFocus
          />
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5a5550", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Clinic URL Slug *
          </label>
          <div style={{ position: "relative" }}>
            <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 12, color: "#9a9590", pointerEvents: "none" }}>
              /c/
            </span>
            <input
              style={{ width: "100%", padding: "11px 14px", paddingLeft: 36, border: `1.5px solid ${slugOk === true ? "#22c55e" : slugOk === false ? "#ef4444" : "#e5e0d8"}`, borderRadius: 10, fontFamily: "'Outfit', sans-serif", fontSize: 14, color: "#1a1a1a", outline: "none", boxSizing: "border-box" }}
              value={slug}
              onChange={(e) => { setSlug(nameToSlug(e.target.value)); setSlugEdited(true); }}
              placeholder="your-clinic"
            />
          </div>
          <div style={{ fontSize: 12, marginTop: 4, color: slugChecking ? "#9a9590" : slugOk === true ? "#16a34a" : slugOk === false ? "#dc2626" : "#9a9590" }}>
            {slugChecking ? "Checking…" : slugOk === true ? "✓ Available" : slugOk === false ? "✗ Taken — try another" : "physioplus.app/c/" + (slug || "your-clinic")}
          </div>
        </div>

        <div style={{ marginBottom: 28 }}>
          <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#5a5550", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>
            Plan
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
            {(["starter", "clinic", "enterprise"] as ClinicPlan[]).map((p) => (
              <button
                key={p} type="button"
                style={{ padding: "10px 6px", borderRadius: 10, border: `1.5px solid ${plan === p ? "#2E8BC0" : "#e5e0d8"}`, background: plan === p ? "#EAF5FC" : "#fafaf8", cursor: "pointer", textAlign: "center", fontFamily: "'Outfit', sans-serif" }}
                onClick={() => setPlan(p)}
              >
                <div style={{ fontSize: 13, fontWeight: 700, color: "#0C3C60" }}>{p.charAt(0).toUpperCase() + p.slice(1)}</div>
                <div style={{ fontSize: 11, color: "#9a9590", marginTop: 2 }}>
                  {p === "starter" ? "2 physios" : p === "clinic" ? "10 physios" : "Unlimited"}
                </div>
              </button>
            ))}
          </div>
        </div>

        <button
          style={{ width: "100%", padding: 13, borderRadius: 12, border: "none", background: "linear-gradient(135deg, #0C3C60, #2E8BC0)", color: "#fff", fontFamily: "'Outfit', sans-serif", fontSize: 15, fontWeight: 600, cursor: loading || !clinicName.trim() || slugOk !== true ? "not-allowed" : "pointer", opacity: loading || !clinicName.trim() || slugOk !== true ? 0.5 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          disabled={!clinicName.trim() || slugOk !== true || loading}
          onClick={handleSave}
        >
          {loading ? "Setting up…" : "Complete setup →"}
        </button>
      </div>
    </div>
  );
}
