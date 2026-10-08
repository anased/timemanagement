import { formatDuration } from "@/lib/time";
import type { CategoryDTO } from "./types";

/** Horizontal bars of tracked minutes per category, largest first. */
export function CategoryBars({ totals, categories }: { totals: Map<string | null, number>; categories: CategoryDTO[] }) {
  const rows = [...totals.entries()]
    .map(([id, minutes]) => {
      const c = categories.find((x) => x.id === id);
      return { id: id ?? "none", name: c?.name ?? "Uncategorised", color: c?.color ?? "#8a8a85", minutes };
    })
    .sort((a, b) => b.minutes - a.minutes);
  const max = Math.max(1, ...rows.map((r) => r.minutes));
  const total = rows.reduce((s, r) => s + r.minutes, 0);

  if (rows.length === 0) return <p className="text-sm text-muted">Nothing tracked yet.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li key={r.id} className="text-sm">
          <div className="mb-0.5 flex items-baseline gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
            <span className="truncate">{r.name}</span>
            <span className="ml-auto tabular-nums">{formatDuration(r.minutes)}</span>
            <span className="w-10 text-right text-xs tabular-nums text-muted">{Math.round((r.minutes / total) * 100)}%</span>
          </div>
          <div className="h-2 rounded bg-bg">
            <div className="h-2 rounded" style={{ width: `${(r.minutes / max) * 100}%`, background: r.color }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
