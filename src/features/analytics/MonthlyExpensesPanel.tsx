// FILE: src/features/analytics/MonthlyExpensesPanel.tsx
// Business Analytics → Monthly Expenses. The owner enters the total PAID per
// category per month (mirroring their spreadsheet). Empty = not entered;
// 0 = verified zero. Saved values are never overwritten without an explicit
// confirmation, and every change keeps the previous value in the record's history.

import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Download, Upload, Settings2, X, Info, AlertTriangle } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";
import {
  saveExpenseChanges, saveBusinessSettings, deleteLegacyExpense,
  type MonthlyExpense, type ExpenseCategory, type ExpenseChange, type BusinessSettings, type LegacyExpense,
} from "../../services/businessService";
import { monthCoverage, expensesForRange, lastMonths, type ACategory } from "./metrics";
import { buildTemplate, parseCsv, validateImport, type ImportRow } from "./expenseCsv";

const egp = (n: number) => `${Math.round(n).toLocaleString("en-US")} EGP`;
const fmtMonthLong = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" });
const fmtMonthShort = (ym: string) => new Date(ym + "-01T00:00:00").toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
const shiftMonth = (ym: string, n: number) => {
  const [y, m] = ym.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};
const monthRangeOf = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return { from: `${ym}-01`, to: `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}` };
};
const parseInput = (v: string): number | null | "invalid" => {
  const t = v.replace(/[,\s]/g, "");
  if (t === "") return null;
  return /^\d+(\.\d+)?$/.test(t) ? Number(t) : "invalid";
};

interface Props {
  entries: MonthlyExpense[];
  legacy: LegacyExpense[];
  settings: BusinessSettings;
  today: string;
}

export default function MonthlyExpensesPanel({ entries, legacy, settings, today }: Props) {
  const { user } = useAuth();
  const uid = user?.uid ?? "";
  const currentMonth = today.slice(0, 7);
  const cats = settings.expenseCategories;
  const [month, setMonth] = useState(currentMonth);
  const [formVersion, setFormVersion] = useState(0);
  const [showCats, setShowCats] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3500); };

  const months6 = lastMonths(today, 6);
  const monthOptions = lastMonths(today, 36).reverse();

  const downloadTemplate = () => {
    const blob = new Blob([buildTemplate(cats, months6)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "physio-plus-monthly-expenses-template.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  };
  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    setImportRows(validateImport(parseCsv(text), cats, entries, currentMonth));
  };

  return (
    <div className="ba-stack">
      <style>{CSS}</style>
      <div className="ba-banner"><Info size={15} />
        <div>Enter the total <b>paid</b> in each category for each month. Leave a box empty if you haven't entered it yet. Type 0 only when you really paid nothing. These are cash amounts paid, not accrual accounting or depreciation; equipment purchases are kept separate from operating costs.</div>
      </div>

      {legacy.length > 0 && <LegacyNotice legacy={legacy} />}

      <div className="me-toolbar">
        <div className="me-monthnav">
          <button className="ba-btn ghost ba-btn-sm" onClick={() => setMonth(shiftMonth(month, -1))} aria-label="Previous month"><ChevronLeft size={15} /></button>
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {monthOptions.map((m) => <option key={m} value={m}>{fmtMonthLong(m)}</option>)}
          </select>
          <button className="ba-btn ghost ba-btn-sm" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= currentMonth} aria-label="Next month"><ChevronRight size={15} /></button>
        </div>
        <div className="me-actions">
          <button className="ba-btn ghost" onClick={downloadTemplate}><Download size={14} /> CSV template</button>
          <label className="ba-btn ghost me-file"><Upload size={14} /> Import CSV
            <input type="file" accept=".csv,text/csv" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <button className="ba-btn ghost" onClick={() => setShowCats(true)}><Settings2 size={14} /> Categories</button>
        </div>
      </div>

      <MonthForm key={`${month}#${formVersion}`} month={month} entries={entries} cats={cats} uid={uid}
        onSaved={flash} />

      <Overview months={months6} entries={entries} cats={cats} onPick={setMonth} selected={month} />

      {showCats && <CategoriesModal settings={settings} entries={entries} onClose={() => setShowCats(false)} />}
      {importRows && <ImportModal rows={importRows} cats={cats} entries={entries} uid={uid}
        onClose={() => setImportRows(null)} onDone={(msg) => { setImportRows(null); setFormVersion((v) => v + 1); flash(msg); }} />}
      {toast && <div className="me-toast">{toast}</div>}
    </div>
  );
}

