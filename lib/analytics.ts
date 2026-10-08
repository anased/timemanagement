/**
 * Pure plan-vs-actual analytics. No I/O, no time-zone logic: callers pass
 * absolute instants and the windows they care about.
 */

export interface Interval {
  start: Date;
  end: Date;
}

export interface PlannedBlock extends Interval {
  id: string;
  title: string;
}

export interface Entry {
  id: string;
  title: string;
  start: Date;
  /** null while the timer is running */
  end: Date | null;
  plannedEventId: string | null;
  categoryId: string | null;
}

export type ReviewStatus = "DONE" | "PARTIAL" | "SKIPPED" | "REPLACED";

export interface Review {
  calendarEventId: string;
  status: ReviewStatus;
}

export type BlockStatus = ReviewStatus | "TRACKED" | "IN_PROGRESS" | "UNREVIEWED" | "UPCOMING";

export interface Activity {
  title: string;
  categoryId: string | null;
  minutes: number;
}

export interface BlockComparison {
  block: PlannedBlock;
  status: BlockStatus;
  plannedMin: number;
  /** total duration of entries linked to this block (wherever they happened) */
  actualMin: number;
  /** actualMin - plannedMin */
  diffMin: number;
  /** minutes between planned start and the first linked entry's start (positive = late) */
  startDriftMin: number | null;
  /** unlinked activities that happened during the block's time window */
  instead: Activity[];
}

export interface GapUsage {
  slot: Interval;
  activities: Activity[];
  trackedMin: number;
  /** elapsed part of the slot with nothing tracked */
  untrackedMin: number;
}

export interface DaySummary {
  plannedMin: number;
  trackedMin: number;
  onPlanMin: number;
  offPlanMin: number;
  freeMin: number;
  freeTrackedMin: number;
  untrackedMin: number;
  /** planned minutes of blocks that have started (the adherence denominator) */
  startedPlannedMin: number;
  /** share of started planned time that was actually spent on the planned task, 0..1; null if nothing started yet */
  adherence: number | null;
}

const MIN = 60000;

export function minutes(i: Interval): number {
  return Math.max(0, (i.end.getTime() - i.start.getTime()) / MIN);
}

/** The interval an entry covers, treating a running timer as ending `now`. */
export function entryInterval(e: Entry, now: Date): Interval {
  const end = e.end ?? new Date(Math.max(now.getTime(), e.start.getTime()));
  return { start: e.start, end };
}

export function clip(i: Interval, w: Interval): Interval | null {
  const start = Math.max(i.start.getTime(), w.start.getTime());
  const end = Math.min(i.end.getTime(), w.end.getTime());
  return end > start ? { start: new Date(start), end: new Date(end) } : null;
}

export function overlapMinutes(a: Interval, b: Interval): number {
  const c = clip(a, b);
  return c ? minutes(c) : 0;
}

export function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = intervals
    .filter((i) => i.end > i.start)
    .map((i) => ({ start: i.start, end: i.end }))
    .sort((a, b) => a.start.getTime() - b.start.getTime());
  const out: Interval[] = [];
  for (const i of sorted) {
    const last = out[out.length - 1];
    if (last && i.start <= last.end) {
      if (i.end > last.end) last.end = i.end;
    } else {
      out.push({ ...i });
    }
  }
  return out;
}

