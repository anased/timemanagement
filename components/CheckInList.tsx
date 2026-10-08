"use client";

import { useState, useTransition } from "react";
import { reviewBlock } from "@/app/actions/reviews";
import { formatTime, toLocalInput } from "@/lib/time";
import type { BlockDTO, CategoryDTO } from "./types";

type Mode = "PARTIAL" | "REPLACED" | null;

/** Past planned blocks with nothing tracked against them: one tap to say how they went. */
export function CheckInList({
  blocks,
  categories,
  timeZone,
}: {
  blocks: BlockDTO[];
  categories: CategoryDTO[];
  timeZone: string;
}) {
  if (blocks.length === 0) return null;
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-semibold">Check in</h2>
        <p className="text-xs text-muted">These blocks are over and nothing was tracked for them. How did they go?</p>
      </div>
      <ul className="space-y-2">
        {blocks.map((b) => (
          <CheckInItem key={b.id} block={b} categories={categories} timeZone={timeZone} />
        ))}
      </ul>
    </section>
  );
}

function CheckInItem({ block, categories, timeZone }: { block: BlockDTO; categories: CategoryDTO[]; timeZone: string }) {
  const [mode, setMode] = useState<Mode>(null);
  const [start, setStart] = useState(toLocalInput(block.start, timeZone));
  const [end, setEnd] = useState(toLocalInput(block.end, timeZone));
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function submit(status: "DONE" | "PARTIAL" | "SKIPPED" | "REPLACED") {
    startTransition(async () => {
      const res = await reviewBlock({
        block: { id: block.id, title: block.title, start: block.start, end: block.end },
        status,
        start: status === "PARTIAL" || status === "REPLACED" ? start : undefined,
        end: status === "PARTIAL" || status === "REPLACED" ? end : undefined,
        title: status === "REPLACED" ? title : undefined,
        categoryId: categoryId || null,
      });
      setError(res.ok ? null : res.error);
    });
  }

  return (
    <li className="rounded-lg border border-line p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium">{block.title}</div>
          <div className="text-xs text-muted">
            {formatTime(block.start, timeZone)}–{formatTime(block.end, timeZone)}
          </div>
        </div>
        <div className="flex flex-wrap gap-1">
          <button className="btn px-2 py-1 text-xs" disabled={pending} onClick={() => submit("DONE")}>
            ✓ As planned
          </button>
          <button className="btn px-2 py-1 text-xs" disabled={pending} onClick={() => setMode(mode === "PARTIAL" ? null : "PARTIAL")}>
            Partly
          </button>
          <button className="btn px-2 py-1 text-xs" disabled={pending} onClick={() => setMode(mode === "REPLACED" ? null : "REPLACED")}>
            Something else
          </button>
          <button className="btn px-2 py-1 text-xs" disabled={pending} onClick={() => submit("SKIPPED")}>
            Skipped
          </button>
        </div>
      </div>
      {mode && (
        <div className="mt-2 space-y-2">
          {mode === "REPLACED" && (
            <input className="input" placeholder="What did you do instead?" value={title} onChange={(e) => setTitle(e.target.value)} />
          )}
          <div className="grid grid-cols-2 gap-2">
            <input type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} aria-label="Actual start" />
            <input type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} aria-label="Actual end" />
          </div>
          <div className="flex gap-2">
            <select className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)} aria-label="Category">
              <option value="">No category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              className="btn-primary shrink-0"
              disabled={pending || (mode === "REPLACED" && !title.trim())}
              onClick={() => submit(mode)}
            >
              Save
            </button>
          </div>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
    </li>
  );
}
