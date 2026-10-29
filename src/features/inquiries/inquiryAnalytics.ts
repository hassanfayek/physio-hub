// FILE: src/features/inquiries/inquiryAnalytics.ts
// Inquiry analytics over a COHORT: inquiries whose inquiry date falls in the
// selected period. Every rate divides unique inquiries by unique inquiries of
// that same cohort — no unrelated period totals, no double counting.
// "Eligible" excludes inquiries closed as Duplicate / invalid.

import type { LeadView } from "./leadLogic";
import type { Range } from "../analytics/metrics";

const inR = (d: string, r: Range) => !!d && d >= r.from && d <= r.to;
const rate = (n: number, d: number) => (d > 0 ? n / d : null);
const count = <T,>(xs: T[], key: (x: T) => string) => {
  const out: Record<string, number> = {};
  for (const x of xs) { const k = key(x); out[k] = (out[k] ?? 0) + 1; }
  return out;
};

export const MIN_RESPONSE_SAMPLES = 5;

export interface InquiryStats {
  total: number; eligible: number; invalid: number;
  bySource: Record<string, number>; byChannel: Record<string, number>; byService: Record<string, number>;
  byStage: Record<string, number>; byReason: Record<string, number>; byAssignee: Record<string, number>;
  booked: number; bookingRate: number | null;                      // booked / eligible
  apptsDue: number; attendedDue: number; attendanceRate: number | null;  // first appointment, already due: completed / due
  prospects: number; registered: number; registrationRate: number | null; // new patients registered / eligible prospects (excl. existing patients)
  converted: number; conversionRate: number | null;                 // ≥1 completed treatment session / eligible
  attendedAssessment: number; assessmentConverted: number; assessmentToPatient: number | null;   // converted / attended an assessment
  reactivations: number;                                            // inquiries from people already registered before
  followUpsDue: number; followUpsOnTime: number; followUpCompletion: number | null;
  responseSamples: number; medianFirstResponseMin: number | null;   // null when < MIN_RESPONSE_SAMPLES
}

export function inquiryStats(views: LeadView[], r: Range, today: string, now: string): InquiryStats {
  const cohort = views.filter((v) => inR(v.lead.date, r));
  const eligible = cohort.filter((v) => v.lead.status !== "invalid");
  const due = eligible.filter((v) => v.firstAppt && v.firstAppt.date <= today &&
    ["completed", "no_show", "cancelled"].includes(v.firstAppt.status));
  const prospects = eligible.filter((v) => !v.reactivation);

  // Follow-ups: every interaction logged against a follow-up that was due in the period
  // (on time = logged no later than the due day), plus follow-ups due in the period that
  // are still overdue now (missed).
  let fuDue = 0, fuOnTime = 0;
  for (const v of views) {
    for (const it of v.lead.interactions) {
      if (!it.dueAt || !inR(it.dueAt.slice(0, 10), r)) continue;
      fuDue++;
      if (it.at.slice(0, 10) <= it.dueAt.slice(0, 10)) fuOnTime++;
    }
    const fu = v.lead.nextFollowUpAt;
    if (v.followUp === "overdue" && fu && fu < now && inR(fu.slice(0, 10), r)) fuDue++;
  }

  const resp = eligible.map((v) => v.firstResponseMinutes).filter((m): m is number => m !== null).sort((a, b) => a - b);
  const median = resp.length >= MIN_RESPONSE_SAMPLES
    ? (resp.length % 2 ? resp[(resp.length - 1) / 2] : (resp[resp.length / 2 - 1] + resp[resp.length / 2]) / 2)
    : null;

  const attendedAssessment = eligible.filter((v) => v.attendedAssessment);
  const closed = cohort.filter((v) => v.stage === "lost" || v.stage === "unresponsive");
  return {
    total: cohort.length, eligible: eligible.length, invalid: cohort.length - eligible.length,
    bySource: count(cohort, (v) => (!v.lead.source || v.lead.source === "unknown" ? "unknown" : v.lead.source)),
    byChannel: count(cohort, (v) => v.lead.channel || ""),
    byService: count(cohort, (v) => v.lead.service || ""),
    byStage: count(cohort, (v) => v.stage),
    byReason: count(closed, (v) => v.lead.closeReason || (v.stage === "unresponsive" ? "no_response" : "unknown")),
    byAssignee: count(cohort, (v) => v.lead.assignedName || "Unassigned"),
    booked: eligible.filter((v) => v.booked).length,
    bookingRate: rate(eligible.filter((v) => v.booked).length, eligible.length),
    apptsDue: due.length, attendedDue: due.filter((v) => v.firstAppt!.status === "completed").length,
    attendanceRate: rate(due.filter((v) => v.firstAppt!.status === "completed").length, due.length),
    prospects: prospects.length,
    registered: prospects.filter((v) => v.registered).length,
    registrationRate: rate(prospects.filter((v) => v.registered).length, prospects.length),
    converted: eligible.filter((v) => v.converted).length,
    conversionRate: rate(eligible.filter((v) => v.converted).length, eligible.length),
    attendedAssessment: attendedAssessment.length,
    assessmentConverted: attendedAssessment.filter((v) => v.converted).length,
    assessmentToPatient: rate(attendedAssessment.filter((v) => v.converted).length, attendedAssessment.length),
    reactivations: eligible.length - prospects.length,
    followUpsDue: fuDue, followUpsOnTime: fuOnTime, followUpCompletion: rate(fuOnTime, fuDue),
    responseSamples: resp.length, medianFirstResponseMin: median,
  };
}
