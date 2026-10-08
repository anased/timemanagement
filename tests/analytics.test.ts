import { describe, expect, it } from "vitest";
import {
  combineSummaries,
  compareBlocks,
  freeSlots,
  gapUsage,
  groupActivities,
  mergeIntervals,
  subtract,
  summarize,
  taskStats,
  type Entry,
  type PlannedBlock,
} from "@/lib/analytics";

const t = (hhmm: string) => new Date(`2026-10-08T${hhmm}:00Z`);
const block = (id: string, title: string, s: string, e: string): PlannedBlock => ({ id, title, start: t(s), end: t(e) });
const entry = (id: string, title: string, s: string, e: string | null, plannedEventId: string | null = null, categoryId: string | null = null): Entry => ({
  id,
  title,
  start: t(s),
  end: e ? t(e) : null,
  plannedEventId,
  categoryId,
});
const window = { start: t("08:00"), end: t("18:00") };
const range = { start: t("00:00"), end: new Date("2026-10-09T00:00:00Z") };

describe("interval helpers", () => {
  it("merges overlapping and touching intervals", () => {
    const merged = mergeIntervals([
      { start: t("10:00"), end: t("11:00") },
      { start: t("09:00"), end: t("10:30") },
      { start: t("11:00"), end: t("11:15") },
      { start: t("13:00"), end: t("14:00") },
    ]);
    expect(merged).toEqual([
      { start: t("09:00"), end: t("11:15") },
      { start: t("13:00"), end: t("14:00") },
    ]);
  });

  it("subtracts covered intervals from a window", () => {
    expect(subtract(window, [{ start: t("07:00"), end: t("09:00") }, { start: t("12:00"), end: t("13:00") }])).toEqual([
      { start: t("09:00"), end: t("12:00") },
      { start: t("13:00"), end: t("18:00") },
    ]);
  });
});

describe("freeSlots", () => {
  const planned = [block("a", "Deep work", "09:00", "11:00"), block("b", "Email", "11:10", "12:00"), block("c", "Overlap", "10:30", "11:05")];

  it("finds gaps between planned blocks inside the day window", () => {
    expect(freeSlots(planned, window)).toEqual([
      { start: t("08:00"), end: t("09:00") },
      { start: t("11:05"), end: t("11:10") },
      { start: t("12:00"), end: t("18:00") },
    ]);
  });

  it("drops slots shorter than the minimum", () => {
    expect(freeSlots(planned, window, 15)).toHaveLength(2);
  });

  it("clips blocks that extend outside the window", () => {
    expect(freeSlots([block("x", "Late", "17:30", "19:00")], window)).toEqual([{ start: t("08:00"), end: t("17:30") }]);
  });
});

describe("compareBlocks", () => {
  const now = t("15:00");
  const planned = [
    block("a", "Write report", "09:00", "10:00"),
    block("b", "Email", "10:00", "10:30"),
    block("c", "Gym", "11:00", "12:00"),
    block("d", "Plan tomorrow", "16:00", "16:30"),
  ];
  const entries = [
    entry("1", "Write report", "09:10", "10:25", "a"),
    entry("2", "Slack", "10:25", "10:40"),
    entry("3", "Write report", "13:00", "13:20", "a"),
  ];

  const rows = compareBlocks(planned, entries, [{ calendarEventId: "c", status: "SKIPPED" }], now);
  const byId = Object.fromEntries(rows.map((r) => [r.block.id, r]));

  it("sums linked entries even outside the block window and measures start drift", () => {
    expect(byId.a.actualMin).toBe(95);
    expect(byId.a.diffMin).toBe(35);
    expect(byId.a.startDriftMin).toBe(10);
    expect(byId.a.status).toBe("TRACKED");
  });

  it("reports what happened during the block instead", () => {
    expect(byId.b.instead).toEqual([
      { title: "Write report", categoryId: null, minutes: 25 },
      { title: "Slack", categoryId: null, minutes: 5 },
    ]);
    expect(byId.b.status).toBe("UNREVIEWED");
  });

  it("uses review status and marks future blocks upcoming", () => {
    expect(byId.c.status).toBe("SKIPPED");
    expect(byId.d.status).toBe("UPCOMING");
  });

  it("treats a running timer as ending now", () => {
    const [row] = compareBlocks([block("a", "x", "14:00", "16:00")], [entry("1", "x", "14:30", null, "a")], [], now);
    expect(row.status).toBe("IN_PROGRESS");
    expect(row.actualMin).toBe(30);
  });
});

