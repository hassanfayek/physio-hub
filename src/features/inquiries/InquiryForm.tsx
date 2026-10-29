// FILE: src/features/inquiries/InquiryForm.tsx
// Fast inquiry form for use during a call or while replying on WhatsApp.
// Required: phone, date/time, source, channel, status. Everything else optional;
// the reason field only appears when the status is a closed one.

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, AlertTriangle } from "lucide-react";
import type { Patient } from "../../services/patientService";
import {
  addLead, updateLead, clinicNow,
  LEAD_SOURCES, LEAD_CHANNELS, LEAD_SERVICES, LEAD_STATUSES, LEAD_LOSS_REASONS, LEAD_INVALID_REASONS,
  type Lead,
} from "../../services/businessService";
import { phoneMatches, fmtShort } from "./leadLogic";
import { addDaysTo, type Staff } from "./shared";

interface Props {
  existing: Lead | null;          // null = new inquiry
  leads: Lead[];
  patients: Patient[];
  staff: Staff[];
  me: Staff | null;
  campaigns: string[];            // previously used campaign names (suggestions)
  onClose: () => void;
  onOpenLead: (id: string) => void;
}

export default function InquiryForm({ existing, leads, patients, staff, me, campaigns, onClose, onOpenLead }: Props) {
  const now = clinicNow();
  const [f, setF] = useState(() => ({
    phone: existing?.phone ?? "",
    name: existing?.name ?? "",
    at: existing ? `${existing.date}T${existing.time || "00:00"}` : now,
    source: existing?.source || "",
    channel: existing?.channel || "",
    status: existing?.status ?? "new",
    closeReason: existing?.closeReason ?? "",
    service: existing?.service ?? "",
    campaign: existing?.campaign ?? "",
    note: existing?.note ?? "",
    assignedTo: existing ? existing.assignedTo : me?.uid ?? "",
    nextFollowUpAt: existing?.nextFollowUpAt ?? "",
    patientId: existing?.patientId ?? "",
  }));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  const closed = f.status === "lost" || f.status === "unresponsive" || f.status === "invalid";
  const reasons = f.status === "invalid" ? LEAD_INVALID_REASONS : LEAD_LOSS_REASONS;
  const dup = phoneMatches(f.phone, leads, patients, existing?.id ?? "");
  const openDup = dup.leads.filter((l) => !["lost", "unresponsive", "invalid"].includes(l.status));

  const save = async () => {
    const phone = f.phone.trim();
    if (!phone) return setErr("Phone number is required.");
    if (!/^[+\d][\d\s\-()]{5,}$/.test(phone)) return setErr("Enter a valid phone number.");
    if (!f.at || f.at.slice(0, 10) > now.slice(0, 10)) return setErr("Inquiry date can't be in the future.");
    if (!f.source) return setErr("Choose where they heard about us (or Unknown).");
    if (!f.channel) return setErr("Choose how they contacted us.");
    setBusy(true); setErr(null);
    const assignee = staff.find((s) => s.uid === f.assignedTo);
    const payload = {
      date: f.at.slice(0, 10), time: f.at.slice(11, 16), phone, name: f.name.trim(), source: f.source, channel: f.channel,
      status: f.status, closeReason: closed ? f.closeReason : "", service: f.service, campaign: f.campaign.trim(), note: f.note.trim(),
      assignedTo: f.assignedTo, assignedName: assignee?.name ?? "", nextFollowUpAt: closed ? "" : f.nextFollowUpAt, patientId: f.patientId,
    };
    const r = existing ? await updateLead(existing.id, payload) : await addLead({ ...payload, interactions: [], createdBy: me?.uid ?? "" });
    setBusy(false);
    if (r.error) setErr(r.error); else onClose();
  };

  return createPortal(
    <div className="iq-overlay" onClick={() => !busy && onClose()}>
      <div className="iq-modal" onClick={(e) => e.stopPropagation()}>
        <div className="iq-modal-head"><b>{existing ? "Edit inquiry" : "New inquiry"}</b><button className="iq-x" onClick={onClose}><X size={16} /></button></div>

        <div className="iq-grid">
          <label className="iq-field"><span>Phone *</span>
            <input inputMode="tel" autoFocus={!existing} value={f.phone} placeholder="01xxxxxxxxx" onChange={(e) => set("phone", e.target.value)} /></label>
          <label className="iq-field"><span>Name</span><input value={f.name} onChange={(e) => set("name", e.target.value)} /></label>
        </div>

        {(openDup.length > 0 || dup.patients.length > 0) && (
          <div className="iq-warn"><AlertTriangle size={14} />
            <div>
              {dup.patients.length > 0 && <div>This phone belongs to patient <b>{dup.patients.map((p) => `${p.firstName} ${p.lastName}`).join(", ")}</b>. Saving logs a repeat inquiry for an existing patient{!f.patientId && <> <button className="iq-link" onClick={() => set("patientId", dup.patients[0].uid)}>Link it to {dup.patients[0].firstName}</button></>}{f.patientId && " (linked)"}.</div>}
              {openDup.length > 0 && <div>Open inquir{openDup.length === 1 ? "y" : "ies"} with this phone: {openDup.map((l) => (
                <button key={l.id} className="iq-link" onClick={() => onOpenLead(l.id)}>{fmtShort(l.date)}{l.name ? ` · ${l.name}` : ""}</button>
              ))}. You can still save a separate inquiry if this is a new request.</div>}
            </div>
          </div>
        )}

        <div className="iq-grid">
          <label className="iq-field"><span>Inquiry date & time *</span>
            <input type="datetime-local" value={f.at} max={now} onChange={(e) => set("at", e.target.value)} /></label>
          <label className="iq-field"><span>Status *</span>
            <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value, closeReason: "" })}>
              {LEAD_STATUSES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></label>
          <label className="iq-field"><span>Heard about us via *</span>
            <select value={f.source} onChange={(e) => set("source", e.target.value)}>
              <option value="">Choose…</option>
              {LEAD_SOURCES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></label>
          <label className="iq-field"><span>Contacted us by *</span>
            <select value={f.channel} onChange={(e) => set("channel", e.target.value)}>
              <option value="">Choose…</option>
              {LEAD_CHANNELS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></label>
          {closed && (
            <label className="iq-field"><span>Reason</span>
              <select value={f.closeReason} onChange={(e) => set("closeReason", e.target.value)}>
                <option value="">Choose…</option>
                {reasons.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select></label>
          )}
          <label className="iq-field"><span>Service interested in</span>
            <select value={f.service} onChange={(e) => set("service", e.target.value)}>
              <option value="">—</option>
              {LEAD_SERVICES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select></label>
          {f.source === "meta_ads" && (
            <label className="iq-field"><span>Campaign (if known)</span>
              <input list="iq-campaigns" value={f.campaign} onChange={(e) => set("campaign", e.target.value)} />
              <datalist id="iq-campaigns">{campaigns.map((c) => <option key={c} value={c} />)}</datalist></label>
          )}
          <label className="iq-field"><span>Assigned to</span>
            <select value={f.assignedTo} onChange={(e) => set("assignedTo", e.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((s) => <option key={s.uid} value={s.uid}>{s.name}</option>)}
            </select></label>
          {!closed && (
            <div className="iq-field"><span>Next follow-up</span>
              <input type="datetime-local" value={f.nextFollowUpAt} onChange={(e) => set("nextFollowUpAt", e.target.value)} />
              <div className="iq-chips">
                {[["Tomorrow", 1], ["In 3 days", 3], ["In a week", 7]].map(([l, d]) => (
                  <button key={l as string} type="button" className="iq-chip" onClick={() => set("nextFollowUpAt", addDaysTo(now, d as number))}>{l}</button>
                ))}
                {f.nextFollowUpAt && <button type="button" className="iq-chip" onClick={() => set("nextFollowUpAt", "")}>Clear</button>}
              </div>
            </div>
          )}
        </div>
        <label className="iq-field"><span>Notes</span><textarea rows={2} value={f.note} onChange={(e) => set("note", e.target.value)} /></label>

        {err && <div className="iq-err">{err}</div>}
        <div className="iq-actions">
          <button className="iq-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="iq-btn" onClick={save} disabled={busy}>{busy ? "Saving…" : existing ? "Save" : "Add inquiry"}</button>
        </div>
      </div>
    </div>, document.body);
}
