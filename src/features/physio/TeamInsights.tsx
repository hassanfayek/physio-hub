// FILE: src/features/physio/TeamInsights.tsx
// Caseload balance bar for the People → Team tab.

import type { Physiotherapist } from "../../services/patientService";
import type { TeamStats } from "./teamStats";

export function CaseloadBar({ physios, stats }: { physios: Physiotherapist[]; stats: TeamStats }) {
  const rows = physios.filter((p) => p.active).map((p) => ({ p, n: stats.caseload.get(p.uid) ?? 0 })).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!rows.length) return null;
  return (
    <div className="tm-caseload">
      <div className="tm-caseload-head">Caseload balance <span>active patients per physio (any role) · use it to spread new patients fairly</span></div>
      {rows.map(({ p, n }) => (
        <div key={p.uid} className="tm-cl-row">
          <span className="tm-cl-name">Dr. {p.firstName} {p.lastName}</span>
          <span className="tm-cl-track"><b style={{ width: `${(n / max) * 100}%` }} /></span>
          <span className="tm-cl-num">{n}</span>
        </div>
      ))}
    </div>
  );
}
