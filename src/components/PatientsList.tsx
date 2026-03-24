// FILE: src/components/PatientsList.tsx

import { useState, useMemo } from "react";
import type { Patient } from "../services/patientService";

// ─── Types ────────────────────────────────────────────────────────────────────

interface PatientsListProps {
  patients:  Patient[];
  loading:   boolean;
  error:     string | null;
  onRefresh: () => void;
  onAddPatient: () => void;
}

type SortKey = "name" | "condition" | "status" | "createdAt";
type SortDir = "asc" | "desc";

const STATUS_META = {
  active:     { label: "Active",     bg: "#d8f3dc", text: "#1b4332" },
  discharged: { label: "Discharged", bg: "#f3f4f6", text: "#374151" },
  on_hold:    { label: "On Hold",    bg: "#fef3c7", text: "#92400e" },
} as const;

// ─── Skeleton row ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="pl-skeleton-row">
      <td><div className="pl-skel pl-skel-avatar" /></td>
      <td><div className="pl-skel pl-skel-md" /></td>
      <td><div className="pl-skel pl-skel-sm" /></td>
      <td><div className="pl-skel pl-skel-chip" /></td>
      <td className="pl-col-added"><div className="pl-skel pl-skel-sm" /></td>
      <td><div className="pl-skel pl-skel-sm" /></td>
    </tr>
  );
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({ name }: { name: string }) {
  const initials = name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  // Deterministic hue from name string
  const hue = name
    .split("")
    .reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360;

  return (
    <div
      className="pl-avatar"
      style={{
        background: `hsl(${hue}, 40%, 88%)`,
        color:      `hsl(${hue}, 45%, 32%)`,
      }}
    >
      {initials}
    </div>
  );
}

