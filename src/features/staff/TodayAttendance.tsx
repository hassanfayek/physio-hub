// FILE: src/features/staff/TodayAttendance.tsx
// Staff tab → Today's attendance: one card per doctor with a clear status
// (not arrived / on duty / finished), times, hours worked, a late badge when
// the arrival rule is known, and one big button for the next action.
// Records go through the existing upsertAttendance (one record per doctor/day).

import { useEffect, useState } from "react";
import { LogIn, LogOut, ChevronRight, Undo2, Clock } from "lucide-react";
import type { Physiotherapist } from "../../services/patientService";
import type { AttendanceRecord } from "../../services/attendanceService";
import { subscribeToBusinessSettings, clinicNow } from "../../services/businessService";
import { lateness, toMinutes, type PayrollRules } from "./payroll";
import { time12 } from "../../utils/time";

const RANK_LABEL: Record<string, string> = { manager: "Manager", senior: "Senior", junior: "Junior", trainee: "Trainee" };
const dur = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")} min`);

interface Props {
  physios: Physiotherapist[];
  attendanceByPhysio: Map<string, AttendanceRecord>;
  markingId: string | null;
  onMark: (p: Physiotherapist, field: "checkIn" | "checkOut", value?: string) => Promise<void>;
  onOpen: (p: Physiotherapist) => void;
}