// ─── Month form ───────────────────────────────────────────────────────────────

function MonthForm({ month, entries, cats, uid, onSaved }: {
  month: string; entries: MonthlyExpense[]; cats: ExpenseCategory[]; uid: string; onSaved: (msg: string) => void;
}) {
  const saved = useMemo(() => new Map(entries.filter((e) => e.month === month).map((e) => [e.categoryId, e] as const)), [entries, month]);
  const prevMonth = shiftMonth(month, -1);
  const prev = new Map(entries.filter((e) => e.month === prevMonth).map((e) => [e.categoryId, e.amount] as const));
  // Active categories, plus inactive ones that already hold a value this month.
  const rows = cats.filter((c) => c.active || saved.has(c.id));
  // Only the user's unsaved edits live in state; everything else is read straight from
  // the live saved records, so the form can never show stale values.
  const [edits, setEdits] = useState<Record<string, { amount?: string; notes?: string }>>({});
  const draft: Record<string, { amount: string; notes: string }> = Object.fromEntries(rows.map((c) => [c.id, {
    amount: edits[c.id]?.amount ?? (saved.has(c.id) ? String(saved.get(c.id)!.amount) : ""),
    notes:  edits[c.id]?.notes  ?? saved.get(c.id)?.notes ?? "",
  }]));
  const setField = (id: string, field: "amount" | "notes", value: string) => setEdits({ ...edits, [id]: { ...edits[id], [field]: value } });
  const [confirm, setConfirm] = useState<ExpenseChange[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const parsed = rows.map((c) => ({ c, v: parseInput(draft[c.id]?.amount ?? ""), notes: draft[c.id]?.notes ?? "", s: saved.get(c.id) }));
  const invalid = parsed.filter((p) => p.v === "invalid").map((p) => p.c.label);
  const changes: ExpenseChange[] = parsed.flatMap(({ c, v, notes, s }): ExpenseChange[] => {
    if (v === "invalid") return [];
    if (v === null) return s ? [{ month, categoryId: c.id, amount: null, notes: "", expectedUpdatedAtMs: s.updatedAt?.toMillis?.() ?? null }] : [];
    if (s && s.amount === v && s.notes === notes.trim()) return [];
    return [{ month, categoryId: c.id, amount: v, notes, expectedUpdatedAtMs: s ? s.updatedAt?.toMillis?.() ?? null : null }];
  });
  const touchesSaved = changes.some((ch) => saved.has(ch.categoryId));

  const cov = monthCoverage(entries, cats as ACategory[], month);
  const savedPeriod = expensesForRange(entries, cats as ACategory[], monthRangeOf(month));
  const prevPeriod = expensesForRange(entries, cats as ACategory[], monthRangeOf(prevMonth));
  const prevCov = monthCoverage(entries, cats as ACategory[], prevMonth);

  const doSave = async (list: ExpenseChange[]) => {
    setBusy(true); setErr(null);
    const r = await saveExpenseChanges(list, uid);
    setBusy(false); setConfirm(null);
    if (r.error) { setErr(r.error); return; }
    onSaved(`Saved ${fmtMonthLong(month)} (${list.length} change${list.length === 1 ? "" : "s"})`);
  };
  const onSave = () => {
    if (invalid.length) { setErr(`Fix the amount for: ${invalid.join(", ")}`); return; }
    if (!changes.length) return;
    if (touchesSaved) setConfirm(changes); else doSave(changes);
  };

  return (
    <div className="ba-card">
      <div className="me-head">
        <div>
          <div className="ba-card-title">{fmtMonthLong(month)}</div>
          <span className={`me-cov ${cov.complete ? "ok" : cov.entered ? "part" : "none"}`}>
            {cov.complete ? "✓ " : ""}Expenses entered for {fmtMonthLong(month)}: {cov.entered} of {cov.required} categories
          </span>
        </div>
        <div className="me-totals">
          <div><span>Operating{savedPeriod.anyEntered && !cov.complete ? " (incomplete)" : ""}</span><b>{savedPeriod.anyEntered ? egp(savedPeriod.operating) : "Not entered"}</b></div>
          <div><span>Capital (equipment)</span><b>{savedPeriod.anyEntered ? egp(savedPeriod.capital) : "—"}</b></div>
          <div><span>vs {fmtMonthShort(prevMonth)} operating</span>
            <b>{!prevCov.complete || !cov.complete ? <span className="ba-muted">needs both months complete</span>
              : `${savedPeriod.operating - prevPeriod.operating >= 0 ? "+" : ""}${egp(savedPeriod.operating - prevPeriod.operating)}`}</b></div>
        </div>
      </div>

      <div className="ba-table-wrap">
        <table className="ba-table me-table">
          <thead><tr><th>Category</th><th className="r">Amount paid (EGP)</th><th>Notes</th><th className="r">{fmtMonthShort(prevMonth)}</th><th className="r">Change</th></tr></thead>
          <tbody>
            {parsed.map(({ c, v, s }) => {
              const p = prev.get(c.id);
              const cur = typeof v === "number" ? v : null;
              const dirty = (s ? String(s.amount) : "") !== (draft[c.id]?.amount ?? "").replace(/[,\s]/g, "") || (s?.notes ?? "") !== (draft[c.id]?.notes ?? "").trim();
              return (
                <tr key={c.id} className={dirty ? "me-dirty" : ""}>
                  <td>
                    {c.label}
                    {c.kind === "capital" && <span className="me-tag">Capital</span>}
                    {!c.active && <span className="me-tag off">Inactive</span>}
                    {s && s.history.length > 0 && <div className="ba-muted" title={s.history.map((h) => `${egp(h.amount)} until ${new Date(h.changedAt).toLocaleDateString("en-GB")}`).join("\n")}>Edited {s.history.length}× · was {egp(s.history[s.history.length - 1].amount)}</div>}
                  </td>
                  <td className="r">
                    <input className={`me-amt ${v === "invalid" ? "bad" : ""}`} inputMode="decimal" placeholder="Not entered"
                      value={draft[c.id]?.amount ?? ""} onChange={(e) => setField(c.id, "amount", e.target.value)} />
                  </td>
                  <td><input className="me-notes" placeholder="Optional" value={draft[c.id]?.notes ?? ""} onChange={(e) => setField(c.id, "notes", e.target.value)} /></td>
                  <td className="r">{p === undefined ? <span className="ba-muted">—</span> : egp(p)}</td>
                  <td className="r">{p === undefined || cur === null ? <span className="ba-muted">—</span> : <span className={cur > p ? "me-up" : cur < p ? "me-down" : ""}>{cur - p >= 0 ? "+" : ""}{egp(cur - p)}</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {err && <div className="ba-err">{err}</div>}
      <div className="me-savebar">
        <span className="ba-muted">{changes.length ? `${changes.length} unsaved change${changes.length === 1 ? "" : "s"}` : "No unsaved changes"}</span>
        <button className="ba-btn" onClick={onSave} disabled={busy || !changes.length}>{busy ? "Saving…" : `Save ${fmtMonthShort(month)}`}</button>
      </div>

      {confirm && createPortal(
        <div className="ba-overlay" onClick={() => !busy && setConfirm(null)}>
          <div className="ba-modal" onClick={(e) => e.stopPropagation()}>
            <div className="ba-modal-head"><b>Change saved values for {fmtMonthLong(month)}?</b><button className="ba-x" onClick={() => setConfirm(null)}><X size={16} /></button></div>
            <p className="ba-modal-note">Previous values are kept in each record's history.</p>
            <table className="ba-table"><tbody>
              {confirm.map((ch) => {
                const s = saved.get(ch.categoryId);
                const label = cats.find((c) => c.id === ch.categoryId)?.label ?? ch.categoryId;
                return <tr key={ch.categoryId}><td>{label}</td>
                  <td className="r">{s ? egp(s.amount) : <span className="ba-muted">not entered</span>}</td><td>→</td>
                  <td className="r"><b>{ch.amount === null ? "Not entered" : egp(ch.amount)}</b></td></tr>;
              })}
            </tbody></table>
            <div className="ba-modal-actions">
              <button className="ba-btn ghost" onClick={() => setConfirm(null)} disabled={busy}>Cancel</button>
              <button className="ba-btn" onClick={() => doSave(confirm)} disabled={busy}>{busy ? "Saving…" : "Confirm changes"}</button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
}

// ─── 6-month overview ─────────────────────────────────────────────────────────

function Overview({ months, entries, cats, onPick, selected }: { months: string[]; entries: MonthlyExpense[]; cats: ExpenseCategory[]; onPick: (m: string) => void; selected: string }) {
  const val = new Map(entries.map((e) => [`${e.month}__${e.categoryId}`, e.amount] as const));
  const rows = cats.filter((c) => c.active || months.some((m) => val.has(`${m}__${c.id}`)));
  return (
    <div className="ba-card wide">
      <div className="ba-card-title">Last 6 months</div>
      <div className="ba-card-help">"—" means not entered. Click a month to edit it.</div>
      <div className="ba-table-wrap">
        <table className="ba-table me-grid">
          <thead><tr><th>Category</th>{months.map((m) => <th key={m} className={`r ${m === selected ? "sel" : ""}`}><button className="ba-link" onClick={() => onPick(m)}>{fmtMonthShort(m)}</button></th>)}</tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id}><td>{c.label}{c.kind === "capital" && <span className="me-tag">Capital</span>}</td>
                {months.map((m) => { const v = val.get(`${m}__${c.id}`); return <td key={m} className={`r ${v === undefined ? "me-missing" : ""}`}>{v === undefined ? "—" : Math.round(v).toLocaleString("en-US")}</td>; })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr><td>Operating total</td>{months.map((m) => { const p = expensesForRange(entries, cats as ACategory[], monthRangeOf(m)); return <td key={m} className="r">{p.anyEntered ? Math.round(p.operating).toLocaleString("en-US") : "—"}</td>; })}</tr>
            <tr><td>Coverage</td>{months.map((m) => { const c = monthCoverage(entries, cats as ACategory[], m); return <td key={m} className={`r ${c.complete ? "me-ok" : "me-missing"}`}>{c.entered}/{c.required}</td>; })}</tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

// ─── Categories ───────────────────────────────────────────────────────────────

function CategoriesModal({ settings, entries, onClose }: { settings: BusinessSettings; entries: MonthlyExpense[]; onClose: () => void }) {
  const [list, setList] = useState<ExpenseCategory[]>(settings.expenseCategories);
  const [newLabel, setNewLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const used = new Set(entries.map((e) => e.categoryId));
  const add = () => {
    const label = newLabel.trim();
    if (!label) return;
    let id = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "category";
    while (list.some((c) => c.id === id)) id += "_x";
    setList([...list, { id, label, kind: "operating", active: true }]); setNewLabel("");
  };
  const save = async () => {
    if (list.some((c) => !c.label.trim())) { setErr("Every category needs a name."); return; }
    setBusy(true); setErr(null);
    const r = await saveBusinessSettings({ ...settings, expenseCategories: list.map((c) => ({ ...c, label: c.label.trim() })) });
    setBusy(false);
    if (r.error) setErr(r.error); else onClose();
  };
  return createPortal(
    <div className="ba-overlay" onClick={onClose}>
      <div className="ba-modal" onClick={(e) => e.stopPropagation()}>
        <div className="ba-modal-head"><b>Expense categories</b><button className="ba-x" onClick={onClose}><X size={16} /></button></div>
        <p className="ba-modal-note">Renaming is safe: records are linked by a fixed ID. A category with saved values can't be deleted. Deactivate it instead to hide it from new months (its history stays). Capital categories (e.g. equipment purchases) are excluded from operating results.</p>
        {list.map((c, i) => (
          <div key={c.id} className="me-cat-row">
            <input value={c.label} onChange={(e) => setList(list.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
            <select value={c.kind} onChange={(e) => setList(list.map((x, j) => j === i ? { ...x, kind: e.target.value as ExpenseCategory["kind"] } : x))}>
              <option value="operating">Operating</option><option value="capital">Capital</option>
            </select>
            <label className="ba-check" style={{ margin: 0 }}><input type="checkbox" checked={c.active} onChange={(e) => setList(list.map((x, j) => j === i ? { ...x, active: e.target.checked } : x))} /> Active</label>
            {!used.has(c.id) && <button className="ba-icon" title="Remove" onClick={() => setList(list.filter((_, j) => j !== i))}><X size={13} /></button>}
          </div>
        ))}
        <div className="me-cat-row">
          <input placeholder="New category name" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} />
          <button className="ba-btn ghost ba-btn-sm" onClick={add}>Add</button>
        </div>
        {err && <div className="ba-err">{err}</div>}
        <div className="ba-modal-actions">
          <button className="ba-btn ghost" onClick={onClose}>Cancel</button>
          <button className="ba-btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save categories"}</button>
        </div>
      </div>
    </div>, document.body);
}

// ─── CSV import preview ───────────────────────────────────────────────────────

const STATUS_TEXT: Record<ImportRow["status"], string> = {
  new: "Import", same: "Already saved", conflict: "Different value saved", invalid: "Error", duplicate_in_file: "Duplicate in file", blank: "Blank",
};

function ImportModal({ rows, cats, entries, uid, onClose, onDone }: {
  rows: ImportRow[]; cats: ExpenseCategory[]; entries: MonthlyExpense[]; uid: string; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [overwrite, setOverwrite] = useState<Set<number>>(new Set());
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const savedByKey = new Map(entries.map((e) => [`${e.month}__${e.categoryId}`, e] as const));
  const label = (id: string | null) => cats.find((c) => c.id === id)?.label ?? id ?? "";
  const toWrite = rows.filter((r) => r.status === "new" || (r.status === "conflict" && overwrite.has(r.line)));
  const count = (s: ImportRow["status"]) => rows.filter((r) => r.status === s).length;

  const run = async () => {
    setBusy(true); setErr(null);
    // One atomic save per month keeps each month consistent.
    const byMonth = new Map<string, ExpenseChange[]>();
    for (const r of toWrite) {
      const s = savedByKey.get(`${r.month}__${r.categoryId}`);
      const list = byMonth.get(r.month!) ?? [];
      list.push({ month: r.month!, categoryId: r.categoryId!, amount: r.amount!, notes: r.notes || (s?.notes ?? ""), expectedUpdatedAtMs: s ? s.updatedAt?.toMillis?.() ?? null : null });
      byMonth.set(r.month!, list);
    }
    const failed: string[] = [];
    let ok = 0;
    for (const [m, list] of byMonth) {
      const res = await saveExpenseChanges(list, uid);
      if (res.error) failed.push(`${m}: ${res.error}`); else ok += list.length;
    }
    setBusy(false);
    const skipped = rows.length - toWrite.length;
    if (failed.length) { setErr(`Imported ${ok}. Failed: ${failed.join("; ")}`); return; }
    onDone(`Imported ${ok} value${ok === 1 ? "" : "s"} · skipped ${skipped} (${count("same")} already saved, ${count("conflict") - overwrite.size} not overwritten, ${count("invalid") + count("duplicate_in_file")} errors, ${count("blank")} blank)`);
  };

  return createPortal(
    <div className="ba-overlay" onClick={() => !busy && onClose()}>
      <div className="ba-modal me-import" onClick={(e) => e.stopPropagation()}>
        <div className="ba-modal-head"><b>Import preview</b><button className="ba-x" onClick={onClose}><X size={16} /></button></div>
        <p className="ba-modal-note">
          {count("new")} new · {count("same")} already saved · {count("conflict")} different from a saved value · {count("invalid") + count("duplicate_in_file")} errors · {count("blank")} blank.
          Saved values are <b>not</b> overwritten unless you tick them below.
        </p>
        {rows.length === 0 ? <div className="ba-empty">The file has no rows.</div> : (
          <div className="ba-table-wrap" style={{ maxHeight: "50vh", overflowY: "auto" }}>
            <table className="ba-table">
              <thead><tr><th>Line</th><th>Month</th><th>Category</th><th className="r">Amount</th><th>Result</th></tr></thead>
              <tbody>{rows.map((r) => (
                <tr key={r.line} className={`me-imp ${r.status}`}>
                  <td>{r.line}</td><td>{r.month ?? r.raw[0]}</td><td>{label(r.categoryId) || r.raw[1]}</td>
                  <td className="r">{r.amount === null ? (r.raw[2] || "—") : egp(r.amount)}</td>
                  <td>
                    <b>{STATUS_TEXT[r.status]}</b> <span className="ba-muted">{r.message}{r.existingAmount !== undefined && r.status === "conflict" ? ` (saved: ${egp(r.existingAmount)})` : ""}</span>
                    {r.status === "conflict" && (
                      <label className="ba-check" style={{ margin: "4px 0 0" }}>
                        <input type="checkbox" checked={overwrite.has(r.line)} onChange={(e) => { const n = new Set(overwrite); if (e.target.checked) n.add(r.line); else n.delete(r.line); setOverwrite(n); }} />
                        Overwrite saved value
                      </label>
                    )}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
        {err && <div className="ba-err">{err}</div>}
        <div className="ba-modal-actions">
          <button className="ba-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="ba-btn" onClick={run} disabled={busy || !toWrite.length}>{busy ? "Importing…" : `Import ${toWrite.length} value${toWrite.length === 1 ? "" : "s"}`}</button>
        </div>
      </div>
    </div>, document.body);
}

// ─── Old per-transaction entries ──────────────────────────────────────────────

function LegacyNotice({ legacy }: { legacy: LegacyExpense[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ba-banner err"><AlertTriangle size={15} />
      <div>
        {legacy.length} older individual expense entr{legacy.length === 1 ? "y" : "ies"} from before monthly totals {legacy.length === 1 ? "isn't" : "aren't"} counted anywhere. Add {legacy.length === 1 ? "it" : "them"} into the matching month's totals, then delete {legacy.length === 1 ? "it" : "them"} here.
        <button className="ba-link" onClick={() => setOpen(!open)}>{open ? "Hide" : "Show"}</button>
        {open && (
          <table className="ba-table" style={{ marginTop: 8 }}><tbody>
            {legacy.map((l) => <tr key={l.id}><td>{l.date}</td><td>{l.category}</td><td className="r">{egp(l.amount)}</td><td>{l.note}</td>
              <td><button className="ba-icon" onClick={() => { if (window.confirm("Delete this old entry?")) deleteLegacyExpense(l.id); }}><X size={13} /></button></td></tr>)}
          </tbody></table>
        )}
      </div>
    </div>
  );
}

const CSS = `
.me-toolbar { display: flex; justify-content: space-between; gap: 10px; flex-wrap: wrap; align-items: center; }
.me-monthnav { display: flex; gap: 6px; align-items: center; }
.me-monthnav select { border: 1.5px solid #e5e0d8; border-radius: 9px; padding: 7px 9px; font-family: inherit; font-size: 14px; font-weight: 600; color: #0C3C60; background: #fff; }
.me-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.me-file { position: relative; overflow: hidden; }
.me-file input { position: absolute; inset: 0; opacity: 0; cursor: pointer; }
.me-head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 12px; }
.me-cov { display: inline-block; font-size: 12px; font-weight: 600; padding: 3px 10px; border-radius: 100px; margin-top: 4px; }
.me-cov.ok { background: #dcfce7; color: #166534; } .me-cov.part { background: #fef3c7; color: #92400e; } .me-cov.none { background: #f3f4f6; color: #4b5563; }
.me-totals { display: flex; gap: 16px; flex-wrap: wrap; }
.me-totals div { display: flex; flex-direction: column; font-size: 11px; color: #9a9590; text-transform: uppercase; letter-spacing: .05em; font-weight: 700; }
.me-totals b { font-size: 16px; color: #0C3C60; text-transform: none; letter-spacing: 0; margin-top: 2px; }
.me-table input { border: 1.5px solid #e5e0d8; border-radius: 8px; padding: 6px 8px; font-family: inherit; font-size: 13px; min-width: 0; width: 100%; }
.me-amt { text-align: right; max-width: 140px; } .me-amt.bad { border-color: #f87171 !important; background: #fef2f2; }
.me-notes { min-width: 120px; }
.me-dirty td { background: #fffbeb; }
.me-tag { margin-left: 6px; font-size: 10px; font-weight: 700; text-transform: uppercase; padding: 1px 6px; border-radius: 100px; background: #ede9fe; color: #5b21b6; }
.me-tag.off { background: #f3f4f6; color: #6b7280; }
.me-up { color: #b91c1c; } .me-down { color: #15803d; }
.me-savebar { display: flex; justify-content: flex-end; align-items: center; gap: 12px; margin-top: 12px; }
.me-grid th.sel { background: #EAF5FC; border-radius: 6px; }
.me-missing { color: #b45309; background: #fffbeb; } .me-ok { color: #15803d; font-weight: 600; }
.me-cat-row { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; flex-wrap: wrap; }
.me-cat-row input:not([type=checkbox]), .me-cat-row select { border: 1.5px solid #e5e0d8; border-radius: 8px; padding: 6px 8px; font-family: inherit; font-size: 13px; flex: 1; min-width: 140px; }
.me-cat-row select { flex: 0 0 auto; min-width: 0; }
.me-import { max-width: 860px; }
.me-imp.invalid td, .me-imp.duplicate_in_file td { background: #fef2f2; }
.me-imp.conflict td { background: #fffbeb; }
.me-imp.same td, .me-imp.blank td { color: #9a9590; }
.me-toast { position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: #0C3C60; color: #fff; padding: 10px 16px; border-radius: 12px; font-size: 13px; z-index: 1100; max-width: calc(100vw - 32px); }
@media (max-width: 640px) { .me-amt { max-width: 110px; } .me-totals { gap: 10px; } }
`;
