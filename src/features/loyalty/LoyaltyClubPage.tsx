// FILE: src/features/loyalty/LoyaltyClubPage.tsx

import { useState, useEffect, useMemo } from "react";
import { Sparkles, Gift, Search, Copy, Check, Lock, Clock, ArrowUpRight, ArrowDownRight } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import { formatPhoneDisplay } from "../../utils/phone";
import { subscribeToAllPatients, type Patient } from "../../services/patientService";
import {
  subscribeToPatientPoints,
  subscribeToPointsLedger,
  subscribeToVouchers,
  redeemPoints,
  LOYALTY_TIERS,
  VOUCHER_SESSION_CAP,
  EMPTY_POINTS,
  type PatientPoints,
  type PointsLedgerEntry,
  type PointsVoucher,
} from "../../services/pointsService";

export interface LoyaltyClubPageProps {
  /** When provided (staff looking up a specific patient), overrides the default of user.uid. */
  patientId?: string;
}

// Timestamps come from two sources that don't share a shape: the Firestore
// client SDK (real Timestamp, has .toDate()) via the realtime subscriptions,
// and the redeemLoyaltyPoints callable response, which JSON-serializes Admin
// SDK Timestamps as plain { _seconds, _nanoseconds } objects. Normalize both.
function toDateSafe(ts: unknown): Date | null {
  if (!ts || typeof ts !== "object") return null;
  const t = ts as { toDate?: () => Date; _seconds?: number; seconds?: number };
  if (typeof t.toDate === "function") return t.toDate();
  if (typeof t._seconds === "number") return new Date(t._seconds * 1000);
  if (typeof t.seconds === "number") return new Date(t.seconds * 1000);
  return null;
}

function fmtDate(ts: unknown): string {
  const d = toDateSafe(ts);
  return d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "";
}

function daysUntil(ts: unknown): number | null {
  const d = toDateSafe(ts);
  return d ? Math.ceil((d.getTime() - Date.now()) / (24 * 60 * 60 * 1000)) : null;
}

