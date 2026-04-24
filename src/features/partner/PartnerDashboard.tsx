// FILE: src/features/partner/PartnerDashboard.tsx
// Read-only portal for referral partners (gyms, clinics).
// Shows their referred patients and earnings breakdown.

import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import {
  subscribeToPartner,
  subscribeToPartnerPatients,
  subscribeToPartnerPackages,
  type Partner,
} from "../../services/partnerService";
import logo from "../../assets/physio-logo.svg";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientRow {
  uid:          string;
  firstName:    string;
  lastName:     string;
  phone:        string;
  totalPaid:    number;
  sessions:     number;
  maxSessions:  number;
  partnerShare: number;
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PartnerDashboard() {
  const { user, logout } = useAuth();

  const [partner,  setPartner]  = useState<Partner | null>(null);
  const [patients, setPatients] = useState<Array<{ uid: string; firstName: string; lastName: string; phone: string }>>([]);
  const [packages, setPackages] = useState<Array<{
    id: string; patientId: string; packageSize: number;
    sessionsUsed: number; paidAmount: number; active: boolean;
  }>>([]);

  const uid = user?.uid ?? "";

  useEffect(() => {
    if (!uid) return;
    return subscribeToPartner(uid, setPartner);
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    return subscribeToPartnerPatients(uid, setPatients);
  }, [uid]);

  useEffect(() => {
    if (patients.length === 0) { setPackages([]); return; }
    const patientIds = patients.map((p) => p.uid);
    const unsub = subscribeToPartnerPackages(uid, patientIds, setPackages);
    return unsub ?? undefined;
  }, [uid, patients]);

  // ── Build per-patient rows ────────────────────────────────────────────────

  const sharePercent = partner?.sharePercent ?? 40;

  const rows: PatientRow[] = patients.map((p) => {
    const pkgs = packages.filter((pkg) => pkg.patientId === p.uid);
    const totalPaid   = pkgs.reduce((s, pkg) => s + (pkg.paidAmount ?? 0), 0);
    const sessions    = pkgs.reduce((s, pkg) => s + (pkg.sessionsUsed ?? 0), 0);
    const maxSessions = pkgs.reduce((s, pkg) => s + (pkg.packageSize  ?? 0), 0);
    return {
      uid: p.uid,
      firstName:    p.firstName,
      lastName:     p.lastName,
      phone:        p.phone,
      totalPaid,
      sessions,
      maxSessions,
      partnerShare: Math.round(totalPaid * sharePercent / 100),
    };
  });

  const totalRevenue     = rows.reduce((s, r) => s + r.totalPaid,    0);
  const totalPartnerEarn = rows.reduce((s, r) => s + r.partnerShare, 0);
  const totalSessions    = rows.reduce((s, r) => s + r.sessions,     0);

  // ── Format ───────────────────────────────────────────────────────────────

  const fmt = (n: number) => n.toLocaleString() + " EGP";

  return (
    <>
      <style>{`
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: 'Outfit', sans-serif; background: #f5f3ef; }

        .pd-root { min-height: 100vh; background: #f5f3ef; font-family: 'Outfit', sans-serif; }

        /* Topbar */
        .pd-topbar {
          background: #fff; border-bottom: 1px solid #e8e4de;
          padding: 0 24px; height: 56px;
          display: flex; align-items: center; justify-content: space-between;
          position: sticky; top: 0; z-index: 100;
          box-shadow: 0 2px 12px rgba(0,0,0,0.04);
        }
        .pd-topbar-left { display: flex; align-items: center; gap: 12px; }
        .pd-topbar-logo { height: 32px; }
        .pd-topbar-org  { font-size: 15px; font-weight: 700; color: #1a1a1a; }
        .pd-topbar-badge {
          font-size: 11px; font-weight: 600; padding: 2px 10px;
          border-radius: 100px; background: #eff6ff; color: #2563eb;
          border: 1px solid #bfdbfe;
        }
        .pd-logout-btn {
          padding: 7px 14px; border-radius: 8px;
          border: 1.5px solid #e5e0d8; background: #fff;
          font-family: 'Outfit', sans-serif; font-size: 13px;
          color: #9a9590; cursor: pointer;
          transition: all 0.15s;
        }
        .pd-logout-btn:hover { border-color: #fca5a5; color: #b91c1c; background: #fff5f5; }

        /* Body */
        .pd-body { max-width: 960px; margin: 0 auto; padding: 28px 20px; }

        /* Welcome */
        .pd-welcome { margin-bottom: 24px; }
        .pd-welcome-title { font-size: 22px; font-weight: 700; color: #1a1a1a; margin-bottom: 4px; }
        .pd-welcome-sub   { font-size: 14px; color: #6b7280; }

        /* Summary cards */
        .pd-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 28px; }
        .pd-card {
          background: #fff; border-radius: 14px; padding: 18px 20px;
          border: 1px solid #e8e4de;
          box-shadow: 0 1px 4px rgba(0,0,0,0.04);
        }
        .pd-card-label { font-size: 12px; font-weight: 600; color: #9a9590; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 8px; }
        .pd-card-value { font-size: 24px; font-weight: 700; color: #1a1a1a; }
        .pd-card-value.accent { color: #2563eb; }
        .pd-card-value.green  { color: #059669; }
        .pd-card-sub  { font-size: 12px; color: #9a9590; margin-top: 4px; }

        /* Share pill */
        .pd-share-pill {
          display: inline-flex; align-items: center; gap: 6px;
          background: #eff6ff; border: 1px solid #bfdbfe;
          border-radius: 100px; padding: 4px 12px;
          font-size: 13px; font-weight: 600; color: #2563eb;
          margin-bottom: 20px;
        }

        /* Table */
        .pd-table-wrap {
          background: #fff; border-radius: 16px;
          border: 1px solid #e8e4de;
          overflow: hidden;
          box-shadow: 0 1px 4px rgba(0,0,0,0.04);
        }
        .pd-table-header {
          padding: 16px 20px; border-bottom: 1px solid #f0ede8;
          display: flex; align-items: center; justify-content: space-between;
        }
        .pd-table-title { font-size: 15px; font-weight: 700; color: #1a1a1a; }
        .pd-table-count { font-size: 13px; color: #9a9590; }

        table.pd-table { width: 100%; border-collapse: collapse; }
        table.pd-table th {
          text-align: left; font-size: 11px; font-weight: 600;
          color: #9a9590; text-transform: uppercase; letter-spacing: 0.04em;
          padding: 10px 20px; border-bottom: 1px solid #f0ede8;
          background: #fafaf8;
        }
        table.pd-table td { padding: 14px 20px; font-size: 14px; color: #1a1a1a; border-bottom: 1px solid #f7f5f2; }
        table.pd-table tr:last-child td { border-bottom: none; }
        table.pd-table tr:hover td { background: #fafaf8; }

        .pd-patient-name { font-weight: 600; color: #1a1a1a; }
        .pd-patient-phone { font-size: 12px; color: #9a9590; margin-top: 2px; }

        .pd-progress-wrap { display: flex; align-items: center; gap: 8px; }
        .pd-progress-bar {
          flex: 1; height: 6px; background: #f0ede8; border-radius: 100px; overflow: hidden; min-width: 60px;
        }
        .pd-progress-fill { height: 100%; border-radius: 100px; background: #2563eb; }
        .pd-progress-label { font-size: 12px; color: #6b7280; white-space: nowrap; }

        .pd-earn { font-weight: 700; color: #059669; }

        /* Empty state */
        .pd-empty {
          padding: 48px 24px; text-align: center;
          color: #9a9590; font-size: 14px;
        }
        .pd-empty-icon { font-size: 36px; margin-bottom: 12px; }

        @media (max-width: 600px) {
          .pd-body { padding: 16px 12px; }
          table.pd-table th, table.pd-table td { padding: 10px 12px; }
          .pd-topbar { padding: 0 12px; }
        }
      `}</style>

      <div className="pd-root">
        {/* Topbar */}
        <header className="pd-topbar">
          <div className="pd-topbar-left">
            <img src={logo} alt="Physio+ Hub" className="pd-topbar-logo" />
            <span className="pd-topbar-org">{partner?.organizationName || "Partner Portal"}</span>
            <span className="pd-topbar-badge">Partner</span>
          </div>
          <button className="pd-logout-btn" onClick={() => logout()}>Sign out</button>
        </header>

        <div className="pd-body">
          {/* Welcome */}
          <div className="pd-welcome">
            <div className="pd-welcome-title">Welcome, {partner?.name || user?.displayName || "Partner"}</div>
            <div className="pd-welcome-sub">
              Here's an overview of your referred patients and your earnings.
            </div>
          </div>

          {/* Share pill */}
          <div className="pd-share-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
            </svg>
            Revenue share: {sharePercent}% to you · {100 - sharePercent}% to clinic
          </div>

          {/* Summary cards */}
          <div className="pd-cards">
            <div className="pd-card">
              <div className="pd-card-label">Referred Patients</div>
              <div className="pd-card-value accent">{patients.length}</div>
              <div className="pd-card-sub">Total enrolled</div>
            </div>
            <div className="pd-card">
              <div className="pd-card-label">Sessions Completed</div>
              <div className="pd-card-value">{totalSessions}</div>
              <div className="pd-card-sub">Across all patients</div>
            </div>
            <div className="pd-card">
              <div className="pd-card-label">Total Revenue</div>
              <div className="pd-card-value">{fmt(totalRevenue)}</div>
              <div className="pd-card-sub">Collected from packages</div>
            </div>
            <div className="pd-card">
              <div className="pd-card-label">Your Earnings</div>
              <div className="pd-card-value green">{fmt(totalPartnerEarn)}</div>
              <div className="pd-card-sub">{sharePercent}% of total revenue</div>
            </div>
          </div>

          {/* Patient table */}
          <div className="pd-table-wrap">
            <div className="pd-table-header">
              <span className="pd-table-title">Referred Patients</span>
              <span className="pd-table-count">{rows.length} patient{rows.length !== 1 ? "s" : ""}</span>
            </div>

            {rows.length === 0 ? (
              <div className="pd-empty">
                <div className="pd-empty-icon">🏋️</div>
                No referred patients yet. Contact the clinic to get started.
              </div>
            ) : (
              <table className="pd-table">
                <thead>
                  <tr>
                    <th>Patient</th>
                    <th>Sessions</th>
                    <th>Total Paid</th>
                    <th>Your Earnings</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const pct = r.maxSessions > 0 ? Math.round((r.sessions / r.maxSessions) * 100) : 0;
                    return (
                      <tr key={r.uid}>
                        <td>
                          <div className="pd-patient-name">{r.firstName} {r.lastName}</div>
                          {r.phone && <div className="pd-patient-phone">{r.phone}</div>}
                        </td>
                        <td>
                          <div className="pd-progress-wrap">
                            <div className="pd-progress-bar">
                              <div className="pd-progress-fill" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="pd-progress-label">{r.sessions}/{r.maxSessions}</span>
                          </div>
                        </td>
                        <td>{fmt(r.totalPaid)}</td>
                        <td><span className="pd-earn">{fmt(r.partnerShare)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
