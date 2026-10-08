import { describe, expect, it } from "vitest";
import { addDays, dayBounds, dayKeyOf, formatDuration, fromLocalInput, toLocalInput, weekStart } from "@/lib/time";

describe("time helpers", () => {
  it("computes local day bounds across a DST change", () => {
    // Europe/Berlin switches from CEST to CET on 2026-10-25 (a 25h day).
    const { start, end } = dayBounds("2026-10-25", "Europe/Berlin");
    expect(start.toISOString()).toBe("2026-10-24T22:00:00.000Z");
    expect(end.toISOString()).toBe("2026-10-25T23:00:00.000Z");
  });

  it("round-trips datetime-local values in the user's zone", () => {
    const d = fromLocalInput("2026-10-08T09:30", "America/New_York");
    expect(d.toISOString()).toBe("2026-10-08T13:30:00.000Z");
    expect(toLocalInput(d, "America/New_York")).toBe("2026-10-08T09:30");
    expect(dayKeyOf(new Date("2026-10-09T02:00:00Z"), "America/Los_Angeles")).toBe("2026-10-08");
  });

  it("does day arithmetic", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(weekStart("2026-10-08")).toBe("2026-10-05"); // Thursday → Monday
    expect(weekStart("2026-10-11")).toBe("2026-10-05"); // Sunday → Monday
  });

  it("formats durations", () => {
    expect(formatDuration(5)).toBe("5m");
    expect(formatDuration(60)).toBe("1h");
    expect(formatDuration(95)).toBe("1h 35m");
    expect(formatDuration(-20)).toBe("-20m");
  });
});
