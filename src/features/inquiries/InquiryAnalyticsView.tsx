// FILE: src/features/inquiries/InquiryAnalyticsView.tsx
// Inquiry analytics for the selected cohort (inquiries received in the period).
// Costs are manager-only and blended: marketing is one monthly total.

import { useEffect, useState } from "react";
import { Info } from "lucide-react";
import {
  subscribeToMonthlyExpenses, subscribeToBusinessSettings, DEFAULT_BUSINESS_SETTINGS, labelFor,
  LEAD_SOURCES, LEAD_CHANNELS, LEAD_LOSS_REASONS, type MonthlyExpense, type BusinessSettings,
} from "../../services/businessService";
import { expensesForRange, expenseGap, type Range } from "../analytics/metrics";
import { inquiryStats, MIN_RESPONSE_SAMPLES } from "./inquiryAnalytics";
import { STAGE_LABEL, fmtShort, type LeadView, type Stage } from "./leadLogic";

const pct = (n: number | null) => (n === null ? "Insufficient data" : `${(n * 100).toFixed(0)}%`);
const egp = (n: number) => `${Math.round(n).toLocaleString("en-US")} EGP`;
const dur = (m: number) => (m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${(m / 60).toFixed(1)} h` : `${(m / 1440).toFixed(1)} days`);

function Rate({ label, value, n, d, help }: { label: string; value: number | null; n: number; d: number; help: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="iq-kpi">
      <div className="iq-kpi-l" style={{ display: "flex", justifyContent: "space-between" }}>{label}
        <button className="iq-x" onClick={() => setOpen(!open)} aria-label="How it's calculated"><Info size={13} /></button></div>
      <div className="iq-kpi-v" style={value === null ? { fontSize: 15, marginTop: 10 } : undefined}>{pct(value)}</div>
      <div className="iq-kpi-n">{n} of {d}</div>
      {open && <div className="iq-kpi-n" style={{ color: "#5a5550", marginTop: 6 }}>{help}</div>}
    </div>
  );
}

function Bars({ title, rows }: { title: string; rows: [string, number][] }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="iq-card-box">
      <div className="iq-section-title">{title}</div>
      {rows.length === 0 ? <div className="iq-muted">No data.</div> : rows.map(([l, v]) => (
        <div key={l} className="iq-bar"><span title={l}>{l}</span><i><b style={{ width: `${(v / max) * 100}%` }} /></i><em>{v}</em></div>
      ))}
    </div>
  );
}

const sorted = (o: Record<string, number>, label: (k: string) => string): [string, number][] =>
  Object.entries(o).map(([k, v]) => [label(k), v] as [string, number]).sort((a, b) => b[1] - a[1]);

export default function InquiryAnalyticsView({ views, range, today, now, isManager }: { views: LeadView[]; range: Range; today: string; now: string; isManager: boolean }) {
  const s = inquiryStats(views, range, today, now);
  const [monthly, setMonthly] = useState<MonthlyExpense[] | null>(null);
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
  useEffect(() => (isManager ? subscribeToMonthlyExpenses("2000-01", setMonthly, () => setMonthly([])) : undefined), [isManager]);
  useEffect(() => (isManager ? subscribeToBusinessSettings(setSettings, () => {}) : undefined), [isManager]);

  const exp = monthly ? expensesForRange(monthly, settings.expenseCategories, range) : null;
  const gap = exp ? expenseGap(exp) : null;

  return (
    <div>
      <div className="iq-sectionhead">Inquiries received {fmtShort(range.from)} – {fmtShort(range.to)}: {s.total} ({s.eligible} eligible{s.invalid ? `, ${s.invalid} duplicate/invalid excluded` : ""})</div>
      <div className="iq-kpis">
        <Rate label="Booked an appointment" value={s.bookingRate} n={s.booked} d={s.eligible}
          help="Eligible inquiries whose linked patient has any appointment (not rescheduled) on or after the inquiry date ÷ eligible inquiries. Unlinked inquiries can't be verified, so they count as not booked." />
        <Rate label="Attended first appointment" value={s.attendanceRate} n={s.attendedDue} d={s.apptsDue}
          help="Of eligible inquiries whose first appointment after the inquiry is already due (completed, no-show or cancelled), the share that was completed. Future bookings aren't counted yet." />
        <Rate label="Registered as new patients" value={s.registrationRate} n={s.registered} d={s.prospects}
          help="Inquiries linked to a patient who registered on or after the inquiry ÷ eligible inquiries, excluding people who were already patients (counted as repeat inquiries)." />
        <Rate label="Converted (started treatment)" value={s.conversionRate} n={s.converted} d={s.eligible}
          help="Eligible inquiries whose linked patient completed at least one treatment session (not an assessment) after the inquiry ÷ eligible inquiries." />
        <Rate label="Assessment → treatment" value={s.assessmentToPatient} n={s.assessmentConverted} d={s.attendedAssessment}
          help="Of inquiries that attended an assessment, the share that went on to a completed treatment session." />
        <Rate label="Follow-ups done on time" value={s.followUpCompletion} n={s.followUpsOnTime} d={s.followUpsDue}
          help="Follow-ups due in the period: logged interactions made no later than the due day ÷ (all logged follow-ups for that period + those still overdue)." />
        <div className="iq-kpi">
          <div className="iq-kpi-l">Median time to first reply</div>
          <div className="iq-kpi-v" style={s.medianFirstResponseMin === null ? { fontSize: 15, marginTop: 10 } : undefined}>{s.medianFirstResponseMin === null ? "Insufficient data" : dur(s.medianFirstResponseMin)}</div>
          <div className="iq-kpi-n">{s.responseSamples} inquiries with a recorded time and first contact{s.responseSamples < MIN_RESPONSE_SAMPLES ? ` (needs ${MIN_RESPONSE_SAMPLES})` : ""}</div>
        </div>
        {s.reactivations > 0 && <div className="iq-kpi"><div className="iq-kpi-l">Repeat inquiries</div><div className="iq-kpi-v">{s.reactivations}</div><div className="iq-kpi-n">From people who were already patients</div></div>}
      </div>

      {isManager && (
        <>
          <div className="iq-sectionhead">Cost (blended — marketing isn't split by source)</div>
          {!exp || gap ? (
            <div className="iq-warn"><Info size={14} /> Insufficient data: {gap ?? "loading…"} Cost needs whole months with the marketing expense entered.</div>
          ) : (
            <div className="iq-kpis">
              <div className="iq-kpi"><div className="iq-kpi-l">Marketing spend</div><div className="iq-kpi-v">{egp(exp.marketing)}</div></div>
              <div className="iq-kpi"><div className="iq-kpi-l">Cost per inquiry</div><div className="iq-kpi-v">{s.eligible ? egp(exp.marketing / s.eligible) : "—"}</div><div className="iq-kpi-n">÷ {s.eligible} eligible inquiries</div></div>
              <div className="iq-kpi"><div className="iq-kpi-l">Cost per converted patient</div><div className="iq-kpi-v">{s.converted ? egp(exp.marketing / s.converted) : "Insufficient data"}</div><div className="iq-kpi-n">÷ {s.converted} converted</div></div>
            </div>
          )}
        </>
      )}

      <div className="iq-bars-grid">
        <Bars title="By source" rows={sorted(s.bySource, (k) => labelFor(LEAD_SOURCES, k, "Unknown"))} />
        <Bars title="By contact channel" rows={sorted(s.byChannel, (k) => labelFor(LEAD_CHANNELS, k, "Not recorded"))} />
        <Bars title="By service of interest" rows={sorted(s.byService, (k) => k || "Not recorded")} />
        <Bars title="By current status" rows={sorted(s.byStage, (k) => STAGE_LABEL[k as Stage] ?? k)} />
        <Bars title="Why inquiries were lost" rows={sorted(s.byReason, (k) => labelFor(LEAD_LOSS_REASONS, k, "Unknown"))} />
        <Bars title="By assigned staff" rows={sorted(s.byAssignee, (k) => k)} />
      </div>
    </div>
  );
}
