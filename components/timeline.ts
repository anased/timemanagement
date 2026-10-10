"use client";

import { useEffect, useState } from "react";
import type { BlockStatus } from "@/lib/analytics";
import { dragRange } from "@/lib/time";
import type { BlockDTO, ShownDTO } from "./types";

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
