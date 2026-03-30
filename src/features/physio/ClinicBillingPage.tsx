// FILE: src/features/physio/ClinicBillingPage.tsx
// Clinic-wide billing dashboard — clinic manager only.
// Shows daily / weekly / monthly revenue across billingEntries, sessionPrices, packages.

import { useState, useEffect, useMemo } from "react";
import {
  collection, query, orderBy, onSnapshot, type Timestamp,
} from "firebase/firestore";
import { createPortal } from "react-dom";
import { Pencil } from "lucide-react";
import { db } from "../../firebase";
import { toDateStr, getWeekStart } from "../../services/appointmentService";
import { setSessionPrice } from "../../services/priceService";

// ─── Local types (raw Firestore shapes) ──────────────────────────────────────

interface RawBillingEntry {
  id: string; patientId: string; date: string; description: string;
  amount: number; paid: boolean; paidDate: string; notes: string;
  createdAt: Timestamp | null;
}
interface RawSessionPrice {
  id: string; patientId: string; appointmentId: string; date: string;
  sessionType: string; physioName: string; amount: number; paid: boolean;
  paidDate: string; packageId: string; notes: string; createdAt: Timestamp | null;
}
interface RawPackage {
  id: string; patientId: string; packageSize: number; pricePerSession: number;
  totalAmount: number; paidAmount: number; startDate: string; sessionsUsed: number;
  active: boolean; notes: string; createdAt: Timestamp | null;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });


