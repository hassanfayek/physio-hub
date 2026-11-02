// FILE: src/features/staff/AssignedPatients.tsx
// Patients assigned to a doctor in any role (primary, senior, junior, trainee),
// shown in the doctor's Staff profile. Click a patient to open their sheet.

import { useEffect, useMemo, useState } from "react";
import { Search, ChevronRight, Users } from "lucide-react";
import { subscribeToPhysioPatients, type Patient } from "../../services/patientService";
import { openPatientSection } from "../../utils/navEvents";

type StatusFilter = "active" | "on_hold" | "discharged" | "all";
const STATUS_LABEL: Record<string, string> = { active: "Active", on_hold: "On hold", discharged: "Discharged" };

function rolesFor(p: Patient, uid: string): string[] {
  const r: string[] = [];
  if (p.physioId === uid) r.push("Primary");
  if (p.seniorEditorId === uid) r.push("Senior");
  if ((p.juniorIds ?? []).includes(uid)) r.push("Junior");
  if (p.traineeId === uid) r.push("Trainee");
  return r;
}

export default function AssignedPatients({ physioId }: { physioId: string }) {
  const [patients, setPatients] = useState<Patient[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>("active");
  const [q, setQ] = useState("");
  useEffect(() => subscribeToPhysioPatients(physioId, setPatients, (e) => setError(e.message)), [physioId]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { active: 0, on_hold: 0, discharged: 0, all: 0 };
    (patients ?? []).forEach((p) => { c.all++; if (p.status in c) c[p.status as StatusFilter]++; });
    return c;
  }, [patients]);

  const nq = q.trim().toLowerCase(), qd = q.replace(/\D/g, "");
  const list = (patients ?? [])
    .filter((p) => filter === "all" || p.status === filter)
    .filter((p) => !nq || `${p.firstName} ${p.lastName}`.toLowerCase().includes(nq) || (qd.length >= 3 && (p.phone ?? "").replace(/\D/g, "").includes(qd)))
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));

  return (
    <div className="ap-wrap">
      <style>{CSS}</style>
      <div className="ap-head">
        <div className="ap-title"><Users size={16} /> Assigned patients <span className="ap-count">{counts.all}</span></div>
        <div className="ap-search"><Search size={13} /><input placeholder="Search name or phone…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      </div>
      <div className="ap-chips">
        {(["active", "on_hold", "discharged", "all"] as StatusFilter[]).map((f) => (
          <button key={f} className={`ap-chip ${filter === f ? "on" : ""}`} onClick={() => setFilter(f)}>
            {f === "all" ? "All" : STATUS_LABEL[f]} <span>{counts[f]}</span>
          </button>
        ))}
      </div>
      {error ? <div className="ap-empty">Couldn't load patients: {error}</div>
        : patients === null ? <div className="ap-empty">Loading…</div>
        : list.length === 0 ? <div className="ap-empty">{counts.all === 0 ? "No patients are assigned to this doctor yet." : "No patients match."}</div>
        : (
          <div className="ap-list">
            {list.map((p) => (
              <button key={p.uid} className="ap-row" onClick={() => openPatientSection(p.uid, "profile")} title="Open patient sheet">
                <span className="ap-avatar">{(p.firstName[0] ?? "") + (p.lastName[0] ?? "")}</span>
                <span className="ap-main">
                  <span className="ap-name">{p.firstName} {p.lastName}</span>
                  <span className="ap-meta">{p.phone || "No phone"}</span>
                </span>
                <span className="ap-roles">{rolesFor(p, physioId).map((r) => <span key={r} className={`ap-role r-${r.toLowerCase()}`}>{r}</span>)}</span>
                <span className={`ap-status s-${p.status}`}>{STATUS_LABEL[p.status] ?? p.status}</span>
                <ChevronRight size={15} className="ap-chev" />
              </button>
            ))}
          </div>
        )}
    </div>
  );
}

const CSS = `
.ap-wrap { background: #fff; border: 1.5px solid #e5e0d8; border-radius: 16px; padding: 16px 18px; margin-bottom: 8px; }
.ap-head { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.ap-title { display: flex; align-items: center; gap: 7px; font-size: 15px; font-weight: 700; color: #0C3C60; }
.ap-count { background: #EAF5FC; color: #2E8BC0; font-size: 12px; padding: 1px 9px; border-radius: 100px; }
.ap-search { display: flex; align-items: center; gap: 6px; border: 1.5px solid #e5e0d8; border-radius: 10px; padding: 0 10px; color: #9a9590; min-width: 0; flex: 0 1 240px; }
.ap-search input { border: none; outline: none; padding: 7px 0; font-family: inherit; font-size: 13px; min-width: 0; flex: 1; }
.ap-chips { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 10px; }
.ap-chip { border: 1.5px solid #e5e0d8; background: #fff; border-radius: 100px; padding: 5px 11px; font-family: inherit; font-size: 12px; font-weight: 600; color: #5a5550; cursor: pointer; }
.ap-chip span { margin-left: 3px; color: #9a9590; }
.ap-chip.on { background: #0C3C60; border-color: #0C3C60; color: #fff; } .ap-chip.on span { color: rgba(255,255,255,.75); }
.ap-list { display: flex; flex-direction: column; gap: 6px; max-height: 420px; overflow-y: auto; }
.ap-row { display: flex; align-items: center; gap: 10px; width: 100%; text-align: left; border: 1px solid #f0ede8; background: #fafaf8; border-radius: 12px; padding: 9px 12px; cursor: pointer; font-family: inherit; transition: border-color .15s, background .15s; }
.ap-row:hover { border-color: #B3DEF0; background: #f5fbff; }
.ap-avatar { width: 34px; height: 34px; border-radius: 50%; background: linear-gradient(135deg, #2E8BC0, #5BC0BE); color: #fff; font-size: 12px; font-weight: 700; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ap-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.ap-name { font-size: 13.5px; font-weight: 600; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ap-meta { font-size: 11.5px; color: #9a9590; }
.ap-roles { display: flex; gap: 4px; flex-wrap: wrap; justify-content: flex-end; }
.ap-role { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; padding: 2px 7px; border-radius: 100px; background: #EAF5FC; color: #0C3C60; }
.ap-role.r-senior { background: #fef3c7; color: #92400e; } .ap-role.r-junior { background: #D6EEF8; color: #0C3C60; }
.ap-role.r-trainee { background: #f3f4f6; color: #374151; } .ap-role.r-primary { background: #ede9fe; color: #5b21b6; }
.ap-status { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 100px; white-space: nowrap; }
.ap-status.s-active { background: #dcfce7; color: #166534; } .ap-status.s-on_hold { background: #fef3c7; color: #92400e; } .ap-status.s-discharged { background: #f3f4f6; color: #4b5563; }
.ap-chev { color: #c0bbb4; flex-shrink: 0; }
.ap-empty { text-align: center; color: #9a9590; font-size: 13px; padding: 18px 8px; }
@media (max-width: 560px) { .ap-roles { display: none; } }
@media print { .ap-wrap { display: none; } }
`;