export default function LoyaltyClubPage({ patientId: patientIdProp }: LoyaltyClubPageProps = {}) {
  const { user } = useAuth();
  const role = user?.role ?? "";
  const isStaffView = role === "clinic_manager" || role === "secretary";

  // ── Staff: patient search ──────────────────────────────────────────────────
  const [allPatients, setAllPatients]     = useState<Patient[]>([]);
  const [search, setSearch]               = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);

  useEffect(() => {
    if (!isStaffView) return;
    return subscribeToAllPatients(setAllPatients, () => {});
  }, [isStaffView]);

  const searchResults = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return allPatients.filter((p) =>
      `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) || p.phone.includes(q)
    ).slice(0, 8);
  }, [search, allPatients]);

  const patientId = isStaffView ? (selectedPatient?.uid ?? "") : (patientIdProp ?? user?.uid ?? "");

  // ── Live data for the resolved patientId ───────────────────────────────────
  const [points, setPoints]     = useState<PatientPoints>(EMPTY_POINTS);
  const [ledger, setLedger]     = useState<PointsLedgerEntry[]>([]);
  const [vouchers, setVouchers] = useState<PointsVoucher[]>([]);

  useEffect(() => {
    if (!patientId) { setPoints(EMPTY_POINTS); setLedger([]); setVouchers([]); return; }
    const u1 = subscribeToPatientPoints(patientId, setPoints);
    const u2 = subscribeToPointsLedger(patientId, setLedger);
    const u3 = subscribeToVouchers(patientId, setVouchers);
    return () => { u1(); u2(); u3(); };
  }, [patientId]);

  // ── Redemption ──────────────────────────────────────────────────────────────
  const [redeeming, setRedeeming]         = useState<number | null>(null);
  const [redeemError, setRedeemError]     = useState<string | null>(null);
  const [justRedeemed, setJustRedeemed]   = useState<PointsVoucher | null>(null);
  const [copiedCode, setCopiedCode]       = useState(false);

  const balance = points.balance;

  const nextTier = useMemo(() => LOYALTY_TIERS.find((t) => t.points > balance) ?? null, [balance]);
  const prevTierPoints = useMemo(() => {
    const reached = [...LOYALTY_TIERS].reverse().find((t) => t.points <= balance);
    return reached ? reached.points : 0;
  }, [balance]);
  const progressPct = nextTier
    ? Math.min(100, Math.round(((balance - prevTierPoints) / (nextTier.points - prevTierPoints)) * 100))
    : 100;

  const handleRedeem = async (tierPoints: number) => {
    setRedeeming(tierPoints);
    setRedeemError(null);
    const result = await redeemPoints(tierPoints);
    setRedeeming(null);
    if (result.error || !result.voucher) {
      setRedeemError(result.error || "Could not redeem right now — please try again.");
      return;
    }
    setJustRedeemed(result.voucher);
  };

  const handleCopy = (code: string) => {
    navigator.clipboard?.writeText(code).then(() => {
      setCopiedCode(true);
      setTimeout(() => setCopiedCode(false), 1800);
    });
  };

  const activeVouchers = vouchers.filter((v) => v.status === "active");
  const canRedeem = role === "patient";

  return (
    <div className="lc-page">
      <style>{`
        .lc-page { max-width: 920px; margin: 0 auto; padding: 4px 4px 60px; font-family: 'Outfit', sans-serif; }
        .lc-title { font-size: 22px; font-weight: 700; color: #0C3C60; margin: 0 0 4px; display: flex; align-items: center; gap: 8px; }
        .lc-subtitle { font-size: 13.5px; color: #7a7570; margin: 0 0 24px; }

        .lc-search-wrap { position: relative; margin-bottom: 24px; }
        .lc-search-box { display: flex; align-items: center; gap: 8px; padding: 10px 14px; border-radius: 12px; border: 1.5px solid #e5e0d8; background: #fff; }
        .lc-search-box input { border: none; outline: none; flex: 1; font-family: 'Outfit', sans-serif; font-size: 14px; background: transparent; }
        .lc-search-results { position: absolute; top: calc(100% + 6px); left: 0; right: 0; background: #fff; border: 1.5px solid #e5e0d8; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.08); z-index: 5; max-height: 280px; overflow-y: auto; }
        .lc-search-row { padding: 10px 14px; cursor: pointer; font-size: 13.5px; color: #3a3530; border-bottom: 1px solid #f0ede8; }
        .lc-search-row:last-child { border-bottom: none; }
        .lc-search-row:hover { background: #f7f5f1; }
        .lc-search-row strong { color: #0C3C60; }

        .lc-hero { border-radius: 20px; padding: 28px 26px; background: linear-gradient(135deg, #0C3C60 0%, #2E8BC0 100%); color: #fff; margin-bottom: 26px; position: relative; overflow: hidden; }
        .lc-hero::after { content: ""; position: absolute; top: -40px; right: -40px; width: 160px; height: 160px; border-radius: 50%; background: rgba(255,255,255,0.08); }
        .lc-hero-label { font-size: 12.5px; letter-spacing: 0.06em; text-transform: uppercase; opacity: 0.75; margin-bottom: 6px; }
        .lc-hero-balance { font-size: 40px; font-weight: 800; line-height: 1; display: flex; align-items: baseline; gap: 8px; }
        .lc-hero-balance span { font-size: 15px; font-weight: 500; opacity: 0.8; }
        .lc-hero-track { margin-top: 18px; height: 8px; border-radius: 999px; background: rgba(255,255,255,0.18); overflow: hidden; }
        .lc-hero-fill { height: 100%; border-radius: 999px; background: linear-gradient(90deg, #F4C542, #E8A93B); transition: width 0.4s ease; }
        .lc-hero-next { margin-top: 8px; font-size: 12.5px; opacity: 0.85; }

        .lc-section-title { font-size: 15px; font-weight: 700; color: #0C3C60; margin: 30px 0 12px; }

        .lc-tier-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 14px; }
        .lc-tier-card { border-radius: 16px; padding: 18px; border: 1.5px solid #e5e0d8; background: #fff; position: relative; transition: transform 0.15s ease, box-shadow 0.15s ease; }
        .lc-tier-card.unlocked { border-color: #E8A93B; box-shadow: 0 0 0 3px rgba(232,169,59,0.12); }
        .lc-tier-card.locked { opacity: 0.55; }
        .lc-tier-icon { width: 36px; height: 36px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: #FBF0DA; color: #B8791A; margin-bottom: 12px; }
        .lc-tier-card.locked .lc-tier-icon { background: #f0ede8; color: #9a9590; }
        .lc-tier-points { font-size: 17px; font-weight: 700; color: #0C3C60; }
        .lc-tier-value { font-size: 13px; color: #7a7570; margin-bottom: 14px; }
        .lc-tier-btn { width: 100%; padding: 9px; border-radius: 10px; border: none; font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 600; cursor: pointer; background: #2E8BC0; color: #fff; display: flex; align-items: center; justify-content: center; gap: 6px; }
        .lc-tier-btn:disabled { background: #e5e0d8; color: #9a9590; cursor: not-allowed; }
        .lc-tier-lock { position: absolute; top: 14px; right: 14px; color: #9a9590; }

        .lc-voucher-card { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 14px 16px; border-radius: 14px; border: 1.5px solid #d8ecd8; background: #f5faf5; margin-bottom: 10px; }
        .lc-voucher-code { font-family: 'Courier New', monospace; font-size: 17px; font-weight: 700; letter-spacing: 0.12em; color: #1b4332; }
        .lc-voucher-meta { font-size: 12px; color: #5a8a5a; margin-top: 2px; }
        .lc-voucher-copy { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-radius: 8px; border: 1.5px solid #b7d8b7; background: #fff; color: #1b4332; font-size: 12.5px; font-weight: 600; cursor: pointer; }

        .lc-empty { padding: 18px; border-radius: 12px; background: #f7f5f1; color: #9a9590; font-size: 13px; text-align: center; }

        .lc-ledger-row { display: flex; align-items: center; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #f0ede8; font-size: 13px; }
        .lc-ledger-row:last-child { border-bottom: none; }
        .lc-ledger-desc { color: #3a3530; }
        .lc-ledger-date { color: #9a9590; font-size: 11.5px; margin-top: 2px; }
        .lc-ledger-amt { font-weight: 700; display: flex; align-items: center; gap: 4px; }
        .lc-ledger-amt.earn { color: #1b4332; }
        .lc-ledger-amt.redeem, .lc-ledger-amt.expire { color: #b91c1c; }

        .lc-redeem-modal-overlay { position: fixed; inset: 0; z-index: 1002; background: rgba(10,15,10,0.5); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 24px; }
        .lc-redeem-modal { background: #fff; border-radius: 18px; padding: 28px; max-width: 380px; width: 100%; text-align: center; }
        .lc-error-banner { padding: 10px 14px; border-radius: 10px; background: #fef2f2; color: #b91c1c; font-size: 13px; margin-top: 10px; }
      `}</style>

      <h1 className="lc-title"><Sparkles size={20} color="#E8A93B" /> Physio+ Loyalty Club</h1>
      <p className="lc-subtitle">
        {isStaffView
          ? "Look up a patient's points balance, vouchers, and history."
          : "Earn 1 point for every 1 EGP spent — redeem for cashback vouchers on future sessions."}
      </p>

      {isStaffView && (
        <div className="lc-search-wrap">
          <div className="lc-search-box">
            <Search size={16} color="#9a9590" />
            <input
              placeholder="Search patient by name or phone…"
              value={selectedPatient ? `${selectedPatient.firstName} ${selectedPatient.lastName}` : search}
              onChange={(e) => { setSearch(e.target.value); setSelectedPatient(null); }}
            />
          </div>
          {!selectedPatient && searchResults.length > 0 && (
            <div className="lc-search-results">
              {searchResults.map((p) => (
                <div key={p.uid} className="lc-search-row" onClick={() => { setSelectedPatient(p); setSearch(""); }}>
                  <strong>{p.firstName} {p.lastName}</strong> — {formatPhoneDisplay(p.phone) || "no phone on file"}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {isStaffView && !selectedPatient ? (
        <div className="lc-empty">Search for a patient above to view their loyalty balance.</div>
      ) : (
        <>
          <div className="lc-hero">
            <div className="lc-hero-label">Points Balance</div>
            <div className="lc-hero-balance">{balance.toLocaleString()} <span>pts</span></div>
            <div className="lc-hero-track"><div className="lc-hero-fill" style={{ width: `${progressPct}%` }} /></div>
            <div className="lc-hero-next">
              {nextTier
                ? `${(nextTier.points - balance).toLocaleString()} pts to your next reward (${nextTier.value} EGP voucher)`
                : "You've unlocked every reward tier — redeem anytime."}
            </div>
          </div>

          <div className="lc-section-title">Redeem for a Voucher</div>
          <div className="lc-tier-grid">
            {LOYALTY_TIERS.map((tier) => {
              const unlocked = balance >= tier.points;
              return (
                <div key={tier.points} className={`lc-tier-card ${unlocked ? "unlocked" : "locked"}`}>
                  {!unlocked && <Lock size={14} className="lc-tier-lock" />}
                  <div className="lc-tier-icon"><Gift size={18} /></div>
                  <div className="lc-tier-points">{tier.points.toLocaleString()} pts</div>
                  <div className="lc-tier-value">→ {tier.value} EGP voucher</div>
                  {canRedeem && (
                    <button
                      className="lc-tier-btn"
                      disabled={!unlocked || redeeming !== null}
                      onClick={() => handleRedeem(tier.points)}
                    >
                      {redeeming === tier.points ? "Redeeming…" : "Redeem"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {redeemError && <div className="lc-error-banner">{redeemError}</div>}

          <div className="lc-section-title">Active Vouchers</div>
          {activeVouchers.length === 0 ? (
            <div className="lc-empty">No active vouchers right now.</div>
          ) : (
            activeVouchers.map((v) => {
              const daysLeft = daysUntil(v.voucherExpiresAt);
              return (
                <div key={v.id} className="lc-voucher-card">
                  <div>
                    <div className="lc-voucher-code">{v.code}</div>
                    <div className="lc-voucher-meta">
                      {v.voucherValue} EGP · expires {fmtDate(v.voucherExpiresAt)}
                      {daysLeft !== null && daysLeft <= 14 && ` (${Math.max(0, daysLeft)}d left)`}
                    </div>
                  </div>
                  {canRedeem && (
                    <button className="lc-voucher-copy" onClick={() => handleCopy(v.code)}>
                      {copiedCode ? <Check size={13} /> : <Copy size={13} />} {copiedCode ? "Copied" : "Copy"}
                    </button>
                  )}
                </div>
              );
            })
          )}
          {isStaffView && activeVouchers.length > 0 && (
            <div className="lc-hero-next" style={{ color: "#7a7570", marginTop: -4, marginBottom: 4 }}>
              Vouchers are applied by staff during billing (Session Billing → Loyalty Voucher) once the patient shows the code — capped at {VOUCHER_SESSION_CAP} EGP per session.
            </div>
          )}

          <div className="lc-section-title" style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Clock size={15} /> History
          </div>
          {ledger.length === 0 ? (
            <div className="lc-empty">No activity yet.</div>
          ) : (
            <div>
              {ledger.map((entry) => (
                <div key={entry.id} className="lc-ledger-row">
                  <div>
                    <div className="lc-ledger-desc">{entry.description || entry.type}</div>
                    <div className="lc-ledger-date">{fmtDate(entry.createdAt)}</div>
                  </div>
                  <div className={`lc-ledger-amt ${entry.type}`}>
                    {entry.points > 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                    {entry.points > 0 ? "+" : ""}{entry.points.toLocaleString()}
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {justRedeemed && (
        <div className="lc-redeem-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) setJustRedeemed(null); }}>
          <div className="lc-redeem-modal">
            <Sparkles size={28} color="#E8A93B" style={{ marginBottom: 10 }} />
            <div style={{ fontSize: 15, fontWeight: 700, color: "#0C3C60", marginBottom: 4 }}>Voucher Ready!</div>
            <div style={{ fontSize: 12.5, color: "#7a7570", marginBottom: 16 }}>
              Show this code to staff to redeem {justRedeemed.voucherValue} EGP off your next session.
            </div>
            <div className="lc-voucher-code" style={{ fontSize: 26, marginBottom: 6 }}>{justRedeemed.code}</div>
            <div style={{ fontSize: 12, color: "#9a9590", marginBottom: 18 }}>Expires {fmtDate(justRedeemed.voucherExpiresAt)}</div>
            <button
              className="lc-tier-btn"
              onClick={() => setJustRedeemed(null)}
              style={{ background: "#0C3C60" }}
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
