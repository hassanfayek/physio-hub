// FILE: src/features/admin/SuperAdminDashboard.tsx
// Platform super-admin panel — manage all clinics, plans, and status.
// Accessible only to users with role: "superadmin".

import { useState, useEffect } from "react";
import { useAuth } from "../../hooks/useAuth";
import {
  subscribeToAllClinics,
  setClinicStatus,
  updateClinic,
  PLAN_LIMITS,
  type Clinic,
  type ClinicPlan,
  type ClinicStatus,
} from "../../services/clinicService";

const STATUS_COLORS: Record<ClinicStatus, { bg: string; color: string; label: string }> = {
  trial:     { bg: "#fef3c7", color: "#92400e", label: "Trial"     },
  active:    { bg: "#d1fae5", color: "#065f46", label: "Active"    },
  suspended: { bg: "#fee2e2", color: "#b91c1c", label: "Suspended" },
  expired:   { bg: "#f5f3ef", color: "#9a9590", label: "Expired"   },
};

const PLAN_COLORS: Record<ClinicPlan, { bg: string; color: string }> = {
  starter:    { bg: "#f5f3ef", color: "#5a5550" },
  clinic:     { bg: "#D6EEF8", color: "#0C3C60" },
  enterprise: { bg: "#ede9fe", color: "#5b21b6" },
};

