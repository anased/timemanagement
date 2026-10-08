"use client";

import type { Activity } from "@/lib/analytics";
import { formatDuration, formatTime } from "@/lib/time";
import { useEntryDialog } from "./EntryDialog";
import type { CategoryDTO } from "./types";

export interface GapDTO {
  start: Date;
  end: Date;
  activities: Activity[];
  trackedMin: number;
  untrackedMin: number;
}

/** Free time between planned blocks and what actually filled it. */
export function GapList({
  gaps,
  categories,
  timeZone,
  now,
}: {
  gaps: GapDTO[];
  categories: CategoryDTO[];
  timeZone: string;
  now: Date;
}) {
  const dialog = useEntryDialog();
  const colorOf = (id: string | null) => categories.find((c) => c.id === id)?.color ?? "#8a8a85";

  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-semibold">Free time</h2>
        <p className="text-xs text-muted">The gaps between your planned blocks.</p>
      </div>
      {gaps.length === 0 && <p className="text-sm text-muted">No free slots in your day window.</p>}
      <ul className="space-y-2">
        {gaps.map((g) => {
          const future = g.start >= now;
          return (
            <li key={g.start.getTime()} className="rounded-lg border border-line p-2.5 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium tabular-nums">
                  {formatTime(g.start, timeZone)}–{formatTime(g.end, timeZone)}
                </span>
                <span className="text-xs text-muted">{formatDuration((g.end.getTime() - g.start.getTime()) / 60000)}</span>
                {!future && (
                  <button
                    className="ml-auto text-xs text-accent hover:underline"
                    onClick={() =>
                      dialog.open({
                        title: "",
                        start: g.start,
                        end: now < g.end ? now : g.end,
                        categoryId: null,
                        plannedEventId: null,
                      })
                    }
                  >
                    + log
                  </button>
                )}
              </div>
              {future ? (
                <p className="mt-1 text-xs text-muted">Upcoming</p>
              ) : (
                <ul className="mt-1.5 space-y-0.5">
                  {g.activities.map((a) => (
                    <li key={`${a.title}-${a.categoryId}`} className="flex items-center gap-2 text-xs">
                      <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorOf(a.categoryId) }} />
                      <span className="truncate">{a.title}</span>
                      <span className="ml-auto tabular-nums text-muted">{formatDuration(a.minutes)}</span>
                    </li>
                  ))}
                  {g.untrackedMin >= 1 && (
                    <li className="flex items-center gap-2 text-xs text-muted">
                      <span className="h-2 w-2 shrink-0 rounded-full border border-dashed border-neutral-400" />
                      <span>Untracked</span>
                      <span className="ml-auto tabular-nums">{formatDuration(g.untrackedMin)}</span>
                    </li>
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
