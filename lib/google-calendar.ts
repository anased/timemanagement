import "server-only";
import { prisma } from "@/lib/db";

const API = "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface PlannedEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  calendarId: string;
  htmlLink?: string;
}

export interface CalendarInfo {
  id: string;
  name: string;
  primary: boolean;
  color?: string;
}

/** The user needs to (re)connect Google: no token, revoked access, or missing scope. */
export class CalendarAuthError extends Error {}

interface RawEvent {
  id: string;
  status?: string;
  summary?: string;
  htmlLink?: string;
  transparency?: string;
  eventType?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}

/**
 * Turns a Google event into a planned block, or null when it is not a time
 * block: all-day events, cancelled or declined events, working-location and
 * out-of-office markers.
 */
export function normalizeEvent(raw: RawEvent, calendarId: string): PlannedEvent | null {
  if (raw.status === "cancelled") return null;
  if (raw.eventType && !["default", "focusTime", "fromGmail"].includes(raw.eventType)) return null;
  if (!raw.start?.dateTime || !raw.end?.dateTime) return null;
  if (raw.attendees?.some((a) => a.self && a.responseStatus === "declined")) return null;
  const start = new Date(raw.start.dateTime);
  const end = new Date(raw.end.dateTime);
  if (!(end > start)) return null;
  return {
    id: raw.id,
    title: raw.summary?.trim() || "(untitled)",
    start,
    end,
    calendarId,
    htmlLink: raw.htmlLink,
  };
}

async function googleGet<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (res.status === 401 || res.status === 403) {
    throw new CalendarAuthError(`Google Calendar refused access (${res.status})`);
  }
  if (!res.ok) throw new Error(`Google Calendar error ${res.status}: ${await res.text()}`);
  return (await res.json()) as T;
}

/** Fetches planned events from several calendars, de-duplicated and sorted. */
export async function fetchEvents(
  token: string,
  calendarIds: string[],
  from: Date,
  to: Date,
): Promise<PlannedEvent[]> {
  const perCalendar = await Promise.all(
    calendarIds.map(async (calendarId) => {
      const events: PlannedEvent[] = [];
      let pageToken: string | undefined;
      do {
        const page = await googleGet<{ items?: RawEvent[]; nextPageToken?: string }>(
          token,
          `/calendars/${encodeURIComponent(calendarId)}/events`,
          {
            timeMin: from.toISOString(),
            timeMax: to.toISOString(),
            singleEvents: "true",
            orderBy: "startTime",
            maxResults: "250",
            ...(pageToken ? { pageToken } : {}),
          },
        );
        for (const raw of page.items ?? []) {
          const e = normalizeEvent(raw, calendarId);
          if (e) events.push(e);
        }
        pageToken = page.nextPageToken;
      } while (pageToken);
      return events;
    }),
  );
  const byId = new Map<string, PlannedEvent>();
  for (const e of perCalendar.flat()) if (!byId.has(e.id)) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => a.start.getTime() - b.start.getTime());
}

/** A valid Google access token for the user, refreshing it when it is about to expire. */
export async function getAccessToken(userId: string): Promise<string> {
  const account = await prisma.account.findFirst({ where: { userId, provider: "google" } });
  if (!account?.access_token) throw new CalendarAuthError("Google account not connected");
  if (!account.scope?.includes("calendar")) throw new CalendarAuthError("Calendar access not granted");

  const expiresAtMs = (account.expires_at ?? 0) * 1000;
  if (expiresAtMs > Date.now() + 60_000) return account.access_token;
  if (!account.refresh_token) throw new CalendarAuthError("No refresh token; please reconnect Google");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.AUTH_GOOGLE_ID ?? "",
      client_secret: process.env.AUTH_GOOGLE_SECRET ?? "",
      grant_type: "refresh_token",
      refresh_token: account.refresh_token,
    }),
    cache: "no-store",
  });
  const body = (await res.json()) as {
    access_token?: string;
    expires_in?: number;
    refresh_token?: string;
    error?: string;
  };
  if (!res.ok || !body.access_token) {
    throw new CalendarAuthError(`Could not refresh Google token: ${body.error ?? res.status}`);
  }
  await prisma.account.update({
    where: { provider_providerAccountId: { provider: "google", providerAccountId: account.providerAccountId } },
    data: {
      access_token: body.access_token,
      expires_at: Math.floor(Date.now() / 1000) + (body.expires_in ?? 3600),
      ...(body.refresh_token ? { refresh_token: body.refresh_token } : {}),
    },
  });
  return body.access_token;
}

export async function listCalendars(userId: string): Promise<CalendarInfo[]> {
  const token = await getAccessToken(userId);
  const data = await googleGet<{
    items?: { id: string; summary?: string; summaryOverride?: string; primary?: boolean; backgroundColor?: string }[];
  }>(token, "/users/me/calendarList", { minAccessRole: "reader" });
  return (data.items ?? []).map((c) => ({
    id: c.id,
    name: c.summaryOverride || c.summary || c.id,
    primary: !!c.primary,
    color: c.backgroundColor,
  }));
}

/** Calendars whose events count as the plan. Defaults to the primary calendar. */
export async function selectedCalendarIds(userId: string): Promise<string[]> {
  const rows = await prisma.calendarSelection.findMany({ where: { userId } });
  if (rows.length === 0) return ["primary"];
  return rows.filter((r) => r.enabled).map((r) => r.calendarId);
}

export type PlannedResult =
  | { ok: true; events: PlannedEvent[] }
  | { ok: false; reason: "auth" | "error"; message: string; events: PlannedEvent[] };

/** Planned events for the user in [from, to). Never throws, so pages can still render tracking data. */
export async function getPlannedEvents(userId: string, from: Date, to: Date): Promise<PlannedResult> {
  try {
    const [token, ids] = await Promise.all([getAccessToken(userId), selectedCalendarIds(userId)]);
    if (ids.length === 0) return { ok: true, events: [] };
    return { ok: true, events: await fetchEvents(token, ids, from, to) };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: err instanceof CalendarAuthError ? "auth" : "error", message, events: [] };
  }
}