// ─── Sort icon ────────────────────────────────────────────────────────────────

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <svg
      width="12" height="12" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2.5"
      strokeLinecap="round" strokeLinejoin="round"
      style={{ opacity: active ? 1 : 0.3, transition: "opacity 0.15s" }}
    >
      {dir === "asc" || !active
        ? <><polyline points="18 15 12 9 6 15"/></>
        : <><polyline points="6 9 12 15 18 9"/></>
      }
    </svg>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function PatientsList({
  patients,
  loading,
  error,
  onRefresh,
  onAddPatient,
}: PatientsListProps) {
  const [search,  setSearch]  = useState("");
  const [status,  setStatus]  = useState<"all" | Patient["status"]>("all");
  const [sortKey, setSortKey] = useState<SortKey>("createdAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  // ── Derived list ──────────────────────────────────────────────────────────
  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return patients
      .filter((p) => {
        const matchSearch =
          !q ||
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          p.condition.toLowerCase().includes(q);
        const matchStatus = status === "all" || p.status === status;
        return matchSearch && matchStatus;
      })
      .sort((a, b) => {
        let cmp = 0;
        if (sortKey === "name") {
          cmp = `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`);
        } else if (sortKey === "condition") {
          cmp = a.condition.localeCompare(b.condition);
        } else if (sortKey === "status") {
          cmp = a.status.localeCompare(b.status);
        } else {
          // createdAt — null values go to end
          const ta = a.createdAt?.toMillis() ?? 0;
          const tb = b.createdAt?.toMillis() ?? 0;
          cmp = ta - tb;
        }
        return sortDir === "asc" ? cmp : -cmp;
      });
  }, [patients, search, status, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const formatDate = (ts: Patient["createdAt"]) => {
    if (!ts) return "—";
    return ts.toDate().toLocaleDateString("en-GB", {
      day: "2-digit", month: "short", year: "numeric",
    });
  };

  const statusCounts = useMemo(() => ({
    all:        patients.length,
    active:     patients.filter((p) => p.status === "active").length,
    on_hold:    patients.filter((p) => p.status === "on_hold").length,
    discharged: patients.filter((p) => p.status === "discharged").length,
  }), [patients]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;500;600&display=swap');

        .pl-root { font-family: 'Outfit', sans-serif; }

        /* ── Toolbar ── */
        .pl-toolbar {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-bottom: 12px;
        }
        .pl-toolbar-top {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }
        .pl-search-wrap {
          position: relative;
          flex: 1;
          min-width: 0;
          max-width: 100%;
        }
        .pl-search-icon {
          position: absolute; left: 12px; top: 50%;
          transform: translateY(-50%);
          color: #c0bbb4; pointer-events: none;
        }
        .pl-search {
          width: 100%;
          padding: 9px 14px 9px 38px;
          border-radius: 10px;
          border: 1.5px solid #e5e0d8;
          background: #fff;
          font-family: 'Outfit', sans-serif;
          font-size: 13.5px;
          color: #1a1a1a;
          outline: none;
          transition: border-color 0.15s, box-shadow 0.15s;
        }
        .pl-search:focus {
          border-color: #52b788;
          box-shadow: 0 0 0 3px rgba(82,183,136,0.1);
        }
        .pl-search::placeholder { color: #c0bbb4; }

        .pl-filter-tabs {
          display: flex;
          gap: 3px;
          background: #f5f3ef;
          border-radius: 10px;
          padding: 3px;
          border: 1px solid #e5e0d8;
          overflow-x: auto;
          -webkit-overflow-scrolling: touch;
        }
        .pl-filter-tab {
          padding: 7px 10px;
          border-radius: 8px;
          border: none;
          background: transparent;
          font-family: 'Outfit', sans-serif;
          font-size: 12px;
          font-weight: 500;
          color: #9a9590;
          cursor: pointer;
          transition: all 0.15s;
          display: flex; align-items: center; gap: 4px;
          white-space: nowrap;
          min-height: 36px;
        }
        .pl-filter-tab.active {
          background: #fff;
          color: #2d6a4f;
          box-shadow: 0 1px 4px rgba(0,0,0,0.06);
        }
        .pl-filter-count {
          font-size: 11px;
          padding: 1px 6px;
          border-radius: 100px;
          background: #e5e0d8;
          color: #5a5550;
          font-weight: 600;
          line-height: 1.4;
        }
        .pl-filter-tab.active .pl-filter-count {
          background: #d8f3dc;
          color: #1b4332;
        }

        .pl-toolbar-right { display: flex; gap: 8px; }

        .pl-refresh-btn {
          padding: 9px 12px;
          border-radius: 10px;
          border: 1.5px solid #e5e0d8;
          background: #fff;
          font-family: 'Outfit', sans-serif;
          font-size: 13px;
          color: #5a5550;
          cursor: pointer;
          display: flex; align-items: center; gap: 5px;
          transition: all 0.15s;
          min-height: 44px;
        }
        .pl-refresh-btn:hover { background: #f5f3ef; border-color: #c0bbb4; }

        .pl-add-btn {
          padding: 9px 14px;
          border-radius: 10px;
          border: none;
          background: #2d6a4f;
          color: #fff;
          font-family: 'Outfit', sans-serif;
          font-size: 13.5px;
          font-weight: 500;
          cursor: pointer;
          display: flex; align-items: center; gap: 7px;
          transition: all 0.2s;
          min-height: 44px;
          white-space: nowrap;
        }
        .pl-add-btn:hover {
          background: #1b4332;
          box-shadow: 0 4px 14px rgba(45,106,79,0.25);
        }

        /* ── Table card ── */
        .pl-card {
          background: #fff;
          border: 1px solid #e5e0d8;
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 2px 12px rgba(0,0,0,0.04);
        }

        .pl-table-wrap { overflow-x: auto; }
        .pl-table {
          width: 100%;
          border-collapse: collapse;
        }
        .pl-table th {
          padding: 12px 16px;
          text-align: left;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #c0bbb4;
          font-weight: 600;
          background: #fafaf8;
          border-bottom: 1px solid #f0ede8;
          white-space: nowrap;
          cursor: pointer;
          user-select: none;
          transition: color 0.15s;
        }
        .pl-table th:hover { color: #5a5550; }
        .pl-table th .pl-th-inner {
          display: flex; align-items: center; gap: 5px;
        }

        .pl-table td {
          padding: 14px 16px;
          font-size: 13.5px;
          border-bottom: 1px solid #f5f3ef;
          color: #1a1a1a;
          vertical-align: middle;
        }
        .pl-table tr:last-child td { border-bottom: none; }
        .pl-table tbody tr {
          transition: background 0.12s;
          cursor: pointer;
        }
        .pl-table tbody tr:hover td { background: #fafff8; }

        /* Avatar + name cell */
        .pl-name-cell {
          display: flex;
          align-items: center;
          gap: 11px;
        }
        .pl-avatar {
          width: 36px; height: 36px;
          border-radius: 50%;
          display: flex; align-items: center; justify-content: center;
          font-size: 13px;
          font-weight: 600;
          flex-shrink: 0;
        }
        .pl-name { font-weight: 500; color: #1a1a1a; line-height: 1.2; }
        .pl-email { font-size: 12px; color: #9a9590; margin-top: 1px; }

        /* Status badge */
        .pl-status {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          padding: 3px 10px;
          border-radius: 100px;
          font-size: 12px;
          font-weight: 500;
          white-space: nowrap;
        }
        .pl-status-dot {
          width: 5px; height: 5px;
          border-radius: 50%;
          background: currentColor;
          opacity: 0.7;
        }

        /* Condition pill */
        .pl-condition {
          display: inline-block;
          padding: 3px 10px;
          background: #f5f3ef;
          border: 1px solid #e5e0d8;
          border-radius: 100px;
          font-size: 12px;
          color: #5a5550;
          white-space: nowrap;
          max-width: 200px;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        /* Action btn */
        .pl-row-action {
          display: flex;
          gap: 6px;
        }
        .pl-action-btn {
          padding: 5px 10px;
          border-radius: 7px;
          border: 1px solid #e5e0d8;
          background: #fff;
          font-family: 'Outfit', sans-serif;
          font-size: 12px;
          color: #5a5550;
          cursor: pointer;
          transition: all 0.15s;
          white-space: nowrap;
        }
        .pl-action-btn:hover { background: #f5f3ef; border-color: #c0bbb4; }
        .pl-action-btn.primary { background: #f0f7f4; border-color: #b7e4c7; color: #2d6a4f; }
        .pl-action-btn.primary:hover { background: #d8f3dc; }

        /* Skeleton */
        .pl-skeleton-row td { padding: 14px 16px; }
        .pl-skel {
          border-radius: 6px;
          background: linear-gradient(90deg, #f0ede8 0%, #e5e0d8 50%, #f0ede8 100%);
          background-size: 200% 100%;
          animation: plShimmer 1.4s ease infinite;
          height: 14px;
        }
        @keyframes plShimmer { to { background-position: -200% 0; } }
        .pl-skel-avatar { width: 36px; height: 36px; border-radius: 50%; }
        .pl-skel-md  { width: 140px; }
        .pl-skel-sm  { width: 90px; }
        .pl-skel-chip{ width: 70px; height: 22px; border-radius: 100px; }

        /* Empty state */
        .pl-empty {
          text-align: center;
          padding: 56px 24px;
        }
        .pl-empty-icon {
          width: 72px; height: 72px;
          border-radius: 50%;
          background: #f5f3ef;
          display: flex; align-items: center; justify-content: center;
          margin: 0 auto 16px;
          font-size: 30px;
        }
        .pl-empty-title {
          font-size: 16px;
          font-weight: 600;
          color: #1a1a1a;
          margin-bottom: 6px;
        }
        .pl-empty-sub { font-size: 13.5px; color: #9a9590; margin-bottom: 20px; }

        /* Error state */
        .pl-error-banner {
          display: flex; align-items: center; gap: 12px;
          padding: 16px 20px;
          background: #fff5f3;
          border-bottom: 1px solid #fecaca;
          font-size: 13.5px; color: #b91c1c;
        }

        /* Summary bar */
        .pl-summary {
          padding: 10px 14px;
          background: #fafaf8;
          border-top: 1px solid #f0ede8;
          font-size: 12px;
          color: #9a9590;
          display: flex;
          justify-content: space-between;
          align-items: center;
          flex-wrap: wrap;
          gap: 4px;
        }

        /* Mobile: hide secondary columns */
        @media (max-width: 600px) {
          .pl-col-added { display: none; }
          .pl-table th, .pl-table td { padding: 10px 10px; }
          .pl-condition { max-width: 120px; }
          .pl-action-btn { padding: 6px 10px; font-size: 12px; }
        }
      `}</style>

      <div className="pl-root">
        {/* Toolbar */}
        <div className="pl-toolbar">
          <div className="pl-toolbar-top">
            <div className="pl-search-wrap">
              <svg className="pl-search-icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className="pl-search"
                placeholder="Search patients…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="pl-toolbar-right">
              <button className="pl-refresh-btn" onClick={onRefresh} title="Refresh list">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                </svg>
                Refresh
              </button>
              <button className="pl-add-btn" onClick={onAddPatient}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                </svg>
                Add Patient
              </button>
            </div>
          </div>
          <div className="pl-filter-tabs">
            {(["all", "active", "on_hold", "discharged"] as const).map((s) => (
              <button
                key={s}
                className={`pl-filter-tab ${status === s ? "active" : ""}`}
                onClick={() => setStatus(s)}
              >
                {s === "all" ? "All" : STATUS_META[s].label}
                <span className="pl-filter-count">{statusCounts[s]}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Table card */}
        <div className="pl-card">
          {error && (
            <div className="pl-error-banner">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
              {error}
              <button className="pl-refresh-btn" style={{ marginLeft: "auto" }} onClick={onRefresh}>Retry</button>
            </div>
          )}

          <div className="pl-table-wrap">
            <table className="pl-table">
              <thead>
                <tr>
                  <th onClick={() => handleSort("name")}>
                    <div className="pl-th-inner">
                      Patient <SortIcon active={sortKey === "name"} dir={sortDir} />
                    </div>
                  </th>
                  <th onClick={() => handleSort("condition")}>
                    <div className="pl-th-inner">
                      Condition <SortIcon active={sortKey === "condition"} dir={sortDir} />
                    </div>
                  </th>
                  <th onClick={() => handleSort("status")}>
                    <div className="pl-th-inner">
                      Status <SortIcon active={sortKey === "status"} dir={sortDir} />
                    </div>
                  </th>
                  <th className="pl-col-added" onClick={() => handleSort("createdAt")}>
                    <div className="pl-th-inner">
                      Added <SortIcon active={sortKey === "createdAt"} dir={sortDir} />
                    </div>
                  </th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ padding: 0 }}>
                      <div className="pl-empty">
                        <div className="pl-empty-icon">
                          {search ? "🔍" : "🩺"}
                        </div>
                        <div className="pl-empty-title">
                          {search ? "No patients match your search" : "No patients yet"}
                        </div>
                        <div className="pl-empty-sub">
                          {search
                            ? `No results for "${search}". Try a different search term.`
                            : "Add your first patient to get started."}
                        </div>
                        {!search && (
                          <button className="pl-add-btn" style={{ margin: "0 auto" }} onClick={onAddPatient}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                            </svg>
                            Add First Patient
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((patient, i) => {
                    const fullName = `${patient.firstName} ${patient.lastName}`;
                    const statusMeta = STATUS_META[patient.status] ?? STATUS_META.active;
                    return (
                      <tr
                        key={patient.uid}
                        style={{ animationDelay: `${i * 30}ms` }}
                      >
                        <td>
                          <div className="pl-name-cell">
                            <Avatar name={fullName} />
                            <div>
                              <div className="pl-name">{fullName}</div>
                              <div className="pl-email">{patient.email}</div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className="pl-condition" title={patient.condition}>
                            {patient.condition}
                          </span>
                        </td>
                        <td>
                          <span className="pl-status" style={{ background: statusMeta.bg, color: statusMeta.text }}>
                            <span className="pl-status-dot" />
                            {statusMeta.label}
                          </span>
                        </td>
                        <td className="pl-col-added" style={{ color: "#9a9590", fontSize: 13 }}>
                          {formatDate(patient.createdAt)}
                        </td>
                        <td>
                          <div className="pl-row-action">
                            <button className="pl-action-btn primary">View</button>
                            <button className="pl-action-btn">Notes</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {!loading && filtered.length > 0 && (
            <div className="pl-summary">
              <span>Showing {filtered.length} of {patients.length} patients</span>
              <span>{statusCounts.active} active · {statusCounts.on_hold} on hold · {statusCounts.discharged} discharged</span>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
