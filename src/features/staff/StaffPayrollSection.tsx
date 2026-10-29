// FILE: src/features/staff/StaffPayrollSection.tsx
// "Attendance & salary" inside a doctor's existing Staff profile (manager only).
// Uses the profile's existing attendance records and month; check-ins are edited
// through the profile's existing attendance entry form. Nothing here creates
// attendance records of its own.

import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Lock, Unlock, AlertTriangle, Pencil } from "lucide-react";
import type { AttendanceRecord } from "../../services/attendanceService";
import { subscribeToBusinessSettings, saveBusinessSettings, DEFAULT_BUSINESS_SETTINGS, type BusinessSettings } from "../../services/businessService";
import {
  subscribeToStaffPay, subscribeToPayrollMonth, saveMonthlySalary, saveExpectedDays, saveCommissionPct, setDayMark, finalizeMonth, reopenMonth,
  EMPTY_MONTH, type StaffPay, type PayrollMonth,
} from "../../services/payrollService";
import { computeMonth, recoveryCommission, isRecoverySession, money, toMinutes, type DayMark, type DayStatus, type PayrollRules, type RecoverySessionIn } from "./payroll";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { docToAppointment, fmtHour12, type Appointment } from "../../services/appointmentService";
import { docToSessionPrice, type SessionPrice } from "../../services/priceService";
import { openPatientSection } from "../../utils/navEvents";

const STATUS: Record<DayStatus, { label: string; cls: string }> = {
  present: { label: "Recorded", cls: "ok" },
  checkin_missing: { label: "Check-in missing (review)", cls: "warn" },
  absent: { label: "Unexcused absence (confirmed)", cls: "bad" },
  leave: { label: "Approved leave", cls: "info" },
  off: { label: "Day off", cls: "muted" },
  conflict: { label: "Checked in but marked away (review)", cls: "warn" },
};
const MARKS: { v: DayMark; l: string }[] = [{ v: "absent", l: "Unexcused absence" }, { v: "leave", l: "Approved leave" }, { v: "off", l: "Day off" }];

