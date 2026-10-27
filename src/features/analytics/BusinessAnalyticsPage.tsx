// FILE: src/features/analytics/BusinessAnalyticsPage.tsx
// Manager-only Business Analytics. All numbers come from metrics.ts (unit-tested);
// this file only loads data, picks the period, and renders.

import { useEffect, useMemo, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Info, RefreshCw, Settings2, Plus, Trash2, X, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { subscribeToClinicSettings, DEFAULT_SETTINGS, fmtHour12, type ClinicSettings } from "../../services/appointmentService";
import {
  subscribeToBusinessSettings, saveBusinessSettings, addExpense, deleteExpense, clinicToday, labelFor,
  DEFAULT_BUSINESS_SETTINGS, EXPENSE_CATEGORIES, ACQUISITION_SOURCES, PAYMENT_METHODS,
  NO_SHOW_TRACKING_SINCE, PAYMENT_LOG_TRACKING_SINCE, type BusinessSettings,
} from "../../services/businessService";
import { loadAnalyticsData, type AnalyticsData } from "./analyticsData";
import * as M from "./metrics";

// ─── Formatting ───────────────────────────────────────────────────────────────

const egp = (n: number | null) => n === null ? "—" : `${Math.round(n).toLocaleString("en-US")} EGP`;
const num = (n: number | null, d = 0) => n === null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: d });
const pct = (n: number | null) => n === null ? "—" : `${(n * 100).toFixed(1)}%`;
const fmtDate = (d: string) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—";
const fmtMonth = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type SectionKey = "overview" | "financial" | "acquisition" | "retention" | "schedule" | "expansion";
const SECTIONS: { key: SectionKey; label: string }[] = [
  { key: "overview",    label: "Executive Overview" },
  { key: "financial",   label: "Financial" },
  { key: "acquisition", label: "Acquisition" },
  { key: "retention",   label: "Retention & Attendance" },
  { key: "schedule",    label: "Schedule & Capacity" },
  { key: "expansion",   label: "Expansion Readiness" },
];
const PRESETS: { key: M.PresetKey; label: string }[] = [
  { key: "week", label: "This week" }, { key: "30d", label: "Last 30 days" }, { key: "month", label: "This month" },
  { key: "prevMonth", label: "Previous month" }, { key: "custom", label: "Custom" },
];

// ─── Small UI pieces ──────────────────────────────────────────────────────────

