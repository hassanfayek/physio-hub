// FILE: src/features/inquiries/InquiriesPanel.tsx
// Front Desk → Inquiries: Dashboard, Work queue and Records over the real inquiry
// records, with stages derived from the linked patients' appointments.

import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { Plus, Search, Phone, ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { db } from "../../firebase";
import { useAuth } from "../../hooks/useAuth";
import { docToAppointment } from "../../services/appointmentService";
import { subscribeToPhysiotherapists, type Patient, type Physiotherapist } from "../../services/patientService";
import { subscribeToSecretaries, type Secretary } from "../../services/secretaryService";
import {
  subscribeToLeads, clinicNow, labelFor, LEAD_SOURCES, LEAD_CHANNELS, LEAD_SERVICES, type Lead,
} from "../../services/businessService";
import { presetRanges, inRange, type PresetKey, type AAppt, type Range } from "../analytics/metrics";
import { deriveLead, inQueue, byQueue, fmtShort, STAGE_LABEL, type LeadView, type QueueFilter, type Stage } from "./leadLogic";
import InquiryForm from "./InquiryForm";
import LogInteraction from "./LogInteraction";
import InquiryDetail from "./InquiryDetail";
import InquiryAnalyticsView from "./InquiryAnalyticsView";
import type { Staff } from "./shared";

type View = "dashboard" | "queue" | "records" | "analytics";
const PAGE = 25;

export default function InquiriesPanel({ patients }: { patients: Patient[] }) {
  const { user } = useAuth();
  const isManager = user?.role === "clinic_manager";
  // Clinic-local time, refreshed every minute so "due today" becomes "overdue" on its own.
  const [now, setNow] = useState(clinicNow);
  useEffect(() => { const t = setInterval(() => setNow(clinicNow()), 60_000); return () => clearInterval(t); }, []);
  const today = now.slice(0, 10);

  // ── Data ────────────────────────────────────────────────────────────────────
  const [leads, setLeads] = useState<Lead[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => subscribeToLeads("0000-00-00", setLeads, (e) => setError(`Couldn't load inquiries: ${e.message}`)), []);
  const minDate = leads && leads.length ? leads.reduce((m, l) => (l.date && l.date < m ? l.date : m), today) : today;
  const [appts, setAppts] = useState<AAppt[]>([]);
  useEffect(() => onSnapshot(query(collection(db, "appointments"), where("date", ">=", minDate)),
    (s) => setAppts(s.docs.map((d) => { const a = docToAppointment(d.id, d.data()); return { ...a, hour: Number(a.hour) }; })),
    (e) => setError(`Couldn't load appointments: ${e.message}`)), [minDate]);
  const [physios, setPhysios] = useState<Physiotherapist[]>([]);
  const [secs, setSecs] = useState<Secretary[]>([]);
  useEffect(() => subscribeToPhysiotherapists(setPhysios, () => {}), []);
  useEffect(() => subscribeToSecretaries(setSecs, () => {}), []);
  // Inquiries are assigned to the manager or a secretary.
  const staff: Staff[] = useMemo(() => [
    ...physios.filter((p) => p.rank === "manager" && p.active).map((p) => ({ uid: p.uid, name: `Dr. ${p.firstName} ${p.lastName}` })),
    ...secs.filter((s) => s.active).map((s) => ({ uid: s.uid, name: `${s.firstName} ${s.lastName}` })),
  ], [physios, secs]);
  const me: Staff | null = staff.find((s) => s.uid === user?.uid) ?? (user ? { uid: user.uid, name: "Me" } : null);

  const created = useMemo(() => new Map(patients.map((p) => [p.uid, p.createdAt?.toDate?.().toISOString().slice(0, 10) ?? null] as const)), [patients]);
  const views: LeadView[] = useMemo(() => (leads ?? []).map((l) => deriveLead(l, appts, l.patientId ? created.get(l.patientId) ?? null : null, now)),
    [leads, appts, created, now]);
  const campaigns = useMemo(() => [...new Set((leads ?? []).map((l) => l.campaign).filter(Boolean))].sort(), [leads]);

  // ── UI state ────────────────────────────────────────────────────────────────
  const [view, setView] = useState<View>("queue");
  const [formFor, setFormFor] = useState<Lead | "new" | null>(null);
  const [logFor, setLogFor] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const viewById = (id: string | null) => (id ? views.find((v) => v.lead.id === id) ?? null : null);

  // Shared filters (Dashboard + Records)
  const [preset, setPreset] = useState<PresetKey>("30d");
  const [custom, setCustom] = useState<Range>({ from: today, to: today });
  const [fSource, setFSource] = useState(""); const [fChannel, setFChannel] = useState("");
  const [fStage, setFStage] = useState(""); const [fService, setFService] = useState(""); const [fAssigned, setFAssigned] = useState("");
  const range = presetRanges(preset, today, custom).cur;
  const matchesFilters = (v: LeadView) =>
    (!fSource || (fSource === "unknown" ? !v.lead.source || v.lead.source === "unknown" : v.lead.source === fSource)) &&
    (!fChannel || v.lead.channel === fChannel) && (!fStage || v.stage === fStage) &&
    (!fService || v.lead.service === fService) && (!fAssigned || (fAssigned === "none" ? !v.lead.assignedTo : v.lead.assignedTo === fAssigned));

  const loading = leads === null;

  return (
    <div className="iq">
      <style>{CSS}</style>
      <div className="iq-top">
        <div className="iq-views">
          {([["queue", "Work queue"], ["dashboard", "Dashboard"], ["records", "Records"], ["analytics", "Analytics"]] as const).map(([k, l]) => (
            <button key={k} className={`iq-view ${view === k ? "on" : ""}`} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
        <button className="iq-btn" onClick={() => setFormFor("new")}><Plus size={15} /> New inquiry</button>
      </div>

      {error && <div className="iq-warn"><AlertTriangle size={14} /> {error}</div>}
      {loading && !error && <div className="iq-muted" style={{ padding: 20 }}>Loading inquiries…</div>}

      {!loading && view === "queue" && <Queue views={views} me={me} onOpen={setOpenId} onLog={setLogFor} />}
      {!loading && view !== "queue" && (
        <Filters preset={preset} setPreset={setPreset} custom={custom} setCustom={setCustom} range={range}
          fSource={fSource} setFSource={setFSource} fChannel={fChannel} setFChannel={setFChannel} fStage={fStage} setFStage={setFStage}
          fService={fService} setFService={setFService} fAssigned={fAssigned} setFAssigned={setFAssigned} staff={staff} />
      )}
      {!loading && view === "dashboard" && <Dashboard views={views} range={range} matches={matchesFilters} onPickQueue={() => setView("queue")} />}
      {!loading && view === "analytics" && <InquiryAnalyticsView views={views.filter(matchesFilters)} range={range} today={today} now={now} isManager={isManager} />}
      {!loading && view === "records" && <Records views={views.filter((v) => inRange(v.lead.date, range) && matchesFilters(v))} onOpen={setOpenId} onLog={setLogFor} />}

      {formFor && <InquiryForm existing={formFor === "new" ? null : formFor} leads={leads ?? []} patients={patients} staff={staff} me={me}
        campaigns={campaigns} onClose={() => setFormFor(null)} onOpenLead={(id) => { setFormFor(null); setOpenId(id); }} />}
      {logFor && viewById(logFor) && <LogInteraction view={viewById(logFor)!} me={me} onClose={() => setLogFor(null)} />}
      {openId && viewById(openId) && !logFor && !formFor && (
        <InquiryDetail view={viewById(openId)!} appts={appts} patients={patients} physios={physios} isManager={isManager} me={me}
          onClose={() => setOpenId(null)} onLog={() => setLogFor(openId)} onEdit={() => setFormFor(viewById(openId)!.lead)} />
      )}
    </div>
  );
}

// ─── Work queue ───────────────────────────────────────────────────────────────

const QUEUES: { k: QueueFilter; l: string }[] = [
  { k: "overdue", l: "Overdue" }, { k: "today", l: "Due today" }, { k: "new", l: "New (no reply yet)" },
  { k: "awaiting", l: "Waiting for patient" }, { k: "booked", l: "Appointments booked" }, { k: "all", l: "All" },
];

function Queue({ views, me, onOpen, onLog }: { views: LeadView[]; me: Staff | null; onOpen: (id: string) => void; onLog: (id: string) => void }) {
  const counts = Object.fromEntries(QUEUES.map((q) => [q.k, views.filter((v) => inQueue(v, q.k)).length]));
  const [q, setQ] = useState<QueueFilter>(() => (counts.overdue ? "overdue" : counts.today ? "today" : counts.new ? "new" : "all"));
  const [mine, setMine] = useState(false);
  const list = views.filter((v) => inQueue(v, q) && (!mine || v.lead.assignedTo === me?.uid)).sort(byQueue);
  return (
    <div>
      <div className="iq-qtabs">
        {QUEUES.map((x) => (
          <button key={x.k} className={`iq-qtab ${q === x.k ? "on" : ""} ${x.k === "overdue" && counts.overdue ? "alert" : ""}`} onClick={() => setQ(x.k)}>
            {x.l} <span>{counts[x.k]}</span>
          </button>
        ))}
        <label className="iq-mine"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> Assigned to me</label>
      </div>
      {list.length === 0 ? <div className="iq-empty">Nothing here. {q === "overdue" || q === "today" ? "You're up to date." : ""}</div> : (
        <div className="iq-qlist">
          {list.map((v) => (
            <div key={v.lead.id} className={`iq-qrow ${v.followUp}`} onClick={() => onOpen(v.lead.id)}>
              <div className="iq-qmain">
                <div className="iq-qname">{v.lead.name || "Unnamed"} <span className={`iq-stage s-${v.stage}`}>{STAGE_LABEL[v.stage]}</span></div>
                <div className="iq-qmeta">
                  {v.lead.phone} · {labelFor(LEAD_SOURCES, v.lead.source, "Unknown")} via {labelFor(LEAD_CHANNELS, v.lead.channel, "?")} · {fmtShort(v.lead.date)}
                  {v.attempts > 0 && <> · {v.attempts} attempt{v.attempts === 1 ? "" : "s"}, last {fmtShort(v.lastContactAt)}</>}
                  {v.lead.assignedName && <> · {v.lead.assignedName}</>}
                </div>
              </div>
              <div className={`iq-next ${v.followUp}`}>{v.nextAction}</div>
              <div className="iq-qbtns" onClick={(e) => e.stopPropagation()}>
                <a className="iq-icon" href={`tel:${v.lead.phone}`} title="Call"><Phone size={14} /></a>
                {!v.closed && v.stage !== "converted" && <button className="iq-btn sm" onClick={() => onLog(v.lead.id)}>Log</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Filters ──────────────────────────────────────────────────────────────────

const PRESETS: { k: PresetKey; l: string }[] = [
  { k: "week", l: "This week" }, { k: "30d", l: "Last 30 days" }, { k: "month", l: "This month" }, { k: "prevMonth", l: "Previous month" }, { k: "custom", l: "Custom" },
];

interface FiltersProps {
  preset: PresetKey; setPreset: (p: PresetKey) => void; custom: Range; setCustom: (r: Range) => void; range: Range;
  fSource: string; setFSource: (v: string) => void; fChannel: string; setFChannel: (v: string) => void;
  fStage: string; setFStage: (v: string) => void; fService: string; setFService: (v: string) => void;
  fAssigned: string; setFAssigned: (v: string) => void; staff: Staff[];
}
function Filters(p: FiltersProps) {
  return (
    <div className="iq-filters">
      <div className="iq-chips">
        {PRESETS.map((x) => <button key={x.k} className={`iq-chip ${p.preset === x.k ? "on" : ""}`} onClick={() => p.setPreset(x.k)}>{x.l}</button>)}
        {p.preset === "custom" && <>
          <input type="date" value={p.custom.from} max={p.custom.to} onChange={(e) => p.setCustom({ ...p.custom, from: e.target.value })} />
          <input type="date" value={p.custom.to} min={p.custom.from} onChange={(e) => p.setCustom({ ...p.custom, to: e.target.value })} />
        </>}
      </div>
      <div className="iq-selects">
        <select value={p.fSource} onChange={(e) => p.setFSource(e.target.value)}><option value="">All sources</option>{LEAD_SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <select value={p.fChannel} onChange={(e) => p.setFChannel(e.target.value)}><option value="">All channels</option>{LEAD_CHANNELS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
        <select value={p.fStage} onChange={(e) => p.setFStage(e.target.value)}><option value="">All statuses</option>{(Object.keys(STAGE_LABEL) as Stage[]).map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}</select>
        <select value={p.fService} onChange={(e) => p.setFService(e.target.value)}><option value="">All services</option>{LEAD_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}</select>
        <select value={p.fAssigned} onChange={(e) => p.setFAssigned(e.target.value)}><option value="">Anyone</option><option value="none">Unassigned</option>{p.staff.map((s) => <option key={s.uid} value={s.uid}>{s.name}</option>)}</select>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

function Dashboard({ views, range, matches, onPickQueue }: { views: LeadView[]; range: Range; matches: (v: LeadView) => boolean; onPickQueue: () => void }) {
  const open = views.filter(matches);
  const cohort = open.filter((v) => inRange(v.lead.date, range));
  const k = (label: string, value: number, note?: string, alert?: boolean) => (
    <div className={`iq-kpi ${alert && value ? "alert" : ""}`}><div className="iq-kpi-l">{label}</div><div className="iq-kpi-v">{value}</div>{note && <div className="iq-kpi-n">{note}</div>}</div>
  );
  return (
    <div>
      <div className="iq-sectionhead">Right now <button className="iq-link" onClick={onPickQueue}>Open work queue</button></div>
      <div className="iq-kpis">
        {k("Awaiting first reply", open.filter((v) => v.needsFirstResponse).length, "New, never contacted", true)}
        {k("Waiting for patient", open.filter((v) => v.stage === "contacted").length)}
        {k("Follow-ups due today", open.filter((v) => v.followUp === "today").length)}
        {k("Overdue follow-ups", open.filter((v) => v.followUp === "overdue").length, undefined, true)}
      </div>
      <div className="iq-sectionhead">Inquiries received {fmtShort(range.from)} – {fmtShort(range.to)}</div>
      <div className="iq-kpis">
        {k("New inquiries", cohort.length)}
        {k("Booked an appointment", cohort.filter((v) => v.booked).length, "From the linked patient's real bookings")}
        {k("Attended", cohort.filter((v) => v.attended).length, `${cohort.filter((v) => v.attendedAssessment).length} attended an assessment`)}
        {k("Registered as patients", cohort.filter((v) => v.registered && !v.reactivation).length, `${cohort.filter((v) => v.reactivation).length} repeat inquiries from existing patients`)}
        {k("Converted", cohort.filter((v) => v.converted).length, "Had a completed treatment session")}
        {k("Lost or unresponsive", cohort.filter((v) => v.stage === "lost" || v.stage === "unresponsive").length)}
      </div>
    </div>
  );
}

// ─── Records ──────────────────────────────────────────────────────────────────

function Records({ views, onOpen, onLog }: { views: LeadView[]; onOpen: (id: string) => void; onLog: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const nq = q.trim().toLowerCase(), qd = q.replace(/\D/g, "");
  const list = views
    .filter((v) => !nq || v.lead.name.toLowerCase().includes(nq) || v.lead.note.toLowerCase().includes(nq) || (qd.length >= 3 && v.lead.phone.replace(/\D/g, "").includes(qd)))
    .sort((a, b) => `${b.lead.date}${b.lead.time}`.localeCompare(`${a.lead.date}${a.lead.time}`));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const cur = Math.min(page, pages - 1);
  const rows = list.slice(cur * PAGE, cur * PAGE + PAGE);
  const appt = (v: LeadView) => (v.nextAppt ?? v.firstAppt) ? fmtShort((v.nextAppt ?? v.firstAppt)!.date) : "—";
  return (
    <div>
      <div className="iq-search"><Search size={14} /><input placeholder="Search name, phone or notes…" value={q} onChange={(e) => { setQ(e.target.value); setPage(0); }} /></div>
      {list.length === 0 ? <div className="iq-empty">No inquiries match.</div> : (<>
        <div className="iq-table-wrap iq-desktop">
          <table className="iq-table">
            <thead><tr><th>Contacted</th><th>Name</th><th>Phone</th><th>Source</th><th>Channel</th><th>Service</th><th>Status</th><th>Last contact</th><th>Attempts</th><th>Next follow-up</th><th>Appointment</th><th>Assigned</th><th /></tr></thead>
            <tbody>{rows.map((v) => (
              <tr key={v.lead.id} onClick={() => onOpen(v.lead.id)}>
                <td>{fmtShort(`${v.lead.date}${v.lead.time ? `T${v.lead.time}` : ""}`)}</td>
                <td>{v.lead.name || "—"}{v.reactivation && <span className="iq-badge">repeat</span>}</td>
                <td>{v.lead.phone}</td>
                <td>{labelFor(LEAD_SOURCES, v.lead.source, "Unknown")}{v.lead.campaign && <div className="iq-muted">{v.lead.campaign}</div>}</td>
                <td>{labelFor(LEAD_CHANNELS, v.lead.channel, "—")}</td>
                <td>{v.lead.service || "—"}</td>
                <td><span className={`iq-stage s-${v.stage}`}>{STAGE_LABEL[v.stage]}</span></td>
                <td>{v.lastContactAt ? fmtShort(v.lastContactAt) : "—"}</td>
                <td>{v.attempts}</td>
                <td className={`iq-next ${v.followUp}`}>{v.lead.nextFollowUpAt && v.followUp !== "none" ? fmtShort(v.lead.nextFollowUpAt) : "—"}</td>
                <td>{appt(v)}</td>
                <td>{v.lead.assignedName || "—"}</td>
                <td onClick={(e) => e.stopPropagation()}>{!v.closed && v.stage !== "converted" && <button className="iq-btn sm" onClick={() => onLog(v.lead.id)}>Log</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="iq-cards iq-mobile">{rows.map((v) => (
          <div key={v.lead.id} className="iq-card" onClick={() => onOpen(v.lead.id)}>
            <div className="iq-qname">{v.lead.name || "Unnamed"} <span className={`iq-stage s-${v.stage}`}>{STAGE_LABEL[v.stage]}</span></div>
            <div className="iq-qmeta">{v.lead.phone} · {fmtShort(v.lead.date)} · {labelFor(LEAD_SOURCES, v.lead.source, "Unknown")} via {labelFor(LEAD_CHANNELS, v.lead.channel, "?")}</div>
            <div className="iq-qmeta">{v.attempts} attempt{v.attempts === 1 ? "" : "s"}{v.lastContactAt && <> · last {fmtShort(v.lastContactAt)}</>}{v.lead.assignedName && <> · {v.lead.assignedName}</>}</div>
            <div className={`iq-next ${v.followUp}`}>{v.nextAction}</div>
          </div>
        ))}</div>
        <div className="iq-pager">
          <button className="iq-btn ghost sm" disabled={cur === 0} onClick={() => setPage(cur - 1)}><ChevronLeft size={14} /></button>
          <span>{cur * PAGE + 1}–{Math.min(list.length, cur * PAGE + PAGE)} of {list.length}</span>
          <button className="iq-btn ghost sm" disabled={cur >= pages - 1} onClick={() => setPage(cur + 1)}><ChevronRight size={14} /></button>
        </div>
      </>)}
    </div>
  );
}

const CSS = `
.iq { font-family: 'Outfit', sans-serif; color: #1a1a1a; }
.iq-top { display: flex; justify-content: space-between; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; }
.iq-views { display: flex; gap: 4px; background: #f0ede8; padding: 3px; border-radius: 11px; }
.iq-view { border: none; background: none; padding: 7px 14px; border-radius: 9px; font-family: inherit; font-size: 13px; font-weight: 600; color: #5a5550; cursor: pointer; }
.iq-view.on { background: #fff; color: #0C3C60; box-shadow: 0 1px 3px rgba(0,0,0,.08); }
.iq-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border-radius: 10px; border: 1.5px solid #2E8BC0; background: #2E8BC0; color: #fff; font-family: inherit; font-size: 13px; font-weight: 600; cursor: pointer; white-space: nowrap; }
.iq-btn.ghost { background: #fff; color: #2E8BC0; border-color: #B3DEF0; }
.iq-btn.ghost.danger { color: #b91c1c; border-color: #fecaca; }
.iq-btn.sm { padding: 5px 10px; font-size: 12px; border-radius: 8px; }
.iq-btn:disabled { opacity: .5; cursor: not-allowed; }
.iq-link { background: none; border: none; color: #2E8BC0; font: inherit; font-weight: 600; cursor: pointer; padding: 0 4px; text-decoration: underline; }
.iq-muted { color: #9a9590; font-size: 12px; }
.iq-empty { text-align: center; color: #9a9590; padding: 30px 10px; background: #fff; border: 1px solid #e5e0d8; border-radius: 14px; }
.iq-warn { display: flex; gap: 8px; align-items: flex-start; background: #fffbeb; border: 1px solid #fde68a; color: #78350f; border-radius: 10px; padding: 9px 11px; font-size: 12.5px; margin: 6px 0 10px; }
.iq-warn svg { flex-shrink: 0; margin-top: 2px; }
.iq-qtabs { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; margin-bottom: 10px; }
.iq-qtab { border: 1.5px solid #e5e0d8; background: #fff; border-radius: 100px; padding: 6px 12px; font-family: inherit; font-size: 12.5px; font-weight: 600; color: #5a5550; cursor: pointer; }
.iq-qtab span { margin-left: 4px; background: #f0ede8; border-radius: 100px; padding: 0 7px; font-size: 11px; }
.iq-qtab.on { background: #0C3C60; color: #fff; border-color: #0C3C60; } .iq-qtab.on span { background: rgba(255,255,255,.2); }
.iq-qtab.alert:not(.on) { border-color: #fca5a5; color: #b91c1c; }
.iq-mine { margin-left: auto; font-size: 12.5px; color: #5a5550; display: inline-flex; gap: 5px; align-items: center; }
.iq-qlist { display: flex; flex-direction: column; gap: 8px; }
.iq-qrow { display: grid; grid-template-columns: 1fr auto auto; gap: 12px; align-items: center; background: #fff; border: 1px solid #e5e0d8; border-left: 4px solid #e5e0d8; border-radius: 12px; padding: 10px 12px; cursor: pointer; }
.iq-qrow.overdue { border-left-color: #dc2626; } .iq-qrow.today { border-left-color: #f59e0b; }
.iq-qrow:hover { border-color: #B3DEF0; }
.iq-qmain { min-width: 0; }
.iq-qname { font-weight: 600; font-size: 14px; display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.iq-qmeta { font-size: 12px; color: #9a9590; margin-top: 2px; overflow-wrap: anywhere; }
.iq-qbtns { display: flex; gap: 6px; align-items: center; }
.iq-icon { width: 30px; height: 30px; border-radius: 8px; border: 1.5px solid #e5e0d8; display: inline-flex; align-items: center; justify-content: center; color: #2E8BC0; background: #fff; }
.iq-next { font-size: 12.5px; font-weight: 600; color: #5a5550; }
.iq-next.overdue { color: #b91c1c; } .iq-next.today { color: #b45309; }
.iq-stage { font-size: 10.5px; font-weight: 700; padding: 2px 8px; border-radius: 100px; background: #f3f4f6; color: #374151; white-space: nowrap; }
.iq-stage.s-new { background: #dbeafe; color: #1e40af; } .iq-stage.s-contacted { background: #fef3c7; color: #92400e; }
.iq-stage.s-replied, .iq-stage.s-follow_up { background: #EAF5FC; color: #0C3C60; }
.iq-stage.s-booked { background: #ede9fe; color: #5b21b6; } .iq-stage.s-no_show { background: #ffedd5; color: #9a3412; }
.iq-stage.s-attended { background: #ccfbf1; color: #115e59; } .iq-stage.s-converted { background: #dcfce7; color: #166534; }
.iq-stage.s-lost, .iq-stage.s-unresponsive { background: #fee2e2; color: #991b1b; } .iq-stage.s-invalid { background: #e5e7eb; color: #4b5563; }
.iq-badge { font-size: 10px; font-weight: 700; padding: 1px 7px; border-radius: 100px; background: #f3e8ff; color: #6b21a8; margin-left: 6px; }
.iq-filters { display: flex; flex-direction: column; gap: 8px; margin-bottom: 12px; }
.iq-chips { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.iq-chip { border: 1.5px solid #e5e0d8; background: #fff; border-radius: 100px; padding: 5px 11px; font-family: inherit; font-size: 12px; font-weight: 600; color: #5a5550; cursor: pointer; }
.iq-chip.on { background: #0C3C60; color: #fff; border-color: #0C3C60; }
.iq-filters input, .iq-selects select { border: 1.5px solid #e5e0d8; border-radius: 9px; padding: 6px 8px; font-family: inherit; font-size: 12.5px; background: #fff; }
.iq-selects { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 6px; }
.iq-sectionhead { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; color: #9a9590; margin: 14px 0 8px; display: flex; gap: 8px; align-items: center; }
.iq-kpis { display: grid; grid-template-columns: repeat(auto-fill, minmax(170px, 1fr)); gap: 10px; }
.iq-kpi { background: #fff; border: 1px solid #e5e0d8; border-radius: 14px; padding: 12px 14px; }
.iq-kpi.alert { border-color: #fca5a5; background: #fff7f7; }
.iq-kpi-l { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #9a9590; }
.iq-kpi-v { font-family: 'Playfair Display', serif; font-size: 26px; font-weight: 600; color: #0C3C60; margin-top: 4px; }
.iq-kpi-n { font-size: 11.5px; color: #9a9590; margin-top: 2px; }
.iq-search { display: flex; align-items: center; gap: 6px; background: #fff; border: 1.5px solid #e5e0d8; border-radius: 10px; padding: 0 10px; margin-bottom: 10px; color: #9a9590; }
.iq-search input { border: none; outline: none; padding: 9px 0; font-family: inherit; font-size: 13px; flex: 1; min-width: 0; }
.iq-table-wrap { overflow-x: auto; background: #fff; border: 1px solid #e5e0d8; border-radius: 14px; }
.iq-table { width: 100%; border-collapse: collapse; font-size: 12.5px; }
.iq-table th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .06em; color: #9a9590; padding: 9px 8px; border-bottom: 1px solid #f0ede8; white-space: nowrap; }
.iq-table td { padding: 9px 8px; border-bottom: 1px solid #f7f5f2; vertical-align: top; }
.iq-table tbody tr { cursor: pointer; } .iq-table tbody tr:hover td { background: #fafaf8; }
.iq-cards { display: none; flex-direction: column; gap: 8px; }
.iq-card { background: #fff; border: 1px solid #e5e0d8; border-radius: 12px; padding: 10px 12px; cursor: pointer; }
.iq-card-box { background: #fff; border: 1px solid #e5e0d8; border-radius: 14px; padding: 12px 14px; min-width: 0; }
.iq-bars-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 10px; margin-top: 14px; }
.iq-bar { display: grid; grid-template-columns: minmax(80px, 40%) 1fr auto; gap: 8px; align-items: center; font-size: 12.5px; margin-bottom: 6px; }
.iq-bar span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #5a5550; }
.iq-bar i { height: 8px; background: #f0ede8; border-radius: 100px; overflow: hidden; } .iq-bar b { display: block; height: 100%; background: linear-gradient(90deg, #2E8BC0, #5BC0BE); border-radius: 100px; }
.iq-bar em { font-style: normal; font-weight: 700; color: #0C3C60; }
.iq-pager { display: flex; justify-content: center; align-items: center; gap: 10px; margin-top: 10px; font-size: 12.5px; color: #5a5550; }
@media (max-width: 760px) {
  .iq-desktop { display: none; } .iq-cards { display: flex; }
  .iq-qrow { grid-template-columns: 1fr auto; } .iq-qrow .iq-next { grid-column: 1 / -1; order: 3; }
  .iq-mine { margin-left: 0; }
}
/* Modals */
.iq-overlay { position: fixed; inset: 0; background: rgba(12,60,96,.35); display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px; z-index: 1000; overflow-y: auto; }
.iq-modal { background: #fff; border-radius: 18px; padding: 18px; width: 100%; max-width: 640px; font-family: 'Outfit', sans-serif; margin: auto 0; }
.iq-modal.iq-narrow { max-width: 460px; } .iq-modal.iq-detail { max-width: 720px; }
.iq-modal-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; font-size: 16px; color: #0C3C60; margin-bottom: 4px; }
.iq-modal-head > div { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.iq-x { background: none; border: none; cursor: pointer; color: #9a9590; }
.iq-sub { font-size: 12.5px; color: #5a5550; margin-bottom: 8px; }
.iq-sub a { color: #2E8BC0; font-weight: 600; text-decoration: none; }
.iq-note { background: #fafaf8; border: 1px solid #f0ede8; border-radius: 10px; padding: 8px 10px; font-size: 13px; margin-bottom: 10px; white-space: pre-wrap; }
.iq-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 10px; margin-bottom: 10px; }
.iq-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; font-weight: 600; color: #5a5550; margin-bottom: 10px; }
.iq-field input, .iq-field select, .iq-field textarea { border: 1.5px solid #e5e0d8; border-radius: 9px; padding: 8px 10px; font-family: inherit; font-size: 13.5px; font-weight: 400; background: #fff; min-width: 0; }
.iq-grid .iq-field { margin-bottom: 0; }
.iq-err { color: #b91c1c; font-size: 12.5px; margin: 6px 0; }
.iq-hint { font-size: 12.5px; color: #78350f; background: #fffbeb; border-radius: 8px; padding: 6px 9px; margin-bottom: 8px; }
.iq-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 6px; }
.iq-seg { display: flex; gap: 0; border: 1.5px solid #e5e0d8; border-radius: 10px; overflow: hidden; margin-bottom: 10px; }
.iq-seg button { flex: 1; border: none; background: #fff; padding: 9px 6px; font-family: inherit; font-size: 13px; font-weight: 600; color: #5a5550; cursor: pointer; display: inline-flex; gap: 5px; justify-content: center; align-items: center; }
.iq-seg button + button { border-left: 1.5px solid #e5e0d8; }
.iq-seg button.on { background: #0C3C60; color: #fff; }
.iq-close-row { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 12px; color: #9a9590; margin-bottom: 8px; }
.iq-action-bar { display: flex; flex-wrap: wrap; gap: 6px; margin: 4px 0 12px; }
.iq-section { border-top: 1px solid #f0ede8; padding-top: 10px; margin-top: 10px; }
.iq-section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; color: #9a9590; margin-bottom: 8px; }
.iq-timeline, .iq-appts { list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; font-size: 13px; }
.iq-timeline li { display: flex; gap: 8px; align-items: flex-start; } .iq-timeline svg { margin-top: 3px; color: #2E8BC0; flex-shrink: 0; }
.iq-appts li { display: flex; gap: 10px; flex-wrap: wrap; }
.iq-appt-status { font-size: 11px; font-weight: 700; text-transform: capitalize; color: #5a5550; }
.iq-appt-status.completed { color: #15803d; } .iq-appt-status.no_show, .iq-appt-status.cancelled { color: #b91c1c; }
`;
