"use client";

import { useState, useTransition } from "react";
import { startTimer, stopTimer } from "@/app/actions/entries";
import { formatTime } from "@/lib/time";
import type { CategoryDTO, EntryDTO } from "./types";
import { useNow } from "./useNow";

function elapsed(from: Date, now: Date): string {
  const s = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

export function TimerBar({
  running,
  categories,
  timeZone,
}: {
  running: EntryDTO | null;
  categories: CategoryDTO[];
  timeZone: string;
}) {
  const now = useNow();
  const [title, setTitle] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const category = categories.find((c) => c.id === running?.categoryId);

  function start(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    startTransition(async () => {
      const res = await startTimer({ title, categoryId: categoryId || null });
      if (res.ok) setTitle("");
      setError(res.ok ? null : res.error);
    });
  }

  function stop() {
    startTransition(async () => {
      const res = await stopTimer();
      setError(res.ok ? null : res.error);
    });
  }

  return (
    <div className="card flex flex-col gap-3 md:flex-row md:items-center">
      {running ? (
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          </span>
          <div className="min-w-0">
            <div className="truncate font-medium">{running.title}</div>
            <div className="text-xs text-muted">
              since {formatTime(running.start, timeZone)}
              {category && (
                <>
                  {" · "}
                  <span style={{ color: category.color }}>●</span> {category.name}
                </>
              )}
            </div>
          </div>
          <span className="ml-auto font-mono text-lg tabular-nums">{elapsed(running.start, now)}</span>
          <button className="btn" onClick={stop} disabled={pending}>
            Stop
          </button>
        </div>
      ) : (
        <div className="flex-1 text-sm text-muted">No timer running.</div>
      )}
      <form onSubmit={start} className="flex min-w-0 flex-1 gap-2">
        <input
          className="input min-w-0 flex-1"
          placeholder={running ? "Switch to…" : "What are you working on?"}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          aria-label="Task title"
        />
        <select
          className="input max-w-36 shrink-0"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          aria-label="Category"
        >
          <option value="">No category</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <button className="btn-primary shrink-0" type="submit" disabled={pending || !title.trim()}>
          {running ? "Switch" : "Start"}
        </button>
      </form>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
