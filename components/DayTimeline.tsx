"use client";

import { useEffect, useState, useTransition } from "react";
import { startTimer } from "@/app/actions/entries";
import type { BlockStatus } from "@/lib/analytics";
import { dragRange, formatDuration, formatTime } from "@/lib/time";
import { useEntryDialog } from "./EntryDialog";
import type { BlockDTO, CategoryDTO, EntryDTO } from "./types";
import { useNow } from "./useNow";

const PX_PER_MIN = 1.1;

interface Positioned<T> {
  item: T;
  lane: number;
  lanes: number;
}

/** Side-by-side lanes for overlapping items. */
function layoutLanes<T>(items: T[], range: (t: T) => [number, number]): Positioned<T>[] {
  const sorted = [...items].sort((a, b) => range(a)[0] - range(b)[0]);
  const out: Positioned<T>[] = [];
  let cluster: Positioned<T>[] = [];
  let laneEnds: number[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    for (const p of cluster) p.lanes = laneEnds.length;
    cluster = [];
    laneEnds = [];
  };
  for (const item of sorted) {
    const [s, e] = range(item);
    if (s >= clusterEnd) flush();
    let lane = laneEnds.findIndex((end) => end <= s);
    if (lane === -1) lane = laneEnds.push(e) - 1;
    else laneEnds[lane] = e;
    const p = { item, lane, lanes: 1 };
    cluster.push(p);
    out.push(p);
    clusterEnd = Math.max(clusterEnd, e);
  }
  flush();
  return out;
}

const STATUS_STYLE: Record<BlockStatus, string> = {
  DONE: "border-emerald-500",
  TRACKED: "border-emerald-500",
  PARTIAL: "border-amber-500",
  IN_PROGRESS: "border-red-500",
  SKIPPED: "border-neutral-400 opacity-60 line-through",
  REPLACED: "border-orange-500 opacity-70",
  UNREVIEWED: "border-dashed border-neutral-400",
  UPCOMING: "border-accent",
};

export interface TimelineBlock extends BlockDTO {
  status: BlockStatus;
}

