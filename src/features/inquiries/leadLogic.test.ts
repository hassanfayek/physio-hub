import { describe, it, expect } from "vitest";
import { deriveLead, inQueue, byQueue, phoneMatches } from "./leadLogic";
import type { Lead } from "../../services/businessService";
import type { AAppt } from "../analytics/metrics";

const NOW = "2026-10-29T12:00";
const lead = (p: Partial<Lead>): Lead => ({
  id: Math.random().toString(36), date: "2026-10-20", time: "10:00", source: "meta_ads", channel: "whatsapp", campaign: "", service: "",
  name: "", phone: "01001234567", note: "", status: "new", closeReason: "", patientId: "", assignedTo: "", assignedName: "",
  nextFollowUpAt: "", interactions: [], createdBy: "", createdAt: null, ...p,
});
const appt = (p: Partial<AAppt>): AAppt => ({ id: Math.random().toString(36), patientId: "pt", physioId: "d", physioName: "D",
  date: "2026-10-22", hour: 16, sessionType: "Assessment Session", status: "completed", ...p });
const call = (at: string, outcome: "answered" | "no_answer" = "no_answer") => ({ at, type: "call" as const, outcome, note: "", by: "u", byName: "U", dueAt: "" });

describe("derived stage (from real appointments)", () => {
  it("an unlinked inquiry follows its manual status", () => {
    expect(deriveLead(lead({ status: "contacted" }), [], null, NOW).stage).toBe("contacted");
  });
  it("booking alone is 'booked', never attended or converted", () => {
    const v = deriveLead(lead({ patientId: "pt" }), [appt({ date: "2026-11-02", status: "scheduled" })], "2026-10-21", NOW);
    expect([v.stage, v.booked, v.attended, v.converted]).toEqual(["booked", true, false, false]);
  });
  it("a no-show stays linked and is shown as booked — did not attend", () => {
    expect(deriveLead(lead({ patientId: "pt" }), [appt({ status: "no_show" })], "2026-10-21", NOW).stage).toBe("no_show");
  });
  it("attending an assessment only is 'attended', not converted", () => {
    const v = deriveLead(lead({ patientId: "pt" }), [appt({})], "2026-10-21", NOW);
    expect([v.stage, v.attendedAssessment, v.converted]).toEqual(["attended", true, false]);
  });
  it("a completed treatment session converts", () => {
    const v = deriveLead(lead({ patientId: "pt", status: "lost" }), [appt({}), appt({ date: "2026-10-25", sessionType: "Physiotherapy Session" })], "2026-10-21", NOW);
    expect(v.stage).toBe("converted");
  });
  it("appointments before the inquiry date and other patients' appointments are ignored", () => {
    const v = deriveLead(lead({ patientId: "pt" }), [appt({ date: "2026-10-01" }), appt({ patientId: "other" })], "2026-01-01", NOW);
    expect([v.booked, v.stage]).toEqual([false, "new"]);
  });
  it("closed beats attended (didn't proceed) but an upcoming booking beats closed", () => {
    expect(deriveLead(lead({ patientId: "pt", status: "lost" }), [appt({})], "2026-10-21", NOW).stage).toBe("lost");
    expect(deriveLead(lead({ patientId: "pt", status: "lost" }), [appt({ date: "2026-11-01", status: "scheduled" })], "2026-10-21", NOW).stage).toBe("booked");
  });
  it("a patient who existed before the inquiry is a reactivation", () => {
    expect(deriveLead(lead({ patientId: "pt" }), [], "2025-05-01", NOW).reactivation).toBe(true);
    expect(deriveLead(lead({ patientId: "pt" }), [], "2026-10-21", NOW).reactivation).toBe(false);
  });
});

describe("follow-ups, attempts and response time", () => {
  it("overdue / today / later relative to now; closed inquiries have no follow-up", () => {
    expect(deriveLead(lead({ nextFollowUpAt: "2026-10-29T09:00" }), [], null, NOW).followUp).toBe("overdue");
    expect(deriveLead(lead({ nextFollowUpAt: "2026-10-29T17:00" }), [], null, NOW).followUp).toBe("today");
    expect(deriveLead(lead({ nextFollowUpAt: "2026-11-02T10:00" }), [], null, NOW).followUp).toBe("later");
    expect(deriveLead(lead({ status: "lost", nextFollowUpAt: "2026-10-01T09:00" }), [], null, NOW).followUp).toBe("none");
  });
  it("attempts, last contact and minutes to first response come from the interaction log", () => {
    const v = deriveLead(lead({ status: "contacted", interactions: [call("2026-10-21T09:00"), call("2026-10-20T10:45")] }), [], null, NOW);
    expect([v.attempts, v.lastContactAt, v.firstResponseMinutes]).toEqual([2, "2026-10-21T09:00", 45]);
  });
  it("older inquiries without a time have no response time", () => {
    expect(deriveLead(lead({ time: "", interactions: [call("2026-10-20T10:45")] }), [], null, NOW).firstResponseMinutes).toBeNull();
  });
  it("needs first response only while new and never contacted", () => {
    expect(deriveLead(lead({}), [], null, NOW).needsFirstResponse).toBe(true);
    expect(deriveLead(lead({ interactions: [call("2026-10-20T11:00")] }), [], null, NOW).needsFirstResponse).toBe(false);
  });
});

describe("work queue", () => {
  const views = [
    deriveLead(lead({ id: "later", status: "contacted", nextFollowUpAt: "2026-11-05T10:00" }), [], null, NOW),
    deriveLead(lead({ id: "new-old", date: "2026-10-18" }), [], null, NOW),
    deriveLead(lead({ id: "overdue", status: "contacted", nextFollowUpAt: "2026-10-27T10:00" }), [], null, NOW),
    deriveLead(lead({ id: "today", status: "replied", nextFollowUpAt: "2026-10-29T15:00" }), [], null, NOW),
    deriveLead(lead({ id: "lost", status: "lost" }), [], null, NOW),
  ];
  it("orders overdue, unanswered new, due today, other open, then closed", () => {
    expect([...views].sort(byQueue).map((v) => v.lead.id)).toEqual(["overdue", "new-old", "today", "later", "lost"]);
  });
  it("quick filters", () => {
    expect(views.filter((v) => inQueue(v, "today")).map((v) => v.lead.id)).toEqual(["today"]);
    expect(views.filter((v) => inQueue(v, "overdue")).map((v) => v.lead.id)).toEqual(["overdue"]);
    expect(views.filter((v) => inQueue(v, "new")).map((v) => v.lead.id)).toEqual(["new-old"]);
    expect(views.filter((v) => inQueue(v, "awaiting")).map((v) => v.lead.id)).toEqual(["later", "overdue"]);
  });
});

describe("duplicates", () => {
  it("matches the same phone in any format, ignoring invalid inquiries and itself", () => {
    const leads = [lead({ id: "a", phone: "+20 100 123 4567" }), lead({ id: "b", phone: "01001234567", status: "invalid" }), lead({ id: "c", phone: "01119998887" })];
    const m = phoneMatches("01001234567", leads, [{ uid: "p", phone: "201001234567" }], "x");
    expect(m.leads.map((l) => l.id)).toEqual(["a"]);
    expect(m.patients).toHaveLength(1);
    expect(phoneMatches("123", leads, []).leads).toEqual([]);
  });
});
