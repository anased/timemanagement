import "server-only";
import { prisma } from "@/lib/db";

const API = "https://www.googleapis.com/calendar/v3";
export const WRITE_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface PlannedEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  calendarId: string;
  htmlLink?: string;
}

/** A timed event from a "show only" calendar: displayed, never part of the plan. */
export type ShownEvent = PlannedEvent;

/** An all-day event, from `startDay` up to (not including) `endDay`. */
export interface AllDayEvent {
  id: string;
  title: string;
  calendarId: string;
  startDay: string;
  endDay: string;
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
  extendedProperties?: { private?: Record<string, string> };
}

/** Private event property marking events this app wrote for a time entry. */
export const ENTRY_PROPERTY = "tmEntryId";

/**
 * Turns a Google event into a planned block, or null when it is not a time
 * block: all-day events, cancelled or declined events, working-location and
 * out-of-office markers.
 */
export function normalizeEvent(raw: RawEvent, calendarId: string): PlannedEvent | null {
  if (raw.status === "cancelled") return null;
  // Our own "actual time" events are never part of the plan.
  if (raw.extendedProperties?.private?.[ENTRY_PROPERTY]) return null;
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

/** All-day events (holidays, birthdays, trips), or null for anything else. */
export function normalizeAllDay(raw: RawEvent, calendarId: string): AllDayEvent | null {
  if (raw.status === "cancelled") return null;
  if (!raw.start?.date || !raw.end?.date) return null;
  if (raw.attendees?.some((a) => a.self && a.responseStatus === "declined")) return null;
  if (!(raw.end.date > raw.start.date)) return null;
  return {
    id: raw.id,
    title: raw.summary?.trim() || "(untitled)",
    calendarId,
    startDay: raw.start.date,
    endDay: raw.end.date,
    htmlLink: raw.htmlLink,
  };
}

export class GoogleHttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Calls the Calendar API. 401/403 become CalendarAuthError, other failures GoogleHttpError. */
export async function googleFetch<T>(
  token: string,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  { params = {}, body }: { params?: Record<string, string>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  if (res.status === 401 || res.status === 403) {
    throw new CalendarAuthError(`Google Calendar refused access (${res.status})`);
  }
  if (!res.ok) throw new GoogleHttpError(res.status, `Google Calendar error ${res.status}: ${await res.text()}`);
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

function googleGet<T>(token: string, path: string, params: Record<string, string> = {}): Promise<T> {
  return googleFetch<T>(token, "GET", path, { params });
}

async function fetchRawEvents(token: string, calendarId: string, from: Date, to: Date): Promise<RawEvent[]> {
  const raws: RawEvent[] = [];
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
    raws.push(...(page.items ?? []));
    pageToken = page.nextPageToken;
  } while (pageToken);
  return raws;
}

const byStart = (a: { start: Date }, b: { start: Date }) => a.start.getTime() - b.start.getTime();

/**
 * Fetches each calendar once and sorts its events into timed plan blocks,
 * timed events that are only shown, and all-day events (from both). An event
 * on several calendars appears once, and counts as plan if any copy does.
 */
export async function fetchCalendars(
  token: string,
  roles: { plan: string[]; show: string[] },
  from: Date,
  to: Date,
): Promise<{ events: PlannedEvent[]; shown: ShownEvent[]; allDay: AllDayEvent[] }> {
  const calendars = [...roles.plan.map((id) => ({ id, plan: true })), ...roles.show.map((id) => ({ id, plan: false }))];
  const raws = await Promise.all(calendars.map((c) => fetchRawEvents(token, c.id, from, to)));

  const events = new Map<string, PlannedEvent>();
  const shown = new Map<string, ShownEvent>();
  const allDay = new Map<string, AllDayEvent>();
  calendars.forEach((c, i) => {
    for (const raw of raws[i]) {
      const timed = normalizeEvent(raw, c.id);
      if (timed) {
        const target = c.plan ? events : shown;
        if (!target.has(timed.id)) target.set(timed.id, timed);
        continue;
      }
      const day = normalizeAllDay(raw, c.id);
      if (day && !allDay.has(day.id)) allDay.set(day.id, day);
    }
  });
  for (const id of events.keys()) shown.delete(id);

  return {
    events: [...events.values()].sort(byStart),
    shown: [...shown.values()].sort(byStart),
    allDay: [...allDay.values()].sort((a, b) => a.startDay.localeCompare(b.startDay) || a.title.localeCompare(b.title)),
  };
}

/** Fetches planned events from several calendars, de-duplicated and sorted. */
export async function fetchEvents(
  token: string,
  calendarIds: string[],
  from: Date,
  to: Date,
): Promise<PlannedEvent[]> {
  return (await fetchCalendars(token, { plan: calendarIds, show: [] }, from, to)).events;
}

export function canWriteCalendar(scope: string | null | undefined): boolean {
  return !!scope?.split(/\s+/).includes(WRITE_SCOPE);
}

export async function hasWriteAccess(userId: string): Promise<boolean> {
  const account = await prisma.account.findFirst({ where: { userId, provider: "google" }, select: { scope: true } });
  return canWriteCalendar(account?.scope);
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

export interface CalendarRoles {
  /** Calendars whose events count as the plan. */
  plan: string[];
  /** Calendars whose events are only displayed. */
  show: string[];
  /** Saved Google colour per calendar id. */
  colors: Record<string, string>;
}

/**
 * Which calendars are plan and which are only shown. With nothing saved the
 * primary calendar is the plan. The app's own "Actual time" calendar is never
 * included.
 */
export async function selectedCalendars(userId: string): Promise<CalendarRoles> {
  const [rows, user] = await Promise.all([
    prisma.calendarSelection.findMany({ where: { userId } }),
    prisma.user.findUnique({ where: { id: userId }, select: { actualCalendarId: true } }),
  ]);
  return calendarRoles(rows, user?.actualCalendarId ?? null);
}

export function calendarRoles(
  rows: { calendarId: string; role: "PLAN" | "SHOW" | "OFF"; color?: string | null }[],
  actualCalendarId: string | null,
): CalendarRoles {
  if (rows.length === 0) return { plan: ["primary"], show: [], colors: {} };
  const ids = (role: string) => rows.filter((r) => r.role === role && r.calendarId !== actualCalendarId).map((r) => r.calendarId);
  const colors: Record<string, string> = {};
  for (const r of rows) if (r.color) colors[r.calendarId] = r.color;
  return { plan: ids("PLAN"), show: ids("SHOW"), colors };
}

interface CalendarData {
  events: PlannedEvent[];
  shown: ShownEvent[];
  allDay: AllDayEvent[];
  colors: Record<string, string>;
}

export type PlannedResult =
  | ({ ok: true } & CalendarData)
  | ({ ok: false; reason: "auth" | "error"; message: string } & CalendarData);

const EMPTY: CalendarData = { events: [], shown: [], allDay: [], colors: {} };

/**
 * Planned events for the user in [from, to), plus events from "show only"
 * calendars and all-day events. Never throws, so pages can still render
 * tracking data.
 */
export async function getPlannedEvents(userId: string, from: Date, to: Date): Promise<PlannedResult> {
  try {
    const [token, roles] = await Promise.all([getAccessToken(userId), selectedCalendars(userId)]);
    if (roles.plan.length + roles.show.length === 0) return { ok: true, ...EMPTY, colors: roles.colors };
    return { ok: true, ...(await fetchCalendars(token, roles, from, to)), colors: roles.colors };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: err instanceof CalendarAuthError ? "auth" : "error", message, ...EMPTY };
  }
}
