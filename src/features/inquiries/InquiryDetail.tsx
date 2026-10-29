// FILE: src/features/inquiries/InquiryDetail.tsx
// One inquiry: details, contact history (chronological), linked patient and the
// appointments after the inquiry, plus the actions to move it forward.

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Phone, MessageCircle, User, UserPlus, CalendarDays, Pencil, Trash2, AlertTriangle } from "lucide-react";
import type { Patient, Physiotherapist } from "../../services/patientService";
import {
  updateLead, deleteLead, setPatientSourceIfEmpty, labelFor, clinicToday,
  LEAD_SOURCES, LEAD_CHANNELS, LEAD_LOSS_REASONS, LEAD_INVALID_REASONS,
} from "../../services/businessService";
import { fmtHour12 } from "../../services/appointmentService";
import AddPatientModal from "../../components/AddPatientModal";
import PatientPicker from "../analytics/PatientPicker";
import { openScheduleDay } from "../../utils/navEvents";
import { STAGE_LABEL, fmtShort, phoneMatches, type LeadView } from "./leadLogic";
import type { AAppt } from "../analytics/metrics";
import type { Staff } from "./shared";

interface Props {
  view: LeadView;
  appts: AAppt[];
  patients: Patient[];
  physios: Physiotherapist[];
  isManager: boolean;
  me: Staff | null;
  onClose: () => void;
  onLog: () => void;
  onEdit: () => void;
}

const ICON = { call: Phone, message: MessageCircle, in_person: User };

