import { describe, it, expect } from "vitest";
import { hour12Label, time12, split12, join24, dateTime12 } from "./time";

describe("12-hour time display", () => {
  it("hour labels, including midnight closing (24)", () => {
    expect([0, 9, 12, 15, 23, 24].map(hour12Label)).toEqual(["12:00 AM", "9:00 AM", "12:00 PM", "3:00 PM", "11:00 PM", "12:00 AM"]);
  });
  it("HH:MM → 12-hour", () => {
    expect(["00:05", "09:30", "12:00", "15:06", "18:56", "23:59", "", "25:00", "abc"].map(time12))
      .toEqual(["12:05 AM", "9:30 AM", "12:00 PM", "3:06 PM", "6:56 PM", "11:59 PM", "", "", ""]);
  });
  it("round-trips between picker parts and stored 24-hour values", () => {
    for (const t of ["00:00", "00:30", "11:59", "12:00", "12:45", "15:06", "23:59"]) {
      const p = split12(t)!;
      expect(join24(p.hour, p.minute, p.period)).toBe(t);
    }
  });
  it("date + time", () => {
    expect([dateTime12("2026-10-29T15:00"), dateTime12("2026-10-29T09:05"), dateTime12("2026-10-29")]).toEqual(["29 Oct 3:00 PM", "29 Oct 9:05 AM", "29 Oct"]);
  });
});
