import { TZDate } from "@date-fns/tz";
import { format } from "date-fns";

/** A calendar day in the user's time zone, as "YYYY-MM-DD". */
export type DayKey = string;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isDayKey(value: unknown): value is DayKey {
  return typeof value === "string" && DAY_RE.test(value);
}

function parts(day: DayKey): [number, number, number] {
  const [y, m, d] = day.split("-").map(Number);
  return [y, m - 1, d];
}

/** The instant of `minutes` after local midnight on `day` in `tz`. */
export function localTime(day: DayKey, minutes: number, tz: string): Date {
  const [y, m, d] = parts(day);
  return new Date(new TZDate(y, m, d, 0, minutes, tz).getTime());
}

/** [midnight, next midnight) of `day` in `tz`. */
export function dayBounds(day: DayKey, tz: string): { start: Date; end: Date } {
  return { start: localTime(day, 0, tz), end: localTime(addDays(day, 1), 0, tz) };
}

export function todayKey(tz: string, now: Date = new Date()): DayKey {
  return format(new TZDate(now, tz), "yyyy-MM-dd");
}

export function dayKeyOf(date: Date, tz: string): DayKey {
  return format(new TZDate(date, tz), "yyyy-MM-dd");
}

export function addDays(day: DayKey, n: number): DayKey {
  const [y, m, d] = parts(day);
  const dt = new Date(Date.UTC(y, m, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Monday of the week containing `day`. */
export function weekStart(day: DayKey): DayKey {
  const [y, m, d] = parts(day);
  const dow = new Date(Date.UTC(y, m, d)).getUTCDay(); // 0 = Sunday
  return addDays(day, -((dow + 6) % 7));
}

export function formatTime(date: Date | string, tz: string): string {
  return format(new TZDate(new Date(date), tz), "HH:mm");
}

export function formatDay(day: DayKey, pattern = "EEE d MMM"): string {
  const [y, m, d] = parts(day);
  return format(new Date(y, m, d), pattern);
}

/** Value for an <input type="datetime-local"> showing `date` in `tz`. */
export function toLocalInput(date: Date | string, tz: string): string {
  return format(new TZDate(new Date(date), tz), "yyyy-MM-dd'T'HH:mm");
}

/** Parse an <input type="datetime-local"> value interpreted in `tz`. */
export function fromLocalInput(value: string, tz: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) throw new Error(`Invalid date-time: ${value}`);
  const [, y, mo, d, h, mi] = match.map(Number);
  return new Date(new TZDate(y, mo - 1, d, h, mi, tz).getTime());
}

export function minutesBetween(a: Date, b: Date): number {
  return (b.getTime() - a.getTime()) / 60000;
}

export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? "-" : "";
  const total = Math.round(Math.abs(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h === 0) return `${sign}${m}m`;
  return `${sign}${h}h${m ? ` ${String(m).padStart(2, "0")}m` : ""}`;
}

export function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Time range picked by dragging on a timeline, snapped to `stepMin` minutes on
 * the absolute clock. A drag shorter than one step counts as a click and gives
 * `clickMin` minutes from the clicked step. Clamped to [min, max].
 */
export function dragRange(
  anchor: number,
  current: number,
  { min, max, stepMin = 15, clickMin = 30 }: { min: number; max: number; stepMin?: number; clickMin?: number },
): { start: Date; end: Date } {
  const step = stepMin * 60_000;
  const lo = Math.min(anchor, current);
  const hi = Math.max(anchor, current);
  let start: number;
  let end: number;
  if (hi - lo < step) {
    start = Math.floor(anchor / step) * step;
    end = start + clickMin * 60_000;
  } else {
    start = Math.round(lo / step) * step;
    end = Math.round(hi / step) * step;
  }
  end = Math.min(end, max);
  start = Math.max(min, Math.min(start, end - step));
  return { start: new Date(start), end: new Date(Math.max(end, start + step)) };
}

/** Minutes after local midnight (wall clock) of `date` on `day`, clamped to [0, 1440]. */
function wallMinute(date: Date, day: DayKey, tz: string): number {
  const { start, end } = dayBounds(day, tz);
  if (date <= start) return 0;
  if (date >= end) return 24 * 60;
  const t = new TZDate(date, tz);
  return t.getHours() * 60 + t.getMinutes();
}

/**
 * Wall-clock minute range [start, end] to show for `day`: the `window` (e.g.
 * the user's day hours), stretched to include every [start, end] in `items`,
 * rounded out to whole hours and clamped to the day.
 */
export function displayMinutes(
  day: DayKey,
  items: [Date, Date][],
  tz: string,
  window: [number, number],
): [number, number] {
  let lo = window[0];
  let hi = window[1];
  const { start, end } = dayBounds(day, tz);
  for (const [s, e] of items) {
    if (e <= start || s >= end) continue;
    lo = Math.min(lo, wallMinute(s, day, tz));
    hi = Math.max(hi, wallMinute(e, day, tz));
  }
  return [Math.max(0, Math.floor(lo / 60) * 60), Math.min(24 * 60, Math.ceil(hi / 60) * 60)];
}