export default function InquiryDetail({ view, appts, patients, physios, isManager, me, onClose, onLog, onEdit }: Props) {
  const lead = view.lead;
  const [converting, setConverting] = useState(false);
  const [dupCheck, setDupCheck] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const patient = lead.patientId ? patients.find((p) => p.uid === lead.patientId) : undefined;
  const after = lead.patientId ? appts.filter((a) => a.patientId === lead.patientId && a.date >= lead.date).sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour) : [];
  const history = [...lead.interactions].sort((a, b) => a.at.localeCompare(b.at));
  const reasonLabel = lead.closeReason ? labelFor(lead.status === "invalid" ? LEAD_INVALID_REASONS : LEAD_LOSS_REASONS, lead.closeReason, lead.closeReason) : "";

  const link = async (patientId: string) => {
    setErr(null);
    const r = await updateLead(lead.id, { patientId });
    if (r.error) return setErr(r.error);
    if (!patientId) return;
    // Attribute the patient to this inquiry's source only if they registered on/after it
    // (an existing patient's original source is never overwritten).
    const p = patients.find((x) => x.uid === patientId);
    const created = p?.createdAt?.toDate?.().toISOString().slice(0, 10) ?? "";
    if (created && created >= lead.date) await setPatientSourceIfEmpty(patientId, lead.source);
  };

  const startConvert = () => {
    const matches = phoneMatches(lead.phone, [], patients).patients;
    if (matches.length) setDupCheck(true); else setConverting(true);
  };
  const [first, ...rest] = lead.name.trim().split(/\s+/);
  const sourceLabel = lead.source && lead.source !== "unknown" ? labelFor(LEAD_SOURCES, lead.source, "") : "";

  return createPortal(
    <div className="iq-overlay" onClick={onClose}>
      <div className="iq-modal iq-detail" onClick={(e) => e.stopPropagation()}>
        <div className="iq-modal-head">
          <div><b>{lead.name || "Unnamed inquiry"}</b> <span className={`iq-stage s-${view.stage}`}>{STAGE_LABEL[view.stage]}</span>
            {view.reactivation && <span className="iq-badge">Existing patient · repeat inquiry</span>}</div>
          <button className="iq-x" onClick={onClose}><X size={16} /></button>
        </div>
        <div className="iq-sub">
          <a href={`tel:${lead.phone}`}>{lead.phone}</a> · {fmtShort(`${lead.date}${lead.time ? `T${lead.time}` : ""}`)} ·{" "}
          {labelFor(LEAD_SOURCES, lead.source, "Unknown source")} via {labelFor(LEAD_CHANNELS, lead.channel, "unknown channel")}
          {lead.campaign && <> · campaign “{lead.campaign}”</>}
          {lead.service && <> · {lead.service}</>}
        </div>
        {reasonLabel && <div className="iq-sub">Reason: <b>{reasonLabel}</b></div>}
        {lead.note && <div className="iq-note">{lead.note}</div>}

        <div className="iq-action-bar">
          {!view.closed && view.stage !== "converted" && <button className="iq-btn" onClick={onLog}>Log interaction</button>}
          <button className="iq-btn ghost" onClick={onEdit}><Pencil size={13} /> Edit</button>
          {!lead.patientId && <button className="iq-btn ghost" onClick={startConvert}><UserPlus size={13} /> Convert to patient</button>}
          {lead.patientId && <button className="iq-btn ghost" onClick={() => { onClose(); openScheduleDay(clinicToday()); }}><CalendarDays size={13} /> Book in schedule</button>}
          <button className="iq-btn ghost danger" onClick={async () => { if (window.confirm("Delete this inquiry and its history?")) { await deleteLead(lead.id); onClose(); } }}><Trash2 size={13} /></button>
        </div>

        <div className="iq-section">
          <div className="iq-section-title">Patient</div>
          <PatientPicker patients={patients} value={lead.patientId} suggestName={lead.name} suggestPhone={lead.phone} onChange={link} />
          {patient && <div className="iq-muted" style={{ marginTop: 6 }}>Linked to the patient record. Booking, attendance and conversion are read from their appointments.</div>}
          {err && <div className="iq-err">{err}</div>}
        </div>

        {lead.patientId && (
          <div className="iq-section">
            <div className="iq-section-title">Appointments since the inquiry</div>
            {after.length === 0 ? <div className="iq-muted">None yet.</div> : (
              <ul className="iq-appts">{after.map((a) => (
                <li key={a.id}><span>{fmtShort(a.date)} {fmtHour12(a.hour)}</span><span>{a.sessionType || "Session"}</span>
                  <span className={`iq-appt-status ${a.status}`}>{a.status.replace("_", "-")}</span></li>
              ))}</ul>
            )}
          </div>
        )}

        <div className="iq-section">
          <div className="iq-section-title">Contact history ({history.length})</div>
          {history.length === 0 ? <div className="iq-muted">No contact logged yet.</div> : (
            <ul className="iq-timeline">{history.map((h, i) => { const Icon = ICON[h.type] ?? Phone; return (
              <li key={i}><Icon size={13} />
                <div><b>{fmtShort(h.at)}</b> · {h.type === "message" ? "Message" : h.type === "call" ? "Call" : "In person"} · {h.outcome === "answered" ? (h.type === "message" ? "replied" : "answered") : (h.type === "message" ? "no reply" : "no answer")}
                  {h.byName && <span className="iq-muted"> · {h.byName}</span>}
                  {h.note && <div>{h.note}</div>}</div>
              </li>); })}</ul>
          )}
          {lead.nextFollowUpAt && <div className={`iq-next ${view.followUp}`}>Next follow-up: {fmtShort(lead.nextFollowUpAt)}{view.followUp === "overdue" ? " (overdue)" : ""}</div>}
        </div>

        {dupCheck && (
          <div className="iq-warn" style={{ marginTop: 10 }}><AlertTriangle size={14} />
            <div>A patient with this phone already exists: {phoneMatches(lead.phone, [], patients).patients.map((p) => (
              <button key={p.uid} className="iq-link" onClick={() => { link(p.uid); setDupCheck(false); }}>Link to {p.firstName} {p.lastName}</button>
            ))}. <button className="iq-link" onClick={() => { setDupCheck(false); setConverting(true); }}>Create a new patient anyway</button></div>
          </div>
        )}

        {converting && (
          <AddPatientModal
            physioId={me?.uid ?? ""}
            physios={isManager ? physios : []}
            initial={{ firstName: first ?? "", lastName: rest.join(" "), phone: lead.phone, acquisitionSource: lead.source === "unknown" ? "" : lead.source, referredBy: sourceLabel }}
            onClose={() => setConverting(false)}
            onCreated={(p) => { updateLead(lead.id, { patientId: p.uid }); }}
          />
        )}
      </div>
    </div>, document.body);
}
