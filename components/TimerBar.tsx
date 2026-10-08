"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { getTaskSuggestions, startTimer, type TaskSuggestions } from "@/app/actions/entries";
import { formatTime } from "@/lib/time";
import { DoneDialog } from "./DoneDialog";
import type { CategoryDTO, RunningDTO } from "./types";
import { useNow } from "./useNow";

function elapsed(from: Date, now: Date): string {
  const s = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

type Picked = { id: string; title: string; start: Date; end: Date } | null;

/**
 * Always-visible tracker: "New task" asks what you're doing and starts the
 * clock; "Done" asks for the details and saves it (to the calendar too).
 */
export function TimerBar({
  running,
  categories,
  timeZone,
  syncsToCalendar,
}: {
  running: RunningDTO | null;
  categories: CategoryDTO[];
  timeZone: string;
  syncsToCalendar: boolean;
}) {
  const now = useNow();
  const [naming, setNaming] = useState(false);
  const [doneOpen, setDoneOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [picked, setPicked] = useState<Picked>(null);
  const [suggestions, setSuggestions] = useState<TaskSuggestions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const category = categories.find((c) => c.id === running?.categoryId);

  useEffect(() => {
    if (!naming) return;
    inputRef.current?.focus();
    let cancelled = false;
    getTaskSuggestions()
      .then((s) => !cancelled && setSuggestions(s))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [naming]);

  function openNaming() {
    setTitle("");
    setPicked(null);
    setError(null);
    setNaming(true);
  }

  function choose(text: string, block: Picked = null) {
    setTitle(text);
    setPicked(block);
    inputRef.current?.focus();
  }

  function start(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    // Keep the planned link only while the name still matches the chosen block.
    const planned = picked && picked.title === title ? picked : null;
    startTransition(async () => {
      const res = await startTimer({ title, planned });
      if (res.ok) setNaming(false);
      setError(res.ok ? null : res.error);
    });
  }

  const recent = (suggestions?.recent ?? []).filter(
    (t) => !suggestions?.current.some((b) => b.title.toLowerCase() === t.toLowerCase()),
  );

  return (
    <div className="card space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        {running ? (
          <>
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{running.title}</div>
              <div className="text-xs text-muted">
                since {formatTime(running.start, timeZone)}
                {running.plannedTitle && <> · planned: {running.plannedTitle}</>}
                {category && (
                  <>
                    {" · "}
                    <span style={{ color: category.color }}>●</span> {category.name}
                  </>
                )}
              </div>
            </div>
            <span className="font-mono text-lg tabular-nums">{elapsed(running.start, now)}</span>
            <button className="btn" onClick={() => (naming ? setNaming(false) : openNaming())} disabled={pending}>
              {naming ? "Cancel" : "New task"}
            </button>
            <button className="btn-primary px-5" onClick={() => setDoneOpen(true)} disabled={pending}>
              ✓ Done
            </button>
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1 text-sm text-muted">
              {naming ? "What are you working on?" : "Not tracking anything right now."}
            </div>
            {naming ? (
              <button className="btn" onClick={() => setNaming(false)}>
                Cancel
              </button>
            ) : (
              <button className="btn-primary px-5" onClick={openNaming}>
                ▶ New task
              </button>
            )}
          </>
        )}
      </div>

      {naming && (
        <form onSubmit={start} className="space-y-2">
          <div className="flex gap-2">
            <input
              ref={inputRef}
              className="input min-w-0 flex-1"
              placeholder={running ? "Switch to… (the current task is saved)" : "e.g. Write project proposal"}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="What are you working on?"
            />
            <button className="btn-primary shrink-0" type="submit" disabled={pending || !title.trim()}>
              Start
            </button>
          </div>
          {suggestions && (suggestions.current.length > 0 || recent.length > 0) && (
            <div className="flex flex-wrap gap-1.5 text-xs">
              {suggestions.current.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  className={`rounded-full border px-2.5 py-1 ${picked?.id === b.id ? "border-accent bg-accent/10 text-accent" : "border-accent/40 text-accent hover:bg-accent/10"}`}
                  onClick={() => choose(b.title, b)}
                  title="Planned now"
                >
                  📅 {b.title} · {formatTime(b.start, timeZone)}–{formatTime(b.end, timeZone)}
                </button>
              ))}
              {recent.map((t) => (
                <button
                  key={t}
                  type="button"
                  className="rounded-full border border-line px-2.5 py-1 text-muted hover:text-fg"
                  onClick={() => choose(t)}
                >
                  {t}
                </button>
              ))}
            </div>
          )}
        </form>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}

      {doneOpen && running && (
        <DoneDialog
          key={running.id}
          running={running}
          categories={categories}
          timeZone={timeZone}
          syncsToCalendar={syncsToCalendar}
          onClose={() => setDoneOpen(false)}
        />
      )}
    </div>
  );
}
