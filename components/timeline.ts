"use client";

import { useEffect, useState, useTransition } from "react";
import { retimeEntry } from "@/app/actions/entries";
import type { BlockStatus } from "@/lib/analytics";
import { adjustRange, dragRange } from "@/lib/time";
import type { BlockDTO, EntryDTO, ShownDTO } from "./types";

export interface Positioned<T> {
  item: T;
  lane: number;
  lanes: number;
}

/** Side-by-side lanes for overlapping items. */
export function layoutLanes<T>(items: T[], range: (t: T) => [number, number]): Positioned<T>[] {
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

export const STATUS_STYLE: Record<BlockStatus, string> = {
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

/**
 * Lanes for the planned column: plan blocks and shown-only events are laid out
 * together so overlapping ones sit side by side.
 */
export function planLanes(blocks: TimelineBlock[], shown: ShownDTO[]) {
  type Item = { block: TimelineBlock; event?: never } | { event: ShownDTO; block?: never };
  const items: Item[] = [...blocks.map((block) => ({ block })), ...shown.map((event) => ({ event }))];
  const laid = layoutLanes(items, (i) => {
    const x = i.block ?? i.event;
    return [x.start.getTime(), x.end.getTime()];
  });
  return {
    blockLanes: laid.flatMap((p) => (p.item.block ? [{ item: p.item.block, lane: p.lane, lanes: p.lanes }] : [])),
    shownLanes: laid.flatMap((p) => (p.item.event ? [{ item: p.item.event, lane: p.lane, lanes: p.lanes }] : [])),
  };
}

/** Background for a plan block: a light tint of its calendar colour. */
export function blockTint(color: string | undefined): React.CSSProperties | undefined {
  return color ? { background: `${color}1f` } : undefined;
}

/**
 * Click or drag on an empty timeline column (from `t0` to `t1`, `pxPerMin`
 * tall) to pick a time range. Spread `handlers` on the column; `preview` is
 * the range while dragging. Escape cancels.
 */
export function useDragToLog({
  t0,
  t1,
  pxPerMin,
  onRange,
}: {
  t0: number;
  t1: number;
  pxPerMin: number;
  onRange: (range: { start: Date; end: Date }) => void;
}) {
  const [drag, setDrag] = useState<{ anchor: number; current: number } | null>(null);
  const totalMin = (t1 - t0) / 60000;
  const range = (a: number, c: number) => dragRange(a, c, { min: t0, max: t1 });
  const timeAt = (e: React.PointerEvent<HTMLElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    return t0 + Math.max(0, Math.min(totalMin, (e.clientY - rect.top) / pxPerMin)) * 60000;
  };

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
    const picked = range(drag.anchor, drag.current);
    setDrag(null);
    onRange(picked);
  }

  return {
    preview: drag && range(drag.anchor, drag.current),
    handlers: { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: () => setDrag(null) },
  };
}

type EntryDragMode = "start" | "end" | "move";

interface EntryDrag {
  id: string;
  mode: EntryDragMode;
  pointerType: string;
  y0: number;
  orig: { start: Date; end: Date };
  current: { start: Date; end: Date };
  moved: boolean;
}

/** Pointer travel (px) before a press counts as a drag rather than a click. */
const DRAG_THRESHOLD = 4;

/**
 * Drag a tracked entry's top edge, bottom edge or body to change its start,
 * end or both, snapped to 15 minutes and kept inside [min, max]. A press
 * without movement calls `onClick`. A running entry can only have its start
 * moved. Escape cancels; failed saves revert.
 */
export function useEntryDrag({
  pxPerMin,
  min,
  max,
  now,
  onClick,
}: {
  pxPerMin: number;
  min: number;
  max: number;
  now: Date;
  onClick: (entry: EntryDTO) => void;
}) {
  const [drag, setDrag] = useState<EntryDrag | null>(null);
  // Times saved by a drag, shown until the refreshed entry arrives from the server.
  const [saved, setSaved] = useState<Map<string, { from: [number, number | null]; to: { start: Date; end: Date } }>>(
    () => new Map(),
  );
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (!drag) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrag(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drag]);

  const visualEnd = (e: EntryDTO) => e.end ?? (now > e.start ? now : e.start);

  /** Where to draw `entry` right now: the drag preview, a just-saved time, or its own times. */
  function times(entry: EntryDTO): { start: Date; end: Date } {
    if (drag?.id === entry.id && drag.moved) return drag.current;
    const s = saved.get(entry.id);
    if (s && s.from[0] === entry.start.getTime() && s.from[1] === (entry.end?.getTime() ?? null)) return s.to;
    return { start: entry.start, end: visualEnd(entry) };
  }

  function save(entry: EntryDTO, to: { start: Date; end: Date }) {
    const from: [number, number | null] = [entry.start.getTime(), entry.end?.getTime() ?? null];
    setSaved((prev) => new Map(prev).set(entry.id, { from, to }));
    startTransition(async () => {
      let error: string | null;
      try {
        const res = await retimeEntry({ id: entry.id, start: to.start, end: entry.end === null ? null : to.end });
        error = res.ok ? null : res.error;
      } catch {
        error = "Couldn't save the new time. Check your connection and try again.";
      }
      if (error) {
        setSaved((prev) => {
          const next = new Map(prev);
          next.delete(entry.id);
          return next;
        });
        alert(error);
      }
    });
  }

  /** Pointer handlers for an entry's top edge ("start"), bottom edge ("end") or body ("move"). */
  function bind(entry: EntryDTO, mode: EntryDragMode) {
    // A running entry has no end yet, so it can't be moved or stretched.
    const draggable = entry.end !== null || mode === "start";
    return {
      onPointerDown(e: React.PointerEvent<HTMLElement>) {
        if (e.button !== 0) return;
        e.stopPropagation();
        // On touch the body keeps scrolling the page (a tap still opens the entry); the edges drag.
        if (draggable && (e.pointerType !== "touch" || mode !== "move")) {
          e.currentTarget.setPointerCapture(e.pointerId);
          e.preventDefault();
        }
        const orig = times(entry);
        setDrag({ id: entry.id, mode, pointerType: e.pointerType, y0: e.clientY, orig, current: orig, moved: false });
      },
      onPointerMove(e: React.PointerEvent<HTMLElement>) {
        if (!drag || drag.id !== entry.id) return;
        e.stopPropagation();
        if (!draggable || (drag.pointerType === "touch" && drag.mode === "move")) return;
        const dy = e.clientY - drag.y0;
        const moved = drag.moved || Math.abs(dy) >= DRAG_THRESHOLD;
        const current = adjustRange(drag.mode, drag.orig, (dy / pxPerMin) * 60_000, { min, max });
        setDrag({ ...drag, moved, current });
      },
      onPointerUp(e: React.PointerEvent<HTMLElement>) {
        if (!drag || drag.id !== entry.id) return;
        e.stopPropagation();
        setDrag(null);
        if (!drag.moved) return onClick(entry);
        const { current, orig } = drag;
        if (current.start.getTime() !== orig.start.getTime() || current.end.getTime() !== orig.end.getTime()) {
          save(entry, current);
        }
      },
      onPointerCancel() {
        setDrag(null);
      },
    };
  }

  return { bind, times, open: onClick, draggingId: drag?.moved ? drag.id : null };
}