function Kpi({ label, value, cur, prev, help, lowerIsBetter, note, kind = "plain" }: {
  label: string; value: string; cur?: number | null; prev?: number | null; help: string;
  lowerIsBetter?: boolean; note?: string; kind?: "plain" | "estimate";
}) {
  const [open, setOpen] = useState(false);
  const ch = cur !== undefined && prev !== undefined ? M.pctChange(cur ?? null, prev ?? null) : null;
  const flat = ch !== null && Math.abs(ch) < 0.005;
  const good = ch === null || flat ? null : (lowerIsBetter ? ch < 0 : ch > 0);
  return (
    <div className={`ba-kpi ${kind === "estimate" ? "estimate" : ""}`}>
      <div className="ba-kpi-head">
        <span className="ba-kpi-label">{label}</span>
        <button className="ba-info" onClick={() => setOpen(!open)} aria-label={`How ${label} is calculated`}><Info size={13} /></button>
      </div>
      <div className="ba-kpi-val">{value}</div>
      {cur !== undefined && (
        <div className={`ba-kpi-delta ${good === null ? "" : good ? "up" : "down"}`}>
          {ch === null ? "no comparison" : flat ? "no change vs previous" : <>{ch > 0 ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {ch > 0 ? "+" : ""}{(ch * 100).toFixed(0)}% vs previous</>}
        </div>
      )}
      {note && <div className="ba-kpi-note">{note}</div>}
      {kind === "estimate" && <div className="ba-tag">Estimate</div>}
      {open && <div className="ba-kpi-help">{help}</div>}
    </div>
  );
}

function Card({ title, help, children, wide }: { title: string; help?: string; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className={`ba-card ${wide ? "wide" : ""}`}>
      <div className="ba-card-title">{title}</div>
      {help && <div className="ba-card-help">{help}</div>}
      {children}
    </div>
  );
}

function BarList({ rows, fmt, empty = "No data in this period." }: { rows: [string, number][]; fmt: (n: number) => string; empty?: string }) {
  const max = Math.max(...rows.map((r) => Math.abs(r[1])), 1);
  if (!rows.length) return <div className="ba-empty">{empty}</div>;
  return (
    <div className="ba-bars">
      {rows.map(([label, v]) => (
        <div key={label} className="ba-bar-row">
          <div className="ba-bar-label" title={label}>{label}</div>
          <div className="ba-bar-track"><div className="ba-bar-fill" style={{ width: `${(Math.abs(v) / max) * 100}%` }} /></div>
          <div className="ba-bar-val">{fmt(v)}</div>
        </div>
      ))}
    </div>
  );
}

function MonthBars({ months, series, fmt }: { months: string[]; series: { label: string; color: string; values: (number | null)[] }[]; fmt: (n: number) => string }) {
  const all = series.flatMap((s) => s.values.map((v) => Math.abs(v ?? 0)));
  const max = Math.max(...all, 1);
  return (
    <div>
      <div className="ba-legend">{series.map((s) => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)}</div>
      <div className="ba-mbars">
        {months.map((m, i) => (
          <div key={m} className="ba-mcol">
            <div className="ba-mstack">
              {series.map((s) => {
                const v = s.values[i];
                return <div key={s.label} className={`ba-mbar ${v !== null && v < 0 ? "neg" : ""}`} title={`${s.label} · ${fmtMonth(m)}: ${v === null ? "—" : fmt(v)}`}
                  style={{ height: `${(Math.abs(v ?? 0) / max) * 100}%`, background: s.color }} />;
              })}
            </div>
            <div className="ba-mlabel">{fmtMonth(m)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ grid, hours }: { grid: M.Grid; hours: number[] }) {
  return (
    <div className="ba-heat-wrap">
      <table className="ba-heat">
        <thead><tr><th />{hours.map((h) => <th key={h}>{fmtHour12(h).replace(":00", "")}</th>)}</tr></thead>
        <tbody>
          {[1, 2, 3, 4, 5, 6, 0].map((wd) => (
            <tr key={wd}>
              <th>{WEEKDAYS[wd]}</th>
              {hours.map((h) => {
                const c = grid.counts[wd][h], cap = grid.capacity[wd][h];
                const u = cap > 0 ? c / cap : null;
                return (
                  <td key={h} title={`${WEEKDAYS[wd]} ${fmtHour12(h)} — ${c} completed${cap ? ` of ${cap} slots (${pct(u)})` : " · closed"}`}
                    className={cap === 0 ? "closed" : ""}
                    style={cap > 0 ? { background: `rgba(46,139,192,${0.08 + Math.min(1, u ?? 0) * 0.85})`, color: (u ?? 0) > 0.55 ? "#fff" : "#0C3C60" } : undefined}>
                    {cap === 0 ? (c ? c : "") : c}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Assumptions modal ────────────────────────────────────────────────────────

function AssumptionsModal({ initial, onClose }: { initial: BusinessSettings; onClose: () => void }) {
  const [s, setS] = useState<BusinessSettings>(initial);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const numField = (key: keyof BusinessSettings, label: string, hint?: string) => (
    <label className="ba-field">
      <span>{label}</span>
      <input type="number" min="0" step="1" value={(s[key] as number | null) ?? ""} placeholder="Not set"
        onChange={(e) => setS({ ...s, [key]: e.target.value === "" ? null : Math.max(0, Number(e.target.value)) })} />
      {hint && <small>{hint}</small>}
    </label>
  );
  const hourSel = (key: keyof BusinessSettings) => (
    <select value={s[key] as number} onChange={(e) => setS({ ...s, [key]: Number(e.target.value) })}>
      {Array.from({ length: 25 }, (_, h) => <option key={h} value={h}>{h === 24 ? "12:00 AM (midnight)" : fmtHour12(h)}</option>)}
    </select>
  );
  const save = async () => {
    if (s.morningStart >= s.morningEnd || s.eveningStart >= s.eveningEnd) { setErr("Each shift must start before it ends."); return; }
    setSaving(true); setErr(null);
    const r = await saveBusinessSettings(s);
    setSaving(false);
    if (r.error) setErr(r.error); else onClose();
  };
  return createPortal(
    <div className="ba-overlay" onClick={onClose}>
      <div className="ba-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ba-modal-head"><b>Assumptions & targets</b><button className="ba-x" onClick={onClose}><X size={16} /></button></div>
        <p className="ba-modal-note">These are <b>your estimates</b>. They never change recorded transactions and are always labelled "Estimate" on the dashboard.</p>
        <div className="ba-form-grid">
          {numField("fixedMonthlyCosts", "Monthly fixed operating costs (EGP)", "Rent, salaries, utilities, subscriptions…")}
          {numField("variableCostPerSession", "Variable cost per completed session (EGP)", "Consumables etc. per session")}
        </div>
        <label className="ba-check">
          <input type="checkbox" checked={s.variableIncludedInExpenses} onChange={(e) => setS({ ...s, variableIncludedInExpenses: e.target.checked })} />
          My recorded expenses already include these per-session costs (don't subtract them again)
        </label>
        <div className="ba-form-grid">
          {numField("targetMonthlyResult", "Target monthly operating result (EGP)")}
          {numField("minCashReserve", "Minimum cash reserve (EGP)")}
          {numField("cashBalance", "Current cash balance (EGP)", "Used for runway only")}
          <label className="ba-field"><span>Cash balance as of</span>
            <input type="date" value={s.cashBalanceAsOf} onChange={(e) => setS({ ...s, cashBalanceAsOf: e.target.value })} /></label>
        </div>
        <div className="ba-form-grid">
          <label className="ba-field"><span>Target schedule utilisation (%)</span>
            <input type="number" min="0" max="100" value={s.targetUtilization ?? ""} placeholder="Not set"
              onChange={(e) => setS({ ...s, targetUtilization: e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value))) })} />
            <small>Expansion criterion: demand close to current capacity</small></label>
          <label className="ba-field"><span>Max share of sessions treated by owner (%)</span>
            <input type="number" min="0" max="100" value={s.maxOwnerSharePct ?? ""} placeholder="Not set"
              onChange={(e) => setS({ ...s, maxOwnerSharePct: e.target.value === "" ? null : Math.min(100, Math.max(0, Number(e.target.value))) })} />
            <small>Owner = physios with the Manager rank</small></label>
          <label className="ba-field"><span>Consecutive months required</span>
            <select value={s.monthsAtTarget} onChange={(e) => setS({ ...s, monthsAtTarget: Number(e.target.value) })}>
              {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
            </select></label>
        </div>
        <div className="ba-field"><span>Closed weekdays (for operating days & capacity)</span>
          <div className="ba-days">
            {WEEKDAYS.map((d, i) => (
              <label key={d} className={`ba-day ${s.closedWeekdays.includes(i) ? "on" : ""}`}>
                <input type="checkbox" checked={s.closedWeekdays.includes(i)}
                  onChange={(e) => setS({ ...s, closedWeekdays: e.target.checked ? [...s.closedWeekdays, i] : s.closedWeekdays.filter((x) => x !== i) })} />{d}
              </label>
            ))}
          </div>
        </div>
        <div className="ba-form-grid">
          <div className="ba-field"><span>Morning window</span><div className="ba-inline">{hourSel("morningStart")} – {hourSel("morningEnd")}</div></div>
          <div className="ba-field"><span>Evening window</span><div className="ba-inline">{hourSel("eveningStart")} – {hourSel("eveningEnd")}</div></div>
        </div>
        {err && <div className="ba-err">{err}</div>}
        <div className="ba-modal-actions">
          <button className="ba-btn ghost" onClick={onClose}>Cancel</button>
          <button className="ba-btn" onClick={save} disabled={saving}>{saving ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>, document.body);
}

// ─── Expenses panel ───────────────────────────────────────────────────────────

function ExpensesPanel({ expenses, range, onChanged }: { expenses: M.AExpense[]; range: M.Range; onChanged: () => void }) {
  const [form, setForm] = useState({ date: clinicToday(), category: "rent", amount: "", marketingSource: "", note: "" });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const rows = expenses.filter((e) => M.inRange(e.date, range)).sort((a, b) => b.date.localeCompare(a.date));
  const add = async () => {
    const amount = Number(form.amount);
    if (!form.date || !(amount > 0)) { setErr("Enter a date and an amount above zero."); return; }
    setBusy(true); setErr(null);
    const r = await addExpense({ date: form.date, category: form.category, amount, note: form.note.trim(),
      marketingSource: form.category === "marketing" ? form.marketingSource : "" });
    setBusy(false);
    if (r.error) { setErr(r.error); return; }
    setForm({ ...form, amount: "", note: "" });
    onChanged();
  };
  const remove = async (id: string) => {
    if (!window.confirm("Delete this expense?")) return;
    const r = await deleteExpense(id);
    if (r.error) alert(r.error); else onChanged();
  };
  return (
    <Card title="Expenses log" wide help="Recorded operating expenses. Tag marketing spend with its channel to unlock cost per new patient.">
      <div className="ba-exp-form">
        <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
        <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
          {EXPENSE_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
        {form.category === "marketing" && (
          <select value={form.marketingSource} onChange={(e) => setForm({ ...form, marketingSource: e.target.value })}>
            <option value="">Channel (optional)</option>
            {ACQUISITION_SOURCES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        )}
        <input type="number" min="0" placeholder="Amount (EGP)" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
        <input placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
        <button className="ba-btn" onClick={add} disabled={busy}><Plus size={14} /> Add</button>
      </div>
      {err && <div className="ba-err">{err}</div>}
      {rows.length === 0 ? <div className="ba-empty">No expenses recorded in this period.</div> : (
        <div className="ba-table-wrap">
          <table className="ba-table">
            <thead><tr><th>Date</th><th>Category</th><th className="r">Amount</th><th /></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.date)}</td>
                  <td>{labelFor(EXPENSE_CATEGORIES, e.category)}{e.marketingSource ? ` · ${labelFor(ACQUISITION_SOURCES, e.marketingSource)}` : ""}</td>
                  <td className="r">{egp(e.amount)}</td>
                  <td className="r"><button className="ba-icon" onClick={() => remove(e.id)} title="Delete"><Trash2 size={13} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function BusinessAnalyticsPage() {
  const today = clinicToday();
  const [section, setSection] = useState<SectionKey>("overview");
  const [preset, setPreset] = useState<M.PresetKey>("month");
  const [custom, setCustom] = useState<M.Range>({ from: M.addDays(today, -13), to: today });
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_BUSINESS_SETTINGS);
  const [clinic, setClinic] = useState<ClinicSettings>(DEFAULT_SETTINGS);
  const [showAssumptions, setShowAssumptions] = useState(false);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [nonce, setNonce] = useState(0);
  const [loadedKey, setLoadedKey] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeToBusinessSettings(setSettings, (e) => setError(e.message)), []);
  // Fill any missing fields with the app defaults so capacity never becomes NaN.
  useEffect(() => subscribeToClinicSettings((c) => setClinic({ ...DEFAULT_SETTINGS, ...c })), []);

  const { cur, prev } = useMemo(() => M.presetRanges(preset, today, custom), [preset, today, custom]);
  const months = useMemo(() => M.lastMonths(today, 6), [today]);
  // Load window covers the comparison period, the 6-month trend and the 60-day follow-up lookback.
  const loadFrom = [prev.from, `${months[0]}-01`, M.addDays(today, -60)].sort()[0];

  // Reload whenever the needed window changes or Refresh is pressed; keep showing the
  // previous data while the new window loads.
  const loadKey = `${loadFrom}#${nonce}`;
  const loading = loadedKey !== loadKey;
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    let alive = true;
    loadAnalyticsData(loadFrom)
      .then((d) => { if (alive) { setData(d); setError(null); setLoadedKey(loadKey); } })
      .catch((e: { message?: string }) => { if (alive) { setError(e.message ?? "Failed to load analytics."); setLoadedKey(loadKey); } });
    return () => { alive = false; };
  }, [loadFrom, loadKey]);

  const cap: M.Capacity = useMemo(() => ({ openingHour: clinic.openingHour, closingHour: clinic.closingHour, maxPerHour: clinic.maxPatientsPerHour, closedWeekdays: settings.closedWeekdays }), [clinic, settings.closedWeekdays]);

  // ── All metrics for current + previous period ──────────────────────────────
  const m = useMemo(() => {
    if (!data) return null;
    const lines = M.cashLines(data.prices, data.pkgs, data.pkgPayments);
    const per = (r: M.Range) => {
      const appt = M.apptStats(data.appts, r, NO_SHOW_TRACKING_SINCE);
      const cash = M.cashStats(lines, r);
      const earned = M.earnedStats(data.appts, data.prices, r);
      const exp = M.expenseStats(data.expenses, r);
      const newPts = M.newPatients(data.patients, r);
      return { appt, cash, earned, exp, newPts, result: cash.total - exp.total,
        capacity: M.slotCapacity(r, cap), opDays: M.operatingDays(r, cap.closedWeekdays),
        pkgSales: M.packageSales(data.pkgs, r), retention: M.retention(data.appts, data.patients, r) };
    };
    const c = per(cur), p = per(prev);
    const monthly = months.map((ym) => { const r = M.monthRange(ym, today); return { ym, r, ...per(r) }; });
    return { lines, c, p, monthly };
  }, [data, cur, prev, months, today, cap]);

  const approxCash = m && m.c.cash.approximate > 0;
  const preTracking = cur.from < PAYMENT_LOG_TRACKING_SINCE;

  return (
    <div className="ba-page">
      <style>{CSS}</style>

      <div className="ba-top">
        <div>
          <h1 className="ba-title">Business Analytics</h1>
          <div className="ba-sub">{fmtDate(cur.from)} – {fmtDate(cur.to)} · compared with {fmtDate(prev.from)} – {fmtDate(prev.to)}</div>
        </div>
        <div className="ba-top-actions">
          <button className="ba-btn ghost" onClick={() => setShowAssumptions(true)}><Settings2 size={14} /> Assumptions</button>
          <button className="ba-btn ghost" onClick={reload} disabled={loading}><RefreshCw size={14} className={loading ? "spin" : ""} /> Refresh</button>
        </div>
      </div>

      <div className="ba-filters">
        {PRESETS.map((p) => <button key={p.key} className={`ba-chip ${preset === p.key ? "on" : ""}`} onClick={() => setPreset(p.key)}>{p.label}</button>)}
        {preset === "custom" && (
          <span className="ba-custom">
            <input type="date" value={custom.from} max={custom.to} onChange={(e) => setCustom({ ...custom, from: e.target.value })} />
            <span>to</span>
            <input type="date" value={custom.to} min={custom.from} onChange={(e) => setCustom({ ...custom, to: e.target.value })} />
          </span>
        )}
      </div>

      <div className="ba-tabs">
        {SECTIONS.map((s) => <button key={s.key} className={`ba-tab ${section === s.key ? "on" : ""}`} onClick={() => setSection(s.key)}>{s.label}</button>)}
      </div>

      {error && <div className="ba-banner err"><AlertTriangle size={15} /> {error} <button className="ba-link" onClick={reload}>Try again</button></div>}
      {loading && !data && <div className="ba-loading">{Array.from({ length: 8 }, (_, i) => <div key={i} className="ba-skel" />)}</div>}

      {m && data && (
        <>
          {(approxCash || preTracking) && (section === "overview" || section === "financial") && (
            <div className="ba-banner">
              <Info size={15} /> Data capture for payment dates, payment methods and no-shows began on {fmtDate(PAYMENT_LOG_TRACKING_SINCE)}.
              {approxCash && <> {egp(m.c.cash.approximate)} of this period's cash comes from older package payments counted on the package start date (approximate).</>}
            </div>
          )}

          {section === "overview" && <Overview m={m} />}
          {section === "financial" && <Financial m={m} data={data} settings={settings} cur={cur} cap={cap} months={months} onExpensesChanged={reload} />}
          {section === "acquisition" && <Acquisition m={m} data={data} cur={cur} />}
          {section === "retention" && <Retention m={m} data={data} today={today} />}
          {section === "schedule" && <Schedule data={data} cur={cur} prev={prev} cap={cap} settings={settings} />}
          {section === "expansion" && <Expansion m={m} data={data} settings={settings} cap={cap} />}
        </>
      )}

      {showAssumptions && <AssumptionsModal initial={settings} onClose={() => setShowAssumptions(false)} />}
    </div>
  );
}

interface Computed {
  lines: M.CashLine[];
  c: PeriodStats; p: PeriodStats;
  monthly: (PeriodStats & { ym: string; r: M.Range })[];
}
interface PeriodStats {
  appt: M.ApptStats; cash: M.CashStats; earned: M.EarnedStats; exp: M.ExpenseStats; newPts: M.APatient[];
  result: number; capacity: number; opDays: number;
  pkgSales: { count: number; value: number; sessions: number };
  retention: { treated: number; newTreated: number; returningTreated: number; sessionsPerPatient: number | null };
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function Overview({ m }: { m: Computed }) {
  const { c, p } = m;
  return (
    <div className="ba-grid">
      <Kpi label="Cash collected" value={egp(c.cash.total)} cur={c.cash.total} prev={p.cash.total}
        help="Money received in the period: paid pay-per-session charges on their paid date + package payments on their payment date. Package-covered sessions are not counted again." />
      <Kpi label="Earned revenue" value={egp(c.earned.total)} cur={c.earned.total} prev={p.earned.total}
        note={c.earned.unpricedSessions ? `${c.earned.unpricedSessions} completed session(s) have no price recorded` : undefined}
        help="Value of treatment actually delivered: each completed session × its price record (package sessions at the package's per-session price). Differs from cash when packages are prepaid." />
      <Kpi label="Operating expenses" value={egp(c.exp.total)} cur={c.exp.total} prev={p.exp.total} lowerIsBetter
        help="Sum of expenses recorded in the Expenses log for the period. Not set up = 0 recorded, so add expenses for a meaningful result." />
      <Kpi label="Operating result" value={egp(c.result)} cur={c.result} prev={p.result} kind="estimate"
        help="Cash collected − recorded expenses. An operating estimate, not accounting profit: excludes depreciation, taxes, owner salary not recorded as an expense, and any unrecorded costs." />
      <Kpi label="Completed sessions" value={num(c.appt.completed)} cur={c.appt.completed} prev={p.appt.completed}
        help="Appointments in the period with status Completed. In-progress, cancelled, no-show and rescheduled never count." />
      <Kpi label="Patients treated" value={num(c.appt.uniquePatients)} cur={c.appt.uniquePatients} prev={p.appt.uniquePatients}
        help="Distinct patients with at least one completed session in the period." />
      <Kpi label="New patients" value={num(c.newPts.length)} cur={c.newPts.length} prev={p.newPts.length}
        help="Patient records created in the period (clinic time)." />
      <Kpi label="Assessments" value={`${num(c.appt.assessmentsAttended)} / ${num(c.appt.assessmentsBooked)}`} cur={c.appt.assessmentsAttended} prev={p.appt.assessmentsAttended}
        note={`Attendance ${pct(c.appt.assessmentAttendanceRate)}`}
        help="Attended / booked appointments whose session type is an assessment (incl. online). Booked excludes rescheduled." />
      <Kpi label="Cancellation rate" value={pct(c.appt.cancellationRate)} cur={c.appt.cancellationRate} prev={p.appt.cancellationRate} lowerIsBetter
        help="Cancelled ÷ booked appointments in the period (booked excludes rescheduled)." />
      <Kpi label="No-show rate" value={pct(c.appt.noShowRate)} cur={c.appt.noShowRate} prev={p.appt.noShowRate} lowerIsBetter
        note={!c.appt.noShowTrackedFully ? `Tracked since ${fmtDate(NO_SHOW_TRACKING_SINCE)} only` : undefined}
        help="No-show ÷ booked appointments, counting only appointments since no-show tracking began." />
      <Kpi label="Revenue per session" value={egp(c.earned.avgPerSession)} cur={c.earned.avgPerSession} prev={p.earned.avgPerSession}
        help="Earned revenue ÷ completed sessions that have a price record (unpriced sessions are excluded rather than counted as 0)." />
      <Kpi label="Schedule utilisation" value={pct(M.ratio(c.appt.completed, c.capacity))} cur={M.ratio(c.appt.completed, c.capacity)} prev={M.ratio(p.appt.completed, p.capacity)}
        note={`${num(c.appt.completed)} of ${num(c.capacity)} slots`}
        help="Completed sessions ÷ bookable slots. Slots = operating days × open hours (clinic settings) × patients per hour. Uses today's opening hours for the whole period." />
    </div>
  );
}

function Financial({ m, data, settings, cur, cap, months, onExpensesChanged }: {
  m: Computed; data: AnalyticsData; settings: BusinessSettings; cur: M.Range; cap: M.Capacity; months: string[]; onExpensesChanged: () => void;
}) {
  const { c } = m;
  const out = M.outstanding(data.unpaidPrices, data.pkgs);
  const obl = M.packageObligations(data.pkgs);
  // Break-even uses the selected period's realised revenue/session and a full calendar month of operating days.
  const ym = M.monthKey(cur.to);
  const fullMonth = { from: `${ym}-01`, to: M.monthRange(ym, "9999-12-31").to };
  const be = M.breakEven({
    fixedMonthlyCosts: settings.fixedMonthlyCosts, variableCostPerSession: settings.variableCostPerSession,
    variableIncludedInExpenses: settings.variableIncludedInExpenses, avgRevenuePerSession: c.earned.avgPerSession,
    operatingDaysInMonth: M.operatingDays(fullMonth, cap.closedWeekdays),
  });
  const targetForPeriod = be.ok && be.sessionsPerDay !== null ? be.sessionsPerDay * c.opDays : null;
  const physioRows = Object.entries(c.earned.byPhysio).map(([id, v]) => [c.earned.physioNames[id] ?? "Unknown", v] as [string, number]).sort((a, b) => b[1] - a[1]);

  return (
    <div className="ba-stack">
      <div className="ba-grid">
        <Kpi label="Cash — sessions" value={egp(c.cash.sessions)} help="Paid pay-per-session charges (not linked to a package), by paid date." />
        <Kpi label="Cash — packages" value={egp(c.cash.packages)} help="Package payments by payment date (older packages: on start date, approximate)." />
        <Kpi label="Package sales" value={`${num(c.pkgSales.count)} · ${egp(c.pkgSales.value)}`} help="Packages starting in the period: count and total package price (sold, not necessarily paid)." />
        <Kpi label="Package sessions used" value={`${num(c.earned.packageRedemptions)} · ${egp(c.earned.packageRedemptionValue)}`}
          help="Completed sessions in the period whose price record is linked to a package, valued at the per-session price. Counted from linked records, not the manual +/− counter." />
        <Kpi label="Outstanding (all time)" value={egp(out.total)} lowerIsBetter
          note={`${egp(out.sessions)} sessions · ${egp(out.packages)} packages`}
          help="Unpaid pay-per-session charges + unpaid balances on packages (total − paid). All time, not just this period." />
        <Kpi label="Prepaid sessions still owed" value={`${num(obl.remainingSessions)} · ${egp(obl.remainingValue)}`}
          help="Sessions remaining in active packages (size − sessions used) × per-session price: treatment the clinic still owes patients." />
      </div>

      <Card title="Monthly trend" wide help="Last 6 months (current month to date). Result = cash collected − recorded expenses.">
        <MonthBars months={months} fmt={egp} series={[
          { label: "Cash collected", color: "#2E8BC0", values: m.monthly.map((x) => x.cash.total) },
          { label: "Earned revenue", color: "#5BC0BE", values: m.monthly.map((x) => x.earned.total) },
          { label: "Expenses", color: "#E8A93B", values: m.monthly.map((x) => x.exp.total) },
          { label: "Result", color: "#16a34a", values: m.monthly.map((x) => x.result) },
        ]} />
      </Card>

      <div className="ba-two">
        <Card title="Earned revenue by service type"><BarList fmt={egp} rows={Object.entries(c.earned.byServiceType).sort((a, b) => b[1] - a[1])} /></Card>
        <Card title="Earned revenue by physiotherapist" help="Attributed to the physio on the completed appointment.">
          <BarList fmt={egp} rows={physioRows} />
        </Card>
        <Card title="Cash by payment method" help={`Recorded from ${fmtDate(PAYMENT_LOG_TRACKING_SINCE)}; earlier payments show as "Not recorded".`}>
          <BarList fmt={egp} rows={Object.entries(c.cash.byMethod).map(([k, v]) => [labelFor(PAYMENT_METHODS, k, "Not recorded"), v] as [string, number]).sort((a, b) => b[1] - a[1])} />
        </Card>
        <Card title="Expenses by category">
          <BarList fmt={egp} empty="No expenses recorded — add them below." rows={Object.entries(c.exp.byCategory).map(([k, v]) => [labelFor(EXPENSE_CATEGORIES, k), v] as [string, number]).sort((a, b) => b[1] - a[1])} />
        </Card>
      </div>

      <Card title="Break-even" wide help="Contribution per session = revenue per session − variable cost per session. Break-even sessions = monthly fixed costs ÷ contribution. Daily = monthly ÷ operating days in the month.">
        {!be.ok ? <div className="ba-banner"><Info size={15} /> {be.reason}</div> : (
          <div className="ba-grid">
            <Kpi label="Revenue per session" value={egp(c.earned.avgPerSession)} help="Measured: earned revenue ÷ priced completed sessions in the selected period." />
            <Kpi label="Variable cost / session" value={settings.variableIncludedInExpenses ? "In expenses" : egp(be.variableUsed)} kind="estimate" help="Your estimate (Assumptions)." />
            <Kpi label="Contribution / session" value={egp(be.contribution)} kind="estimate" help="Revenue per session − variable cost per session." />
            <Kpi label="Break-even / month" value={`${num(be.sessionsPerMonth)} sessions`} kind="estimate" help="Monthly fixed costs (your estimate) ÷ contribution per session, rounded up." />
            <Kpi label="Break-even / day" value={num(be.sessionsPerDay, 1)} kind="estimate" help="Monthly break-even ÷ operating days in the month (closed weekdays excluded)." />
            <Kpi label="Actual vs target (period)" value={`${num(c.appt.completed)} / ${num(targetForPeriod, 0)}`}
              note={targetForPeriod ? `${pct(M.ratio(c.appt.completed, targetForPeriod))} of break-even pace` : undefined}
              help="Completed sessions in the selected period vs break-even per day × operating days in the period." />
          </div>
        )}
      </Card>

      <ExpensesPanel expenses={data.expenses} range={cur} onChanged={onExpensesChanged} />
    </div>
  );
}

function Acquisition({ m, data, cur }: { m: Computed; data: AnalyticsData; cur: M.Range }) {
  const { c } = m;
  const src = M.bySource(c.newPts);
  const unknown = src[""] ?? 0;
  const rows = Object.entries(src).map(([k, v]) => [labelFor(ACQUISITION_SOURCES, k), v] as [string, number]).sort((a, b) => b[1] - a[1]);
  const spend = c.exp.marketingBySource;
  // Earned revenue in the period from patients grouped by their source.
  const srcByPatient = new Map(data.patients.map((p) => [p.uid, M.sourceOf(p)] as const));
  const priceByAppt = new Map(data.prices.map((p) => [p.appointmentId, p.amount] as const));
  const revBySrc: Record<string, number> = {};
  data.appts.filter((a) => a.status === "completed" && M.inRange(a.date, cur)).forEach((a) => {
    const s = srcByPatient.get(a.patientId) ?? ""; revBySrc[s] = (revBySrc[s] ?? 0) + (priceByAppt.get(a.id) ?? 0);
  });
  const funnel = M.leadFunnel(data.leads, data.appts, cur);
  const a2t = M.assessmentToTreatment(data.appts, cur);
  const channels = [...new Set([...Object.keys(spend), ...Object.keys(src), ...Object.keys(funnel.bySource)])].filter(Boolean);
  return (
    <div className="ba-stack">
      <div className="ba-grid">
        <Kpi label="New patients" value={num(c.newPts.length)} help="Patient records created in the period." />
        <Kpi label="Source unknown" value={`${num(unknown)} of ${num(c.newPts.length)}`} lowerIsBetter
          help="New patients with no recorded 'How did they hear about us?'. Fill it in on the patient sheet to improve attribution." />
        <Kpi label="Marketing spend" value={egp(c.exp.marketingTotal)} help="Expenses in the Marketing category for the period." />
        <Kpi label="Cost per new patient" value={egp(M.ratio(c.exp.marketingTotal, c.newPts.length))}
          help="Marketing spend ÷ all new patients (blended). Per-channel figures are below where spend is tagged with a channel." />
        <Kpi label="Assessment attendance" value={pct(c.appt.assessmentAttendanceRate)} note={`${num(c.appt.assessmentsAttended)} of ${num(c.appt.assessmentsBooked)} booked`}
          help="Attended ÷ booked assessment appointments in the period." />
        <Kpi label="Assessment → treatment" value={pct(a2t.rate)} note={`${num(a2t.converted)} of ${num(a2t.assessed)} assessed patients`}
          help="Patients who attended an assessment in the period and then had at least one completed non-assessment session afterwards (up to today). Recent assessments may not have converted yet." />
        <Kpi label="Inquiries" value={num(funnel.inquiries)} help="Inquiries logged on the Front Desk page with a date in the period." />
        <Kpi label="Cost per inquiry" value={egp(M.ratio(c.exp.marketingTotal, funnel.inquiries))}
          help="Marketing spend ÷ inquiries logged in the period (blended across channels)." />
        <Kpi label="Cost per attended assessment" value={egp(M.ratio(c.exp.marketingTotal, c.appt.assessmentsAttended))}
          help="Marketing spend ÷ assessment appointments attended in the period (blended)." />
      </div>
      <div className="ba-two">
        <Card title="New patients by source" help="As recorded at registration. Historical patients without a source are 'Unknown'; a recorded referring physician counts as Doctor referral.">
          <BarList fmt={(n) => num(n)} rows={rows} />
        </Card>
        <Card title="Channel efficiency" help="Spend = marketing expenses tagged with the channel. Cost per inquiry / new patient = channel spend ÷ that channel's inquiries / new patients. Revenue = earned in the period from patients of that source (any join date).">
          {channels.length === 0 ? <div className="ba-empty">No sources or tagged spend in this period.</div> : (
            <div className="ba-table-wrap"><table className="ba-table">
              <thead><tr><th>Channel</th><th className="r">Inquiries</th><th className="r">New</th><th className="r">Spend</th><th className="r">Cost / inquiry</th><th className="r">Cost / new</th><th className="r">Revenue</th></tr></thead>
              <tbody>{channels.map((k) => (
                <tr key={k}><td>{labelFor(ACQUISITION_SOURCES, k)}</td><td className="r">{num(funnel.bySource[k] ?? 0)}</td><td className="r">{num(src[k] ?? 0)}</td><td className="r">{spend[k] ? egp(spend[k]) : "—"}</td>
                  <td className="r">{spend[k] && funnel.bySource[k] ? egp(M.ratio(spend[k], funnel.bySource[k])) : "—"}</td>
                  <td className="r">{spend[k] ? egp(M.ratio(spend[k], src[k] ?? 0)) : "—"}</td><td className="r">{egp(revBySrc[k] ?? 0)}</td></tr>
              ))}</tbody>
            </table></div>
          )}
        </Card>
      </div>
      <Card title="Inquiry → treatment funnel" wide help="Inquiries are logged on the Front Desk page. Stages after 'booked' come from the linked patient's real appointments on/after the inquiry date. Inquiries not yet linked to a patient can only reach 'booked' (by status). Each stage is counted on its own, so 'treatment started' can exceed 'assessment attended' when a patient starts without a recorded assessment.">
        {funnel.inquiries === 0 ? <div className="ba-empty">No inquiries logged in this period. The secretary can log them under Front Desk → Inquiries.</div> : (
          <>
            <BarList fmt={(n) => num(n)} rows={[
              ["Inquiries", funnel.inquiries], ["Assessment booked", funnel.booked], ["Assessment attended", funnel.attended],
              ["Treatment started", funnel.started], ["2+ treatment sessions", funnel.continuing],
            ]} />
            <div className="ba-muted" style={{ marginTop: 8 }}>{funnel.linked} of {funnel.inquiries} inquiries are linked to a patient record.</div>
          </>
        )}
      </Card>
    </div>
  );
}

function Retention({ m, data, today }: { m: Computed; data: AnalyticsData; today: string }) {
  const { c, p } = m;
  const obl = M.packageObligations(data.pkgs);
  const reviewed = new Map(data.patients.map((p) => [p.uid, p.followUpReviewedFor ?? ""] as const));
  const follow = M.followUpCandidates(data.appts, data.patients, today, 60)
    .map((f) => ({ ...f, isReviewed: (reviewed.get(f.uid) ?? "") >= f.lastSession }));
  return (
    <div className="ba-stack">
      <div className="ba-grid">
        <Kpi label="Patients treated" value={num(c.retention.treated)} cur={c.retention.treated} prev={p.retention.treated} help="Distinct patients with a completed session in the period." />
        <Kpi label="New vs returning" value={`${num(c.retention.newTreated)} / ${num(c.retention.returningTreated)}`}
          help="Of patients treated: new = record created in the period; returning = created earlier." />
        <Kpi label="Sessions per patient" value={num(c.retention.sessionsPerPatient, 1)} cur={c.retention.sessionsPerPatient} prev={p.retention.sessionsPerPatient}
          help="Completed sessions ÷ patients treated in the period." />
        <Kpi label="Booked / completed" value={`${num(c.appt.booked)} / ${num(c.appt.completed)}`} help="Booked excludes rescheduled. Still-open = scheduled or in progress." note={`${num(c.appt.open)} still open`} />
        <Kpi label="Cancelled / no-show" value={`${num(c.appt.cancelled)} / ${num(c.appt.noShow)}`} lowerIsBetter cur={c.appt.cancelled + c.appt.noShow} prev={p.appt.cancelled + p.appt.noShow}
          help="Counts of cancelled and no-show appointments in the period." />
        <Kpi label="Package utilisation" value={pct(obl.avgUtilization)} note={`${num(obl.activePackages)} active · ${num(obl.remainingSessions)} sessions left`}
          help="Average of sessions used ÷ package size across active packages." />
        <Kpi label="Patients with upcoming bookings" value={num(M.upcomingPatients(data.appts, today))} help="Distinct patients with a scheduled appointment from today on." />
      </div>
      <Card title={`For administrative review (${follow.filter((f) => !f.isReviewed).length} open · ${follow.filter((f) => f.isReviewed).length} reviewed)`} wide
        help="Active patients whose last completed session was within the last 60 days and who have nothing booked. This is NOT a 'lost patient' list — some have finished treatment or paused appropriately. Review before contacting anyone; nothing is sent automatically.">
        {follow.length === 0 ? <div className="ba-empty">No patients to review.</div> : (
          <div className="ba-table-wrap"><table className="ba-table">
            <thead><tr><th>Patient</th><th>Last session</th><th className="r">Days since</th><th>Review</th></tr></thead>
            <tbody>{follow.map((f) => <tr key={f.uid}><td>{f.name}</td><td>{fmtDate(f.lastSession)}</td><td className="r">{f.daysSince}</td>
              <td>{f.isReviewed ? "Reviewed" : <span className="ba-muted">Open (record a decision on Front Desk)</span>}</td></tr>)}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}

function Schedule({ data, cur, prev, cap, settings }: { data: AnalyticsData; cur: M.Range; prev: M.Range; cap: M.Capacity; settings: BusinessSettings }) {
  const grid = M.weekdayHourGrid(data.appts, cur, cap);
  const hrs = Array.from({ length: 24 }, (_, h) => h).filter((h) =>
    M.isOpenHour(h, cap) || (h >= settings.morningStart && h < settings.morningEnd) || grid.counts.some((row) => row[h] > 0));
  const morning = M.shiftStats("Morning", settings.morningStart, settings.morningEnd, data.appts, data.prices, cur, cap);
  const evening = M.shiftStats("Evening", settings.eveningStart, settings.eveningEnd, data.appts, data.prices, cur, cap);
  const split = M.morningDemandSplit(data.appts, cur, prev, [settings.morningStart, settings.morningEnd], [settings.eveningStart, settings.eveningEnd]);
  const byWeekday = [1, 2, 3, 4, 5, 6, 0].map((wd) => [WEEKDAYS[wd], grid.counts[wd].reduce((a, b) => a + b, 0)] as [string, number]);
  const byHour = hrs.map((h) => [fmtHour12(h), grid.counts.reduce((a, row) => a + row[h], 0)] as [string, number]);
  const shiftRow = (s: M.ShiftStats) => (
    <tr key={s.label}>
      <td><b>{s.label}</b><div className="ba-muted">{fmtHour12(s.hFrom)}–{fmtHour12(s.hTo)}</div></td>
      <td className="r">{s.openHours ? num(s.openHours) : <span className="ba-muted">closed</span>}</td>
      <td className="r">{num(s.booked)}</td><td className="r">{num(s.completed)}</td>
      <td className="r">{num(s.capacity)}</td><td className="r">{pct(s.utilization)}</td>
      <td className="r">{pct(s.cancelRate)}</td><td className="r">{num(s.noShow)}</td>
      <td className="r">{egp(s.earned)}</td><td className="r">{egp(s.earnedPerOpenHour)}</td>
    </tr>
  );
  return (
    <div className="ba-stack">
      <div className="ba-banner"><Info size={15} /> Capacity uses the clinic's current schedule settings: open {fmtHour12(cap.openingHour)}–{cap.closingHour >= 24 ? "midnight" : fmtHour12(cap.closingHour)}, {cap.maxPerHour} patients per hour{cap.closedWeekdays.length ? `, closed ${cap.closedWeekdays.map((d) => WEEKDAYS[d]).join(", ")}` : ""}. Each appointment is a 1-hour slot. Historical changes to opening hours aren't stored, so past capacity uses today's settings.</div>
      <Card title="Morning vs evening" wide help="Booked excludes rescheduled. Utilisation = completed ÷ capacity in the window. Revenue per open hour = earned revenue ÷ open clinic hours in the window. Adjust windows in Assumptions.">
        <div className="ba-table-wrap"><table className="ba-table">
          <thead><tr><th>Shift</th><th className="r">Open hrs</th><th className="r">Booked</th><th className="r">Done</th><th className="r">Slots</th><th className="r">Util.</th><th className="r">Cancel</th><th className="r">No-show</th><th className="r">Earned</th><th className="r">/ open hr</th></tr></thead>
          <tbody>{shiftRow(morning)}{shiftRow(evening)}</tbody>
        </table></div>
        {morning.openHours === 0 && <div className="ba-muted" style={{ marginTop: 8 }}>The clinic isn't open in the morning window yet, so there's no morning capacity. Once you extend opening hours in schedule settings, this compares the two shifts directly.</div>}
        {split.morningPatients > 0 && (
          <div className="ba-banner" style={{ marginTop: 10 }}><Info size={15} />
            Of {split.morningPatients} patients seen in the morning, {split.newToSchedule} did not have an evening session in the previous period ({split.shiftedFromEvening} moved from evenings). Only the first number is likely extra demand.
          </div>
        )}
      </Card>
      <Card title="Completed sessions by weekday × hour" wide help="Cell = completed sessions; shading = share of that cell's capacity. Grey = closed (by current settings).">
        <Heatmap grid={grid} hours={hrs} />
      </Card>
      <div className="ba-two">
        <Card title="Completed by weekday"><BarList fmt={(n) => num(n)} rows={byWeekday} /></Card>
        <Card title="Completed by hour"><BarList fmt={(n) => num(n)} rows={byHour} /></Card>
      </div>
    </div>
  );
}

function Expansion({ m, data, settings, cap }: { m: Computed; data: AnalyticsData; settings: BusinessSettings; cap: M.Capacity }) {
  // Full calendar months only (the current month is partial).
  const full = m.monthly.slice(0, -1);
  const span: M.Range | null = full.length ? { from: full[0].r.from, to: full[full.length - 1].r.to } : null;
  const earned = full.reduce((a, x) => a + x.earned.total, 0);
  const priced = full.reduce((a, x) => a + x.earned.pricedSessions, 0);
  const be = M.breakEven({
    fixedMonthlyCosts: settings.fixedMonthlyCosts, variableCostPerSession: settings.variableCostPerSession,
    variableIncludedInExpenses: settings.variableIncludedInExpenses, avgRevenuePerSession: M.ratio(earned, priced),
    operatingDaysInMonth: span ? M.operatingDays(full[full.length - 1].r, cap.closedWeekdays) : 0,
  });
  const owner = span ? M.ownerShare(data.appts, data.managerIds, span) : null;
  const run = M.runway(settings.cashBalance, full.slice(-3).map((x) => x.result));
  const criteria = M.expansionCriteria({
    fullMonths: full.map((x) => ({ ym: x.ym, result: x.result, completed: x.appt.completed, capacity: x.capacity, newPatients: x.newPts.length, expensesRecorded: x.exp.total > 0 })),
    monthsAtTarget: settings.monthsAtTarget,
    targetMonthlyResult: settings.targetMonthlyResult,
    breakEvenSessionsPerMonth: be.ok ? be.sessionsPerMonth : null,
    targetUtilization: settings.targetUtilization === null ? null : settings.targetUtilization / 100,
    cashBalance: settings.cashBalance, minCashReserve: settings.minCashReserve,
    ownerShare: owner?.share ?? null, maxOwnerShare: settings.maxOwnerSharePct === null ? null : settings.maxOwnerSharePct / 100,
  });
  const met = criteria.filter((c) => c.state === "met").length;
  const missing = criteria.filter((c) => c.state === "missing").length;
  const months = full.map((x) => x.ym);
  return (
    <div className="ba-stack">
      <div className="ba-banner"><Info size={15} />
        {met} of {criteria.length} criteria met{missing ? `, ${missing} can't be assessed yet` : ""}. This is evidence for your decision, not a verdict. Second-branch costs (rent, salaries, fit-out, start-up capital) aren't modelled here.
      </div>
      <Card title="Criteria" wide help="Thresholds come from Assumptions and are your targets. Measured values come from recorded data over full calendar months.">
        <div className="ba-crit">
          {criteria.map((c) => (
            <div key={c.key} className={`ba-crit-row ${c.state}`}>
              <span className="ba-crit-badge">{c.state === "met" ? "Met" : c.state === "not_met" ? "Not met" : "Missing data"}</span>
              <div><div className="ba-crit-label">{c.label}</div><div className="ba-muted">{c.evidence}</div></div>
            </div>
          ))}
        </div>
      </Card>
      <div className="ba-grid">
        <Kpi label="Owner dependence" value={pct(owner?.share ?? null)} note={owner ? `${num(owner.owner)} of ${num(owner.total)} sessions (full months)` : undefined}
          help="Share of completed sessions in the full months shown that were treated by a physio with the Manager rank." />
        <Kpi label="Cash runway" kind="estimate"
          value={run.burning === null ? "—" : run.burning ? `${num(run.months, 1)} months` : "Not burning cash"}
          note={settings.cashBalance === null ? "Enter a cash balance in Assumptions" : `Balance ${egp(settings.cashBalance)}${settings.cashBalanceAsOf ? ` as of ${fmtDate(settings.cashBalanceAsOf)}` : ""}`}
          help="Owner-entered cash balance ÷ average monthly loss over the last 3 full months. If the average result is positive, the clinic isn't drawing down cash." />
        <Kpi label="Break-even / month" kind="estimate" value={be.ok ? `${num(be.sessionsPerMonth)} sessions` : "—"} note={be.ok ? undefined : be.reason}
          help="Monthly fixed costs ÷ contribution per session, using revenue per session across the full months shown." />
      </div>
      {full.length === 0 ? <div className="ba-empty">Not enough history yet.</div> : (
        <div className="ba-two">
          <Card title="Revenue, expenses & result" help="Full months. Result = cash collected − recorded expenses.">
            <MonthBars months={months} fmt={egp} series={[
              { label: "Cash collected", color: "#2E8BC0", values: full.map((x) => x.cash.total) },
              { label: "Expenses", color: "#E8A93B", values: full.map((x) => x.exp.total) },
              { label: "Result", color: "#16a34a", values: full.map((x) => x.result) },
            ]} />
          </Card>
          <Card title="Completed sessions vs break-even" help={be.ok ? `Break-even: ${be.sessionsPerMonth} sessions/month (estimate).` : "Break-even not available; see Financial."}>
            <MonthBars months={months} fmt={(n) => num(n)} series={[
              { label: "Completed sessions", color: "#5BC0BE", values: full.map((x) => x.appt.completed) },
              ...(be.ok ? [{ label: "Break-even", color: "#c0bbb4", values: full.map(() => be.sessionsPerMonth) }] : []),
            ]} />
          </Card>
          <Card title="Utilisation" help="Completed ÷ bookable slots per month (current schedule settings).">
            <BarList fmt={pct} rows={full.map((x) => [fmtMonth(x.ym), M.ratio(x.appt.completed, x.capacity) ?? 0] as [string, number])} />
          </Card>
          <Card title="New patients & cost per new patient" help="New patient records per month; marketing spend ÷ new patients.">
            <div className="ba-table-wrap"><table className="ba-table">
              <thead><tr><th>Month</th><th className="r">New</th><th className="r">Marketing</th><th className="r">Cost / new</th></tr></thead>
              <tbody>{full.map((x) => <tr key={x.ym}><td>{fmtMonth(x.ym)}</td><td className="r">{num(x.newPts.length)}</td>
                <td className="r">{egp(x.exp.marketingTotal)}</td><td className="r">{egp(M.ratio(x.exp.marketingTotal, x.newPts.length))}</td></tr>)}</tbody>
            </table></div>
          </Card>
        </div>
      )}
    </div>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const CSS = `
.ba-page { max-width: 1180px; margin: 0 auto; padding: 4px 4px 60px; font-family: 'Outfit', sans-serif; color: #1a1a1a; }
.ba-top { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
.ba-title { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 500; margin: 0 0 3px; color: #0C3C60; }
.ba-sub { font-size: 12.5px; color: #9a9590; }
.ba-top-actions { display: flex; gap: 8px; }
.ba-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 10px; border: 1.5px solid #2E8BC0; background: #2E8BC0; color: #fff; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.ba-btn.ghost { background: #fff; color: #2E8BC0; border-color: #B3DEF0; }
.ba-btn:disabled { opacity: .55; cursor: not-allowed; }
.ba-btn .spin { animation: baSpin 1s linear infinite; }
@keyframes baSpin { to { transform: rotate(360deg); } }
.ba-filters { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-bottom: 12px; }
.ba-chip { padding: 6px 12px; border-radius: 100px; border: 1.5px solid #e5e0d8; background: #fff; font-family: inherit; font-size: 12.5px; font-weight: 600; color: #5a5550; cursor: pointer; }
.ba-chip.on { background: #0C3C60; border-color: #0C3C60; color: #fff; }
.ba-custom { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; color: #9a9590; flex-wrap: wrap; }
.ba-custom input, .ba-exp-form input, .ba-exp-form select, .ba-field input, .ba-field select, .ba-inline select {
  border: 1.5px solid #e5e0d8; border-radius: 9px; padding: 7px 9px; font-family: inherit; font-size: 13px; background: #fff; min-width: 0; }
.ba-tabs { display: flex; gap: 4px; overflow-x: auto; border-bottom: 1.5px solid #e5e0d8; margin-bottom: 16px; scrollbar-width: none; }
.ba-tab { padding: 9px 14px; border: none; background: none; font-family: inherit; font-size: 13.5px; font-weight: 600; color: #9a9590; cursor: pointer; white-space: nowrap; border-bottom: 2.5px solid transparent; margin-bottom: -1.5px; }
.ba-tab.on { color: #0C3C60; border-bottom-color: #2E8BC0; }
.ba-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.ba-stack { display: flex; flex-direction: column; gap: 14px; }
.ba-two { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 14px; }
.ba-kpi { background: #fff; border: 1px solid #e5e0d8; border-radius: 14px; padding: 14px; position: relative; min-width: 0; }
.ba-kpi.estimate { background: repeating-linear-gradient(135deg, #fff, #fff 10px, #fcfaf6 10px, #fcfaf6 20px); border-style: dashed; }
.ba-kpi-head { display: flex; justify-content: space-between; align-items: center; gap: 6px; }
.ba-kpi-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #9a9590; }
.ba-info { background: none; border: none; color: #c0bbb4; cursor: pointer; padding: 2px; display: flex; }
.ba-info:hover { color: #2E8BC0; }
.ba-kpi-val { font-family: 'Playfair Display', serif; font-size: 23px; font-weight: 600; color: #0C3C60; margin-top: 6px; word-break: break-word; }
.ba-kpi-delta { font-size: 11.5px; color: #9a9590; margin-top: 4px; display: flex; align-items: center; gap: 4px; }
.ba-kpi-delta.up { color: #15803d; } .ba-kpi-delta.down { color: #b91c1c; }
.ba-kpi-note { font-size: 11.5px; color: #9a9590; margin-top: 4px; }
.ba-kpi-help { font-size: 12px; color: #5a5550; background: #f7f5f2; border-radius: 8px; padding: 8px 10px; margin-top: 8px; line-height: 1.45; }
.ba-tag { position: absolute; top: -8px; right: 10px; font-size: 9.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; background: #fef3c7; color: #92400e; padding: 2px 7px; border-radius: 100px; }
.ba-card { background: #fff; border: 1px solid #e5e0d8; border-radius: 16px; padding: 16px; min-width: 0; }
.ba-card-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #5a5550; margin-bottom: 4px; }
.ba-card-help { font-size: 12px; color: #9a9590; margin-bottom: 12px; line-height: 1.45; }
.ba-empty { text-align: center; color: #c0bbb4; font-size: 13px; padding: 22px 8px; }
.ba-bars { display: flex; flex-direction: column; gap: 7px; }
.ba-bar-row { display: grid; grid-template-columns: minmax(80px, 34%) 1fr auto; gap: 8px; align-items: center; font-size: 12.5px; }
.ba-bar-label { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #5a5550; }
.ba-bar-track { height: 9px; background: #f0ede8; border-radius: 100px; overflow: hidden; }
.ba-bar-fill { height: 100%; background: linear-gradient(90deg, #2E8BC0, #5BC0BE); border-radius: 100px; }
.ba-bar-val { font-weight: 600; color: #0C3C60; white-space: nowrap; }
.ba-legend { display: flex; flex-wrap: wrap; gap: 12px; font-size: 11.5px; color: #5a5550; margin-bottom: 10px; }
.ba-legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
.ba-mbars { display: flex; gap: 8px; height: 170px; align-items: stretch; }
.ba-mcol { flex: 1; display: flex; flex-direction: column; min-width: 0; }
.ba-mstack { flex: 1; display: flex; align-items: flex-end; gap: 2px; border-bottom: 1px solid #e5e0d8; }
.ba-mbar { flex: 1; border-radius: 4px 4px 0 0; min-height: 1px; }
.ba-mbar.neg { opacity: .45; background-image: repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,.6) 3px, rgba(255,255,255,.6) 6px) !important; }
.ba-mlabel { font-size: 10.5px; color: #9a9590; text-align: center; margin-top: 5px; white-space: nowrap; }
.ba-heat-wrap, .ba-table-wrap { overflow-x: auto; }
.ba-heat { border-collapse: separate; border-spacing: 3px; font-size: 11px; }
.ba-heat th { color: #9a9590; font-weight: 600; padding: 2px 4px; white-space: nowrap; }
.ba-heat td { width: 34px; min-width: 34px; height: 28px; text-align: center; border-radius: 6px; font-weight: 600; }
.ba-heat td.closed { background: #f3f1ed; color: #c0bbb4; }
.ba-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.ba-table th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: #9a9590; padding: 7px 8px; border-bottom: 1px solid #f0ede8; white-space: nowrap; }
.ba-table td { padding: 8px; border-bottom: 1px solid #f7f5f2; vertical-align: top; }
.ba-table .r { text-align: right; white-space: nowrap; }
.ba-muted { color: #9a9590; font-size: 11.5px; }
.ba-banner { display: flex; gap: 8px; align-items: flex-start; background: #EAF5FC; color: #0C3C60; border: 1px solid #B3DEF0; border-radius: 12px; padding: 10px 12px; font-size: 12.5px; line-height: 1.45; margin-bottom: 12px; }
.ba-banner svg { flex-shrink: 0; margin-top: 1px; }
.ba-stack .ba-banner, .ba-card .ba-banner { margin-bottom: 0; }
.ba-banner.err { background: #fef2f2; border-color: #fecaca; color: #991b1b; }
.ba-link { background: none; border: none; color: inherit; text-decoration: underline; cursor: pointer; font: inherit; }
.ba-loading { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 10px; }
.ba-skel { height: 96px; border-radius: 14px; background: linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%); background-size: 200% 100%; animation: baShim 1.4s ease infinite; }
@keyframes baShim { to { background-position: -200% 0; } }
.ba-exp-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; margin-bottom: 10px; }
.ba-icon { background: none; border: 1px solid #e5e0d8; border-radius: 7px; padding: 4px 6px; color: #9a9590; cursor: pointer; }
.ba-icon:hover { color: #b91c1c; border-color: #fca5a5; background: #fee2e2; }
.ba-err { color: #b91c1c; font-size: 12.5px; margin: 6px 0; }
.ba-overlay { position: fixed; inset: 0; background: rgba(12,60,96,.35); display: flex; align-items: center; justify-content: center; padding: 16px; z-index: 1000; }
.ba-modal { background: #fff; border-radius: 18px; padding: 20px; width: 100%; max-width: 620px; max-height: 90vh; overflow-y: auto; font-family: 'Outfit', sans-serif; }
.ba-modal-head { display: flex; justify-content: space-between; align-items: center; font-size: 16px; color: #0C3C60; margin-bottom: 6px; }
.ba-x { background: none; border: none; cursor: pointer; color: #9a9590; }
.ba-modal-note { font-size: 12.5px; color: #5a5550; background: #fef9ec; border: 1px solid #fde68a; border-radius: 10px; padding: 8px 10px; margin: 0 0 14px; }
.ba-form-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 12px; }
.ba-field { display: flex; flex-direction: column; gap: 5px; font-size: 12.5px; color: #5a5550; font-weight: 600; margin-bottom: 4px; }
.ba-field small { font-weight: 400; color: #9a9590; }
.ba-check { display: flex; gap: 8px; align-items: flex-start; font-size: 12.5px; color: #5a5550; margin-bottom: 14px; }
.ba-days { display: flex; flex-wrap: wrap; gap: 6px; }
.ba-day { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border: 1.5px solid #e5e0d8; border-radius: 100px; font-weight: 600; cursor: pointer; }
.ba-day.on { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }
.ba-day input { display: none; }
.ba-inline { display: flex; align-items: center; gap: 6px; }
.ba-inline select { flex: 1; }
.ba-modal-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 8px; }
.ba-crit { display: flex; flex-direction: column; gap: 8px; }
.ba-crit-row { display: flex; gap: 10px; align-items: flex-start; padding: 10px; border-radius: 10px; background: #fafaf8; border: 1px solid #f0ede8; }
.ba-crit-label { font-size: 13px; font-weight: 600; }
.ba-crit-badge { flex-shrink: 0; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; padding: 3px 8px; border-radius: 100px; min-width: 86px; text-align: center; }
.ba-crit-row.met .ba-crit-badge { background: #dcfce7; color: #166534; }
.ba-crit-row.not_met .ba-crit-badge { background: #fee2e2; color: #991b1b; }
.ba-crit-row.missing .ba-crit-badge { background: #f3f4f6; color: #4b5563; }
@media (max-width: 640px) {
  .ba-two { grid-template-columns: 1fr; }
  .ba-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .ba-kpi-val { font-size: 19px; }
  .ba-mbars { height: 140px; gap: 4px; }
}
`;