/** Parts of `window` not covered by `covered`. */
export function subtract(window: Interval, covered: Interval[]): Interval[] {
  const out: Interval[] = [];
  let cursor = window.start;
  for (const c of mergeIntervals(covered.map((i) => clip(i, window)).filter((i): i is Interval => !!i))) {
    if (c.start > cursor) out.push({ start: cursor, end: c.start });
    if (c.end > cursor) cursor = c.end;
  }
  if (window.end > cursor) out.push({ start: cursor, end: window.end });
  return out;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

/** Groups (title, category) pairs and sums their minutes, largest first. */
export function groupActivities(items: Activity[]): Activity[] {
  const map = new Map<string, Activity>();
  for (const a of items) {
    if (a.minutes <= 0) continue;
    const key = `${a.title.trim().toLowerCase()}\u0000${a.categoryId ?? ""}`;
    const existing = map.get(key);
    if (existing) existing.minutes += a.minutes;
    else map.set(key, { ...a, title: a.title.trim() });
  }
  return [...map.values()].sort((a, b) => b.minutes - a.minutes);
}

function activitiesIn(window: Interval, entries: Entry[], now: Date): Activity[] {
  return groupActivities(
    entries.map((e) => ({
      title: e.title,
      categoryId: e.categoryId,
      minutes: overlapMinutes(entryInterval(e, now), window),
    })),
  );
}

/** Free time between planned blocks inside `window`, ignoring slots shorter than `minGapMin`. */
export function freeSlots(planned: Interval[], window: Interval, minGapMin = 0): Interval[] {
  return subtract(window, planned).filter((s) => minutes(s) >= minGapMin);
}

export function compareBlocks(
  planned: PlannedBlock[],
  entries: Entry[],
  reviews: Review[],
  now: Date,
): BlockComparison[] {
  const reviewById = new Map(reviews.map((r) => [r.calendarEventId, r]));
  return [...planned]
    .sort((a, b) => a.start.getTime() - b.start.getTime())
    .map((block) => {
      const linked = entries.filter((e) => e.plannedEventId === block.id);
      const plannedMin = minutes(block);
      const actualMin = sum(linked.map((e) => minutes(entryInterval(e, now))));
      const firstStart = linked.length ? Math.min(...linked.map((e) => e.start.getTime())) : null;
      const unlinked = entries.filter((e) => e.plannedEventId !== block.id);

      let status: BlockStatus;
      const review = reviewById.get(block.id);
      if (review) status = review.status;
      else if (linked.some((e) => e.end === null)) status = "IN_PROGRESS";
      else if (linked.length) status = "TRACKED";
      else status = block.end <= now ? "UNREVIEWED" : "UPCOMING";

      return {
        block,
        status,
        plannedMin,
        actualMin,
        diffMin: actualMin - plannedMin,
        startDriftMin: firstStart === null ? null : (firstStart - block.start.getTime()) / MIN,
        instead: activitiesIn(block, unlinked, now),
      };
    });
}

/** What was done in each free slot, and how much of it went untracked. */
export function gapUsage(slots: Interval[], entries: Entry[], now: Date): GapUsage[] {
  const tracked = entries.map((e) => entryInterval(e, now));
  return slots.map((slot) => {
    const elapsed = clip(slot, { start: slot.start, end: now });
    const trackedMin = sum(mergeIntervals(tracked).map((t) => overlapMinutes(t, slot)));
    const untrackedMin = elapsed ? sum(subtract(elapsed, tracked).map(minutes)) : 0;
    return { slot, activities: activitiesIn(slot, entries, now), trackedMin, untrackedMin };
  });
}

export interface SummaryInput {
  planned: PlannedBlock[];
  entries: Entry[];
  /** whole period being summarised (e.g. one local day) */
  range: Interval;
  /** the part of the period that should be accounted for (e.g. 07:00–22:00) */
  window: Interval;
  minGapMin: number;
  now: Date;
}

export function summarize({ planned, entries, range, window, minGapMin, now }: SummaryInput): DaySummary {
  const inRange = (i: Interval) => clip(i, range);
  const plannedClipped = planned.map(inRange).filter((i): i is Interval => !!i);
  const plannedIds = new Set(planned.map((p) => p.id));
  const intervals = entries.map((e) => ({ e, i: entryInterval(e, now) }));

  const plannedMin = sum(mergeIntervals(plannedClipped).map(minutes));
  const trackedMin = sum(mergeIntervals(intervals.map((x) => x.i)).map((i) => overlapMinutes(i, range)));
  const onPlanMin = sum(
    intervals.filter((x) => x.e.plannedEventId && plannedIds.has(x.e.plannedEventId)).map((x) => overlapMinutes(x.i, range)),
  );

  const slots = freeSlots(planned, window, minGapMin);
  const usage = gapUsage(slots, entries, now);
  const elapsedWindow = clip(window, { start: window.start, end: now });
  const untrackedMin = elapsedWindow
    ? sum(subtract(elapsedWindow, intervals.map((x) => x.i)).map(minutes))
    : 0;

  const started = planned.filter((p) => p.start <= now);
  const startedMin = sum(started.map(minutes));
  const spentOnStarted = sum(
    compareBlocks(started, entries, [], now).map((c) => Math.min(c.actualMin, c.plannedMin)),
  );

  return {
    plannedMin,
    trackedMin,
    onPlanMin,
    offPlanMin: Math.max(0, trackedMin - onPlanMin),
    freeMin: sum(slots.map(minutes)),
    freeTrackedMin: sum(usage.map((u) => u.trackedMin)),
    untrackedMin,
    startedPlannedMin: startedMin,
    adherence: startedMin > 0 ? spentOnStarted / startedMin : null,
  };
}

/** Adds up several day summaries (adherence is weighted by started planned time). */
export function combineSummaries(summaries: DaySummary[]): DaySummary {
  const sum = (k: keyof DaySummary) => summaries.reduce((s, d) => s + ((d[k] as number | null) ?? 0), 0);
  const base = sum("startedPlannedMin");
  return {
    plannedMin: sum("plannedMin"),
    trackedMin: sum("trackedMin"),
    onPlanMin: sum("onPlanMin"),
    offPlanMin: sum("offPlanMin"),
    freeMin: sum("freeMin"),
    freeTrackedMin: sum("freeTrackedMin"),
    untrackedMin: sum("untrackedMin"),
    startedPlannedMin: base,
    adherence: base ? summaries.reduce((s, d) => s + (d.adherence ?? 0) * d.startedPlannedMin, 0) / base : null,
  };
}

/** Minutes per category over `range`. Key `null` = uncategorised. */
export function categoryTotals(entries: Entry[], range: Interval, now: Date): Map<string | null, number> {
  const totals = new Map<string | null, number>();
  for (const e of entries) {
    const m = overlapMinutes(entryInterval(e, now), range);
    if (m > 0) totals.set(e.categoryId, (totals.get(e.categoryId) ?? 0) + m);
  }
  return totals;
}

export interface TaskStat {
  title: string;
  count: number;
  plannedMin: number;
  actualMin: number;
  avgDiffMin: number;
  overruns: number;
  skipped: number;
}

/**
 * Aggregates finished block comparisons by task title so recurring tasks
 * ("Email", "Deep work") show their typical overrun.
 */
export function taskStats(comparisons: BlockComparison[]): TaskStat[] {
  const map = new Map<string, TaskStat>();
  for (const c of comparisons) {
    if (c.status === "UPCOMING" || c.status === "UNREVIEWED" || c.status === "IN_PROGRESS") continue;
    const key = c.block.title.trim().toLowerCase();
    const s = map.get(key) ?? {
      title: c.block.title.trim(),
      count: 0,
      plannedMin: 0,
      actualMin: 0,
      avgDiffMin: 0,
      overruns: 0,
      skipped: 0,
    };
    s.count += 1;
    s.plannedMin += c.plannedMin;
    s.actualMin += c.actualMin;
    if (c.status === "SKIPPED") s.skipped += 1;
    else if (c.actualMin > c.plannedMin * 1.1) s.overruns += 1;
    map.set(key, s);
  }
  return [...map.values()]
    .map((s) => ({ ...s, avgDiffMin: (s.actualMin - s.plannedMin) / s.count }))
    .sort((a, b) => Math.abs(b.avgDiffMin) * b.count - Math.abs(a.avgDiffMin) * a.count);
}
