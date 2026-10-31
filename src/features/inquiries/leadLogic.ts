// FILE: src/features/inquiries/leadLogic.ts
// Pure inquiry logic (no Firestore/React), unit-tested in leadLogic.test.ts.
//
// The manual status only covers what staff decide (new → contacted → replied →
// follow-up, or closed as lost / unresponsive / invalid). Whether an inquiry
// booked, attended or converted is DERIVED from the linked patient's real
// appointments on/after the inquiry date, so it can never contradict the schedule.

import type { AAppt } from "../analytics/metrics";
import { phoneKey } from "../analytics/patientSearch";
import { time12, dateTime12 } from "../../utils/time";
import { CLOSED_LEAD_STATUSES, type Lead } from "../../services/businessService";

export const isAssessment = (t: string) => /assessment/i.test(t);

export type Stage =
  | "new" | "contacted" | "replied" | "follow_up"
  | "booked" | "no_show" | "attended" | "converted"
  | "lost" | "unresponsive" | "invalid";

export const STAGE_LABEL: Record<Stage, string> = {
  new: "New", contacted: "Contacted — awaiting patient", replied: "Patient replied", follow_up: "Follow-up due",
  booked: "Appointment booked", no_show: "Booked — did not attend", attended: "Attended",
  converted: "Converted to patient", lost: "Lost", unresponsive: "Unresponsive", invalid: "Duplicate / invalid",
};

export type FollowUpState = "overdue" | "today" | "later" | "none";

export interface LeadView {
  lead: Lead;
  stage: Stage;
  closed: boolean;               // lost / unresponsive / invalid (and not overridden by a booking/conversion)
  registered: boolean;           // linked to a patient record
  reactivation: boolean;         // the patient already existed before this inquiry
  booked: boolean;               // has any (non-rescheduled) appointment on/after the inquiry date
  nextAppt: AAppt | null;        // first upcoming appointment
  firstAppt: AAppt | null;       // first appointment after the inquiry
  attended: boolean;             // any completed appointment after the inquiry
  attendedAssessment: boolean;
  converted: boolean;            // ≥1 completed treatment (non-assessment) session after the inquiry
  followUp: FollowUpState;
  needsFirstResponse: boolean;   // new and never contacted
  attempts: number;
  lastContactAt: string;         // "YYYY-MM-DDTHH:MM" or ""
  firstResponseMinutes: number | null;
  nextAction: string;
}

const minutesBetween = (a: string, b: string) => (Date.parse(b + ":00Z") - Date.parse(a + ":00Z")) / 60000;

/** `now` is clinic-local "YYYY-MM-DDTHH:MM". `appts` may contain any appointments; only the
 *  linked patient's, on/after the inquiry date, are used. */
export function deriveLead(lead: Lead, appts: AAppt[], patientCreatedDate: string | null, now: string): LeadView {
  const today = now.slice(0, 10);
  const own = lead.patientId
    ? appts.filter((a) => a.patientId === lead.patientId && a.date >= lead.date && a.status !== "rescheduled")
        .sort((a, b) => a.date.localeCompare(b.date) || a.hour - b.hour)
    : [];
  const done = own.filter((a) => a.status === "completed");
  const upcoming = own.filter((a) => (a.status === "scheduled" || a.status === "in_progress") && a.date >= today);
  const converted = done.some((a) => !isAssessment(a.sessionType));
  const attended = done.length > 0;
  const noShow = !attended && upcoming.length === 0 && own.some((a) => a.status === "no_show");
  const manualClosed = CLOSED_LEAD_STATUSES.includes(lead.status);

  let stage: Stage;
  if (converted) stage = "converted";
  else if (upcoming.length) stage = "booked";
  else if (manualClosed) stage = lead.status as Stage;
  else if (attended) stage = "attended";
  else if (noShow) stage = "no_show";
  else stage = (["new", "contacted", "replied", "follow_up"].includes(lead.status) ? lead.status : "new") as Stage;
  const closed = stage === "lost" || stage === "unresponsive" || stage === "invalid";

  const open = !closed && stage !== "converted";
  const fu = lead.nextFollowUpAt;
  const followUp: FollowUpState = !open || !fu ? "none" : fu < now ? "overdue" : fu.slice(0, 10) === today ? "today" : "later";

  const its = [...lead.interactions].sort((a, b) => a.at.localeCompare(b.at));
  const lastContactAt = its.length ? its[its.length - 1].at : "";
  const firstResponseMinutes = lead.time && its.length ? Math.max(0, minutesBetween(`${lead.date}T${lead.time}`, its[0].at)) : null;
  const needsFirstResponse = stage === "new" && its.length === 0;

  const view: LeadView = {
    lead, stage, closed, registered: !!lead.patientId,
    reactivation: !!lead.patientId && !!patientCreatedDate && patientCreatedDate < lead.date,
    booked: own.length > 0, nextAppt: upcoming[0] ?? null, firstAppt: own[0] ?? null,
    attended, attendedAssessment: done.some((a) => isAssessment(a.sessionType)), converted,
    followUp, needsFirstResponse, attempts: its.length, lastContactAt, firstResponseMinutes, nextAction: "",
  };
  view.nextAction = nextActionFor(view);
  return view;
}