export default function SuperAdminDashboard() {
  const { logout } = useAuth();
  const [clinics,    setClinics]    = useState<Clinic[]>([]);
  const [search,     setSearch]     = useState("");
  const [filter,     setFilter]     = useState<ClinicStatus | "all">("all");
  const [updating,   setUpdating]   = useState<string | null>(null);
  const [editingPlan, setEditingPlan] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToAllClinics(setClinics);
  }, []);

  const displayed = clinics.filter((c) => {
    const matchSearch = !search || c.name.toLowerCase().includes(search.toLowerCase()) || c.slug.includes(search.toLowerCase());
    const matchFilter = filter === "all" || c.status === filter;
    return matchSearch && matchFilter;
  });

  const handleToggleStatus = async (c: Clinic) => {
    setUpdating(c.id);
    const newStatus: ClinicStatus = c.status === "active" ? "suspended" : "active";
    await setClinicStatus(c.id, newStatus);
    setUpdating(null);
  };

  const handleChangePlan = async (c: Clinic, plan: ClinicPlan) => {
    setUpdating(c.id);
    await updateClinic(c.id, { plan });
    setEditingPlan(null);
    setUpdating(null);
  };

  const stats = {
    total:     clinics.length,
    active:    clinics.filter((c) => c.status === "active").length,
    trial:     clinics.filter((c) => c.status === "trial").length,
    suspended: clinics.filter((c) => c.status === "suspended").length,
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f8fc", fontFamily: "'Outfit', sans-serif" }}>
      <style>{`
        .sa-topbar {
          background: #0C3C60; color: #fff;
          display: flex; align-items: center; justify-content: space-between;
          padding: 0 32px; height: 60px;
        }
        .sa-topbar-title { font-size: 17px; font-weight: 700; display: flex; align-items: center; gap: 10px; }
        .sa-badge {
          font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 100px;
          background: rgba(255,255,255,0.15); letter-spacing: 0.06em; text-transform: uppercase;
        }
        .sa-logout-btn {
          background: rgba(255,255,255,0.12); border: 1px solid rgba(255,255,255,0.2);
          color: #fff; padding: 6px 14px; border-radius: 8px; cursor: pointer;
          font-family: 'Outfit', sans-serif; font-size: 13px; transition: all 0.15s;
        }
        .sa-logout-btn:hover { background: rgba(255,255,255,0.2); }
        .sa-body { max-width: 1200px; margin: 0 auto; padding: 32px; }

        .sa-stats { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 28px; }
        .sa-stat-card {
          background: #fff; border: 1px solid #e5e0d8; border-radius: 14px;
          padding: 20px 22px;
        }
        .sa-stat-num { font-size: 32px; font-weight: 800; color: #0C3C60; line-height: 1; }
        .sa-stat-label { font-size: 13px; color: #9a9590; margin-top: 6px; }

        .sa-toolbar {
          display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap;
        }
        .sa-search {
          flex: 1; min-width: 200px; padding: 10px 14px;
          border: 1.5px solid #e5e0d8; border-radius: 10px;
          font-family: 'Outfit', sans-serif; font-size: 14px; color: #1a1a1a;
          outline: none; transition: border-color 0.15s;
        }
        .sa-search:focus { border-color: #2E8BC0; }
        .sa-filter-btn {
          padding: 9px 14px; border-radius: 10px; border: 1.5px solid #e5e0d8;
          background: #fff; font-family: 'Outfit', sans-serif; font-size: 13px;
          font-weight: 500; color: #5a5550; cursor: pointer; transition: all 0.15s;
          white-space: nowrap;
        }
        .sa-filter-btn.active { border-color: #0C3C60; background: #0C3C60; color: #fff; }

        .sa-table-wrap { background: #fff; border: 1px solid #e5e0d8; border-radius: 16px; overflow: hidden; }
        .sa-table { width: 100%; border-collapse: collapse; }
        .sa-table th {
          background: #f5f7fa; padding: 12px 16px; text-align: left;
          font-size: 11px; font-weight: 700; text-transform: uppercase;
          letter-spacing: 0.07em; color: #9a9590;
          border-bottom: 1px solid #e5e0d8;
        }
        .sa-table td { padding: 14px 16px; border-bottom: 1px solid #f5f3ef; vertical-align: middle; }
        .sa-table tr:last-child td { border-bottom: none; }
        .sa-table tr:hover td { background: #fafaf8; }
        .sa-chip {
          display: inline-block; font-size: 11px; font-weight: 700;
          padding: 3px 10px; border-radius: 100px;
        }
        .sa-clinic-name { font-size: 14px; font-weight: 600; color: #0C3C60; }
        .sa-clinic-slug { font-size: 12px; color: #9a9590; margin-top: 2px; font-family: monospace; }
        .sa-action-btn {
          padding: 5px 12px; border-radius: 7px; border: 1px solid #e5e0d8;
          background: #fff; font-family: 'Outfit', sans-serif; font-size: 12px;
          font-weight: 500; cursor: pointer; transition: all 0.15s;
        }
        .sa-action-btn:hover { background: #f5f3ef; }
        .sa-action-btn.danger { color: #b91c1c; border-color: #fecaca; }
        .sa-action-btn.danger:hover { background: #fee2e2; }
        .sa-action-btn.success { color: #065f46; border-color: #86efac; }
        .sa-action-btn.success:hover { background: #d1fae5; }
        .sa-plan-select {
          padding: 4px 8px; border-radius: 7px; border: 1px solid #e5e0d8;
          font-family: 'Outfit', sans-serif; font-size: 12px; cursor: pointer; outline: none;
        }
        .sa-empty { text-align: center; padding: 48px; color: #9a9590; font-size: 14px; }
      `}</style>

      {/* Topbar */}
      <nav className="sa-topbar">
        <div className="sa-topbar-title">
          🦴 Physio+ Admin
          <span className="sa-badge">Super Admin</span>
        </div>
        <button className="sa-logout-btn" onClick={logout}>Log out</button>
      </nav>

      <div className="sa-body">
        {/* Stats */}
        <div className="sa-stats">
          {[
            { num: stats.total,     label: "Total clinics"     },
            { num: stats.active,    label: "Active"            },
            { num: stats.trial,     label: "On free trial"     },
            { num: stats.suspended, label: "Suspended"         },
          ].map((s) => (
            <div key={s.label} className="sa-stat-card">
              <div className="sa-stat-num">{s.num}</div>
              <div className="sa-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="sa-toolbar">
          <input
            className="sa-search" placeholder="Search by name or slug…"
            value={search} onChange={(e) => setSearch(e.target.value)}
          />
          {(["all", "trial", "active", "suspended", "expired"] as const).map((f) => (
            <button
              key={f}
              className={`sa-filter-btn ${filter === f ? "active" : ""}`}
              onClick={() => setFilter(f)}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Table */}
        <div className="sa-table-wrap">
          {displayed.length === 0 ? (
            <div className="sa-empty">No clinics found</div>
          ) : (
            <table className="sa-table">
              <thead>
                <tr>
                  <th>Clinic</th>
                  <th>Status</th>
                  <th>Plan</th>
                  <th>Limits</th>
                  <th>Owner</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {displayed.map((c) => {
                  const statusStyle = STATUS_COLORS[c.status];
                  const planStyle   = PLAN_COLORS[c.plan];
                  const limits      = PLAN_LIMITS[c.plan];
                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="sa-clinic-name">{c.name}</div>
                        <div className="sa-clinic-slug">/c/{c.slug}</div>
                      </td>
                      <td>
                        <span className="sa-chip" style={{ background: statusStyle.bg, color: statusStyle.color }}>
                          {statusStyle.label}
                        </span>
                        {c.status === "trial" && c.trialEndsAt && (
                          <div style={{ fontSize: 11, color: "#9a9590", marginTop: 3 }}>
                            Until {c.trialEndsAt.toDate?.().toLocaleDateString() ?? "—"}
                          </div>
                        )}
                      </td>
                      <td>
                        {editingPlan === c.id ? (
                          <select
                            className="sa-plan-select"
                            value={c.plan}
                            onChange={(e) => handleChangePlan(c, e.target.value as ClinicPlan)}
                            onBlur={() => setEditingPlan(null)}
                            autoFocus
                          >
                            <option value="starter">Starter</option>
                            <option value="clinic">Clinic</option>
                            <option value="enterprise">Enterprise</option>
                          </select>
                        ) : (
                          <span
                            className="sa-chip"
                            style={{ background: planStyle.bg, color: planStyle.color, cursor: "pointer" }}
                            onClick={() => setEditingPlan(c.id)}
                            title="Click to change plan"
                          >
                            {c.plan.charAt(0).toUpperCase() + c.plan.slice(1)}
                          </span>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: "#5a5550" }}>
                        {limits.maxPhysios === -1 ? "∞" : limits.maxPhysios} physios<br />
                        {limits.maxPatients === -1 ? "∞" : limits.maxPatients} patients
                      </td>
                      <td style={{ fontSize: 13, color: "#5a5550" }}>
                        {c.ownerEmail}
                      </td>
                      <td style={{ fontSize: 12, color: "#9a9590" }}>
                        {c.createdAt?.toDate?.().toLocaleDateString() ?? "—"}
                      </td>
                      <td>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className={`sa-action-btn ${c.status === "active" ? "danger" : "success"}`}
                            disabled={updating === c.id || c.status === "trial" || c.status === "expired"}
                            onClick={() => handleToggleStatus(c)}
                          >
                            {updating === c.id ? "…" : c.status === "active" ? "Suspend" : "Activate"}
                          </button>
                          {(c.status === "trial" || c.status === "expired") && (
                            <button
                              className="sa-action-btn success"
                              onClick={() => setClinicStatus(c.id, "active")}
                            >
                              Activate
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
