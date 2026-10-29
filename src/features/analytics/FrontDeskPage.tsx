// FILE: src/features/analytics/FrontDeskPage.tsx
// Manager + secretary tools that feed Business Analytics:
//  • Inquiries — log who asked about treatment and where they heard of us.
//  • Follow-up review — patients with nothing booked after recent treatment, for an
//    administrative decision. Nothing is ever sent to patients automatically.

import { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { Plus, Trash2, Info, Pencil, Check, X } from "lucide-react";
import { db } from "../../firebase";
import { docToAppointment } from "../../services/appointmentService";
import { subscribeToAllPatients, type Patient } from "../../services/patientService";
import {
  subscribeToLeads, addLead, updateLead, deleteLead, setPatientFollowUp, clinicToday, labelFor,
  ACQUISITION_SOURCES, LEAD_STATUSES, FOLLOW_UP_OUTCOMES, type Lead, type FollowUp,
} from "../../services/businessService";
import { addDays, followUpCandidates, type AAppt } from "./metrics";
import PatientPicker from "./PatientPicker";

const fmtDate = (d: string) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" }) : "—";
type PatientWithFollowUp = Patient & { followUp?: FollowUp };

export default function FrontDeskPage() {
  const today = clinicToday();
  const [tab, setTab] = useState<"inquiries" | "followup">("inquiries");
  const [patients, setPatients] = useState<PatientWithFollowUp[]>([]);
  useEffect(() => subscribeToAllPatients((p) => setPatients(p as PatientWithFollowUp[])), []);

  return (
    <div className="fd-page">
      <style>{CSS}</style>
      <h1 className="fd-title">Front Desk</h1>
      <div className="fd-sub">Inquiries and follow-ups. These feed the Business Analytics dashboard.</div>
      <div className="fd-tabs">
        <button className={`fd-tab ${tab === "inquiries" ? "on" : ""}`} onClick={() => setTab("inquiries")}>Inquiries</button>
        <button className={`fd-tab ${tab === "followup" ? "on" : ""}`} onClick={() => setTab("followup")}>Follow-up review</button>
      </div>
      {tab === "inquiries" ? <Inquiries today={today} patients={patients} /> : <FollowUpReview today={today} patients={patients} />}
    </div>
  );
}

// ─── Inquiries ────────────────────────────────────────────────────────────────

function Inquiries({ today, patients }: { today: string; patients: Patient[] }) {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ date: today, source: "", name: "", phone: "", note: "" });
  const [busy, setBusy] = useState(false);
  // Inline edit of an existing inquiry's date / name / phone / note
  const [editId, setEditId] = useState<string | null>(null);
  const [draft, setDraft] = useState({ date: "", name: "", phone: "", note: "" });
  const [savingEdit, setSavingEdit] = useState(false);
  const startEdit = (l: Lead) => { setEditId(l.id); setDraft({ date: l.date, name: l.name, phone: l.phone, note: l.note }); setError(null); };
  const saveEdit = async () => {
    if (!editId) return;
    if (!draft.date || draft.date > today) { setError("Choose a valid inquiry date (not in the future)."); return; }
    setSavingEdit(true);
    const r = await updateLead(editId, { date: draft.date, name: draft.name.trim(), phone: draft.phone.trim(), note: draft.note.trim() });
    setSavingEdit(false);
    if (r.error) setError(r.error); else setEditId(null);
  };
  useEffect(() => subscribeToLeads(addDays(today, -90), setLeads, (e) => setError(e.message)), [today]);

  const add = async () => {
    if (!form.date) return;
    setBusy(true); setError(null);
    const r = await addLead({ ...form, name: form.name.trim(), phone: form.phone.trim(), note: form.note.trim(), status: "new", patientId: "" });
    setBusy(false);
    if (r.error) setError(r.error); else setForm({ ...form, name: "", phone: "", note: "" });
  };
  return (
    <>
      <div className="fd-card">
        <div className="fd-card-title">Log an inquiry</div>
        <div className="fd-form">
          <input type="date" value={form.date} max={today} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })}>
            <option value="">How did they hear about us?</option>
            {ACQUISITION_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <input placeholder="Name (optional)" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <input placeholder="Phone (optional)" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          <input placeholder="Note (optional)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button className="fd-btn" onClick={add} disabled={busy}><Plus size={14} /> Add</button>
        </div>
        {error && <div className="fd-err">{error}</div>}
      </div>

      <div className="fd-card">
        <div className="fd-card-title">Last 90 days ({leads.length})</div>
        <div className="fd-help">When an inquiry registers, link them to their patient record, so the dashboard can follow them from inquiry to treatment using their real appointments.</div>
        {leads.length === 0 ? <div className="fd-empty">No inquiries logged yet.</div> : (
          <div className="fd-table-wrap"><table className="fd-table">
            <thead><tr><th>Date</th><th>Who</th><th>Source</th><th>Status</th><th>Linked patient</th><th /></tr></thead>
            <tbody>
              {leads.map((l) => (
                <tr key={l.id}>
                  {editId === l.id ? (
                    <>
                      <td><input className="fd-edit" type="date" value={draft.date} max={today} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></td>
                      <td>
                        <div className="fd-edit-stack">
                          <input className="fd-edit" placeholder="Name" value={draft.name} autoFocus onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                          <input className="fd-edit" placeholder="Phone" value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} />
                          <input className="fd-edit" placeholder="Note" value={draft.note}
                            onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                            onKeyDown={(e) => { if (e.key === "Enter") saveEdit(); if (e.key === "Escape") setEditId(null); }} />
                          <div className="fd-edit-actions">
                            <button className="fd-btn fd-btn-sm" onClick={saveEdit} disabled={savingEdit}><Check size={13} /> {savingEdit ? "Saving…" : "Save"}</button>
                            <button className="fd-btn-ghost" onClick={() => setEditId(null)} disabled={savingEdit}><X size={13} /> Cancel</button>
                          </div>
                        </div>
                      </td>
                    </>
                  ) : (
                    <>
                      <td>{fmtDate(l.date)}</td>
                      <td>{l.name || <span className="fd-muted">—</span>}{l.phone && <div className="fd-muted">{l.phone}</div>}{l.note && <div className="fd-muted">{l.note}</div>}</td>
                    </>
                  )}
                  <td>
                    <select value={l.source} onChange={(e) => updateLead(l.id, { source: e.target.value })}>
                      <option value="">Unknown</option>
                      {ACQUISITION_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <select value={l.status} onChange={(e) => updateLead(l.id, { status: e.target.value })}>
                      {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </td>
                  <td>
                    <PatientPicker patients={patients} value={l.patientId} suggestName={l.name} suggestPhone={l.phone}
                      onChange={(id) => updateLead(l.id, id
                        ? { patientId: id, status: "converted" }
                        : { patientId: "", ...(l.status === "converted" ? { status: "new" } : {}) })} />
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {editId !== l.id && <button className="fd-icon edit" title="Edit date, name, phone or note" onClick={() => startEdit(l)}><Pencil size={13} /></button>}{" "}
                    <button className="fd-icon" title="Delete" onClick={() => { if (window.confirm("Delete this inquiry?")) deleteLead(l.id); }}><Trash2 size={13} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        )}
      </div>
    </>
  );
}

// ─── Follow-up review ─────────────────────────────────────────────────────────

function FollowUpReview({ today, patients }: { today: string; patients: PatientWithFollowUp[] }) {
  const [appts, setAppts] = useState<AAppt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  useEffect(() => {
    let alive = true;
    getDocs(query(collection(db, "appointments"), where("date", ">=", addDays(today, -60))))
      .then((s) => { if (alive) setAppts(s.docs.map((d) => { const a = docToAppointment(d.id, d.data()); return { ...a, hour: Number(a.hour) }; })); })
      .catch((e: { message?: string }) => { if (alive) setError(e.message ?? "Failed to load appointments."); });
    return () => { alive = false; };
  }, [today]);

  const rows = useMemo(() => {
    if (!appts) return [];
    const ap = patients.map((p) => ({ uid: p.uid, name: `${p.firstName} ${p.lastName}`, createdDate: "", status: p.status,
      acquisitionSource: "", referredByPhysicianId: "" }));
    const byId = new Map(patients.map((p) => [p.uid, p] as const));
    // A review applies to the last session it was made for; a newer session re-opens the item.
    return followUpCandidates(appts, ap, today, 60).map((c) => {
      const f = byId.get(c.uid)?.followUp;
      return { ...c, phone: byId.get(c.uid)?.phone ?? "", review: f && f.reviewedFor >= c.lastSession ? f : null };
    });
  }, [appts, patients, today]);

  const open = rows.filter((r) => !r.review);
  const done = rows.filter((r) => r.review);
  const mark = (uid: string, lastSession: string, outcome: string) =>
    setPatientFollowUp(uid, { outcome, note: "", reviewedFor: lastSession, reviewedAt: today }).then((r) => r.error && setError(r.error));

  return (
    <div className="fd-card">
      <div className="fd-banner"><Info size={15} />
        Active patients whose last completed session was in the past 60 days and who have nothing booked. This is not a list of lost patients: some have finished treatment or paused on purpose. Record what you decided. Nothing is sent to patients automatically.
      </div>
      {error && <div className="fd-err">{error}</div>}
      {!appts ? <div className="fd-empty">Loading…</div> : open.length === 0 ? <div className="fd-empty">Nothing waiting for review.</div> : (
        <div className="fd-table-wrap"><table className="fd-table">
          <thead><tr><th>Patient</th><th>Last session</th><th>Days</th><th>Decision</th></tr></thead>
          <tbody>{open.map((r) => (
            <tr key={r.uid}>
              <td>{r.name}{r.phone && <div className="fd-muted">{r.phone}</div>}</td>
              <td>{fmtDate(r.lastSession)}</td><td>{r.daysSince}</td>
              <td>
                <select value="" onChange={(e) => e.target.value && mark(r.uid, r.lastSession, e.target.value)}>
                  <option value="">Record a decision…</option>
                  {FOLLOW_UP_OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </td>
            </tr>
          ))}</tbody>
        </table></div>
      )}
      {done.length > 0 && (
        <>
          <button className="fd-link" onClick={() => setShowDone(!showDone)}>{showDone ? "Hide" : "Show"} reviewed ({done.length})</button>
          {showDone && (
            <div className="fd-table-wrap"><table className="fd-table">
              <tbody>{done.map((r) => (
                <tr key={r.uid}><td>{r.name}</td><td>{fmtDate(r.lastSession)}</td>
                  <td>{labelFor(FOLLOW_UP_OUTCOMES, r.review!.outcome)} <span className="fd-muted">· {fmtDate(r.review!.reviewedAt)}</span></td></tr>
              ))}</tbody>
            </table></div>
          )}
        </>
      )}
    </div>
  );
}

const CSS = `
.fd-page { max-width: 1100px; margin: 0 auto; padding: 4px 4px 60px; font-family: 'Outfit', sans-serif; color: #1a1a1a; }
.fd-title { font-family: 'Playfair Display', serif; font-size: 24px; font-weight: 500; margin: 0 0 3px; color: #0C3C60; }
.fd-sub { font-size: 12.5px; color: #9a9590; margin-bottom: 14px; }
.fd-tabs { display: flex; gap: 4px; border-bottom: 1.5px solid #e5e0d8; margin-bottom: 14px; }
.fd-tab { padding: 9px 14px; border: none; background: none; font-family: inherit; font-size: 13.5px; font-weight: 600; color: #9a9590; cursor: pointer; border-bottom: 2.5px solid transparent; margin-bottom: -1.5px; }
.fd-tab.on { color: #0C3C60; border-bottom-color: #2E8BC0; }
.fd-card { background: #fff; border: 1px solid #e5e0d8; border-radius: 16px; padding: 16px; margin-bottom: 14px; min-width: 0; }
.fd-card-title { font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #5a5550; margin-bottom: 8px; }
.fd-help { font-size: 12px; color: #9a9590; margin-bottom: 10px; }
.fd-form { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px; }
.fd-form input, .fd-form select, .fd-table select { border: 1.5px solid #e5e0d8; border-radius: 9px; padding: 7px 9px; font-family: inherit; font-size: 13px; background: #fff; min-width: 0; max-width: 100%; }
.fd-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 14px; border-radius: 10px; border: none; background: #2E8BC0; color: #fff; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
.fd-btn:disabled { opacity: .55; }
.fd-table-wrap { overflow-x: auto; }
.fd-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.fd-table th { text-align: left; font-size: 10.5px; text-transform: uppercase; letter-spacing: .06em; color: #9a9590; padding: 7px 8px; border-bottom: 1px solid #f0ede8; white-space: nowrap; }
.fd-table td { padding: 8px; border-bottom: 1px solid #f7f5f2; vertical-align: top; }
.fd-muted { color: #9a9590; font-size: 11.5px; }
.fd-empty { text-align: center; color: #c0bbb4; font-size: 13px; padding: 22px 8px; }
.fd-err { color: #b91c1c; font-size: 12.5px; margin-top: 8px; }
.fd-icon { background: none; border: 1px solid #e5e0d8; border-radius: 7px; padding: 4px 6px; color: #9a9590; cursor: pointer; }
.fd-icon:hover { color: #b91c1c; border-color: #fca5a5; background: #fee2e2; }
.fd-icon.edit:hover { color: #2E8BC0; border-color: #B3DEF0; background: #EAF5FC; }
.fd-edit { border: 1.5px solid #B3DEF0; border-radius: 8px; padding: 6px 8px; font-family: inherit; font-size: 13px; background: #fff; width: 100%; min-width: 0; box-sizing: border-box; }
.fd-edit-stack { display: flex; flex-direction: column; gap: 6px; min-width: 180px; }
.fd-edit-actions { display: flex; gap: 6px; }
.fd-btn-sm { padding: 5px 10px; font-size: 12px; border-radius: 8px; }
.fd-btn-ghost { display: inline-flex; align-items: center; gap: 4px; padding: 5px 10px; border-radius: 8px; border: 1.5px solid #e5e0d8; background: #fff; color: #5a5550; font-family: inherit; font-size: 12px; font-weight: 600; cursor: pointer; }
.fd-banner { display: flex; gap: 8px; align-items: flex-start; background: #EAF5FC; color: #0C3C60; border: 1px solid #B3DEF0; border-radius: 12px; padding: 10px 12px; font-size: 12.5px; line-height: 1.45; margin-bottom: 12px; }
.fd-banner svg { flex-shrink: 0; margin-top: 1px; }
.fd-link { background: none; border: none; color: #2E8BC0; font-family: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer; margin-top: 10px; padding: 0; }
`;