function nextActionFor(v: LeadView): string {
  const fu = v.lead.nextFollowUpAt;
  if (v.stage === "converted" || v.closed) return "—";
  if (v.followUp === "overdue") return `Follow up (was due ${fmtShort(fu)})`;
  if (v.needsFirstResponse) return "First reply";
  if (v.followUp === "today") return `Follow up today ${time12(fu.slice(11, 16))}`;
  if (v.stage === "booked" && v.nextAppt) return `Appointment ${fmtShort(v.nextAppt.date)}`;
  if (v.stage === "no_show") return "Rebook (missed appointment)";
  if (v.stage === "attended") return "Offer treatment plan";
  if (v.stage === "contacted") return fu ? `Wait for reply · follow up ${fmtShort(fu)}` : "Wait for reply";
  if (v.stage === "replied") return v.registered ? "Book appointment" : "Book or register";
  if (v.stage === "follow_up") return fu ? `Follow up ${fmtShort(fu)}` : "Set a follow-up";
  return fu ? `Follow up ${fmtShort(fu)}` : "—";
}

/** "2026-10-29T15:05" → "29 Oct 3:05 PM" (12-hour). */
export const fmtShort = (dt: string): string => dateTime12(dt);

// ─── Work queue ───────────────────────────────────────────────────────────────

export type QueueFilter = "today" | "overdue" | "new" | "awaiting" | "booked" | "all";

export function inQueue(v: LeadView, f: QueueFilter): boolean {
  switch (f) {
    case "today":    return v.followUp === "today";
    case "overdue":  return v.followUp === "overdue";
    case "new":      return v.needsFirstResponse;
    case "awaiting": return v.stage === "contacted";
    case "booked":   return v.stage === "booked" || v.stage === "no_show";
    default:         return true;
  }
}

/** Overdue first (oldest first), then never-answered new inquiries (oldest first), then
 *  due today (by time), then other open ones by next follow-up, then closed/converted. */
export function queueRank(v: LeadView): [number, string] {
  const at = `${v.lead.date}T${v.lead.time || "00:00"}`;
  if (v.followUp === "overdue") return [0, v.lead.nextFollowUpAt];
  if (v.needsFirstResponse) return [1, at];
  if (v.followUp === "today") return [2, v.lead.nextFollowUpAt];
  if (!v.closed && v.stage !== "converted") return [3, v.lead.nextFollowUpAt || "9999"];
  return [4, String(99999999 - Number(v.lead.date.replace(/-/g, "")))];
}
export const byQueue = (a: LeadView, b: LeadView) => {
  const [ra, ka] = queueRank(a), [rb, kb] = queueRank(b);
  return ra - rb || ka.localeCompare(kb);
};

// ─── Duplicates ───────────────────────────────────────────────────────────────

export interface PhoneMatches<P> { leads: Lead[]; patients: P[] }
/** Other inquiries and patients with the same phone (any +20 / 0 format). Never merges. */
export function phoneMatches<P extends { phone: string }>(phone: string, leads: Lead[], patients: P[], excludeLeadId = ""): PhoneMatches<P> {
  const k = phoneKey(phone);
  if (k.length < 7) return { leads: [], patients: [] };
  return {
    leads: leads.filter((l) => l.id !== excludeLeadId && l.status !== "invalid" && phoneKey(l.phone) === k),
    patients: patients.filter((p) => phoneKey(p.phone) === k),
  };
}
