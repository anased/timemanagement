import Link from "next/link";
import { BlockTable } from "@/components/BlockTable";
import { CalendarBanner } from "@/components/CalendarBanner";
import { CheckInList } from "@/components/CheckInList";
import { DayTimeline } from "@/components/DayTimeline";
import { EntryDialogProvider } from "@/components/EntryDialog";
import { GapList } from "@/components/GapList";
import { LogTimeButton } from "@/components/LogTimeButton";
import { StatTiles } from "@/components/StatTiles";
import { calendarView, loadPeriod } from "@/lib/period";
import { currentScope } from "@/lib/session";
import { addDays, formatDay, isDayKey, todayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const scope = await currentScope();
  const { timeZone } = await scope.settings.get();
  const { date } = await searchParams;
  const today = todayKey(timeZone);
  const day = isDayKey(date) ? date : today;

  const data = await loadPeriod(scope, day, 1);
  const [analysis] = data.days;
  const { now, categories } = data;

  const view = calendarView(analysis, data.calendarColors);
  const blocks = view.blocks;
  const checkIns = blocks.filter((b) => b.status === "UNREVIEWED");

  // Show the whole day window, stretched to include anything outside it.
  const times = [
    analysis.window.start,
    analysis.window.end,
    ...blocks.flatMap((b) => [b.start, b.end]),
    ...view.shown.flatMap((e) => [e.start, e.end]),
    ...data.entries.flatMap((e) => [e.start, e.end ?? now]),
  ].map((d) => Math.min(Math.max(d.getTime(), analysis.range.start.getTime()), analysis.range.end.getTime()));
  const hour = 3600_000;
  const displayStart = new Date(Math.floor(Math.min(...times) / hour) * hour);
  const displayEnd = new Date(Math.ceil(Math.max(...times) / hour) * hour);

  return (
    <EntryDialogProvider categories={categories} blocks={blocks} timeZone={timeZone}>
      <CalendarBanner result={data.calendar} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="mr-2 text-xl font-semibold">{day === today ? "Today" : formatDay(day, "EEEE")}</h1>
        <span className="text-muted">{formatDay(day, "d MMMM yyyy")}</span>
        <div className="ml-auto flex gap-1">
          <Link className="btn" href={`/?date=${addDays(day, -1)}`} aria-label="Previous day">
            ←
          </Link>
          {day !== today && (
            <Link className="btn" href="/">
              Today
            </Link>
          )}
          <Link className="btn" href={`/?date=${addDays(day, 1)}`} aria-label="Next day">
            →
          </Link>
          <LogTimeButton day={day} timeZone={timeZone} />
        </div>
      </div>

      <StatTiles summary={analysis.summary} />

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <DayTimeline
          displayStart={displayStart}
          displayEnd={displayEnd}
          blocks={view.blocks}
          shown={view.shown}
          allDay={view.allDay}
          entries={data.entries}
          slots={analysis.gaps.map((g) => g.slot)}
          categories={categories}
          timeZone={timeZone}
        />
        <div className="space-y-4">
          <CheckInList blocks={checkIns} categories={categories} timeZone={timeZone} />
          <GapList
            gaps={analysis.gaps.map((g) => ({ ...g.slot, activities: g.activities, trackedMin: g.trackedMin, untrackedMin: g.untrackedMin }))}
            categories={categories}
            timeZone={timeZone}
            now={now}
          />
        </div>
      </div>

      <div className="mt-4">
        <BlockTable
          timeZone={timeZone}
          rows={analysis.comparisons.map((c) => ({
            id: c.block.id,
            title: c.block.title,
            start: c.block.start,
            end: c.block.end,
            status: c.status,
            plannedMin: c.plannedMin,
            actualMin: c.actualMin,
            diffMin: c.diffMin,
            startDriftMin: c.startDriftMin,
            instead: c.instead,
          }))}
        />
      </div>
    </EntryDialogProvider>
  );
}
