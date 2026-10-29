// FILE: src/features/staff/SalarySlip.tsx
// Printable monthly salary slip for one doctor: only what they need to check
// their pay (earnings, deductions with the days behind them, recovery sessions,
// net). Rendered into a body-level portal and printed on its own, so nothing
// else on the page (or the attendance print sheet) comes along.

import { createPortal } from "react-dom";
import { fmtHour12 } from "../../services/appointmentService";
import { money, toMinutes, type MonthResult, type PayrollRules, type RecoveryResult } from "./payroll";

export interface SlipData {
  doctorName: string;
  month: string;              // YYYY-MM
  finalized: boolean;
  monthlySalary: number;
  expectedWorkingDays: number;
  rules: PayrollRules;
  att: MonthResult;           // saved-values calculation
  rec: RecoveryResult;        // saved-values calculation
  net: number;
}

const monthName = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const day = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
const t12 = (hhmm: string) => {
  const t = toMinutes(hhmm); if (t === null) return "—";
  const h = Math.floor(t / 60), m = t % 60;
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
const mins = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${m % 60} min`);

export default function SalarySlip({ d }: { d: SlipData }) {
  const lateDays = d.att.days.filter((x) => x.countedLateness > 0 && (x.status === "present" || x.status === "conflict"));
  const absences = d.att.days.filter((x) => x.status === "absent");
  const recPriced = d.rec.rows.filter((x) => x.price !== null);
  const recPending = d.rec.rows.filter((x) => x.price === null);
  const commissionOn = d.rec.valid && d.rec.sessions > 0;

  return createPortal(
    <div className="slip-root">
      <style>{CSS}</style>
      <div className="slip">
        <div className="slip-head">
          <div>
            <div className="slip-clinic">Physio+ Clinic</div>
            <div className="slip-title">Salary Slip: {monthName(d.month)}</div>
          </div>
          <div className="slip-who">
            <div><b>{d.doctorName}</b></div>
            <div>Issued {new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}</div>
            {!d.finalized && <div className="slip-draft">DRAFT: not yet finalized</div>}
          </div>
        </div>

        <table className="slip-money">
          <tbody>
            <tr className="slip-sec"><td colSpan={2}>Earnings</td></tr>
            <tr><td>Basic monthly salary</td><td>{money(d.monthlySalary)}</td></tr>
            {commissionOn && <tr><td>Recovery sessions commission ({d.rec.pct}% of {money(d.rec.totalValue)} from {d.rec.priced} session{d.rec.priced === 1 ? "" : "s"})</td><td>+ {money(d.rec.commission)}</td></tr>}
            <tr className="slip-sec"><td colSpan={2}>Deductions</td></tr>
            <tr><td>Lateness: {mins(d.att.totalCountedLateness)} counted after the daily grace period</td><td>− {money(d.att.latenessDeduction)}</td></tr>
            {d.att.confirmedAbsences > 0 && <tr><td>Unexcused absence: {d.att.confirmedAbsences} day{d.att.confirmedAbsences === 1 ? "" : "s"} × {money(d.att.dailyRate)}</td><td>− {money(d.att.absenceDeduction)}</td></tr>}
            <tr className="slip-net"><td>Net salary payable (EGP)</td><td>{money(d.net)}</td></tr>
          </tbody>
        </table>

        <div className="slip-grid">
          <div><span>Expected working days</span><b>{d.expectedWorkingDays}</b></div>
          <div><span>Days attended</span><b>{d.att.recordedDays}</b></div>
          <div><span>Approved leave</span><b>{d.att.leaveDays}</b></div>
          <div><span>Unexcused absences</span><b>{d.att.confirmedAbsences}</b></div>
        </div>

        <div className="slip-rules">
          <b>How lateness is calculated.</b> The working day starts at {t12(d.rules.requiredArrival)}. The first {d.rules.graceMinutes} minutes of lateness are excused on each day,
          and arriving early on one day doesn't offset another. Each counted minute is deducted at {money(d.monthlySalary)} ÷ {d.expectedWorkingDays} days ÷ {d.rules.shiftHours} hours ÷ 60
          = {d.att.minuteRate.toFixed(4)} EGP.
        </div>

        <div className="slip-h">Late arrivals and absences</div>
        {lateDays.length === 0 && absences.length === 0 ? <div className="slip-none">None this month. No lateness or absence deductions.</div> : (
          <table className="slip-table">
            <thead><tr><th>Date</th><th>Check-in</th><th>Late</th><th>Counted (after grace)</th><th>Deduction</th></tr></thead>
            <tbody>
              {[...lateDays, ...absences].sort((a, b) => a.date.localeCompare(b.date)).map((x) => (
                <tr key={x.date}>
                  <td>{day(x.date)}</td>
                  {x.status === "absent"
                    ? <><td colSpan={3}>Unexcused absence (one day's pay)</td><td>{money(d.att.dailyRate)}</td></>
                    : <><td>{t12(x.checkIn)}</td><td>{mins(x.actualLateness)}</td><td>{mins(x.countedLateness)}</td><td>{money(x.deduction)}</td></>}
                </tr>
              ))}
              <tr className="slip-total"><td colSpan={4}>Total deductions</td><td>{money(d.att.latenessDeduction + d.att.absenceDeduction)}</td></tr>
            </tbody>
          </table>
        )}

        {commissionOn && (
          <>
            <div className="slip-h">Recovery sessions ({d.rec.pct}% commission)</div>
            <table className="slip-table">
              <thead><tr><th>Date</th><th>Time</th><th>Patient</th><th>Session price</th><th>Commission</th></tr></thead>
              <tbody>
                {recPriced.map((x) => (
                  <tr key={x.id}><td>{day(x.date)}</td><td>{fmtHour12(x.hour)}</td><td>{x.patientName}</td><td>{money(x.price!)}</td><td>{money(x.commission)}</td></tr>
                ))}
                <tr className="slip-total"><td colSpan={3}>Total</td><td>{money(d.rec.totalValue)}</td><td>{money(d.rec.commission)}</td></tr>
              </tbody>
            </table>
            {recPending.length > 0 && (
              <div className="slip-none">
                {recPending.length} more recovery session{recPending.length === 1 ? "" : "s"} ({recPending.map((x) => day(x.date)).join(", ")}) {recPending.length === 1 ? "has" : "have"} no price recorded yet and {recPending.length === 1 ? "is" : "are"} not included above.
              </div>
            )}
          </>
        )}

        <div className="slip-sign">
          <div><div className="slip-line" />Clinic manager</div>
          <div><div className="slip-line" />Employee: {d.doctorName}</div>
          <div><div className="slip-line" />Date received</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

const CSS = `
.slip-root { display: none; }
@media print {
  body.printing-slip > *:not(.slip-root) { display: none !important; }
  body.printing-slip .slip-root { display: block !important; }
  body.printing-slip { background: #fff !important; }
  @page { size: A4; margin: 14mm; }
}
.slip { font-family: 'Outfit', Arial, sans-serif; color: #111; font-size: 11.5pt; }
.slip-head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0C3C60; padding-bottom: 10px; margin-bottom: 14px; }
.slip-clinic { font-size: 18pt; font-weight: 700; color: #0C3C60; }
.slip-title { font-size: 13pt; font-weight: 600; margin-top: 2px; }
.slip-who { text-align: right; font-size: 10.5pt; line-height: 1.5; }
.slip-draft { margin-top: 4px; font-weight: 700; color: #b45309; border: 1.5px solid #b45309; padding: 1px 8px; display: inline-block; }
.slip-money { width: 100%; border-collapse: collapse; margin-bottom: 12px; }
.slip-money td { padding: 5px 4px; border-bottom: 1px solid #e5e5e5; }
.slip-money td:last-child { text-align: right; white-space: nowrap; width: 130px; font-variant-numeric: tabular-nums; }
.slip-sec td { text-align: left !important; width: auto !important; font-weight: 700; text-transform: uppercase; font-size: 9.5pt; letter-spacing: .05em; color: #555; border-bottom: 1px solid #999; padding-top: 10px; }
.slip-net td { font-weight: 800; font-size: 13pt; border-top: 2px solid #0C3C60; border-bottom: none; padding-top: 8px; color: #0C3C60; }
.slip-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 10px; }
.slip-grid div { border: 1px solid #ddd; border-radius: 6px; padding: 6px 8px; display: flex; flex-direction: column; }
.slip-grid span { font-size: 8.5pt; color: #666; text-transform: uppercase; letter-spacing: .04em; }
.slip-grid b { font-size: 13pt; }
.slip-rules { font-size: 9.5pt; color: #333; background: #f6f6f6; border-radius: 6px; padding: 7px 9px; margin-bottom: 12px; line-height: 1.45; }
.slip-h { font-weight: 700; font-size: 11pt; margin: 12px 0 5px; color: #0C3C60; }
.slip-table { width: 100%; border-collapse: collapse; font-size: 10pt; }
.slip-table th { text-align: left; font-size: 8.5pt; text-transform: uppercase; color: #555; border-bottom: 1px solid #999; padding: 4px; }
.slip-table td { padding: 4px; border-bottom: 1px solid #eee; }
.slip-table th:last-child, .slip-table td:last-child { text-align: right; }
.slip-total td { font-weight: 700; border-top: 1px solid #999; }
.slip-none { font-size: 10pt; color: #444; margin: 4px 0 8px; }
.slip-sign { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; margin-top: 36px; font-size: 10pt; color: #333; }
.slip-line { border-bottom: 1px solid #333; height: 30px; margin-bottom: 4px; }
`;
