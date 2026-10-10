import { describe, expect, it } from "vitest";
import { addDays, dayBounds, dayKeyOf, displayMinutes, dragRange, formatDuration, fromLocalInput, toLocalInput, weekStart } from "@/lib/time";

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

describe("dragRange", () => {
  const at = (hhmm: string) => new Date(`2026-10-08T${hhmm}:00Z`).getTime();
  const bounds = { min: at("07:00"), max: at("22:00") };
  const iso = (r: { start: Date; end: Date }) => [r.start.toISOString().slice(11, 16), r.end.toISOString().slice(11, 16)];

  it("snaps a downward drag to 15 minutes", () => {
    expect(iso(dragRange(at("09:10"), at("10:20"), bounds))).toEqual(["09:15", "10:15"]);
  });

  it("handles dragging upwards", () => {
    expect(iso(dragRange(at("10:20"), at("09:10"), bounds))).toEqual(["09:15", "10:15"]);
  });

  it("turns a click into a 30-minute range from the clicked step", () => {
    expect(iso(dragRange(at("09:52"), at("09:55"), bounds))).toEqual(["09:45", "10:15"]);
  });

  it("clamps to the visible range", () => {
    expect(iso(dragRange(at("21:50"), at("21:52"), bounds))).toEqual(["21:45", "22:00"]);
    expect(iso(dragRange(at("06:00"), at("07:40"), bounds))).toEqual(["07:00", "07:45"]);
  });

  describe("displayMinutes", () => {
    const tz = "Europe/Berlin";
    const at = (iso: string) => new Date(iso);

    it("uses the day window when everything fits", () => {
      const items: [Date, Date][] = [[at("2026-10-08T07:00:00Z"), at("2026-10-08T08:00:00Z")]]; // 09:00–10:00
      expect(displayMinutes("2026-10-08", items, tz, [420, 1320])).toEqual([420, 1320]);
    });

    it("stretches to items outside the window, rounded to hours", () => {
      const items: [Date, Date][] = [[at("2026-10-08T03:40:00Z"), at("2026-10-08T04:10:00Z")]]; // 05:40–06:10
      expect(displayMinutes("2026-10-08", items, tz, [420, 1320])).toEqual([300, 1320]);
    });

    it("clamps items crossing midnight to the day", () => {
      const items: [Date, Date][] = [[at("2026-10-08T20:30:00Z"), at("2026-10-09T01:00:00Z")]]; // 22:30–03:00 next day
      expect(displayMinutes("2026-10-08", items, tz, [420, 1320])).toEqual([420, 1440]);
      expect(displayMinutes("2026-10-09", items, tz, [420, 1320])).toEqual([0, 1320]);
    });

    it("ignores items on other days", () => {
      const items: [Date, Date][] = [[at("2026-10-10T02:00:00Z"), at("2026-10-10T03:00:00Z")]];
      expect(displayMinutes("2026-10-08", items, tz, [420, 1320])).toEqual([420, 1320]);
    });
  });
});
