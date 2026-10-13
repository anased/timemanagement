"use client";

import type { useEntryDrag } from "./timeline";
import type { EntryDTO } from "./types";

/**
 * A tracked entry on a timeline: drag the body to move it, drag the top or
 * bottom edge to change its start or end, click (or Enter) to edit it.
 */
export function DraggableEntry({
  entry,
  drag,
  className,
  style,
  title,
  children,
}: {
  entry: EntryDTO;
  drag: ReturnType<typeof useEntryDrag>;
  className: string;
  style: React.CSSProperties;
  title?: string;
  children: React.ReactNode;
}) {
  const running = entry.end === null;
  const dragging = drag.draggingId === entry.id;
  const cursor = running ? "cursor-pointer" : dragging ? "cursor-grabbing" : "cursor-grab";
  const grip = <span className="mx-auto block h-0.5 w-5 rounded bg-current opacity-0 group-hover:opacity-40" />;
  return (
    <div
      role="button"
      tabIndex={0}
      title={title}
      className={`group absolute select-none ${cursor} ${dragging ? "z-30 shadow-md ring-1 ring-accent" : ""} ${className}`}
      style={style}
      {...drag.bind(entry, "move")}
      onKeyDown={(ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          drag.open(entry);
        }
      }}
    >
      {children}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-1.5 cursor-ns-resize pt-px"
        style={{ touchAction: "none" }}
        title="Drag to change the start"
        {...drag.bind(entry, "start")}
      >
        {grip}
      </div>
      {!running && (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 flex h-1.5 cursor-ns-resize items-end pb-px"
          style={{ touchAction: "none" }}
          title="Drag to change the end"
          {...drag.bind(entry, "end")}
        >
          {grip}
        </div>
      )}
    </div>
  );
}
