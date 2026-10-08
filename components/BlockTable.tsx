"use client";

import { useTransition } from "react";
import { undoReview } from "@/app/actions/reviews";
import type { BlockStatus } from "@/lib/analytics";
import { formatDuration, formatTime } from "@/lib/time";

export interface BlockRow {
  id: string;
  title: string;
  start: Date;
  end: Date;
  status: BlockStatus;
  plannedMin: number;
  actualMin: number;
  diffMin: number;
  startDriftMin: number | null;
  instead: { title: string; minutes: number }[];
}

const STATUS_LABEL: Record<BlockStatus, string> = {
  DONE: "Done",
  TRACKED: "Tracked",
  PARTIAL: "Partly",
  SKIPPED: "Skipped",
  REPLACED: "Did something else",
  IN_PROGRESS: "In progress",
  UNREVIEWED: "Not checked in",
  UPCOMING: "Upcoming",
};

const REVIEWED: BlockStatus[] = ["DONE", "PARTIAL", "SKIPPED", "REPLACED"];

/** Planned block by block: planned vs. actual duration, start drift and what happened instead. */
export function BlockTable({ rows, timeZone }: { rows: BlockRow[]; timeZone: string }) {
  const [pending, startTransition] = useTransition();
  if (rows.length === 0) return null;
  return (
    <section className="card overflow-x-auto">
      <h2 className="mb-3 font-semibold">Plan vs. actual</h2>
      <table className="w-full min-w-[560px] text-sm">
        <thead className="text-left text-xs text-muted">
          <tr>
            <th className="pb-2 font-medium">Block</th>
            <th className="pb-2 text-right font-medium">Planned</th>
            <th className="pb-2 text-right font-medium">Actual</th>
            <th className="pb-2 text-right font-medium">Diff</th>
            <th className="pb-2 text-right font-medium">Started</th>
            <th className="pb-2 pl-4 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const counted = r.status !== "UPCOMING" && r.status !== "UNREVIEWED";
            return (
              <tr key={r.id} className="border-t border-line align-top">
                <td className="py-2 pr-2">
                  <div className="font-medium">{r.title}</div>
                  <div className="text-xs text-muted">
                    {formatTime(r.start, timeZone)}–{formatTime(r.end, timeZone)}
                  </div>
                  {r.instead.length > 0 && (
                    <div className="mt-0.5 text-xs text-muted">
                      Meanwhile: {r.instead.slice(0, 3).map((a) => `${a.title} (${formatDuration(a.minutes)})`).join(", ")}
                    </div>
                  )}
                </td>
                <td className="py-2 text-right tabular-nums">{formatDuration(r.plannedMin)}</td>
                <td className="py-2 text-right tabular-nums">{counted ? formatDuration(r.actualMin) : "—"}</td>
                <td
                  className={`py-2 text-right tabular-nums ${
                    !counted ? "" : r.diffMin > 5 ? "text-orange-600" : r.diffMin < -5 ? "text-sky-600" : ""
                  }`}
                >
                  {counted ? `${r.diffMin > 0 ? "+" : ""}${formatDuration(r.diffMin)}` : "—"}
                </td>
                <td className="py-2 text-right tabular-nums text-muted">
                  {r.startDriftMin === null
                    ? "—"
                    : Math.abs(r.startDriftMin) < 1
                      ? "on time"
                      : `${formatDuration(Math.abs(r.startDriftMin))} ${r.startDriftMin > 0 ? "late" : "early"}`}
                </td>
                <td className="py-2 pl-4 text-xs">
                  {STATUS_LABEL[r.status]}
                  {REVIEWED.includes(r.status) && (
                    <button
                      className="ml-2 text-accent hover:underline"
                      disabled={pending}
                      title="Clear the check-in. Logged entries stay; edit them on the timeline."
                      onClick={() => startTransition(async () => void (await undoReview(r.id)))}
                    >
                      reset
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
