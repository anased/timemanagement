import Link from "next/link";
import { CalendarBanner } from "@/components/CalendarBanner";
import { CategoryBars } from "@/components/CategoryBars";
import { DailyChart } from "@/components/DailyChart";
import { StatTiles } from "@/components/StatTiles";
import { categoryTotals, combineSummaries, groupActivities, taskStats } from "@/lib/analytics";
import { loadPeriod } from "@/lib/period";
import { currentScope } from "@/lib/session";
import { addDays, formatDay, formatDuration, todayKey } from "@/lib/time";

export const dynamic = "force-dynamic";

const RANGES = [7, 30, 90];

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const scope = await currentScope();
  const { timeZone } = await scope.settings.get();
  const requested = Number((await searchParams).days);
  const days = RANGES.includes(requested) ? requested : 30;
  const first = addDays(todayKey(timeZone), -(days - 1));
  const data = await loadPeriod(scope, first, days);

  const summary = combineSummaries(data.days.map((d) => d.summary));
  const tasks = taskStats(data.days.flatMap((d) => d.comparisons)).slice(0, 12);
  const freeActivities = groupActivities(data.days.flatMap((d) => d.gaps.flatMap((g) => g.activities))).slice(0, 10);
  const freeUntracked = data.days.reduce((s, d) => s + d.gaps.reduce((t, g) => t + g.untrackedMin, 0), 0);
  const insteadOfPlan = groupActivities(data.days.flatMap((d) => d.comparisons.flatMap((c) => c.instead))).slice(0, 10);
  const skipped = data.days.flatMap((d) => d.comparisons).filter((c) => c.status === "SKIPPED" || c.status === "REPLACED");
  const colorOf = (id: string | null) => data.categories.find((c) => c.id === id)?.color ?? "#8a8a85";

  return (
    <>
      <CalendarBanner result={data.calendar} />
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">Reports</h1>
        <span className="text-muted">
          {formatDay(first, "d MMM")} – {formatDay(addDays(first, days - 1), "d MMM yyyy")}
        </span>
        <div className="ml-auto flex gap-1">
          {RANGES.map((r) => (
            <Link key={r} href={`/reports?days=${r}`} className={r === days ? "btn-primary" : "btn"}>
              {r} days
            </Link>
          ))}
        </div>
      </div>

      <StatTiles summary={summary} />

      <section className="card mt-4">
        <h2 className="mb-1 font-semibold">Planned vs. actual per day</h2>
        <p className="mb-3 text-xs text-muted">
          Left bar: time you blocked. Right bar: time you tracked, split into work on a planned block and everything else.
        </p>
        <DailyChart
          data={data.days.map((d) => ({
            label: formatDay(d.day, days > 14 ? "d/M" : "EEE d"),
            planned: d.summary.plannedMin,
            onPlan: d.summary.onPlanMin,
            offPlan: d.summary.offPlanMin,
          }))}
        />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">Time by category</h2>
          <CategoryBars totals={categoryTotals(data.entries, data.range, data.now)} categories={data.categories} />
        </section>

        <section className="card">
          <h2 className="mb-1 font-semibold">What fills your free time</h2>
          <p className="mb-3 text-xs text-muted">Tracked activities in the gaps between planned blocks.</p>
          <ActivityList items={freeActivities} colorOf={colorOf} extra={freeUntracked >= 1 ? { label: "Untracked", minutes: freeUntracked } : null} />
        </section>

        <section className="card overflow-x-auto lg:col-span-2">
          <h2 className="mb-1 font-semibold">Tasks that run long (or short)</h2>
          <p className="mb-3 text-xs text-muted">Planned blocks grouped by title. Only blocks that are tracked or checked in count.</p>
          {tasks.length === 0 ? (
            <p className="text-sm text-muted">Track or check in on a few planned blocks to see this.</p>
          ) : (
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="pb-2 font-medium">Task</th>
                  <th className="pb-2 text-right font-medium">Times</th>
                  <th className="pb-2 text-right font-medium">Planned</th>
                  <th className="pb-2 text-right font-medium">Actual</th>
                  <th className="pb-2 text-right font-medium">Avg. difference</th>
                  <th className="pb-2 text-right font-medium">Overran</th>
                  <th className="pb-2 text-right font-medium">Skipped</th>
                </tr>
              </thead>
              <tbody>
                {tasks.map((t) => (
                  <tr key={t.title} className="border-t border-line">
                    <td className="py-2">{t.title}</td>
                    <td className="py-2 text-right tabular-nums">{t.count}</td>
                    <td className="py-2 text-right tabular-nums">{formatDuration(t.plannedMin)}</td>
                    <td className="py-2 text-right tabular-nums">{formatDuration(t.actualMin)}</td>
                    <td className="py-2 text-right tabular-nums">
                      {t.avgDiffMin > 0 ? "+" : ""}
                      {formatDuration(t.avgDiffMin)}
                    </td>
                    <td className="py-2 text-right tabular-nums">{t.overruns}</td>
                    <td className="py-2 text-right tabular-nums">{t.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="card">
          <h2 className="mb-1 font-semibold">What happened during planned blocks instead</h2>
          <p className="mb-3 text-xs text-muted">Unplanned activities tracked inside a block&apos;s time slot.</p>
          <ActivityList items={insteadOfPlan} colorOf={colorOf} extra={null} />
        </section>

        <section className="card">
          <h2 className="mb-1 font-semibold">Skipped or replaced blocks</h2>
          <p className="mb-3 text-xs text-muted">{skipped.length} block(s) in this period.</p>
          <ul className="space-y-1 text-sm">
            {skipped.slice(0, 10).map((c) => (
              <li key={c.block.id} className="flex gap-2">
                <span className="truncate">{c.block.title}</span>
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {c.status === "SKIPPED" ? "skipped" : "replaced"} · {formatDuration(c.plannedMin)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}

function ActivityList({
  items,
  colorOf,
  extra,
}: {
  items: { title: string; categoryId: string | null; minutes: number }[];
  colorOf: (id: string | null) => string;
  extra: { label: string; minutes: number } | null;
}) {
  if (items.length === 0 && !extra) return <p className="text-sm text-muted">Nothing tracked here yet.</p>;
  return (
    <ul className="space-y-1.5 text-sm">
      {items.map((a) => (
        <li key={`${a.title}-${a.categoryId}`} className="flex items-center gap-2">
          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(a.categoryId) }} />
          <span className="truncate">{a.title}</span>
          <span className="ml-auto tabular-nums">{formatDuration(a.minutes)}</span>
        </li>
      ))}
      {extra && (
        <li className="flex items-center gap-2 text-muted">
          <span className="h-2 w-2 shrink-0 rounded-full border border-dashed border-neutral-400" />
          <span>{extra.label}</span>
          <span className="ml-auto tabular-nums">{formatDuration(extra.minutes)}</span>
        </li>
      )}
    </ul>
  );
}