export function DayTimeline({
  displayStart,
  displayEnd,
  blocks,
  entries,
  slots,
  categories,
  timeZone,
}: {
  displayStart: Date;
  displayEnd: Date;
  blocks: TimelineBlock[];
  entries: EntryDTO[];
  slots: { start: Date; end: Date }[];
  categories: CategoryDTO[];
  timeZone: string;
}) {
  const now = useNow(30_000);
  const dialog = useEntryDialog();
  const [pending, startTransition] = useTransition();
  const [drag, setDrag] = useState<{ anchor: number; current: number } | null>(null);
  const t0 = displayStart.getTime();
  const totalMin = (displayEnd.getTime() - t0) / 60000;
  const y = (d: Date) => Math.max(0, Math.min(totalMin, (d.getTime() - t0) / 60000)) * PX_PER_MIN;
  const h = (s: Date, e: Date) => Math.max(14, y(e) - y(s));
  const colorOf = (id: string | null) => categories.find((c) => c.id === id)?.color ?? "#8a8a85";

  // Full hours in the user's time zone (not the browser's).
  const hours: Date[] = [];
  const step = 15 * 60_000;
  for (let t = Math.ceil(t0 / step) * step; t <= displayEnd.getTime(); t += step) {
    if (formatTime(new Date(t), timeZone).endsWith(":00")) hours.push(new Date(t));
  }

  const entryEnd = (e: EntryDTO) => e.end ?? (now > e.start ? now : e.start);
  const blockLanes = layoutLanes(blocks, (b) => [b.start.getTime(), b.end.getTime()]);
  const entryLanes = layoutLanes(entries, (e) => [e.start.getTime(), entryEnd(e).getTime()]);
  const showNow = now >= displayStart && now <= displayEnd;

  // Click or drag on empty space in the actual column to log that range.
  const range = (a: number, c: number) => dragRange(a, c, { min: t0, max: displayEnd.getTime() });
  const timeAt = (e: React.PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return t0 + Math.max(0, Math.min(totalMin, (e.clientY - rect.top) / PX_PER_MIN)) * 60000;
  };
  const preview = drag && range(drag.anchor, drag.current);

  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag]);

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (e.button !== 0 || e.target !== e.currentTarget) return;
    const t = timeAt(e);
    // Touch keeps scrolling the page; a tap still logs half an hour.
    if (e.pointerType !== "touch") {
      e.currentTarget.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
    setDrag({ anchor: t, current: t });
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (drag && e.pointerType !== "touch") setDrag({ ...drag, current: timeAt(e) });
  }

  function onPointerUp() {
    if (!drag) return;
    const { start, end } = range(drag.anchor, drag.current);
    setDrag(null);
    dialog.open({ title: "", start, end, categoryId: null, plannedEventId: null });
  }

  function startFromBlock(b: TimelineBlock) {
    startTransition(async () => {
      await startTimer({ title: b.title, planned: { id: b.id, title: b.title, start: b.start, end: b.end } });
    });
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="grid grid-cols-[3rem_1fr_1fr] border-b border-line text-xs font-medium text-muted">
        <div />
        <div className="px-2 py-2">Planned</div>
        <div className="border-l border-line px-2 py-2">
          Actual <span className="font-normal opacity-70">· drag to log</span>
        </div>
      </div>
      <div className="relative grid grid-cols-[3rem_1fr_1fr]" style={{ height: totalMin * PX_PER_MIN }}>
        {/* hour grid */}
        {hours.map((hr) => (
          <div key={hr.getTime()} className="pointer-events-none absolute inset-x-0" style={{ top: y(hr) }}>
            <div className="border-t" style={{ borderColor: "var(--grid)" }} />
            <span className="absolute -top-2 left-1 bg-panel px-0.5 text-[10px] text-muted">{formatTime(hr, timeZone)}</span>
          </div>
        ))}

        <div />

        {/* planned column */}
        <div className="relative">
          {slots.map((s) => (
            <button
              key={s.start.getTime()}
              className="group absolute inset-x-1 flex items-center justify-center rounded-md border border-dashed border-transparent text-[11px] text-muted hover:border-line hover:bg-bg"
              style={{ top: y(s.start), height: h(s.start, s.end) }}
              onClick={() =>
                dialog.open({
                  title: "",
                  start: s.start,
                  end: now > s.start && now < s.end ? now : s.end,
                  categoryId: null,
                  plannedEventId: null,
                })
              }
              title="Free slot — log what you did"
            >
              <span className="opacity-0 group-hover:opacity-100">
                free · {formatDuration((s.end.getTime() - s.start.getTime()) / 60000)} · log
              </span>
            </button>
          ))}
          {blockLanes.map(({ item: b, lane, lanes }) => (
            <div
              key={b.id}
              className={`absolute overflow-hidden rounded-md border-l-4 bg-accent/10 px-1.5 py-0.5 text-xs ${STATUS_STYLE[b.status]}`}
              style={{
                top: y(b.start),
                height: h(b.start, b.end),
                left: `calc(${(lane / lanes) * 100}% + 4px)`,
                width: `calc(${100 / lanes}% - 8px)`,
              }}
            >
              <div className="flex items-start gap-1">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{b.title}</div>
                  <div className="truncate text-[10px] text-muted">
                    {formatTime(b.start, timeZone)}–{formatTime(b.end, timeZone)}
                  </div>
                </div>
                <button
                  className="rounded px-1 text-[11px] text-accent hover:bg-accent/20"
                  title="Start timer for this block"
                  disabled={pending}
                  onClick={() => startFromBlock(b)}
                >
                  ▶
                </button>
                <button
                  className="rounded px-1 text-[11px] text-accent hover:bg-accent/20"
                  title="Log time for this block"
                  onClick={() =>
                    dialog.open({ title: b.title, start: b.start, end: b.end, categoryId: null, plannedEventId: b.id })
                  }
                >
                  +
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* actual column */}
        <div className="relative border-l border-line">
          <div
            className="absolute inset-0 cursor-crosshair select-none"
            style={{ touchAction: "pan-y" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={() => setDrag(null)}
            title="Click or drag to log time"
          />
          {entryLanes.map(({ item: e, lane, lanes }) => {
            const end = entryEnd(e);
            const color = colorOf(e.categoryId);
            return (
              <button
                key={e.id}
                className="absolute overflow-hidden rounded-md border-l-4 px-1.5 py-0.5 text-left text-xs hover:brightness-95"
                style={{
                  top: y(e.start),
                  height: h(e.start, end),
                  left: `calc(${(lane / lanes) * 100}% + 4px)`,
                  width: `calc(${100 / lanes}% - 8px)`,
                  borderColor: color,
                  background: `${color}22`,
                }}
                onClick={() => dialog.open({ ...e })}
              >
                <div className="truncate font-medium">
                  {e.end === null && "● "}
                  {e.title}
                </div>
                <div className="truncate text-[10px] text-muted">
                  {formatTime(e.start, timeZone)}–{e.end ? formatTime(e.end, timeZone) : "now"} ·{" "}
                  {formatDuration((end.getTime() - e.start.getTime()) / 60000)}
                  {e.plannedEventId ? "" : " · unplanned"}
                </div>
              </button>
            );
          })}
          {preview && (
            <div
              className="pointer-events-none absolute inset-x-1 z-20 rounded-md border border-dashed border-accent bg-accent/20 px-1.5 py-0.5 text-[11px] font-medium"
              style={{ top: y(preview.start), height: h(preview.start, preview.end) }}
            >
              {formatTime(preview.start, timeZone)}–{formatTime(preview.end, timeZone)} ·{" "}
              {formatDuration((preview.end.getTime() - preview.start.getTime()) / 60000)}
            </div>
          )}
        </div>

        {showNow && (
          <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: y(now) }}>
            <div className="border-t-2 border-red-500" />
          </div>
        )}
      </div>
    </div>
  );
}
