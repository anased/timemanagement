"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { startTimer } from "@/app/actions/entries";
import { formatDay, formatDuration, formatTime, type DayKey } from "@/lib/time";
import { useEntryDialog } from "./EntryDialog";
import { layoutLanes, STATUS_STYLE, useDragToLog, type TimelineBlock } from "./timeline";
import type { CategoryDTO, EntryDTO } from "./types";
import { useNow } from "./useNow";

const PX_PER_MIN = 0.8;
const MODE_KEY = "weekCalendarMode";

type Mode = "split" | "plan" | "actual";

const MODES: { value: Mode; label: string }[] = [
  { value: "split", label: "Plan + actual" },
  { value: "plan", label: "Plan" },
  { value: "actual", label: "Actual" },
];

export interface WeekDay {
  day: DayKey;
  displayStart: Date;
  displayEnd: Date;
  blocks: TimelineBlock[];
  entries: EntryDTO[];
  slots: { start: Date; end: Date }[];
}

/** Seven days side by side: planned blocks and/or tracked time on one time axis. */
export function WeekCalendar({
  days,
  startMin,
  endMin,
  today,
  categories,
  timeZone,
}: {
  days: WeekDay[];
  /** Shared wall-clock range shown for every day, in minutes after midnight. */
  startMin: number;
  endMin: number;
  today: DayKey;
  categories: CategoryDTO[];
  timeZone: string;
}) {
  const now = useNow(30_000);
  const [mode, setMode] = useState<Mode>("split");
  // The now line differs between server and client render, so draw it after mount.
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(MODE_KEY);
      if (saved === "split" || saved === "plan" || saved === "actual") setMode(saved);
    } catch {
      // Storage unavailable: keep the default.
    }
  }, []);

  function choose(m: Mode) {
    setMode(m);
    try {
      localStorage.setItem(MODE_KEY, m);
    } catch {
      // Ignore: the choice just won't be remembered.
    }
  }

  const height = (endMin - startMin) * PX_PER_MIN;
  const hours: number[] = [];
  for (let m = Math.ceil(startMin / 60) * 60; m < endMin; m += 60) hours.push(m);
  const cols = "grid-cols-[3rem_repeat(7,minmax(0,1fr))]";

  return (
    <section className="card p-0">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <h2 className="font-semibold">Calendar</h2>
        <span className="text-xs text-muted">
          {mode === "plan" ? "click a block or free slot to log time" : "drag in a day to log time"}
        </span>
        <div className="ml-auto flex rounded-lg border border-line p-0.5 text-xs" role="group" aria-label="Calendar view">
          {MODES.map((m) => (
            <button
              key={m.value}
              className={`rounded-md px-2.5 py-1 font-medium ${mode === m.value ? "bg-accent/10 text-accent" : "text-muted hover:text-fg"}`}
              aria-pressed={mode === m.value}
              onClick={() => choose(m.value)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className={mode === "split" ? "min-w-[760px]" : "min-w-[560px]"}>
          <div className={`grid ${cols} border-b border-line text-xs`}>
            <div />
            {days.map(({ day }) => (
              <Link
                key={day}
                href={`/?date=${day}`}
                className={`border-l border-line px-2 py-2 hover:text-accent ${day === today ? "font-semibold text-accent" : "text-muted"}`}
              >
                {formatDay(day, "EEE d")}
                {mode === "split" && (
                  <span className="mt-0.5 grid grid-cols-2 text-[10px] font-normal text-muted">
                    <span>Plan</span>
                    <span>Actual</span>
                  </span>
                )}
              </Link>
            ))}
          </div>

          <div className={`relative grid ${cols}`} style={{ height }}>
            {hours.map((m) => (
              <div
                key={m}
                className="pointer-events-none absolute inset-x-0"
                style={{ top: (m - startMin) * PX_PER_MIN }}
              >
                <div className="border-t" style={{ borderColor: "var(--grid)" }} />
                <span className="absolute -top-2 left-1 bg-panel px-0.5 text-[10px] text-muted">
                  {String(Math.floor(m / 60) % 24).padStart(2, "0")}:00
                </span>
              </div>
            ))}
            <div />
            {days.map((d) => (
              <DayColumn key={d.day} data={d} mode={mode} now={now} showNowLine={mounted} categories={categories} timeZone={timeZone} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function DayColumn({
  data,
  mode,
  now,
  showNowLine,
  categories,
  timeZone,
}: {
  data: WeekDay;
  mode: Mode;
  now: Date;
  showNowLine: boolean;
  categories: CategoryDTO[];
  timeZone: string;
}) {
  const dialog = useEntryDialog();
  const [pending, startTransition] = useTransition();
  const { displayStart, displayEnd, blocks, entries, slots } = data;
  const t0 = displayStart.getTime();
  const totalMin = (displayEnd.getTime() - t0) / 60000;
  const y = (d: Date) => Math.max(0, Math.min(totalMin, (d.getTime() - t0) / 60000)) * PX_PER_MIN;
  const h = (s: Date, e: Date) => Math.max(12, y(e) - y(s));
  const colorOf = (id: string | null) => categories.find((c) => c.id === id)?.color ?? "#8a8a85";
  const span = (s: Date, e: Date | null) => `${formatTime(s, timeZone)}–${e ? formatTime(e, timeZone) : "now"}`;

  const entryEnd = (e: EntryDTO) => e.end ?? (now > e.start ? now : e.start);
  const blockLanes = layoutLanes(blocks, (b) => [b.start.getTime(), b.end.getTime()]);
  const entryLanes = layoutLanes(entries, (e) => [e.start.getTime(), entryEnd(e).getTime()]);
  const showNow = showNowLine && now >= displayStart && now <= displayEnd;

  const { preview, handlers } = useDragToLog({
    t0,
    t1: displayEnd.getTime(),
    pxPerMin: PX_PER_MIN,
    onRange: ({ start, end }) => dialog.open({ title: "", start, end, categoryId: null, plannedEventId: null }),
  });

  function startFromBlock(b: TimelineBlock) {
    startTransition(async () => {
      await startTimer({ title: b.title, planned: { id: b.id, title: b.title, start: b.start, end: b.end } });
    });
  }

  const planLane = (
    <div className="relative">
      {slots.map((s) => (
        <button
          key={s.start.getTime()}
          className="absolute inset-x-0.5 rounded border border-dashed border-transparent text-[10px] text-muted opacity-0 hover:border-line hover:bg-bg hover:opacity-100 focus:opacity-100"
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
          title={`Free ${span(s.start, s.end)} · ${formatDuration((s.end.getTime() - s.start.getTime()) / 60000)} — log what you did`}
        >
          + log
        </button>
      ))}
      {blockLanes.map(({ item: b, lane, lanes }) => (
        <div
          key={b.id}
          className={`group absolute overflow-hidden rounded border-l-[3px] bg-accent/10 text-[10px] leading-tight ${STATUS_STYLE[b.status]}`}
          style={{
            top: y(b.start),
            height: h(b.start, b.end),
            left: `calc(${(lane / lanes) * 100}% + 2px)`,
            width: `calc(${100 / lanes}% - 4px)`,
          }}
        >
          <button
            className="flex h-full w-full flex-col items-start justify-start px-1 py-0.5 text-left"
            title={`${b.title} · ${span(b.start, b.end)} — log time for this block`}
            onClick={() =>
              dialog.open({ title: b.title, start: b.start, end: b.end, categoryId: null, plannedEventId: b.id })
            }
          >
            <span className="w-full truncate font-medium">{b.title}</span>
            <span className="w-full truncate text-muted">{formatTime(b.start, timeZone)}</span>
          </button>
          <button
            className="absolute right-0.5 top-0.5 rounded bg-panel px-1 text-[10px] text-accent opacity-0 hover:bg-accent/20 focus:opacity-100 group-hover:opacity-100"
            title="Start timer for this block"
            aria-label={`Start timer for ${b.title}`}
            disabled={pending}
            onClick={() => startFromBlock(b)}
          >
            ▶
          </button>
        </div>
      ))}
    </div>
  );

  const actualLane = (
    <div className={`relative ${mode === "split" ? "border-l border-dashed border-line" : ""}`}>
      <div
        className="absolute inset-0 cursor-crosshair select-none"
        style={{ touchAction: "pan-y" }}
        {...handlers}
        title="Click or drag to log time"
      />
      {entryLanes.map(({ item: e, lane, lanes }) => {
        const end = entryEnd(e);
        const color = colorOf(e.categoryId);
        return (
          <button
            key={e.id}
            className="absolute flex flex-col items-start justify-start overflow-hidden rounded border-l-[3px] px-1 py-0.5 text-left text-[10px] leading-tight hover:brightness-95"
            style={{
              top: y(e.start),
              height: h(e.start, end),
              left: `calc(${(lane / lanes) * 100}% + 2px)`,
              width: `calc(${100 / lanes}% - 4px)`,
              borderColor: color,
              background: `${color}22`,
            }}
            title={`${e.title} · ${span(e.start, e.end)} · ${formatDuration((end.getTime() - e.start.getTime()) / 60000)}${e.plannedEventId ? "" : " · unplanned"}`}
            onClick={() => dialog.open({ ...e })}
          >
            <span className="w-full truncate font-medium">
              {e.end === null && "● "}
              {e.title}
            </span>
            <span className="w-full truncate text-muted">{formatDuration((end.getTime() - e.start.getTime()) / 60000)}</span>
          </button>
        );
      })}
      {preview && (
        <div
          className="pointer-events-none absolute inset-x-0.5 z-20 rounded border border-dashed border-accent bg-accent/20 px-1 text-[10px] font-medium"
          style={{ top: y(preview.start), height: h(preview.start, preview.end) }}
        >
          {span(preview.start, preview.end)}
        </div>
      )}
    </div>
  );

  return (
    <div className={`relative grid border-l border-line ${mode === "split" ? "grid-cols-2" : "grid-cols-1"}`}>
      {mode !== "actual" && planLane}
      {mode !== "plan" && actualLane}
      {showNow && (
        <div className="pointer-events-none absolute inset-x-0 z-10" style={{ top: y(now) }}>
          <div className="border-t-2 border-red-500" />
        </div>
      )}
    </div>
  );
}
