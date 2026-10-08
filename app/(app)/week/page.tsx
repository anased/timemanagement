import Link from "next/link";
import { CalendarBanner } from "@/components/CalendarBanner";
import { CategoryBars } from "@/components/CategoryBars";
import { StatTiles } from "@/components/StatTiles";
import { categoryTotals, combineSummaries } from "@/lib/analytics";
import { loadPeriod } from "@/lib/period";
import { currentScope } from "@/lib/session";
import { addDays, formatDay, formatDuration, isDayKey, todayKey, weekStart } from "@/lib/time";

export const dynamic = "force-dynamic";

export default async function WeekPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const scope = await currentScope();
  const { timeZone } = await scope.settings.get();
  const { date } = await searchParams;
  const start = weekStart(isDayKey(date) ? date : todayKey(timeZone));
  const data = await loadPeriod(scope, start, 7);
  const totals = categoryTotals(data.entries, data.range, data.now);

  return (
    <>
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
    </>
  );
}
