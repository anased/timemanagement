import { formatDuration, formatTime } from "@/lib/time";
import type { AllDayDTO, ShownDTO } from "./types";

const GREY = "#8a8a85";

/** A faint, dashed event from a "show only" calendar. Opens it in Google. */
export function ShownBox({
  event: e,
  style,
  timeZone,
  compact = false,
}: {
  event: ShownDTO;
  style: React.CSSProperties;
  timeZone: string;
  compact?: boolean;
}) {
  const color = e.color ?? GREY;
  const time = `${formatTime(e.start, timeZone)}–${formatTime(e.end, timeZone)}`;
  const className = `absolute overflow-hidden rounded border border-dashed px-1 py-0.5 text-left leading-tight text-muted ${compact ? "text-[10px]" : "text-[11px]"}`;
  const content = (
    <>
      <span className="block truncate">{e.title}</span>
      {!compact && <span className="block truncate text-[10px] opacity-80">{time}</span>}
    </>
  );
  const props = {
    className,
    style: { ...style, borderColor: color, background: `${color}12` },
    title: `${e.title} · ${time} · ${formatDuration((e.end.getTime() - e.start.getTime()) / 60000)} (shown only, not part of your plan)`,
  };
  return e.htmlLink ? (
    <a {...props} href={e.htmlLink} target="_blank" rel="noreferrer">
      {content}
    </a>
  ) : (
    <div {...props}>{content}</div>
  );
}

/** All-day events as small chips. Renders nothing when there are none. */
export function AllDayStrip({ items, className = "" }: { items: AllDayDTO[]; className?: string }) {
  if (items.length === 0) return null;
  return (
    <div className={`flex flex-wrap gap-1 ${className}`}>
      {items.map((i) => {
        const color = i.color ?? GREY;
        const chip = {
          className: "max-w-full truncate rounded px-1.5 py-0.5 text-[10px] leading-tight",
          style: { background: `${color}26`, borderLeft: `3px solid ${color}` },
          title: `${i.title} (all day)`,
        };
        return i.htmlLink ? (
          <a key={i.id} {...chip} href={i.htmlLink} target="_blank" rel="noreferrer">
            {i.title}
          </a>
        ) : (
          <span key={i.id} {...chip}>
            {i.title}
          </span>
        );
      })}
    </div>
  );
}