describe("gapUsage", () => {
  it("splits each free slot into tracked activities and untracked time", () => {
    const now = t("13:00");
    const slots = [{ start: t("10:00"), end: t("12:00") }, { start: t("12:30"), end: t("14:00") }];
    const entries = [
      entry("1", "Lunch", "10:30", "11:00", null, "break"),
      entry("2", "lunch ", "11:30", "11:45", null, "break"),
      entry("3", "Reading", "11:50", "12:10"),
    ];
    const [first, second] = gapUsage(slots, entries, now);
    expect(first.activities).toEqual([
      { title: "Lunch", categoryId: "break", minutes: 45 },
      { title: "Reading", categoryId: null, minutes: 10 },
    ]);
    expect(first.trackedMin).toBe(55);
    expect(first.untrackedMin).toBe(65);
    // Only the elapsed part of a slot counts as untracked.
    expect(second.untrackedMin).toBe(30);
  });
});

describe("summarize", () => {
  it("computes day totals and adherence", () => {
    const now = t("12:00");
    const planned = [block("a", "Deep work", "09:00", "11:00"), block("b", "Later", "14:00", "15:00")];
    const entries = [
      entry("1", "Deep work", "09:30", "10:30", "a"),
      entry("2", "Twitter", "10:30", "11:00"),
      entry("3", "Coffee", "11:00", "11:30"),
    ];
    const s = summarize({ planned, entries, range, window, minGapMin: 0, now });
    expect(s.plannedMin).toBe(180);
    expect(s.trackedMin).toBe(120);
    expect(s.onPlanMin).toBe(60);
    expect(s.offPlanMin).toBe(60);
    expect(s.freeMin).toBe(600 - 180);
    expect(s.freeTrackedMin).toBe(30);
    // 08:00–12:00 elapsed, 2h tracked
    expect(s.untrackedMin).toBe(120);
    // only block a has started: 60 of 120 minutes
    expect(s.startedPlannedMin).toBe(120);
    expect(s.adherence).toBeCloseTo(0.5);
  });

  it("has no adherence before any block starts", () => {
    const s = summarize({ planned: [block("a", "x", "09:00", "10:00")], entries: [], range, window, minGapMin: 0, now: t("08:30") });
    expect(s.adherence).toBeNull();
  });

  it("weights combined adherence by started planned time", () => {
    const base = { plannedMin: 0, trackedMin: 0, onPlanMin: 0, offPlanMin: 0, freeMin: 0, freeTrackedMin: 0, untrackedMin: 0 };
    const total = combineSummaries([
      { ...base, startedPlannedMin: 60, adherence: 1 },
      { ...base, startedPlannedMin: 180, adherence: 0.5 },
      { ...base, startedPlannedMin: 0, adherence: null },
    ]);
    expect(total.adherence).toBeCloseTo((60 + 90) / 240);
  });
});

describe("taskStats and groupActivities", () => {
  it("aggregates finished blocks by title", () => {
    const now = t("23:00");
    const planned = [block("a", "Email", "09:00", "09:30"), block("b", "email", "13:00", "13:30"), block("c", "Email", "17:00", "17:30")];
    const entries = [entry("1", "Email", "09:00", "10:00", "a"), entry("2", "Email", "13:00", "13:20", "b")];
    const stats = taskStats(compareBlocks(planned, entries, [{ calendarEventId: "c", status: "SKIPPED" }], now));
    expect(stats).toHaveLength(1);
    expect(stats[0]).toMatchObject({ count: 3, plannedMin: 90, actualMin: 80, overruns: 1, skipped: 1 });
  });

  it("merges activity titles case-insensitively", () => {
    expect(
      groupActivities([
        { title: "Email", categoryId: null, minutes: 5 },
        { title: " email", categoryId: null, minutes: 10 },
        { title: "Email", categoryId: "x", minutes: 1 },
        { title: "Zero", categoryId: null, minutes: 0 },
      ]),
    ).toEqual([
      { title: "Email", categoryId: null, minutes: 15 },
      { title: "Email", categoryId: "x", minutes: 1 },
    ]);
  });
});
