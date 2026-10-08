"use client";

import { localTime, todayKey, type DayKey } from "@/lib/time";
import { useEntryDialog } from "./EntryDialog";

/** Opens the entry dialog with the last half hour (or 09:00–09:30 on another day). */
export function LogTimeButton({ day, timeZone }: { day: DayKey; timeZone: string }) {
  const dialog = useEntryDialog();
  function open() {
    const now = new Date();
    const end = day === todayKey(timeZone) ? now : localTime(day, 9 * 60 + 30, timeZone);
    const start = new Date(end.getTime() - 30 * 60_000);
    dialog.open({ title: "", start, end, categoryId: null, plannedEventId: null });
  }
  return (
    <button className="btn-primary" onClick={open}>
      + Log time
    </button>
  );
}
