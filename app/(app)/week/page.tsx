import Link from "next/link";
import { CalendarBanner } from "@/components/CalendarBanner";
import { CategoryBars } from "@/components/CategoryBars";
import { EntryDialogProvider } from "@/components/EntryDialog";
import { StatTiles } from "@/components/StatTiles";
import { WeekCalendar } from "@/components/WeekCalendar";
import { categoryTotals, combineSummaries } from "@/lib/analytics";
import { loadPeriod } from "@/lib/period";
import { currentScope } from "@/lib/session";
import { addDays, displayMinutes, formatDay, formatDuration, isDayKey, localTime, todayKey, weekStart } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const scope = await currentScope();
  const { timeZone } = await scope.settings.get();
  const { date } = await searchParams;
  const today = todayKey(timeZone);
  const start = weekStart(isDayKey(date) ? date : today);
  const data = await loadPeriod(scope, start, 7);
  const totals = categoryTotals(data.entries, data.range, data.now);

  const blocks = data.days.flatMap((d) =>
    d.planned.map((p) => ({ id: p.id, title: p.title, start: p.start, end: p.end, htmlLink: p.htmlLink })),
  );

  // One time axis for the whole week: the user's day hours, stretched to fit everything shown.
  const items: [Date, Date][] = [
    ...blocks.map((b): [Date, Date] => [b.start, b.end]),
    ...data.entries.map((e): [Date, Date] => [e.start, e.end ?? data.now]),
  ];
  const ranges = data.days.map((d) =>
    displayMinutes(d.day, items, timeZone, [data.user.dayStartMin, data.user.dayEndMin]),
  );
  const startMin = Math.min(...ranges.map((r) => r[0]));
  const endMin = Math.max(...ranges.map((r) => r[1]));

  const calendarDays = data.days.map((d) => {
    const statusById = new Map(d.comparisons.map((c) => [c.block.id, c.status]));
    return {
      day: d.day,
      displayStart: localTime(d.day, startMin, timeZone),
      displayEnd: localTime(d.day, endMin, timeZone),
      blocks: d.planned.map((p) => ({
        id: p.id,
        title: p.title,
        start: p.start,
        end: p.end,
        htmlLink: p.htmlLink,
        status: statusById.get(p.id) ?? "UPCOMING",
      })),
      entries: data.entries.filter((e) => e.start < d.range.end && (e.end === null || e.end > d.range.start)),
      slots: d.gaps.map((g) => g.slot),
    };
  });

  return (
    <EntryDialogProvider categories={data.categories} blocks={blocks} timeZone={timeZone}>
      <CalendarBanner result={data.calendar} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">
          Week of {formatDay(start, "d MMM")} – {formatDay(addDays(start, 6), "d MMM yyyy")}
        </h1>
        <div className="ml-auto flex gap-1">
          <Link className="btn" href={`/week?date=${addDays(start, -7)}`} aria-label="Previous week">
            ←
          </Link>
          <Link className="btn" href="/week">
            This week
          </Link>
          <Link className="btn" href={`/week?date=${addDays(start, 7)}`} aria-label="Next week">
            →
          </Link>
        </div>
      </div>

      <StatTiles summary={combineSummaries(data.days.map((d) => d.summary))} />

      <div className="mt-4">
        <WeekCalendar
          days={calendarDays}
          startMin={startMin}
          endMin={endMin}
          today={today}
          categories={data.categories}
          timeZone={timeZone}
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <section className="card overflow-x-auto">
          <h2 className="mb-3 font-semibold">Day by day</h2>
          <table className="w-full min-w-[560px] text-sm">
            <thead className="text-left text-xs text-muted">
              <tr>
                <th className="pb-2 font-medium">Day</th>
                <th className="pb-2 text-right font-medium">Planned</th>
                <th className="pb-2 text-right font-medium">On plan</th>
                <th className="pb-2 text-right font-medium">Off plan</th>
                <th className="pb-2 text-right font-medium">Free used</th>
                <th className="pb-2 text-right font-medium">Untracked</th>
                <th className="pb-2 text-right font-medium">Adherence</th>
              </tr>
            </thead>
            <tbody>
              {data.days.map(({ day, summary: s }) => (
                <tr key={day} className="border-t border-line">
                  <td className="py-2">
                    <Link className="hover:text-accent" href={`/?date=${day}`}>
                      {formatDay(day)}
                    </Link>
                  </td>
                  <td className="py-2 text-right tabular-nums">{formatDuration(s.plannedMin)}</td>
                  <td className="py-2 text-right tabular-nums">{formatDuration(s.onPlanMin)}</td>
                  <td className="py-2 text-right tabular-nums">{formatDuration(s.offPlanMin)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {formatDuration(s.freeTrackedMin)}
                    <span className="text-muted"> / {formatDuration(s.freeMin)}</span>
                  </td>
                  <td className="py-2 text-right tabular-nums text-muted">{formatDuration(s.untrackedMin)}</td>
                  <td className="py-2 text-right tabular-nums">
                    {s.adherence === null ? "—" : `${Math.round(s.adherence * 100)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">Where the time went</h2>
          <CategoryBars totals={totals} categories={data.categories} />
        </section>
      </div>
    </EntryDialogProvider>
  );
}
