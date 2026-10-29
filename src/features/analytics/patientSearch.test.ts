import { describe, it, expect } from "vitest";
import { searchPatients, suggestPatients } from "./patientSearch";

const pts = [
  { uid: "1", firstName: "Mohamed", lastName: "Fahim", phone: "+201001234567" },
  { uid: "2", firstName: "Mohamed", lastName: "Ali", phone: "01112223334" },
  { uid: "3", firstName: "Eslam", lastName: "Ayman", phone: "01009998887" },
  { uid: "4", firstName: "Mona", lastName: "Fahmy", phone: "" },
];

describe("patient search", () => {
  it("matches name words in any order, case-insensitive", () => {
    expect(searchPatients(pts, "fahim mohamed").map((p) => p.uid)).toEqual(["1"]);
    expect(searchPatients(pts, "MOHAMED").map((p) => p.uid)).toEqual(["2", "1"]);   // both start with it; alphabetical
  });
  it("matches phone digits regardless of formatting", () => {
    expect(searchPatients(pts, "0100 999").map((p) => p.uid)).toEqual(["3"]);
  });
  it("empty query returns nothing; short digit strings don't match phones", () => {
    expect(searchPatients(pts, "  ")).toEqual([]);
    expect(searchPatients(pts, "01").map((p) => p.uid)).toEqual([]);
  });
});

describe("suggestions from the inquiry", () => {
  it("same phone first (any +20 / 0 format), then name matches, no duplicates", () => {
    expect(suggestPatients(pts, "Mohamed Fahim", "01001234567").map((p) => p.uid)).toEqual(["1"]);
    expect(suggestPatients(pts, "Mohamed", "").map((p) => p.uid)).toEqual(["2", "1"]);
  });
  it("nothing to suggest without a name or phone", () => {
    expect(suggestPatients(pts, "", "")).toEqual([]);
  });
});
