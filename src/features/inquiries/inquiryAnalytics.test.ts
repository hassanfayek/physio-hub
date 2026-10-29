import { describe, it, expect } from "vitest";
import { inquiryStats } from "./inquiryAnalytics";
import { deriveLead } from "./leadLogic";
import type { Lead, LeadInteraction } from "../../services/businessService";
import type { AAppt } from "../analytics/metrics";

const NOW = "2026-10-29T12:00", TODAY = "2026-10-29";
const OCT = { from: "2026-10-01", to: "2026-10-31" };
let n = 0;
const lead = (p: Partial<Lead>): Lead => ({
  id: `l${n++}`, date: "2026-10-10", time: "10:00", source: "meta_ads", channel: "whatsapp", campaign: "", service: "", name: "", phone: "0100",
  note: "", status: "new", closeReason: "", patientId: "", assignedTo: "", assignedName: "", nextFollowUpAt: "", interactions: [], createdBy: "", createdAt: null, ...p,
});
const appt = (p: Partial<AAppt>): AAppt => ({ id: `a${n++}`, patientId: "p", physioId: "d", physioName: "D", date: "2026-10-15", hour: 16, sessionType: "Assessment Session", status: "completed", ...p });
const inter = (at: string, dueAt = ""): LeadInteraction => ({ at, type: "message", outcome: "answered", note: "", by: "u", byName: "U", dueAt });

describe("inquiry cohort stats", () => {
  const appts = [
    appt({ patientId: "p1" }), appt({ patientId: "p1", date: "2026-10-18", sessionType: "Physiotherapy Session" }), // p1: assessment + treatment
    appt({ patientId: "p2", status: "no_show" }),                                                                    // p2: no-show
    appt({ patientId: "p3", date: "2026-11-05", status: "scheduled" }),                                             // p3: future booking
  ];
  const created: Record<string, string> = { p1: "2026-10-12", p2: "2026-10-12", p3: "2026-10-12", old: "2025-01-01" };
  const views = [
    lead({ patientId: "p1" }), lead({ patientId: "p2" }), lead({ patientId: "p3" }),
    lead({ patientId: "old", source: "existing_patient" }),          // reactivation, never booked
    lead({ status: "lost", closeReason: "price" }), lead({ status: "unresponsive" }), lead({ status: "invalid" }),
    lead({ date: "2026-09-20" }),                                      // outside the cohort
  ].map((l) => deriveLead(l, appts, l.patientId ? created[l.patientId] : null, NOW));
  const s = inquiryStats(views, OCT, TODAY, NOW);

  it("cohort and eligibility (duplicates / invalid excluded)", () => {
    expect([s.total, s.eligible, s.invalid]).toEqual([7, 6, 1]);
  });
  it("booking rate = unique booked / eligible", () => {
    expect(s.booked).toBe(3);
    expect(s.bookingRate).toBeCloseTo(3 / 6);
  });
  it("attendance uses each inquiry's first appointment that is already due", () => {
    expect([s.apptsDue, s.attendedDue, s.attendanceRate]).toEqual([2, 1, 0.5]);   // p1 attended, p2 no-show; p3 not due yet
  });
  it("registration excludes existing patients; conversion needs a treatment session", () => {
    expect([s.prospects, s.registered, s.reactivations]).toEqual([5, 3, 1]);
    expect([s.converted, s.attendedAssessment, s.assessmentConverted, s.assessmentToPatient]).toEqual([1, 1, 1, 1]);
  });
  it("loss reasons and sources", () => {
    expect(s.byReason).toEqual({ price: 1, no_response: 1 });
    expect(s.bySource).toEqual({ meta_ads: 6, existing_patient: 1 });
  });
});

describe("follow-up completion and response time", () => {
  it("on time = logged no later than the day it was due; still-overdue ones count as missed", () => {
    const views = [
      lead({ interactions: [inter("2026-10-12T10:00", "2026-10-12T09:00"), inter("2026-10-15T10:00", "2026-10-14T09:00")] }),
      lead({ status: "contacted", nextFollowUpAt: "2026-10-20T09:00" }),
    ].map((l) => deriveLead(l, [], null, NOW));
    const s = inquiryStats(views, OCT, TODAY, NOW);
    expect([s.followUpsDue, s.followUpsOnTime]).toEqual([3, 1]);
  });
  it("median first response needs enough samples, otherwise insufficient data", () => {
    const mk = (mins: number) => lead({ time: "10:00", interactions: [inter(`2026-10-10T${String(10 + Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`)] });
    const few = [mk(5), mk(10)].map((l) => deriveLead(l, [], null, NOW));
    expect(inquiryStats(few, OCT, TODAY, NOW).medianFirstResponseMin).toBeNull();
    const many = [mk(5), mk(10), mk(20), mk(30), mk(90)].map((l) => deriveLead(l, [], null, NOW));
    expect(inquiryStats(many, OCT, TODAY, NOW).medianFirstResponseMin).toBe(20);
  });
  it("an empty cohort gives null rates, never 0%", () => {
    const s = inquiryStats([], OCT, TODAY, NOW);
    expect([s.bookingRate, s.attendanceRate, s.conversionRate, s.followUpCompletion]).toEqual([null, null, null, null]);
  });
});