const fmtMin = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);
const fmt12 = (hhmm: string) => {
  const t = toMinutes(hhmm); if (t === null) return "—";
  const h = Math.floor(t / 60), mi = t % 60;
  return `${((h + 11) % 12) + 1}:${String(mi).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const fmtDay = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const monthName = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const parseNum = (s: string) => { const t = s.replace(/[,\s]/g, ""); return t === "" ? null : /^\d+(\.\d+)?$/.test(t) ? Number(t) : NaN; };

interface Props {
  physioId: string;
  month: string;                         // the profile's attendance month (YYYY-MM)
  monthDays: string[];
  attendance: AttendanceRecord[];        // this doctor's existing attendance records
  uid: string;
  onEditDay: (date: string) => void;     // opens the profile's existing attendance entry form
}

export default function StaffPayrollSection({ physioId, month, monthDays, attendance, uid, onEditDay }: Props) {
  const [open, setOpen] = useState(true);
  const [pay, setPay] = useState<StaffPay | null>(null);
  const [mdoc, setMdoc] = useState<PayrollMonth>(EMPTY_MONTH);
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => subscribeToStaffPay(physioId, setPay, (e) => setError(e.message)), [physioId]);
  useEffect(() => subscribeToPayrollMonth(physioId, month, setMdoc, (e) => setError(e.message)), [physioId, month]);
  useEffect(() => subscribeToBusinessSettings(setSettings, () => {}), []);
  const savedRules: PayrollRules = settings.payrollRules ?? DEFAULT_BUSINESS_SETTINGS.payrollRules;

  // This doctor's appointments and the clinic's session charges for the month (live).
  const [monthAppts, setMonthAppts] = useState<Appointment[]>([]);
  const [monthCharges, setMonthCharges] = useState<SessionPrice[]>([]);
  useEffect(() => {
    const from = `${month}-01`, to = `${month}-31`;
    const u1 = onSnapshot(query(collection(db, "appointments"), where("date", ">=", from), where("date", "<=", to)),
      (snap) => setMonthAppts(snap.docs.map((d) => docToAppointment(d.id, d.data())).filter((a) => a.physioId === physioId)),
      (e) => setError(e.message));
    const u2 = onSnapshot(query(collection(db, "patientSessionPrices"), where("date", ">=", from), where("date", "<=", to)),
      (snap) => setMonthCharges(snap.docs.map((d) => docToSessionPrice(d.id, d.data()))),
      (e) => setError(e.message));
    return () => { u1(); u2(); };
  }, [physioId, month]);

  // Drafts drive the calculation immediately; Save persists them. null = not being edited.
  const [salaryDraft, setSalaryDraft] = useState<string | null>(null);
  const [pctDraft, setPctDraft] = useState<string | null>(null);
  const [daysDraft, setDaysDraft] = useState<string | null>(null);
  const [rulesDraft, setRulesDraft] = useState<{ requiredArrival: string; graceMinutes: string; shiftHours: string } | null>(null);
  const [markDate, setMarkDate] = useState(""); const [markType, setMarkType] = useState<DayMark>("absent");
  const [busy, setBusy] = useState(false);

  const salary = salaryDraft !== null ? parseNum(salaryDraft) : pay?.monthlySalary ?? null;
  const expected = daysDraft !== null ? parseNum(daysDraft) : mdoc.expectedWorkingDays;
  const rules: PayrollRules = rulesDraft
    ? { requiredArrival: rulesDraft.requiredArrival, graceMinutes: Number(rulesDraft.graceMinutes), shiftHours: Number(rulesDraft.shiftHours) }
    : savedRules;

  const monthAttendance = useMemo(() => attendance.filter((a) => a.date.startsWith(month)).map((a) => ({ date: a.date, checkIn: a.checkIn })), [attendance, month]);
  const r = computeMonth({
    monthlySalary: salary === null || Number.isNaN(salary) ? null : salary,
    expectedWorkingDays: expected === null || Number.isNaN(expected) ? null : expected,
    rules, attendance: monthAttendance, marks: mdoc.marks,
  });
  // The saved values alone (no drafts) — used to finalize and to detect changes after finalizing.
  const saved = computeMonth({ monthlySalary: pay?.monthlySalary ?? null, expectedWorkingDays: mdoc.expectedWorkingDays, rules: savedRules, attendance: monthAttendance, marks: mdoc.marks });
  // Completed Recovery Sessions this month, each priced from its session charge.
  const recoveryIn: RecoverySessionIn[] = useMemo(() => {
    const byAppt = new Map<string, SessionPrice>();
    for (const c of monthCharges) {
      const cur = byAppt.get(c.appointmentId);
      if (!cur || (c.paid && !cur.paid)) byAppt.set(c.appointmentId, c);   // prefer the paid one if duplicated
    }
    return monthAppts.filter((a) => a.status === "completed" && isRecoverySession(a.sessionType)).map((a) => {
      const c = byAppt.get(a.id);
      return { id: a.id, date: a.date, hour: Number(a.hour), patientName: a.patientName || "Walk-in", price: c ? Number(c.amount) || 0 : null,
        paid: !!c?.paid, viaPackage: !!c?.packageId, patientId: a.patientId };
    });
  }, [monthAppts, monthCharges]);
  const pct = pctDraft !== null ? parseNum(pctDraft) : pay?.recoveryCommissionPct ?? null;
  const rec = recoveryCommission(recoveryIn, pct === null || Number.isNaN(pct) ? null : pct);
  const savedRec = recoveryCommission(recoveryIn, pay?.recoveryCommissionPct ?? null);
  const total = r.net + (rec.valid ? rec.commission : 0);
  const savedTotal = saved.net + (savedRec.valid ? savedRec.commission : 0);

  const locked = mdoc.finalized;
  const snap = mdoc.snapshot;
  const driftAfterFinal = locked && snap && saved.valid && Math.abs(savedTotal - snap.net) > 0.005;

  const run = async (fn: () => Promise<{ error?: string }>, after?: () => void) => {
    setBusy(true); setError(null);
    const res = await fn();
    setBusy(false);
    if (res.error) setError(res.error); else after?.();
  };
  const savePct = () => { const v = parseNum(pctDraft ?? ""); if (Number.isNaN(v)) return setError("Enter the commission as a number."); run(() => saveCommissionPct(physioId, v, uid), () => setPctDraft(null)); };
  const saveSalary = () => { const v = parseNum(salaryDraft ?? ""); if (v === null || Number.isNaN(v)) return setError("Enter the salary as a number."); run(() => saveMonthlySalary(physioId, v, uid), () => setSalaryDraft(null)); };
  const saveDays = () => { const v = parseNum(daysDraft ?? ""); run(() => saveExpectedDays(physioId, month, v === null || Number.isNaN(v) ? null : v), () => setDaysDraft(null)); };
  const saveRules = () => {
    if (!rulesDraft) return;
    const g = Number(rulesDraft.graceMinutes), h = Number(rulesDraft.shiftHours);
    if (toMinutes(rulesDraft.requiredArrival) === null) return setError("Enter a valid arrival time.");
    if (!(Number.isInteger(g) && g >= 0 && g <= 120)) return setError("Grace period must be 0–120 minutes.");
    if (!(h > 0 && h <= 24)) return setError("Shift duration must be between 0 and 24 hours.");
    run(() => saveBusinessSettings({ ...settings, payrollRules: { requiredArrival: rulesDraft.requiredArrival, graceMinutes: g, shiftHours: h } }), () => setRulesDraft(null));
  };
  const doFinalize = () => {
    if (!saved.valid) return setError(saved.reason ?? "Can't finalize yet.");
    if (salaryDraft !== null || daysDraft !== null || rulesDraft !== null || pctDraft !== null) return setError("Save or cancel your unsaved changes first.");
    if (savedRec.unpriced > 0 && !window.confirm(`${savedRec.unpriced} recovery session(s) have no price yet and earn no commission. Finalize anyway?`)) return;
    if (!window.confirm(`Finalize ${monthName(month)}? Net salary ${money(savedTotal)} EGP will be locked until you reopen the month.`)) return;
    run(() => finalizeMonth(physioId, month, {
      monthlySalary: pay!.monthlySalary!, expectedWorkingDays: mdoc.expectedWorkingDays!, rules: savedRules,
      totalCountedLateness: saved.totalCountedLateness, latenessDeduction: saved.latenessDeduction, absenceDeduction: saved.absenceDeduction,
      recoverySessions: savedRec.sessions, recoveryValue: savedRec.totalValue, recoveryCommissionPct: pay?.recoveryCommissionPct ?? null, recoveryCommission: savedRec.valid ? savedRec.commission : 0,
      net: savedTotal,
    }, uid));
  };
  const unmarkedDays = monthDays.filter((d) => !mdoc.marks[d] && !monthAttendance.some((a) => a.date === d));

  return (
    <div className="pr-wrap">
      <style>{CSS}</style>
      <button className="pr-head" onClick={() => setOpen(!open)}>
        <span>Attendance & salary <span className="pr-tag">Manager only</span>{locked && <span className="pr-tag lock"><Lock size={10} /> Finalized</span>}</span>
        <ChevronDown size={16} className={open ? "pr-rot" : ""} />
      </button>
      {open && (
        <div className="pr-body">
          <div className="pr-sub">{monthName(month)}: change the month with the attendance month picker above.</div>
          {error && <div className="pr-alert bad"><AlertTriangle size={14} /> {error}</div>}
          {locked && (
            <div className="pr-alert info"><Lock size={14} />
              <div>This month was finalized{mdoc.finalizedAt ? ` on ${mdoc.finalizedAt.toDate().toLocaleDateString("en-GB")}` : ""}. Inputs are locked and the finalized figures are kept.
                {driftAfterFinal && <> <b>Attendance or sessions have changed since:</b> recalculated net is {money(savedTotal)} EGP vs finalized {money(snap!.net)} EGP. Reopen the month to update it.</>}
                <button className="pr-link" onClick={() => { if (window.confirm("Reopen this month? The finalized figures will be replaced when you finalize again.")) run(() => reopenMonth(physioId, month)); }}><Unlock size={12} /> Reopen month</button>
              </div>
            </div>
          )}

          <div className="pr-inputs">
            <label className="pr-field"><span>Monthly salary (EGP)</span>
              <div className="pr-row">
                <input inputMode="decimal" disabled={locked} value={salaryDraft ?? (pay?.monthlySalary ?? "").toString()} placeholder="Not set" onChange={(e) => setSalaryDraft(e.target.value)} />
                {salaryDraft !== null && <><button className="pr-btn" disabled={busy} onClick={saveSalary}>Save</button><button className="pr-btn ghost" onClick={() => setSalaryDraft(null)}>Cancel</button></>}
              </div>
              <small>Applies to every month not yet finalized.</small></label>
            <label className="pr-field"><span>Expected working days in {monthName(month)}</span>
              <div className="pr-row">
                <input inputMode="numeric" disabled={locked} value={daysDraft ?? (mdoc.expectedWorkingDays ?? "").toString()} placeholder="Not set" onChange={(e) => setDaysDraft(e.target.value)} />
                {daysDraft !== null && <><button className="pr-btn" disabled={busy} onClick={saveDays}>Save</button><button className="pr-btn ghost" onClick={() => setDaysDraft(null)}>Cancel</button></>}
              </div>
              <small>No working schedule is stored, so set this per month. {r.recordedDays} day{r.recordedDays === 1 ? "" : "s"} recorded so far.</small></label>
            <div className="pr-field"><span>Rules (all doctors)</span>
              {rulesDraft ? (
                <div className="pr-row wrap">
                  <input type="time" value={rulesDraft.requiredArrival} onChange={(e) => setRulesDraft({ ...rulesDraft, requiredArrival: e.target.value })} />
                  <input inputMode="numeric" style={{ width: 70 }} value={rulesDraft.graceMinutes} onChange={(e) => setRulesDraft({ ...rulesDraft, graceMinutes: e.target.value })} title="Grace minutes" />
                  <span className="pr-unit">min grace</span>
                  <input inputMode="decimal" style={{ width: 60 }} value={rulesDraft.shiftHours} onChange={(e) => setRulesDraft({ ...rulesDraft, shiftHours: e.target.value })} title="Shift hours" />
                  <span className="pr-unit">h shift</span>
                  <button className="pr-btn" disabled={busy} onClick={saveRules}>Save</button><button className="pr-btn ghost" onClick={() => setRulesDraft(null)}>Cancel</button>
                </div>
              ) : (
                <div className="pr-rules">Arrive by <b>{fmt12(savedRules.requiredArrival)}</b> · <b>{savedRules.graceMinutes} min</b> daily grace · <b>{savedRules.shiftHours} h</b> shift
                  {!locked && <button className="pr-link" onClick={() => setRulesDraft({ requiredArrival: savedRules.requiredArrival, graceMinutes: String(savedRules.graceMinutes), shiftHours: String(savedRules.shiftHours) })}><Pencil size={11} /> Edit</button>}</div>
              )}
            </div>
          </div>

          {!r.valid ? <div className="pr-alert info"><AlertTriangle size={14} /> {r.reason}</div> : (
            <>
              <div className="pr-grid">
                <K l="Monthly salary" v={`${money(salary as number)} EGP`} />
                <K l="Expected working days" v={String(expected)} />
                <K l="Recorded attendance" v={`${r.recordedDays} day${r.recordedDays === 1 ? "" : "s"}`} />
                <K l="Missing records (review)" v={String(r.unaccounted + r.incompleteRecords)} warn={r.unaccounted + r.incompleteRecords > 0} n="Not deducted" />
                <K l="Confirmed absences" v={String(r.confirmedAbsences)} n={r.leaveDays ? `${r.leaveDays} approved leave` : undefined} />
                <K l="Actual lateness" v={fmtMin(r.totalActualLateness)} />
                <K l="Counted lateness" v={fmtMin(r.totalCountedLateness)} n={`After ${rules.graceMinutes} min daily grace`} />
                <K l="Lateness deduction" v={`${money(r.latenessDeduction)} EGP`} bad={r.latenessDeduction > 0} />
                <K l="Absence deduction" v={`${money(r.absenceDeduction)} EGP`} bad={r.absenceDeduction > 0} n={r.confirmedAbsences ? `${r.confirmedAbsences} × ${money(r.dailyRate)}` : undefined} />
                <K l="Recovery commission" v={rec.valid ? `${money(rec.commission)} EGP` : "% not set"} n={rec.valid ? `${rec.pct}% of ${money(rec.totalValue)} · ${rec.sessions} session${rec.sessions === 1 ? "" : "s"}` : `${rec.sessions} session${rec.sessions === 1 ? "" : "s"} this month`} />
                <K l="Net salary" v={`${money(total)} EGP`} strong n={`Salary − deductions${rec.valid ? " + recovery commission" : ""}`} />
              </div>
              <div className="pr-rates">
                Daily rate {money(r.dailyRate)} = {money(salary as number)} ÷ {expected} days · Hourly {money(r.hourlyRate)} = daily ÷ {rules.shiftHours} h ·
                Per minute {r.minuteRate.toFixed(4)} = hourly ÷ 60 · Lateness deduction = {r.totalCountedLateness} counted min × {r.minuteRate.toFixed(4)}
              </div>
              {(salaryDraft !== null || daysDraft !== null || rulesDraft !== null || pctDraft !== null) && <div className="pr-alert info">Showing your unsaved changes. Save to keep them.</div>}
            </>
          )}

          {(r.unaccounted > 0 || r.incompleteRecords > 0 || r.conflicts > 0) && (
            <div className="pr-alert warn"><AlertTriangle size={14} />
              <div>
                {r.unaccounted > 0 && <div>{r.unaccounted} expected working day{r.unaccounted === 1 ? " has" : "s have"} no attendance record. Add the check-in, or mark the day below. Missing days are <b>not</b> deducted unless you confirm an absence.</div>}
                {r.incompleteRecords > 0 && <div>{r.incompleteRecords} record{r.incompleteRecords === 1 ? " has" : "s have"} no check-in time.</div>}
                {r.conflicts > 0 && <div>{r.conflicts} day{r.conflicts === 1 ? " has" : "s have"} a check-in but {r.conflicts === 1 ? "is" : "are"} also marked as away. Remove the mark or fix the record.</div>}
              </div>
            </div>
          )}

          <div className="pr-table-wrap">
            <table className="pr-table">
              <thead><tr><th>Date</th><th>Check-in</th><th>Actual lateness</th><th>Counted lateness</th><th className="r">Deduction</th><th>Status</th><th /></tr></thead>
              <tbody>
                {r.days.length === 0 ? <tr><td colSpan={7} className="pr-empty">No attendance recorded for {monthName(month)} yet.</td></tr> : r.days.map((d) => (
                  <tr key={d.date}>
                    <td>{fmtDay(d.date)}</td>
                    <td>{fmt12(d.checkIn)}</td>
                    <td>{d.checkIn ? fmtMin(d.actualLateness) : "—"}</td>
                    <td>{d.checkIn ? <>{fmtMin(d.countedLateness)}{d.actualLateness > 0 && d.countedLateness === 0 && <span className="pr-muted"> (within grace)</span>}</> : "—"}</td>
                    <td className="r">{d.status === "absent" ? <span className="pr-bad">{money(r.dailyRate)}</span> : d.deduction > 0 ? <span className="pr-bad">{money(d.deduction)}</span> : "0.00"}</td>
                    <td><span className={`pr-status ${STATUS[d.status].cls}`}>{STATUS[d.status].label}</span></td>
                    <td className="pr-actions">
                      {!locked && <button className="pr-link" onClick={() => onEditDay(d.date)}>Edit check-in</button>}
                      {!locked && (
                        <select value={d.mark ?? ""} onChange={(e) => run(() => setDayMark(physioId, month, d.date, (e.target.value || null) as DayMark | null))}>
                          <option value="">No mark</option>
                          {MARKS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!locked && (
            <div className="pr-markrow">
              <span>Mark a day with no record:</span>
              <select value={markDate} onChange={(e) => setMarkDate(e.target.value)}>
                <option value="">Choose a date…</option>
                {unmarkedDays.map((d) => <option key={d} value={d}>{fmtDay(d)}</option>)}
              </select>
              <select value={markType} onChange={(e) => setMarkType(e.target.value as DayMark)}>{MARKS.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}</select>
              <button className="pr-btn" disabled={!markDate || busy} onClick={() => run(() => setDayMark(physioId, month, markDate, markType), () => setMarkDate(""))}>Add</button>
              <button className="pr-link" onClick={() => onEditDay(markDate || monthDays[0])}>or add a check-in</button>
            </div>
          )}

          <div className="pr-subhead">Recovery sessions: commission</div>
          <div className="pr-inputs" style={{ marginBottom: 10 }}>
            <label className="pr-field"><span>Commission on recovery sessions (%)</span>
              <div className="pr-row">
                <input inputMode="decimal" disabled={locked} value={pctDraft ?? (pay?.recoveryCommissionPct ?? "").toString()} placeholder="Not set" onChange={(e) => setPctDraft(e.target.value)} />
                {pctDraft !== null && <><button className="pr-btn" disabled={busy} onClick={savePct}>Save</button><button className="pr-btn ghost" onClick={() => setPctDraft(null)}>Cancel</button></>}
              </div>
              <small>This doctor only. Counts completed Recovery Sessions they did in {monthName(month)}, priced from each session's charge.</small></label>
            <div className="pr-recsum">
              <div><b>{rec.sessions}</b> session{rec.sessions === 1 ? "" : "s"} done</div>
              <div><b>{money(rec.totalValue)}</b> EGP total value</div>
              <div><b>{rec.valid ? money(rec.commission) : "—"}</b> EGP commission</div>
              {rec.unpriced > 0 && <div className="pr-bad">{rec.unpriced} not priced yet (no commission)</div>}
            </div>
          </div>
          {rec.valid === false && pct !== null && !Number.isNaN(pct) && <div className="pr-alert bad"><AlertTriangle size={14} /> Commission must be between 0 and 100%.</div>}
          <div className="pr-table-wrap" style={{ marginBottom: 6 }}>
            <table className="pr-table">
              <thead><tr><th>Date</th><th>Time</th><th>Patient</th><th className="r">Session price</th><th>Patient paid</th><th className="r">Commission</th></tr></thead>
              <tbody>
                {rec.rows.length === 0 ? <tr><td colSpan={6} className="pr-empty">No completed Recovery Sessions for this doctor in {monthName(month)}.</td></tr> : rec.rows.map((x) => (
                  <tr key={x.id}>
                    <td>{fmtDay(x.date)}</td>
                    <td>{fmtHour12(x.hour)}</td>
                    <td>{x.patientName}</td>
                    <td className="r">{x.price === null
                      ? <button className="pr-link" onClick={() => x.patientId && openPatientSection(x.patientId, "pricing")}>Not priced: set price</button>
                      : <>{money(x.price)}{x.viaPackage && <span className="pr-muted"> (package)</span>}</>}</td>
                    <td>{x.price === null ? "—" : x.paid ? <span className="pr-status ok">Paid</span> : <span className="pr-status warn">Unpaid</span>}</td>
                    <td className="r">{rec.valid && x.price !== null ? money(x.commission) : "—"}</td>
                  </tr>
                ))}
                {rec.rows.length > 0 && <tr className="pr-total"><td colSpan={3}>Total</td><td className="r">{money(rec.totalValue)}</td><td /><td className="r">{rec.valid ? money(rec.commission) : "—"}</td></tr>}
              </tbody>
            </table>
          </div>

          <div className="pr-final">
            {locked && snap ? <span className="pr-muted">Finalized net: <b>{money(snap.net)} EGP</b> ({money(snap.monthlySalary)} − {money(snap.latenessDeduction)} lateness − {money(snap.absenceDeduction)} absence{snap.recoveryCommission ? ` + ${money(snap.recoveryCommission)} recovery commission` : ""})</span>
              : <button className="pr-btn" disabled={busy || !saved.valid} onClick={doFinalize}><Lock size={13} /> Finalize {monthName(month)}</button>}
          </div>
        </div>
      )}
    </div>
  );
}

function K({ l, v, n, warn, bad, strong }: { l: string; v: string; n?: string; warn?: boolean; bad?: boolean; strong?: boolean }) {
  return <div className={`pr-k ${warn ? "warn" : ""} ${strong ? "strong" : ""}`}><div className="pr-kl">{l}</div><div className={`pr-kv ${bad ? "bad" : ""}`}>{v}</div>{n && <div className="pr-kn">{n}</div>}</div>;
}

const CSS = `
.pr-wrap { margin-top: 30px; border: 1.5px solid #e5e0d8; border-radius: 16px; background: #fff; overflow: hidden; }
.pr-head { width: 100%; display: flex; justify-content: space-between; align-items: center; padding: 14px 18px; background: #fafaf8; border: none; cursor: pointer; font-family: 'Outfit', sans-serif; font-size: 15px; font-weight: 700; color: #0C3C60; }
.pr-head svg { transition: transform .2s; } .pr-rot { transform: rotate(180deg); }
.pr-tag { margin-left: 8px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; background: #ede9fe; color: #5b21b6; padding: 2px 8px; border-radius: 100px; vertical-align: middle; }
.pr-tag.lock { background: #dcfce7; color: #166534; display: inline-flex; gap: 3px; align-items: center; }
.pr-body { padding: 14px 18px 18px; }
.pr-sub { font-size: 12.5px; color: #9a9590; margin-bottom: 12px; }
.pr-inputs { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 12px; margin-bottom: 14px; }
.pr-field { display: flex; flex-direction: column; gap: 5px; font-size: 12px; font-weight: 600; color: #5a5550; }
.pr-field small { font-weight: 400; color: #9a9590; }
.pr-row { display: flex; gap: 6px; align-items: center; } .pr-row.wrap { flex-wrap: wrap; }
.pr-row input, .pr-markrow select, .pr-actions select { border: 1.5px solid #e5e0d8; border-radius: 9px; padding: 7px 9px; font-family: inherit; font-size: 13px; min-width: 0; }
.pr-row input { flex: 1; } .pr-row input:disabled { background: #f7f5f2; color: #9a9590; }
.pr-unit { font-size: 12px; color: #9a9590; font-weight: 500; }
.pr-rules { font-size: 13px; font-weight: 400; color: #1a1a1a; padding: 7px 0; }
.pr-btn { display: inline-flex; align-items: center; gap: 5px; padding: 7px 12px; border-radius: 9px; border: 1.5px solid #2E8BC0; background: #2E8BC0; color: #fff; font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.pr-btn.ghost { background: #fff; color: #2E8BC0; border-color: #B3DEF0; } .pr-btn:disabled { opacity: .5; cursor: not-allowed; }
.pr-link { background: none; border: none; color: #2E8BC0; font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer; display: inline-flex; align-items: center; gap: 3px; margin-left: 6px; padding: 0; }
.pr-alert { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; line-height: 1.45; padding: 9px 11px; border-radius: 10px; margin-bottom: 10px; }
.pr-alert svg { flex-shrink: 0; margin-top: 2px; }
.pr-alert.info { background: #EAF5FC; color: #0C3C60; border: 1px solid #B3DEF0; }
.pr-alert.warn { background: #fffbeb; color: #78350f; border: 1px solid #fde68a; }
.pr-alert.bad { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.pr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; margin-bottom: 8px; }
.pr-k { border: 1px solid #f0ede8; border-radius: 12px; padding: 10px 12px; background: #fafaf8; }
.pr-k.warn { border-color: #fde68a; background: #fffbeb; } .pr-k.strong { border-color: #B3DEF0; background: #EAF5FC; }
.pr-kl { font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; color: #9a9590; }
.pr-kv { font-size: 16px; font-weight: 700; color: #0C3C60; margin-top: 3px; } .pr-kv.bad { color: #b91c1c; }
.pr-k.strong .pr-kv { font-size: 19px; }
.pr-kn { font-size: 11px; color: #9a9590; margin-top: 2px; }
.pr-rates { font-size: 11.5px; color: #7a7570; background: #fafaf8; border-radius: 8px; padding: 7px 10px; margin-bottom: 12px; line-height: 1.5; }
.pr-table-wrap { overflow-x: auto; border: 1px solid #f0ede8; border-radius: 12px; }
.pr-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.pr-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #9a9590; padding: 8px; border-bottom: 1px solid #f0ede8; white-space: nowrap; }
.pr-table td { padding: 8px; border-bottom: 1px solid #f7f5f2; vertical-align: middle; white-space: nowrap; }
.pr-table .r { text-align: right; }
.pr-empty { text-align: center; color: #9a9590; padding: 18px !important; }
.pr-actions { display: flex; gap: 6px; align-items: center; }
.pr-actions select { padding: 4px 6px; font-size: 12px; }
.pr-status { font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 100px; }
.pr-status.ok { background: #dcfce7; color: #166534; } .pr-status.warn { background: #fef3c7; color: #92400e; }
.pr-status.bad { background: #fee2e2; color: #991b1b; } .pr-status.info { background: #EAF5FC; color: #0C3C60; } .pr-status.muted { background: #f3f4f6; color: #4b5563; }
.pr-bad { color: #b91c1c; font-weight: 600; } .pr-muted { color: #9a9590; font-size: 12px; }
.pr-markrow { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 10px; font-size: 12.5px; color: #5a5550; }
.pr-subhead { font-size: 13px; font-weight: 700; color: #0C3C60; margin: 18px 0 8px; padding-top: 14px; border-top: 1px solid #f0ede8; }
.pr-recsum { display: flex; flex-wrap: wrap; gap: 8px 16px; align-items: center; font-size: 12.5px; color: #5a5550; padding: 8px 0; }
.pr-recsum b { color: #0C3C60; font-size: 15px; }
.pr-total td { font-weight: 700; color: #0C3C60; background: #fafaf8; }
.pr-final { display: flex; justify-content: flex-end; margin-top: 14px; }
@media print { .pr-wrap { display: none; } }
`;
