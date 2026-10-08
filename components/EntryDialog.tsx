"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { deleteEntry, saveEntry } from "@/app/actions/entries";
import { formatTime, toLocalInput } from "@/lib/time";
import type { BlockDTO, CategoryDTO } from "./types";

export interface EntryDraft {
  id?: string;
  title: string;
  start: Date;
  end: Date | null;
  categoryId: string | null;
  note?: string | null;
  plannedEventId: string | null;
}

interface Ctx {
  open: (draft: EntryDraft) => void;
}

const EntryDialogContext = createContext<Ctx | null>(null);

export function useEntryDialog(): Ctx {
  const ctx = useContext(EntryDialogContext);
  if (!ctx) throw new Error("useEntryDialog must be used inside <EntryDialogProvider>");
  return ctx;
}

export function EntryDialogProvider({
  categories,
  blocks,
  timeZone,
  children,
}: {
  categories: CategoryDTO[];
  blocks: BlockDTO[];
  timeZone: string;
  children: React.ReactNode;
}) {
  const [draft, setDraft] = useState<EntryDraft | null>(null);
  return (
    <EntryDialogContext.Provider value={{ open: setDraft }}>
      {children}
      {draft && (
        <EntryForm
          key={draft.id ?? `${draft.start.getTime()}`}
          draft={draft}
          categories={categories}
          blocks={blocks}
          timeZone={timeZone}
          onClose={() => setDraft(null)}
        />
      )}
    </EntryDialogContext.Provider>
  );
}

function EntryForm({
  draft,
  categories,
  blocks,
  timeZone,
  onClose,
}: {
  draft: EntryDraft;
  categories: CategoryDTO[];
  blocks: BlockDTO[];
  timeZone: string;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(draft.title);
  const [start, setStart] = useState(toLocalInput(draft.start, timeZone));
  const [end, setEnd] = useState(draft.end ? toLocalInput(draft.end, timeZone) : "");
  const [categoryId, setCategoryId] = useState(draft.categoryId ?? "");
  const [plannedId, setPlannedId] = useState(draft.plannedEventId ?? "");
  const [note, setNote] = useState(draft.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isRunning = !!draft.id && draft.end === null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const block = blocks.find((b) => b.id === plannedId);
    startTransition(async () => {
      const res = await saveEntry({
        id: draft.id,
        title,
        start,
        end,
        categoryId: categoryId || null,
        note,
        // A link to a block outside this view is kept as-is (undefined = unchanged).
        planned: block
          ? { id: block.id, title: block.title, start: block.start, end: block.end }
          : plannedId && plannedId === draft.plannedEventId
            ? undefined
            : null,
      });
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  function remove() {
    if (!draft.id || !confirm("Delete this entry?")) return;
    startTransition(async () => {
      const res = await deleteEntry(draft.id!);
      if (res.ok) onClose();
      else setError(res.error);
    });
  }

  function linkBlock(id: string) {
    setPlannedId(id);
    const block = blocks.find((b) => b.id === id);
    if (block && !title.trim()) setTitle(block.title);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <form onSubmit={submit} className="card w-full max-w-md space-y-3 shadow-xl" role="dialog" aria-modal="true">
        <h2 className="text-lg font-semibold">{draft.id ? "Edit entry" : "Log time"}</h2>
        <div>
          <label className="label" htmlFor="entry-title">
            What did you do?
          </label>
          <input id="entry-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="entry-start">
              Start
            </label>
            <input
              id="entry-start"
              type="datetime-local"
              className="input"
              value={start}
              onChange={(e) => setStart(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="entry-end">
              End
            </label>
            <input
              id="entry-end"
              type="datetime-local"
              className="input"
              value={end}
              onChange={(e) => setEnd(e.target.value)}
              placeholder={isRunning ? "running" : ""}
            />
            {isRunning && <p className="mt-1 text-xs text-muted">Leave empty to keep the timer running.</p>}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="entry-category">
            Category
          </label>
          <select id="entry-category" className="input" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">No category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="entry-planned">
            Counts towards planned block
          </label>
          <select id="entry-planned" className="input" value={plannedId} onChange={(e) => linkBlock(e.target.value)}>
            <option value="">— Not planned —</option>
            {draft.plannedEventId && !blocks.some((b) => b.id === draft.plannedEventId) && (
              <option value={draft.plannedEventId}>(keep current link)</option>
            )}
            {blocks.map((b) => (
              <option key={b.id} value={b.id}>
                {formatTime(b.start, timeZone)}–{formatTime(b.end, timeZone)} {b.title}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="entry-note">
            Note
          </label>
          <textarea id="entry-note" className="input" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex items-center gap-2 pt-1">
          {draft.id && (
            <button type="button" className="btn text-red-600" onClick={remove} disabled={pending}>
              Delete
            </button>
          )}
          <button type="button" className="btn ml-auto" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={pending || !title.trim()}>
            Save
          </button>
        </div>
      </form>
    </div>
  );
}