function monthLabel(ym: string): string {
  const [y, m] = ym.split("-");
  return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// ─── Period filter helpers ────────────────────────────────────────────────────

function isInDay(date: string, day: string): boolean { return date === day; }
function isInWeek(date: string, ws: string, we: string): boolean { return date >= ws && date <= we; }
function isInMonth(date: string, ym: string): boolean { return date.startsWith(ym); }

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClinicBillingPage() {
  const today      = toDateStr(new Date());
  const weekStart  = toDateStr(getWeekStart(new Date()));
  const weekEnd    = toDateStr(new Date(getWeekStart(new Date()).getTime() + 6 * 86400000));
  const thisMonth  = today.slice(0, 7);  // "YYYY-MM"

  // ── Period selector ──────────────────────────────────────────────────────
  const [period,      setPeriod]      = useState<"day" | "week" | "month">("day");
  const [selectedDay,   setSelectedDay]   = useState(today);
  const [selectedWeek,  setSelectedWeek]  = useState<[string, string]>([weekStart, weekEnd]);
  const [selectedMonth, setSelectedMonth] = useState(thisMonth);

  // ── Source data ─────────────────────────────────────────────────────────
  const [billingEntries,  setBillingEntries]  = useState<RawBillingEntry[]>([]);
  const [sessionPrices,   setSessionPrices]   = useState<RawSessionPrice[]>([]);
  const [packages,        setPackages]        = useState<RawPackage[]>([]);
  const [loading,         setLoading]         = useState(true);

  // ── Active section detail ───────────────────────────────────────────────
  const [activeSection, setActiveSection] = useState<"overview" | "entries" | "sessions" | "packages">("overview");

  // ── Session charge edit modal ────────────────────────────────────────────
  const [editingSession,    setEditingSession]    = useState<RawSessionPrice | null>(null);
  const [editSessionForm,   setEditSessionForm]   = useState({ date: "", sessionType: "", physioName: "", amount: "", paid: false, paidDate: "", notes: "" });
  const [editSessionSaving, setEditSessionSaving] = useState(false);
  const [editSessionError,  setEditSessionError]  = useState<string | null>(null);

  const openEditSession = (s: RawSessionPrice) => {
    setEditingSession(s);
    setEditSessionForm({ date: s.date, sessionType: s.sessionType, physioName: s.physioName, amount: String(s.amount), paid: s.paid, paidDate: s.paidDate, notes: s.notes });
    setEditSessionError(null);
  };

  const handleSaveEditSession = async () => {
    if (!editingSession) return;
    const amount = parseFloat(editSessionForm.amount);
    if (isNaN(amount) || amount < 0) { setEditSessionError("Enter a valid amount."); return; }
    setEditSessionSaving(true); setEditSessionError(null);
    const { id: _id, createdAt: _ca, ...rest } = editingSession;
    const result = await setSessionPrice({
      ...rest,
      date:        editSessionForm.date,
      sessionType: editSessionForm.sessionType,
      physioName:  editSessionForm.physioName,
      amount,
      paid:        editSessionForm.paid,
      paidDate:    editSessionForm.paid ? (editSessionForm.paidDate || editSessionForm.date) : "",
      notes:       editSessionForm.notes,
    });
    setEditSessionSaving(false);
    if ("error" in result && result.error) { setEditSessionError(result.error); return; }
    setEditingSession(null);
  };

  useEffect(() => {
    let done = 0;
    const check = () => { done++; if (done === 3) setLoading(false); };

    const u1 = onSnapshot(
      query(collection(db, "patientBilling"), orderBy("date", "desc")),
      (s) => { setBillingEntries(s.docs.map((d) => ({ id: d.id, ...d.data() } as RawBillingEntry))); check(); },
      () => check()
    );
    const u2 = onSnapshot(
      query(collection(db, "patientSessionPrices"), orderBy("date", "desc")),
      (s) => { setSessionPrices(s.docs.map((d) => ({ id: d.id, ...d.data() } as RawSessionPrice))); check(); },
      () => check()
    );
    const u3 = onSnapshot(
      query(collection(db, "patientPackages"), orderBy("createdAt", "desc")),
      (s) => { setPackages(s.docs.map((d) => ({ id: d.id, ...d.data() } as RawPackage))); check(); },
      () => check()
    );
    return () => { u1(); u2(); u3(); };
  }, []);

  // ── Filter by current period ─────────────────────────────────────────────
  const inPeriod = (date: string): boolean => {
    if (period === "day")   return isInDay(date, selectedDay);
    if (period === "week")  return isInWeek(date, selectedWeek[0], selectedWeek[1]);
    return isInMonth(date, selectedMonth);
  };

  const filteredEntries  = useMemo(() => billingEntries.filter((e) => inPeriod(e.date)),       [billingEntries, period, selectedDay, selectedWeek, selectedMonth]);
  const filteredSessions = useMemo(() => sessionPrices.filter((s) => inPeriod(s.date)),        [sessionPrices, period, selectedDay, selectedWeek, selectedMonth]);
  const filteredPackages = useMemo(() => packages.filter((p) => inPeriod(p.startDate)),        [packages, period, selectedDay, selectedWeek, selectedMonth]);

  // ── Aggregates ────────────────────────────────────────────────────────────
  const entryTotal    = filteredEntries.reduce((s, e) => s + e.amount, 0);
  const entryPaid     = filteredEntries.filter((e) => e.paid).reduce((s, e) => s + e.amount, 0);
  const sessionTotal  = filteredSessions.reduce((s, e) => s + e.amount, 0);
  const sessionPaid   = filteredSessions.filter((e) => e.paid).reduce((s, e) => s + e.amount, 0);
  const pkgTotal      = filteredPackages.reduce((s, p) => s + p.totalAmount, 0);
  const pkgPaid       = filteredPackages.reduce((s, p) => s + p.paidAmount, 0);
  const grandTotal    = entryTotal + sessionTotal + pkgTotal;
  const grandPaid     = entryPaid  + sessionPaid  + pkgPaid;
  const grandBalance  = grandTotal - grandPaid;

  // ── Weekly/Monthly trend for chart-like rows ──────────────────────────────
  // Group all-time session prices by month for a mini trend
  const monthlyRevenue = useMemo(() => {
    const map = new Map<string, { billed: number; collected: number }>();
    [...billingEntries, ...sessionPrices].forEach((e) => {
      const ym = (e.date || "").slice(0, 7);
      if (!ym) return;
      const cur = map.get(ym) ?? { billed: 0, collected: 0 };
      cur.billed    += e.amount;
      cur.collected += (e as { paid?: boolean }).paid ? e.amount : 0;
      map.set(ym, cur);
    });
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 6)
      .reverse();
  }, [billingEntries, sessionPrices]);

  const maxRevenue = Math.max(...monthlyRevenue.map((m) => m[1].billed), 1);

  // ── Period navigation ────────────────────────────────────────────────────
  const shiftDay = (n: number) => {
    const d = new Date(selectedDay + "T00:00:00");
    d.setDate(d.getDate() + n);
    setSelectedDay(toDateStr(d));
  };
  const shiftWeek = (n: number) => {
    const ws = new Date(selectedWeek[0] + "T00:00:00");
    ws.setDate(ws.getDate() + n * 7);
    const we = new Date(ws); we.setDate(ws.getDate() + 6);
    setSelectedWeek([toDateStr(ws), toDateStr(we)]);
  };
  const shiftMonth = (n: number) => {
    const [y, m] = selectedMonth.split("-").map(Number);
    const d = new Date(y, m - 1 + n, 1);
    setSelectedMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  };
  const shift = (n: number) => {
    if (period === "day")   shiftDay(n);
    if (period === "week")  shiftWeek(n);
    if (period === "month") shiftMonth(n);
  };

  const periodLabel = (): string => {
    if (period === "day")   return new Date(selectedDay + "T00:00:00").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
    if (period === "week")  return `${selectedWeek[0]} → ${selectedWeek[1]}`;
    return monthLabel(selectedMonth);
  };

  const isToday = period === "day" && selectedDay === today;

  const shimmer = { height: 80, borderRadius: 14, background: "linear-gradient(90deg,#f0ede8 0%,#e5e0d8 50%,#f0ede8 100%)", backgroundSize: "200% 100%", animation: "cbShimmer 1.4s ease infinite" };

  return (
    <>
      <style>{`
        .cb-root { font-family: 'Outfit', sans-serif; }
        .cb-page-header { margin-bottom: 24px; }
        .cb-page-title { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 500; color: #1a1a1a; letter-spacing: -0.02em; margin-bottom: 4px; }
        .cb-page-sub { font-size: 13px; color: #9a9590; }

        /* Period tabs */
        .cb-period-bar { display: flex; align-items: center; gap: 10px; margin-bottom: 20px; flex-wrap: wrap; }
        .cb-period-tabs { display: flex; background: #f5f3ef; border-radius: 11px; padding: 4px; gap: 2px; }
        .cb-period-tab {
          padding: 7px 18px; border-radius: 8px; border: none; cursor: pointer;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          color: #5a5550; background: transparent; transition: all 0.15s;
        }
        .cb-period-tab.active { background: #fff; color: #1a1a1a; font-weight: 600; box-shadow: 0 1px 6px rgba(0,0,0,0.08); }
        .cb-period-nav { display: flex; align-items: center; gap: 6px; margin-left: auto; }
        .cb-nav-btn {
          width: 32px; height: 32px; border-radius: 8px; border: 1.5px solid #e5e0d8; background: #fff;
          display: flex; align-items: center; justify-content: center;
          cursor: pointer; color: #5a5550; transition: all 0.15s; font-size: 15px;
        }
        .cb-nav-btn:hover { border-color: #2E8BC0; color: #2E8BC0; }
        .cb-period-label { font-size: 13px; font-weight: 600; color: #1a1a1a; min-width: 220px; text-align: center; }
        .cb-today-btn {
          padding: 6px 14px; border-radius: 8px; border: 1.5px solid #B3DEF0; background: #EAF5FC;
          font-family: 'Outfit', sans-serif; font-size: 12px; font-weight: 600; color: #2E8BC0;
          cursor: pointer; transition: all 0.15s; white-space: nowrap;
        }
        .cb-today-btn:hover { background: #D6EEF8; }

        /* KPI cards */
        .cb-kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px; margin-bottom: 20px; }
        @media (max-width: 900px) { .cb-kpi-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 480px) { .cb-kpi-grid { grid-template-columns: 1fr; } }
        .cb-kpi {
          background: #fff; border: 1.5px solid #e5e0d8; border-radius: 14px;
          padding: 16px 18px; position: relative; overflow: hidden;
        }
        .cb-kpi::before { content: ""; position: absolute; top: 0; left: 0; right: 0; height: 3px; }
        .cb-kpi.total::before   { background: #2E8BC0; }
        .cb-kpi.paid::before    { background: #52b788; }
        .cb-kpi.balance::before { background: #e07a5f; }
        .cb-kpi.sessions::before { background: #7c3aed; }
        .cb-kpi-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #c0bbb4; font-weight: 700; margin-bottom: 6px; }
        .cb-kpi-value { font-family: 'Playfair Display', serif; font-size: 28px; color: #1a1a1a; margin-bottom: 3px; }
        .cb-kpi-sub   { font-size: 11.5px; color: #9a9590; }

        /* Section tabs */
        .cb-section-tabs { display: flex; gap: 6px; margin-bottom: 18px; flex-wrap: wrap; }
        .cb-sec-tab {
          display: inline-flex; align-items: center; gap: 6px;
          padding: 8px 16px; border-radius: 100px; border: 1.5px solid #e5e0d8;
          font-family: 'Outfit', sans-serif; font-size: 13px; font-weight: 500;
          cursor: pointer; transition: all 0.15s; background: #fff; color: #5a5550;
        }
        .cb-sec-tab:hover { border-color: #2E8BC0; color: #2E8BC0; }
        .cb-sec-tab.active { background: #0C3C60; border-color: #0C3C60; color: #fff; }
        .cb-sec-count { font-size: 10px; font-weight: 700; background: rgba(255,255,255,0.2); padding: 1px 6px; border-radius: 100px; }
        .cb-sec-tab:not(.active) .cb-sec-count { background: #f0ede8; color: #5a5550; }

        /* Trend chart */
        .cb-trend-section { margin-bottom: 24px; }
        .cb-trend-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9a9590; margin-bottom: 12px; }
        .cb-trend-bars { display: flex; align-items: flex-end; gap: 8px; height: 80px; }
        .cb-trend-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 4px; }
        .cb-trend-bar-wrap { flex: 1; width: 100%; display: flex; align-items: flex-end; }
        .cb-trend-bar { width: 100%; border-radius: 5px 5px 0 0; transition: height 0.5s cubic-bezier(0.34,1.2,0.64,1); position: relative; min-height: 3px; }
        .cb-trend-bar-inner { position: absolute; bottom: 0; left: 0; right: 0; border-radius: 5px 5px 0 0; opacity: 0.5; }
        .cb-trend-label { font-size: 10px; color: #9a9590; white-space: nowrap; }
        .cb-trend-amount { font-size: 10px; font-weight: 700; color: #1a1a1a; }
        .cb-trend-line { width: 100%; height: 1px; background: #e5e0d8; margin-bottom: 4px; }

        /* Tables */
        .cb-table-wrap { overflow-x: auto; border-radius: 14px; border: 1.5px solid #e5e0d8; }
        .cb-table { width: 100%; border-collapse: collapse; font-family: 'Outfit', sans-serif; }
        .cb-table th { background: #f5f3ef; padding: 11px 14px; font-size: 10.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #9a9590; border-bottom: 1.5px solid #e5e0d8; text-align: left; white-space: nowrap; }
        .cb-table td { padding: 12px 14px; border-bottom: 1px solid #f0ede8; font-size: 13.5px; color: #1a1a1a; vertical-align: middle; }
        .cb-table tr:last-child td { border-bottom: none; }
        .cb-table tr:hover td { background: #fafaf8; }
        .cb-table tfoot td { border-top: 2px solid #e5e0d8; font-weight: 700; color: #1a1a1a; }
        .cb-amount { font-family: 'Playfair Display', serif; font-size: 15px; font-weight: 600; white-space: nowrap; }
        .cb-paid-pill { display: inline-flex; align-items: center; gap: 3px; font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 100px; white-space: nowrap; }
        .cb-paid-pill.paid   { background: #d8f3dc; color: #1b4332; }
        .cb-paid-pill.unpaid { background: #fee2e2; color: #991b1b; }
        .cb-empty { text-align: center; padding: 48px 20px; color: #c0bbb4; font-size: 14px; }
        .cb-edit-btn { display: inline-flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 8px; border: 1.5px solid #e8e3dc; background: #fff; font-size: 12px; font-weight: 500; color: #5a5550; cursor: pointer; font-family: inherit; white-space: nowrap; }
        .cb-edit-btn:hover { border-color: #1a3a2a; color: #1a3a2a; background: #f5f3ef; }

        /* Package cards */
        .cb-pkg-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 10px; }
        .cb-pkg-card { background: #fff; border: 1.5px solid #e5e0d8; border-radius: 14px; padding: 16px; border-top: 3px solid #7c3aed; }
        .cb-pkg-size { font-family: 'Playfair Display', serif; font-size: 20px; margin-bottom: 8px; }
        .cb-pkg-size span { font-size: 13px; font-family: 'Outfit', sans-serif; color: #9a9590; }
        .cb-pkg-row { display: flex; justify-content: space-between; font-size: 13px; color: #5a5550; margin-bottom: 4px; }
        .cb-pkg-row strong { color: #1a1a1a; }

        /* Summary breakdown */
        .cb-breakdown { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-bottom: 20px; }
        @media (max-width: 640px) { .cb-breakdown { grid-template-columns: 1fr; } }
        .cb-breakdown-card { background: #fff; border: 1.5px solid #e5e0d8; border-radius: 12px; padding: 14px 16px; }
        .cb-breakdown-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.1em; color: #c0bbb4; font-weight: 700; margin-bottom: 6px; }
        .cb-breakdown-row { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: #5a5550; margin-bottom: 3px; }
        .cb-breakdown-row strong { font-family: 'Playfair Display', serif; font-size: 15px; color: #1a1a1a; }
        .cb-collection-rate { font-size: 22px; font-family: 'Playfair Display', serif; color: #1b4332; margin-top: 2px; }

        @keyframes cbShimmer { to { background-position: -200% 0; } }
      `}</style>

      <div className="cb-root">
        <div className="cb-page-header">
          <div className="cb-page-title">Clinic Billing</div>
          <div className="cb-page-sub">Complete financial overview — all billing entries, session charges and packages</div>
        </div>

        {/* Period selector */}
        <div className="cb-period-bar">
          <div className="cb-period-tabs">
            {(["day", "week", "month"] as const).map((p) => (
              <button key={p} className={`cb-period-tab ${period === p ? "active" : ""}`} onClick={() => setPeriod(p)}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
          <div className="cb-period-nav">
            <button className="cb-nav-btn" onClick={() => shift(-1)}>‹</button>
            <div className="cb-period-label">{periodLabel()}</div>
            <button className="cb-nav-btn" onClick={() => shift(1)}>›</button>
          </div>
          {!isToday && period === "day" && (
            <button className="cb-today-btn" onClick={() => setSelectedDay(today)}>Today</button>
          )}
          {period === "week" && selectedWeek[0] !== weekStart && (
            <button className="cb-today-btn" onClick={() => setSelectedWeek([weekStart, weekEnd])}>This Week</button>
          )}
          {period === "month" && selectedMonth !== thisMonth && (
            <button className="cb-today-btn" onClick={() => setSelectedMonth(thisMonth)}>This Month</button>
          )}
        </div>

        {loading ? (
          <>
            <div style={{ ...shimmer, marginBottom: 10 }} />
            <div style={{ ...shimmer, marginBottom: 10 }} />
            <div style={shimmer} />
          </>
        ) : (
          <>
            {/* KPI cards */}
            <div className="cb-kpi-grid">
              <div className="cb-kpi total">
                <div className="cb-kpi-label">Total Billed</div>
                <div className="cb-kpi-value">{fmt(grandTotal)}</div>
                <div className="cb-kpi-sub">{filteredEntries.length + filteredSessions.length} charges · {filteredPackages.length} pkg{filteredPackages.length !== 1 ? "s" : ""}</div>
              </div>
              <div className="cb-kpi paid">
                <div className="cb-kpi-label">Collected</div>
                <div className="cb-kpi-value" style={{ color: "#1b4332" }}>{fmt(grandPaid)}</div>
                <div className="cb-kpi-sub">
                  {grandTotal > 0 ? `${Math.round((grandPaid / grandTotal) * 100)}% collection rate` : "No charges"}
                </div>
              </div>
              <div className="cb-kpi balance">
                <div className="cb-kpi-label">Outstanding</div>
                <div className="cb-kpi-value" style={{ color: grandBalance > 0 ? "#b91c1c" : "#1b4332" }}>{fmt(grandBalance)}</div>
                <div className="cb-kpi-sub">{(filteredEntries.filter((e) => !e.paid).length + filteredSessions.filter((s) => !s.paid).length)} unpaid items</div>
              </div>
              <div className="cb-kpi sessions">
                <div className="cb-kpi-label">Sessions Done</div>
                <div className="cb-kpi-value">{filteredSessions.length}</div>
                <div className="cb-kpi-sub">{fmt(sessionTotal)} billed · {fmt(sessionPaid)} paid</div>
              </div>
            </div>

            {/* Breakdown by source */}
            <div className="cb-breakdown">
              <div className="cb-breakdown-card">
                <div className="cb-breakdown-label">Billing Entries</div>
                <div className="cb-breakdown-row"><span>Billed</span><strong>{fmt(entryTotal)}</strong></div>
                <div className="cb-breakdown-row"><span>Paid</span><strong style={{ color: "#1b4332" }}>{fmt(entryPaid)}</strong></div>
                <div className="cb-breakdown-row"><span>Owed</span><strong style={{ color: entryTotal - entryPaid > 0 ? "#b91c1c" : "#1b4332" }}>{fmt(entryTotal - entryPaid)}</strong></div>
              </div>
              <div className="cb-breakdown-card">
                <div className="cb-breakdown-label">Session Charges</div>
                <div className="cb-breakdown-row"><span>Billed</span><strong>{fmt(sessionTotal)}</strong></div>
                <div className="cb-breakdown-row"><span>Paid</span><strong style={{ color: "#1b4332" }}>{fmt(sessionPaid)}</strong></div>
                <div className="cb-breakdown-row"><span>Owed</span><strong style={{ color: sessionTotal - sessionPaid > 0 ? "#b91c1c" : "#1b4332" }}>{fmt(sessionTotal - sessionPaid)}</strong></div>
              </div>
              <div className="cb-breakdown-card">
                <div className="cb-breakdown-label">Packages</div>
                <div className="cb-breakdown-row"><span>Total Value</span><strong>{fmt(pkgTotal)}</strong></div>
                <div className="cb-breakdown-row"><span>Collected</span><strong style={{ color: "#1b4332" }}>{fmt(pkgPaid)}</strong></div>
                <div className="cb-breakdown-row"><span>Remaining</span><strong style={{ color: pkgTotal - pkgPaid > 0 ? "#b91c1c" : "#1b4332" }}>{fmt(pkgTotal - pkgPaid)}</strong></div>
              </div>
            </div>

            {/* Monthly trend (always shown, not filtered by period) */}
            {monthlyRevenue.length > 0 && (
              <div className="cb-trend-section">
                <div className="cb-trend-title">Monthly Revenue Trend</div>
                <div className="cb-trend-bars">
                  {monthlyRevenue.map(([ym, data]) => {
                    const pct     = (data.billed / maxRevenue) * 100;
                    const paidPct = (data.collected / data.billed) * 100;
                    return (
                      <div key={ym} className="cb-trend-col">
                        <div className="cb-trend-amount">{data.billed >= 1000 ? `${(data.billed / 1000).toFixed(1)}k` : fmt(data.billed)}</div>
                        <div className="cb-trend-bar-wrap">
                          <div className="cb-trend-bar" style={{ height: `${pct}%`, background: "#2E8BC0", width: "100%", borderRadius: "5px 5px 0 0", position: "relative" }}>
                            <div className="cb-trend-bar-inner" style={{ height: `${paidPct}%`, background: "#52b788" }} />
                          </div>
                        </div>
                        <div className="cb-trend-label">{ym.slice(5)}/{ym.slice(2, 4)}</div>
                      </div>
                    );
                  })}
                </div>
                <div className="cb-trend-line" />
                <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#9a9590" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "#2E8BC0", display: "inline-block" }} /> Billed
                  </span>
                  <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 11, color: "#9a9590" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "#52b788", display: "inline-block" }} /> Collected
                  </span>
                </div>
              </div>
            )}

            {/* Section tabs */}
            <div className="cb-section-tabs">
              {[
                { id: "overview",  label: "Overview" },
                { id: "entries",   label: "Billing Entries",  count: filteredEntries.length },
                { id: "sessions",  label: "Session Charges",  count: filteredSessions.length },
                { id: "packages",  label: "Packages",         count: filteredPackages.length },
              ].map((s) => (
                <button
                  key={s.id}
                  className={`cb-sec-tab ${activeSection === s.id ? "active" : ""}`}
                  onClick={() => setActiveSection(s.id as typeof activeSection)}
                >
                  {s.label}
                  {"count" in s && <span className="cb-sec-count">{s.count}</span>}
                </button>
              ))}
            </div>

            {/* ── Overview section ── */}
            {activeSection === "overview" && (
              <div style={{ display: "grid", gap: 16 }}>
                {/* Top unpaid entries */}
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#9a9590", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 10 }}>Unpaid This Period</div>
                  {filteredEntries.filter((e) => !e.paid).length + filteredSessions.filter((s) => !s.paid).length === 0 ? (
                    <div className="cb-empty" style={{ padding: "24px 20px" }}>✓ All charges collected for this period</div>
                  ) : (
                    <div className="cb-table-wrap">
                      <table className="cb-table">
                        <thead>
                          <tr><th>Date</th><th>Type</th><th>Description</th><th>Amount</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {filteredEntries.filter((e) => !e.paid).map((e) => (
                            <tr key={e.id}>
                              <td style={{ color: "#5a5550", whiteSpace: "nowrap" }}>{e.date}</td>
                              <td><span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: "#EAF5FC", color: "#2E8BC0" }}>Entry</span></td>
                              <td>{e.description}</td>
                              <td><span className="cb-amount">{fmt(e.amount)}</span></td>
                              <td><span className="cb-paid-pill unpaid">Unpaid</span></td>
                            </tr>
                          ))}
                          {filteredSessions.filter((s) => !s.paid).map((s) => (
                            <tr key={s.id}>
                              <td style={{ color: "#5a5550", whiteSpace: "nowrap" }}>{s.date}</td>
                              <td><span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 100, background: "#ede9fe", color: "#4c1d95" }}>Session</span></td>
                              <td>{s.sessionType || "Session"}{s.physioName ? ` · ${s.physioName}` : ""}</td>
                              <td><span className="cb-amount">{fmt(s.amount)}</span></td>
                              <td><span className="cb-paid-pill unpaid">Unpaid</span></td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr>
                            <td colSpan={3}>Total Outstanding</td>
                            <td><span className="cb-amount" style={{ color: "#b91c1c" }}>{fmt(grandBalance)}</span></td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ── Billing Entries section ── */}
            {activeSection === "entries" && (
              filteredEntries.length === 0 ? (
                <div className="cb-empty">No billing entries for this period.</div>
              ) : (
                <div className="cb-table-wrap">
                  <table className="cb-table">
                    <thead>
                      <tr><th>Date</th><th>Description</th><th>Amount</th><th>Status</th><th>Paid On</th><th>Notes</th></tr>
                    </thead>
                    <tbody>
                      {filteredEntries.map((e) => (
                        <tr key={e.id}>
                          <td style={{ whiteSpace: "nowrap", color: "#5a5550" }}>{e.date}</td>
                          <td style={{ fontWeight: 500 }}>{e.description}</td>
                          <td><span className="cb-amount">{fmt(e.amount)}</span></td>
                          <td><span className={`cb-paid-pill ${e.paid ? "paid" : "unpaid"}`}>{e.paid ? "✓ Paid" : "Unpaid"}</span></td>
                          <td style={{ color: "#9a9590", fontSize: 12 }}>{e.paidDate || "—"}</td>
                          <td style={{ color: "#9a9590", fontSize: 12 }}>{e.notes || "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={2}>Total</td>
                        <td><span className="cb-amount">{fmt(entryTotal)}</span></td>
                        <td><span style={{ fontSize: 12, color: "#1b4332" }}>{fmt(entryPaid)} paid</span></td>
                        <td><span style={{ fontSize: 12, color: entryTotal - entryPaid > 0 ? "#b91c1c" : "#1b4332" }}>{entryTotal - entryPaid > 0 ? `${fmt(entryTotal - entryPaid)} due` : "✓ Settled"}</span></td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            )}

            {/* ── Session Charges section ── */}
            {activeSection === "sessions" && (
              filteredSessions.length === 0 ? (
                <div className="cb-empty">No session charges for this period.</div>
              ) : (
                <div className="cb-table-wrap">
                  <table className="cb-table">
                    <thead>
                      <tr><th>Date</th><th>Session Type</th><th>Physiotherapist</th><th>Amount</th><th>Status</th><th>Package</th><th>Notes</th><th></th></tr>
                    </thead>
                    <tbody>
                      {filteredSessions.map((s) => (
                        <tr key={s.id}>
                          <td style={{ whiteSpace: "nowrap", color: "#5a5550" }}>{s.date}</td>
                          <td style={{ fontWeight: 500 }}>{s.sessionType || "Session"}</td>
                          <td style={{ color: "#5a5550" }}>{s.physioName || "—"}</td>
                          <td><span className="cb-amount">{fmt(s.amount)}</span></td>
                          <td><span className={`cb-paid-pill ${s.paid ? "paid" : "unpaid"}`}>{s.paid ? "✓ Paid" : "Unpaid"}</span></td>
                          <td>{s.packageId ? <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 100, background: "#ede9fe", color: "#4c1d95" }}>Pkg</span> : <span style={{ color: "#c0bbb4" }}>—</span>}</td>
                          <td style={{ color: "#9a9590", fontSize: 12 }}>{s.notes || "—"}</td>
                          <td><button className="cb-edit-btn" onClick={() => openEditSession(s)}><Pencil size={12} strokeWidth={2} /> Edit</button></td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={3}>Total</td>
                        <td><span className="cb-amount">{fmt(sessionTotal)}</span></td>
                        <td><span style={{ fontSize: 12, color: "#1b4332" }}>{fmt(sessionPaid)} paid</span></td>
                        <td><span style={{ fontSize: 12, color: sessionTotal - sessionPaid > 0 ? "#b91c1c" : "#1b4332" }}>{sessionTotal - sessionPaid > 0 ? `${fmt(sessionTotal - sessionPaid)} due` : "✓ Settled"}</span></td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )
            )}

            {/* ── Packages section ── */}
            {activeSection === "packages" && (
              filteredPackages.length === 0 ? (
                <div className="cb-empty">No packages started in this period.</div>
              ) : (
                <div className="cb-pkg-grid">
                  {filteredPackages.map((p) => {
                    const remaining = p.packageSize - p.sessionsUsed;
                    const balance   = p.totalAmount - p.paidAmount;
                    return (
                      <div key={p.id} className="cb-pkg-card">
                        <div className="cb-pkg-size">{p.packageSize} <span>sessions</span></div>
                        <div className="cb-pkg-row"><span>Per session</span><strong>{fmt(p.pricePerSession)}</strong></div>
                        <div className="cb-pkg-row"><span>Total value</span><strong>{fmt(p.totalAmount)}</strong></div>
                        <div className="cb-pkg-row"><span>Paid</span><strong style={{ color: "#1b4332" }}>{fmt(p.paidAmount)}</strong></div>
                        <div className="cb-pkg-row"><span>Balance</span><strong style={{ color: balance > 0 ? "#b91c1c" : "#1b4332" }}>{fmt(balance)}</strong></div>
                        <div style={{ borderTop: "1px solid #f0ede8", marginTop: 8, paddingTop: 8 }}>
                          <div className="cb-pkg-row"><span>Sessions used</span><strong>{p.sessionsUsed} / {p.packageSize}</strong></div>
                          <div className="cb-pkg-row"><span>Remaining</span><strong>{remaining}</strong></div>
                          <div className="cb-pkg-row"><span>Started</span><strong>{p.startDate}</strong></div>
                          <div className="cb-pkg-row"><span>Status</span>
                            <strong style={{ color: p.active ? "#1b4332" : "#9a9590" }}>{p.active ? "Active" : "Completed"}</strong>
                          </div>
                        </div>
                        {p.notes && <div style={{ fontSize: 12, color: "#9a9590", marginTop: 8 }}>{p.notes}</div>}
                      </div>
                    );
                  })}
                </div>
              )
            )}
          </>
        )}
      </div>

      {/* ── Session Charge Edit Modal ── */}
      {editingSession && createPortal(
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center" }}
          onClick={(e) => { if (e.target === e.currentTarget && !editSessionSaving) setEditingSession(null); }}>
          <div style={{ background: "#fff", borderRadius: 18, padding: "28px 28px 22px", width: "100%", maxWidth: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.18)", fontFamily: "'Outfit',sans-serif" }}
            onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 4, color: "#1a1a1a" }}>Edit Session Charge</div>
            <div style={{ fontSize: 13, color: "#9a9590", marginBottom: 20 }}>{editingSession.date}</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 5 }}>Session Type</label>
                <input style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #e8e3dc", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                  value={editSessionForm.sessionType} onChange={(e) => setEditSessionForm({ ...editSessionForm, sessionType: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 5 }}>Physiotherapist</label>
                <input style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #e8e3dc", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                  value={editSessionForm.physioName} onChange={(e) => setEditSessionForm({ ...editSessionForm, physioName: e.target.value })} />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 5 }}>Date</label>
                <input type="date" style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #e8e3dc", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                  value={editSessionForm.date} onChange={(e) => setEditSessionForm({ ...editSessionForm, date: e.target.value })} />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 5 }}>Amount</label>
                <input type="number" min="0" step="0.01" style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #e8e3dc", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                  value={editSessionForm.amount} onChange={(e) => setEditSessionForm({ ...editSessionForm, amount: e.target.value })} />
              </div>
            </div>
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 5 }}>Notes</label>
              <input style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #e8e3dc", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                value={editSessionForm.notes} onChange={(e) => setEditSessionForm({ ...editSessionForm, notes: e.target.value })} />
            </div>
            <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}
              onClick={() => setEditSessionForm({ ...editSessionForm, paid: !editSessionForm.paid, paidDate: !editSessionForm.paid ? (editSessionForm.paidDate || new Date().toISOString().slice(0,10)) : "" })}>
              <input type="checkbox" checked={editSessionForm.paid} readOnly style={{ width: 16, height: 16, cursor: "pointer" }} />
              <span style={{ fontSize: 14, color: "#1a1a1a" }}>Mark as Paid</span>
            </div>
            {editSessionForm.paid && (
              <div style={{ marginBottom: 14 }}>
                <label style={{ fontSize: 12, fontWeight: 500, color: "#5a5550", display: "block", marginBottom: 5 }}>Paid On</label>
                <input type="date" style={{ width: "100%", padding: "9px 12px", borderRadius: 10, border: "1.5px solid #e8e3dc", fontSize: 14, outline: "none", fontFamily: "inherit", boxSizing: "border-box" }}
                  value={editSessionForm.paidDate} onChange={(e) => setEditSessionForm({ ...editSessionForm, paidDate: e.target.value })} />
              </div>
            )}
            {editSessionError && <div style={{ background: "#fef2f2", color: "#b91c1c", borderRadius: 8, padding: "8px 12px", fontSize: 13, marginBottom: 14 }}>{editSessionError}</div>}
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
              <button style={{ padding: "9px 20px", borderRadius: 10, border: "1.5px solid #e8e3dc", background: "transparent", fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}
                onClick={() => setEditingSession(null)}>Cancel</button>
              <button style={{ padding: "9px 20px", borderRadius: 10, border: "none", background: "#1a3a2a", color: "#fff", fontSize: 14, fontWeight: 600, cursor: editSessionSaving ? "not-allowed" : "pointer", opacity: editSessionSaving ? 0.7 : 1, fontFamily: "inherit" }}
                disabled={editSessionSaving} onClick={handleSaveEditSession}>{editSessionSaving ? "Saving…" : "Save Changes"}</button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
