// FILE: src/features/inquiries/LogInteraction.tsx
// One-step "Log interaction": what happened, a short note, and when to follow up.
// Records the attempt only — it never contacts anyone.

import { useState } from "react";
import { createPortal } from "react-dom";
import { X, Phone, MessageCircle, User } from "lucide-react";
import { logLeadInteraction, clinicNow, LEAD_LOSS_REASONS, type LeadInteraction } from "../../services/businessService";
import type { LeadView } from "./leadLogic";
import { addDaysTo, type Staff } from "./shared";

export default function LogInteraction({ view, me, onClose }: { view: LeadView; me: Staff | null; onClose: () => void }) {
  const now = clinicNow();
  const lead = view.lead;
  const [type, setType] = useState<LeadInteraction["type"]>(lead.channel === "phone" ? "call" : lead.channel === "in_person" ? "in_person" : "message");
  const [outcome, setOutcome] = useState<LeadInteraction["outcome"]>("no_answer");
  const [note, setNote] = useState("");
  const [next, setNext] = useState(addDaysTo(now, outcome === "no_answer" ? 1 : 3));
  const [close, setClose] = useState<"" | "lost" | "unresponsive">("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const noAnswers = lead.interactions.filter((i) => i.outcome === "no_answer").length + (outcome === "no_answer" ? 1 : 0);

  const save = async () => {
    if (close === "lost" && !reason) return setErr("Choose a reason.");
    setBusy(true); setErr(null);
    const r = await logLeadInteraction(lead.id,
      { at: now, type, outcome, note, by: me?.uid ?? "", byName: me?.name ?? "" },
      close ? { status: close, closeReason: close === "unresponsive" ? "no_response" : reason } : { nextFollowUpAt: next });
    setBusy(false);
    if (r.error) setErr(r.error); else onClose();
  };

  return createPortal(
    <div className="iq-overlay" onClick={() => !busy && onClose()}>
      <div className="iq-modal iq-narrow" onClick={(e) => e.stopPropagation()}>
        <div className="iq-modal-head"><b>Log interaction</b><button className="iq-x" onClick={onClose}><X size={16} /></button></div>
        <div className="iq-sub">{lead.name || "Unnamed"} · {lead.phone} · attempt #{lead.interactions.length + 1}</div>

        <div className="iq-seg">
          {([["call", "Call", Phone], ["message", "Message", MessageCircle], ["in_person", "In person", User]] as const).map(([v, l, Icon]) => (
            <button key={v} type="button" className={type === v ? "on" : ""} onClick={() => setType(v)}><Icon size={14} /> {l}</button>
          ))}
        </div>
        <div className="iq-seg">
          {([["answered", type === "message" ? "Replied" : "Answered"], ["no_answer", type === "message" ? "No reply" : "No answer"]] as const).map(([v, l]) => (
            <button key={v} type="button" className={outcome === v ? "on" : ""} onClick={() => { setOutcome(v); setNext(addDaysTo(now, v === "no_answer" ? 1 : 3)); }}>{l}</button>
          ))}
        </div>
        <label className="iq-field"><span>Note</span><input value={note} placeholder="e.g. asked about prices, will confirm tomorrow" onChange={(e) => setNote(e.target.value)} /></label>

        {!close && (
          <div className="iq-field"><span>Next follow-up</span>
            <input type="datetime-local" value={next} onChange={(e) => setNext(e.target.value)} />
            <div className="iq-chips">
              {[["Tomorrow", 1], ["In 3 days", 3], ["In a week", 7]].map(([l, d]) => (
                <button key={l as string} type="button" className="iq-chip" onClick={() => setNext(addDaysTo(now, d as number))}>{l}</button>
              ))}
              <button type="button" className="iq-chip" onClick={() => setNext("")}>No follow-up</button>
            </div>
          </div>
        )}

        {noAnswers >= 3 && !close && (
          <div className="iq-hint">{noAnswers} attempts without an answer. <button className="iq-link" onClick={() => setClose("unresponsive")}>Mark as unresponsive</button></div>
        )}
        <div className="iq-close-row">
          <span>Close this inquiry:</span>
          <button type="button" className={`iq-chip ${close === "lost" ? "on" : ""}`} onClick={() => setClose(close === "lost" ? "" : "lost")}>Lost</button>
          <button type="button" className={`iq-chip ${close === "unresponsive" ? "on" : ""}`} onClick={() => setClose(close === "unresponsive" ? "" : "unresponsive")}>Unresponsive</button>
        </div>
        {close === "lost" && (
          <label className="iq-field"><span>Reason</span>
            <select value={reason} onChange={(e) => setReason(e.target.value)}>
              <option value="">Choose…</option>
              {LEAD_LOSS_REASONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select></label>
        )}
        {close && <div className="iq-hint">Closing stops all follow-ups for this inquiry.</div>}

        {err && <div className="iq-err">{err}</div>}
        <div className="iq-actions">
          <button className="iq-btn ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="iq-btn" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
        </div>
      </div>
    </div>, document.body);
}
