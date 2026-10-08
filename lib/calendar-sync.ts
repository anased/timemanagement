import "server-only";
import { forUser } from "@/lib/db-scoped";
import {
  ENTRY_PROPERTY,
  GoogleHttpError,
  getAccessToken,
  googleFetch,
  hasWriteAccess,
} from "@/lib/google-calendar";

/**
 * Mirrors finished time entries into an "Actual time" Google calendar that
 * this app creates (scope calendar.app.created), so what you did shows up
 * next to your plan in Google / Notion Calendar. Everything here is
 * best-effort: a failure is logged and never blocks saving an entry.
 */

export const ACTUAL_CALENDAR_NAME = "Actual time";
const CALENDAR_MARKER = "Created by Plan vs. Actual";

export interface SyncableEntry {
  id: string;
  title: string;
  start: Date;
  end: Date | null;
  note: string | null;
  plannedTitle: string | null;
  googleEventId: string | null;
}

export function shouldSync(
  user: { syncToCalendar: boolean },
  entry: { end: Date | null },
  canWrite: boolean,
): boolean {
  return user.syncToCalendar && canWrite && entry.end !== null;
}

function isGone(err: unknown) {
  return err instanceof GoogleHttpError && (err.status === 404 || err.status === 410);
}

/** Finds the app's calendar (e.g. after its id was lost) or creates it. */
export async function findOrCreateCalendar(token: string, timeZone: string): Promise<string> {
  const list = await googleFetch<{ items?: { id: string; summary?: string; description?: string; accessRole?: string }[] }>(
    token,
    "GET",
    "/users/me/calendarList",
    { params: { minAccessRole: "owner" } },
  );
  const existing = list.items?.find((c) => c.summary === ACTUAL_CALENDAR_NAME && c.description?.includes(CALENDAR_MARKER));
  if (existing) return existing.id;
  const created = await googleFetch<{ id: string }>(token, "POST", "/calendars", {
    body: {
      summary: ACTUAL_CALENDAR_NAME,
      description: `How you actually spent your time. ${CALENDAR_MARKER}.`,
      timeZone,
    },
  });
  return created.id;
}

export function eventBody(entry: SyncableEntry, timeZone: string, categoryName?: string | null) {
  const details = [
    categoryName ? `Category: ${categoryName}` : null,
    entry.plannedTitle ? `Planned block: ${entry.plannedTitle}` : null,
    entry.note || null,
  ].filter(Boolean);
  return {
    summary: entry.title,
    description: [...details, "", "Logged with Plan vs. Actual"].join("\n").trim(),
    start: { dateTime: entry.start.toISOString(), timeZone },
    end: { dateTime: entry.end!.toISOString(), timeZone },
    // Logged time shouldn't make you look busy or trigger reminders.
    transparency: "transparent",
    reminders: { useDefault: false, overrides: [] },
    extendedProperties: { private: { [ENTRY_PROPERTY]: entry.id } },
  };
}

/**
 * Creates or updates the calendar event for a finished entry. Recreates the
 * event or the whole calendar if the user deleted them in Google.
 */
export async function pushEntry(
  token: string,
  opts: { calendarId: string | null; timeZone: string; entry: SyncableEntry; categoryName?: string | null },
): Promise<{ calendarId: string; eventId: string }> {
  const body = eventBody(opts.entry, opts.timeZone, opts.categoryName);
  let calendarId = opts.calendarId ?? (await findOrCreateCalendar(token, opts.timeZone));
  const path = (cal: string) => `/calendars/${encodeURIComponent(cal)}/events`;

  if (opts.entry.googleEventId) {
    try {
      const updated = await googleFetch<{ id: string }>(
        token,
        "PATCH",
        `${path(calendarId)}/${encodeURIComponent(opts.entry.googleEventId)}`,
        { body },
      );
      return { calendarId, eventId: updated.id };
    } catch (err) {
      if (!isGone(err)) throw err;
    }
  }

  try {
    const created = await googleFetch<{ id: string }>(token, "POST", path(calendarId), { body });
    return { calendarId, eventId: created.id };
  } catch (err) {
    if (!isGone(err)) throw err;
    // The calendar itself is gone: make a new one and try once more.
    calendarId = await findOrCreateCalendar(token, opts.timeZone);
    const created = await googleFetch<{ id: string }>(token, "POST", path(calendarId), { body });
    return { calendarId, eventId: created.id };
  }
}

export async function deleteEvent(token: string, calendarId: string, eventId: string): Promise<void> {
  try {
    await googleFetch(token, "DELETE", `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`);
  } catch (err) {
    if (!isGone(err)) throw err;
  }
}

/** Mirrors one entry into the user's "Actual time" calendar, if enabled. */
export async function syncEntry(userId: string, entryId: string): Promise<void> {
  try {
    const scope = forUser(userId);
    const [user, entry, canWrite] = await Promise.all([
      scope.settings.get(),
      scope.entries.get(entryId),
      hasWriteAccess(userId),
    ]);
    if (!entry || !shouldSync(user, entry, canWrite)) return;
    const token = await getAccessToken(userId);
    const categoryName = entry.categoryId
      ? (await scope.categories.list()).find((c) => c.id === entry.categoryId)?.name
      : null;
    const result = await pushEntry(token, {
      calendarId: user.actualCalendarId,
      timeZone: user.timeZone,
      entry,
      categoryName,
    });
    if (result.calendarId !== user.actualCalendarId) await scope.settings.update({ actualCalendarId: result.calendarId });
    if (result.eventId !== entry.googleEventId) await scope.entries.setGoogleEventId(entry.id, result.eventId);
  } catch (err) {
    console.error(`Calendar sync failed for entry ${entryId}:`, err);
  }
}

/** Removes the calendar event of a deleted entry. */
export async function unsyncEntry(userId: string, googleEventId: string | null): Promise<void> {
  if (!googleEventId) return;
  try {
    const scope = forUser(userId);
    const [user, canWrite] = await Promise.all([scope.settings.get(), hasWriteAccess(userId)]);
    if (!user.actualCalendarId || !canWrite) return;
    await deleteEvent(await getAccessToken(userId), user.actualCalendarId, googleEventId);
  } catch (err) {
    console.error(`Removing calendar event ${googleEventId} failed:`, err);
  }
}
