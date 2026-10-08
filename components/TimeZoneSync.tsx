"use client";

import { useEffect } from "react";
import { syncTimeZone } from "@/app/actions/settings";

/** On first visit, store the browser's time zone so day boundaries match the user's clock. */
export function TimeZoneSync({ current }: { current: string }) {
  useEffect(() => {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (current === "UTC" && tz && tz !== "UTC") void syncTimeZone(tz);
  }, [current]);
  return null;
}
