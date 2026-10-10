import "server-only";
import type { AllDayDTO, ShownDTO } from "@/components/types";
import {
  compareBlocks,
  freeSlots,
  gapUsage,
  summarize,
  type BlockComparison,
  type BlockStatus,
  type DaySummary,
  type GapUsage,
  type Interval,
  type PlannedBlock,
} from "@/lib/analytics";
import type { UserScope } from "@/lib/db-scoped";
import { getPlannedEvents, type AllDayEvent, type PlannedEvent, type PlannedResult, type ShownEvent } from "@/lib/google-calendar";
import { categoriesWithDefaults } from "@/lib/session";
import { addDays, dayBounds, dayKeyOf, localTime, type DayKey } from "@/lib/time";

export interface DayAnalysis {
  day: DayKey;
  range: Interval;
  window: Interval;
  planned: PlannedEvent[];
  /** Timed events from "show only" calendars overlapping the day. Not part of any analytics. */
  shown: ShownEvent[];
  /** All-day events covering the day. */
  allDay: AllDayEvent[];
  comparisons: BlockComparison[];
  gaps: GapUsage[];
  summary: DaySummary;
}

/**
 * Loads everything needed to analyse `days` consecutive local days starting at
 * `firstDay`: calendar plan, tracked entries, check-ins and per-day analytics.
 */
export async function loadPeriod(scope: UserScope, firstDay: DayKey, days: number) {
  const user = await scope.settings.get();
  const tz = user.timeZone;
  const from = dayBounds(firstDay, tz).start;
  const to = dayBounds(addDays(firstDay, days - 1), tz).end;
  const now = new Date();

  const [plannedResult, entries, reviews, categories] = await Promise.all([
    getPlannedEvents(scope.userId, from, to),
    scope.entries.listInRange(from, to),
    scope.reviews.listInRange(from, to),
    categoriesWithDefaults(scope),
  ]);

  const dayList: DayAnalysis[] = [];
  for (let i = 0; i < days; i++) {
    const day = addDays(firstDay, i);
    const range = dayBounds(day, tz);
    const window = { start: localTime(day, user.dayStartMin, tz), end: localTime(day, user.dayEndMin, tz) };
    // Each block belongs to the day it starts on, so multi-day blocks are not double counted.
    const planned = plannedResult.events.filter((e) => dayKeyOf(e.start, tz) === day);
    const blocks: PlannedBlock[] = planned;
    const shown = plannedResult.shown.filter((e) => e.start < range.end && e.end > range.start);
    const allDay = plannedResult.allDay.filter((e) => e.startDay <= day && day < e.endDay);
    const dayEntries = entries.filter((e) => e.start < range.end && (e.end === null || e.end > range.start));
    const slots = freeSlots(blocks, window, user.minGapMin);
    dayList.push({
      day,
      range,
      window,
      planned,
      shown,
      allDay,
      comparisons: compareBlocks(blocks, dayEntries, reviews, now),
      gaps: gapUsage(slots, dayEntries, now),
      summary: summarize({ planned: blocks, entries: dayEntries, range, window, minGapMin: user.minGapMin, now }),
    });
  }

  return {
    user,
    now,
    range: { start: from, end: to },
    calendar: plannedResult as PlannedResult,
    /** Saved Google colour per calendar id. */
    calendarColors: plannedResult.colors,
    entries,
    reviews,
    categories,
    days: dayList,
  };
}

/**
 * What a day's calendar view draws: plan blocks with their status and
 * calendar colour, events from "show only" calendars, and all-day chips.
 */
export function calendarView(d: DayAnalysis, colors: Record<string, string>) {
  const statusById = new Map(d.comparisons.map((c) => [c.block.id, c.status]));
  return {
    blocks: d.planned.map((p) => ({
      id: p.id,
      title: p.title,
      start: p.start,
      end: p.end,
      htmlLink: p.htmlLink,
      color: colors[p.calendarId],
      status: (statusById.get(p.id) ?? "UPCOMING") as BlockStatus,
    })),
    shown: d.shown.map(
      (e): ShownDTO => ({ id: e.id, title: e.title, start: e.start, end: e.end, color: colors[e.calendarId], htmlLink: e.htmlLink }),
    ),
    allDay: d.allDay.map((e): AllDayDTO => ({ id: e.id, title: e.title, color: colors[e.calendarId], htmlLink: e.htmlLink })),
  };
}
