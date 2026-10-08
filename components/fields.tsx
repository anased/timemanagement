"use client";

import { formatTime } from "@/lib/time";
import type { BlockDTO, CategoryDTO } from "./types";

export function CategorySelect({
  id,
  categories,
  value,
  onChange,
}: {
  id: string;
  categories: CategoryDTO[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        Category
      </label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">No category</option>
        {categories.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * Picks the planned block an entry counts towards. `keepId` is a block that is
 * already linked but not in `blocks` (e.g. from another day); it stays selectable.
 */
export function PlannedSelect({
  id,
  blocks,
  value,
  onChange,
  keepId,
  timeZone,
}: {
  id: string;
  blocks: Pick<BlockDTO, "id" | "title" | "start" | "end">[];
  value: string;
  onChange: (value: string) => void;
  keepId?: string | null;
  timeZone: string;
}) {
  return (
    <div>
      <label className="label" htmlFor={id}>
        Counts towards planned block
      </label>
      <select id={id} className="input" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">— Not planned —</option>
        {keepId && !blocks.some((b) => b.id === keepId) && <option value={keepId}>(keep current link)</option>}
        {blocks.map((b) => (
          <option key={b.id} value={b.id}>
            {formatTime(b.start, timeZone)}–{formatTime(b.end, timeZone)} {b.title}
          </option>
        ))}
      </select>
    </div>
  );
}
