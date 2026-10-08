import type { DaySummary } from "@/lib/analytics";
import { formatDuration } from "@/lib/time";

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="card p-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-0.5 text-xl font-semibold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function StatTiles({ summary }: { summary: DaySummary }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
      <Tile label="Planned" value={formatDuration(summary.plannedMin)} />
      <Tile label="Tracked" value={formatDuration(summary.trackedMin)} />
      <Tile label="On plan" value={formatDuration(summary.onPlanMin)} hint="linked to a planned block" />
      <Tile label="Off plan" value={formatDuration(summary.offPlanMin)} hint="unplanned work" />
      <Tile
        label="Free time used"
        value={formatDuration(summary.freeTrackedMin)}
        hint={`of ${formatDuration(summary.freeMin)} free`}
      />
      <Tile
        label="Plan adherence"
        value={summary.adherence === null ? "—" : `${Math.round(summary.adherence * 100)}%`}
        hint={`${formatDuration(summary.untrackedMin)} untracked`}
      />
    </div>
  );
}