export default function TodayAttendance({ physios, attendanceByPhysio, markingId, onMark, onOpen }: Props) {
  const [now, setNow] = useState(clinicNow);
  useEffect(() => { const t = setInterval(() => setNow(clinicNow()), 30_000); return () => clearInterval(t); }, []);
  // The arrival rule lives in manager-only settings; for other roles it simply isn't shown.
  const [rules, setRules] = useState<PayrollRules | null>(null);
  useEffect(() => subscribeToBusinessSettings((s) => setRules(s.payrollRules ?? null), () => setRules(null)), []);
  // Short "Undo" window after each tap, for mis-taps.
  const [undo, setUndo] = useState<{ uid: string; field: "checkIn" | "checkOut" } | null>(null);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 15_000); return () => clearTimeout(t); }, [undo]);

  const nowMin = toMinutes(now.slice(11, 16)) ?? 0;
  const dueBy = rules ? (toMinutes(rules.requiredArrival) ?? 0) + rules.graceMinutes : null;

  const state = (p: Physiotherapist) => {
    const a = attendanceByPhysio.get(p.uid);
    return !a?.checkIn ? "out" : !a.checkOut ? "in" : "done";
  };
  const onDuty = physios.filter((p) => state(p) === "in").length;
  const done = physios.filter((p) => state(p) === "done").length;
  const notYet = physios.length - onDuty - done;
  const late = rules ? physios.filter((p) => { const a = attendanceByPhysio.get(p.uid); return a?.checkIn && lateness(a.checkIn, rules).counted > 0; }).length : 0;

  const mark = async (p: Physiotherapist, field: "checkIn" | "checkOut") => { await onMark(p, field); setUndo({ uid: p.uid, field }); };

  return (
    <div className="ta">
      <style>{CSS}</style>
      <div className="ta-head">
        <div>
          <div className="ta-title"><Clock size={16} /> Today's attendance</div>
          <div className="ta-date">{new Date(now.slice(0, 10) + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })} · {time12(now.slice(11, 16))}
            {rules && <> · arrive by {time12(rules.requiredArrival)}</>}</div>
        </div>
        <div className="ta-sum">
          <span className="ta-pill on"><i />{onDuty} on duty</span>
          <span className="ta-pill done"><i />{done} finished</span>
          <span className="ta-pill out"><i />{notYet} not arrived</span>
          {rules && late > 0 && <span className="ta-pill late"><i />{late} late</span>}
        </div>
      </div>

      {physios.length === 0 ? <div className="ta-empty">No physiotherapists on file yet.</div> : (
        <div className="ta-grid">
          {physios.map((p) => {
            const a = attendanceByPhysio.get(p.uid);
            const st = state(p);
            const saving = markingId === p.uid;
            const lt = rules && a?.checkIn ? lateness(a.checkIn, rules) : null;
            const inMin = a?.checkIn ? toMinutes(a.checkIn) : null;
            const outMin = a?.checkOut ? toMinutes(a.checkOut) : null;
            const overdue = st === "out" && dueBy !== null && nowMin > dueBy;
            return (
              <div key={p.uid} className={`ta-card s-${st}`}>
                <div className="ta-top" onClick={() => onOpen(p)} title="Open profile">
                  <div className="ta-avatar">{(p.firstName[0] ?? "") + (p.lastName[0] ?? "")}<i /></div>
                  <div className="ta-who">
                    <div className="ta-name">Dr. {p.firstName} {p.lastName}</div>
                    <div className="ta-rank">{RANK_LABEL[p.rank] ?? p.rank}</div>
                  </div>
                  <ChevronRight size={16} className="ta-chev" />
                </div>

                <div className="ta-status">
                  {st === "out" && (overdue
                    ? <span className="ta-warn">Not arrived. Expected by {time12(rules!.requiredArrival)}</span>
                    : <span className="ta-muted">Not arrived yet</span>)}
                  {st === "in" && <>
                    <span className="ta-live"><i />On duty since <b>{time12(a!.checkIn)}</b></span>
                    {inMin !== null && nowMin >= inMin && <span className="ta-muted">{dur(nowMin - inMin)} so far</span>}
                  </>}
                  {st === "done" && <>
                    <span><b>{time12(a!.checkIn)}</b> → <b>{time12(a!.checkOut)}</b></span>
                    {inMin !== null && outMin !== null && outMin >= inMin && <span className="ta-muted">{dur(outMin - inMin)} worked</span>}
                  </>}
                  {lt && lt.counted > 0 && <span className="ta-late">Late {lt.actual} min</span>}
                  {lt && lt.counted === 0 && st !== "out" && <span className="ta-ontime">{lt.actual === 0 ? "On time" : "On time (within grace)"}</span>}
                </div>

                <div className="ta-actions">
                  {st === "out" && <button className="ta-btn in" disabled={saving} onClick={() => mark(p, "checkIn")}><LogIn size={16} /> {saving ? "Saving…" : "Check in"}</button>}
                  {st === "in" && <button className="ta-btn outb" disabled={saving} onClick={() => mark(p, "checkOut")}><LogOut size={16} /> {saving ? "Saving…" : "Check out"}</button>}
                  {st === "done" && <button className="ta-btn ghost" onClick={() => onOpen(p)}>View attendance</button>}
                  {undo?.uid === p.uid && (
                    <button className="ta-undo" disabled={saving} onClick={async () => { await onMark(p, undo.field, ""); setUndo(null); }}>
                      <Undo2 size={13} /> Undo {undo.field === "checkIn" ? "check-in" : "check-out"}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

const CSS = `
.ta { margin-top: 28px; }
.ta-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.ta-title { display: flex; align-items: center; gap: 7px; font-size: 16px; font-weight: 700; color: #0C3C60; }
.ta-date { font-size: 12.5px; color: #9a9590; margin-top: 3px; }
.ta-sum { display: flex; gap: 6px; flex-wrap: wrap; }
.ta-pill { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 600; padding: 5px 11px; border-radius: 100px; background: #fff; border: 1px solid #e5e0d8; color: #5a5550; }
.ta-pill i { width: 8px; height: 8px; border-radius: 50%; background: #c0bbb4; }
.ta-pill.on i { background: #16a34a; } .ta-pill.done i { background: #2E8BC0; } .ta-pill.late i { background: #dc2626; }
.ta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
.ta-card { background: #fff; border: 1.5px solid #e5e0d8; border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 10px; transition: box-shadow .15s, border-color .15s; }
.ta-card:hover { box-shadow: 0 6px 18px rgba(12,60,96,.08); }
.ta-card.s-in { border-color: #86efac; background: linear-gradient(180deg, #f0fdf4 0%, #fff 60%); }
.ta-card.s-done { border-color: #B3DEF0; }
.ta-top { display: flex; align-items: center; gap: 10px; cursor: pointer; }
.ta-avatar { position: relative; width: 42px; height: 42px; border-radius: 50%; background: linear-gradient(135deg, #0C3C60, #2E8BC0); color: #fff; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
.ta-avatar i { position: absolute; right: -1px; bottom: -1px; width: 13px; height: 13px; border-radius: 50%; border: 2.5px solid #fff; background: #c0bbb4; }
.s-in .ta-avatar i { background: #16a34a; } .s-done .ta-avatar i { background: #2E8BC0; }
.ta-who { min-width: 0; flex: 1; }
.ta-name { font-size: 14px; font-weight: 700; color: #1a1a1a; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ta-rank { font-size: 11.5px; color: #9a9590; }
.ta-chev { color: #c0bbb4; }
.ta-status { display: flex; flex-wrap: wrap; gap: 6px 10px; align-items: center; font-size: 13px; color: #1a1a1a; min-height: 22px; }
.ta-muted { color: #9a9590; font-size: 12.5px; }
.ta-warn { color: #b45309; font-size: 12.5px; font-weight: 600; }
.ta-live { display: inline-flex; align-items: center; gap: 6px; }
.ta-live i { width: 8px; height: 8px; border-radius: 50%; background: #16a34a; box-shadow: 0 0 0 0 rgba(22,163,74,.5); animation: taPulse 1.8s infinite; }
@keyframes taPulse { 0% { box-shadow: 0 0 0 0 rgba(22,163,74,.5); } 70% { box-shadow: 0 0 0 7px rgba(22,163,74,0); } 100% { box-shadow: 0 0 0 0 rgba(22,163,74,0); } }
.ta-late { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 100px; background: #fee2e2; color: #991b1b; }
.ta-ontime { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 100px; background: #dcfce7; color: #166534; }
.ta-actions { display: flex; flex-direction: column; gap: 6px; margin-top: auto; }
.ta-btn { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px; border-radius: 12px; border: none; font-family: inherit; font-size: 14px; font-weight: 700; cursor: pointer; transition: transform .1s, filter .15s; }
.ta-btn:active { transform: scale(.98); } .ta-btn:disabled { opacity: .6; cursor: wait; }
.ta-btn.in { background: #16a34a; color: #fff; } .ta-btn.in:hover { filter: brightness(1.05); }
.ta-btn.outb { background: #0C3C60; color: #fff; } .ta-btn.outb:hover { filter: brightness(1.15); }
.ta-btn.ghost { background: #fafaf8; color: #2E8BC0; border: 1.5px solid #e5e0d8; font-weight: 600; font-size: 13px; padding: 9px; }
.ta-undo { align-self: center; display: inline-flex; align-items: center; gap: 5px; background: none; border: none; color: #9a9590; font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.ta-undo:hover { color: #b91c1c; }
.ta-empty { text-align: center; color: #9a9590; padding: 24px; background: #fff; border: 1px solid #e5e0d8; border-radius: 14px; }
`;
