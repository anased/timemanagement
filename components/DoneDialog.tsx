"use client";

import { useEffect, useState, useTransition } from "react";
import { discardTimer, finishTimer, getTaskSuggestions, type TaskSuggestions } from "@/app/actions/entries";
import { formatDuration, fromLocalInput, toLocalInput } from "@/lib/time";
import { CategorySelect, PlannedSelect } from "./fields";
import type { CategoryDTO, RunningDTO } from "./types";

/** Shown when you click Done: confirm what you did, then it is saved (and added to the calendar). */
export function DoneDialog({
  running,
  categories,
  timeZone,
  syncsToCalendar,
  onClose,
}: {
  running: RunningDTO;
  categories: CategoryDTO[];
  timeZone: string;
  syncsToCalendar: boolean;
  onClose: () => void;
}) {
  const [initialStart] = useState(() => toLocalInput(running.start, timeZone));
  const [initialEnd] = useState(() => toLocalInput(new Date(), timeZone));
  const [title, setTitle] = useState(running.title);
  const [categoryId, setCategoryId] = useState(running.categoryId ?? "");
  const [note, setNote] = useState(running.note ?? "");
  const [plannedId, setPlannedId] = useState(running.plannedEventId ?? "");
  const [start, setStart] = useState(initialStart);
  const [end, setEnd] = useState(initialEnd);
  const [suggestions, setSuggestions] = useState<TaskSuggestions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    getTaskSuggestions()
      .then((s) => {
        if (cancelled) return;
        setSuggestions(s);
        // Unlinked task whose name matches a block happening now: suggest that block.
        if (!running.plannedEventId) {
          const match = s.current.find((b) => b.title.trim().toLowerCase() === running.title.trim().toLowerCase());
          if (match) setPlannedId(match.id);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [running.plannedEventId, running.title]);

  const linked =
    running.plannedEventId && running.plannedTitle && running.plannedStart && running.plannedEnd
      ? [{ id: running.plannedEventId, title: running.plannedTitle, start: running.plannedStart, end: running.plannedEnd }]
      : [];
  const blocks = [...linked, ...(suggestions?.current ?? []).filter((b) => b.id !== running.plannedEventId)];

  let durationMin: number | null = null;
  try {
    durationMin = (fromLocalInput(end, timeZone).getTime() - fromLocalInput(start, timeZone).getTime()) / 60000;
  } catch {}

  function save(e: React.FormEvent) {
    e.preventDefault();
    const block = blocks.find((b) => b.id === plannedId);
    startTransition(async () => {
      const res = await finishTimer({
        title,
        categoryId: categoryId || null,
        note,
        planned:
          plannedId === (running.plannedEventId ?? "")
            ? undefined
            : block
              ? { id: block.id, title: block.title, start: block.start, end: block.end }
              : null,
        start: start !== initialStart ? start : undefined,
        end: end !== initialEnd ? end : undefined,
      });
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  function discard() {
    if (!confirm("Throw away this timer? Nothing will be saved.")) return;
    startTransition(async () => {
      const res = await discardTimer();
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form onSubmit={save} className="card w-full max-w-md space-y-3 shadow-xl" role="dialog" aria-modal="true" aria-label="Finish task">
        <div>
          <h2 className="text-lg font-semibold">Done — what did you do?</h2>
          {durationMin !== null && durationMin > 0 && (
            <p className="text-sm text-muted">{formatDuration(durationMin)} tracked</p>
          )}
        </div>
        <div>
          <label className="label" htmlFor="done-title">
            Task
          </label>
          <input id="done-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <CategorySelect id="done-category" categories={categories} value={categoryId} onChange={setCategoryId} />
        <PlannedSelect
          id="done-planned"
          blocks={blocks}
          value={plannedId}
          onChange={setPlannedId}
          keepId={running.plannedEventId}
          timeZone={timeZone}
        />
        <div>
          <label className="label" htmlFor="done-note">
            Note (optional)
          </label>
          <textarea id="done-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <details className="text-sm">
          <summary className="cursor-pointer text-xs text-muted">Adjust start / end time</summary>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="done-start">
                Started
              </label>
              <input id="done-start" type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="label" htmlFor="done-end">
                Finished
              </label>
              <input id="done-end" type="datetime-local" className="input" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
        </details>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button type="button" className="btn text-red-600" onClick={discard} disabled={pending}>
            Discard
          </button>
          <button type="button" className="btn ml-auto" onClick={onClose} disabled={pending}>
            Keep running
          </button>
          <button type="submit" className="btn-primary" disabled={pending || !title.trim()}>
            {syncsToCalendar ? "Save to calendar" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
