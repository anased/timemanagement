import { afterEach, describe, expect, it, vi } from "vitest";
import { deleteEvent, eventBody, pushEntry, shouldSync, type SyncableEntry } from "@/lib/calendar-sync";
import { canWriteCalendar, normalizeEvent, planCalendarIds, WRITE_SCOPE } from "@/lib/google-calendar";

const entry = (over: Partial<SyncableEntry> = {}): SyncableEntry => ({
  id: "entry1",
  title: "Write report",
  start: new Date("2026-10-08T09:00:00Z"),
  end: new Date("2026-10-08T10:15:00Z"),
  note: "first draft",
  plannedTitle: "Deep work",
  googleEventId: null,
  ...over,
});

interface Call {
  method: string;
  path: string;
  body?: Record<string, unknown>;
}

/** Fake Calendar API: `routes` maps "METHOD path" to [status, body]. */
function mockGoogle(routes: Record<string, [number, unknown]>) {
  const calls: Call[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init?: RequestInit) => {
      const path = decodeURIComponent(url.pathname.replace("/calendar/v3", ""));
      const method = init?.method ?? "GET";
      calls.push({ method, path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
      const [status, body] = routes[`${method} ${path}`] ?? [500, { error: "unexpected" }];
      return new Response(status === 204 ? null : JSON.stringify(body), { status });
    }),
  );
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

describe("shouldSync", () => {
  it("syncs only finished entries, when enabled and permitted", () => {
    const finished = { end: new Date() };
    expect(shouldSync({ syncToCalendar: true }, finished, true)).toBe(true);
    expect(shouldSync({ syncToCalendar: false }, finished, true)).toBe(false);
    expect(shouldSync({ syncToCalendar: true }, finished, false)).toBe(false);
    expect(shouldSync({ syncToCalendar: true }, { end: null }, true)).toBe(false);
  });
});

describe("eventBody", () => {
  it("describes the entry and marks it as ours", () => {
    const body = eventBody(entry(), "Europe/Berlin", "Deep work");
    expect(body.summary).toBe("Write report");
    expect(body.start).toEqual({ dateTime: "2026-10-08T09:00:00.000Z", timeZone: "Europe/Berlin" });
    expect(body.description).toContain("Category: Deep work");
    expect(body.description).toContain("first draft");
    expect(body.transparency).toBe("transparent");
    expect(body.extendedProperties.private.tmEntryId).toBe("entry1");
  });
});

describe("pushEntry", () => {
  it("creates the Actual time calendar on first use, then the event", async () => {
    const calls = mockGoogle({
      "GET /users/me/calendarList": [200, { items: [{ id: "primary", summary: "Me" }] }],
      "POST /calendars": [200, { id: "actual@group" }],
      "POST /calendars/actual@group/events": [200, { id: "ev1" }],
    });
    const res = await pushEntry("tok", { calendarId: null, timeZone: "UTC", entry: entry() });
    expect(res).toEqual({ calendarId: "actual@group", eventId: "ev1" });
    expect(calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      "GET /users/me/calendarList",
      "POST /calendars",
      "POST /calendars/actual@group/events",
    ]);
    expect(calls[1].body).toMatchObject({ summary: "Actual time", timeZone: "UTC" });
  });

  it("reuses an existing Actual time calendar found by name", async () => {
    mockGoogle({
      "GET /users/me/calendarList": [
        200,
        { items: [{ id: "old@group", summary: "Actual time", description: "How you actually spent your time. Created by Plan vs. Actual." }] },
      ],
      "POST /calendars/old@group/events": [200, { id: "ev1" }],
    });
    const res = await pushEntry("tok", { calendarId: null, timeZone: "UTC", entry: entry() });
    expect(res.calendarId).toBe("old@group");
  });

  it("updates an already-synced entry in place", async () => {
    const calls = mockGoogle({ "PATCH /calendars/cal/events/ev1": [200, { id: "ev1" }] });
    const res = await pushEntry("tok", { calendarId: "cal", timeZone: "UTC", entry: entry({ googleEventId: "ev1", title: "Renamed" }) });
    expect(res).toEqual({ calendarId: "cal", eventId: "ev1" });
    expect(calls).toHaveLength(1);
    expect(calls[0].body?.summary).toBe("Renamed");
  });

  it("recreates an event the user deleted in Google", async () => {
    mockGoogle({
      "PATCH /calendars/cal/events/ev1": [404, {}],
      "POST /calendars/cal/events": [200, { id: "ev2" }],
    });
    const res = await pushEntry("tok", { calendarId: "cal", timeZone: "UTC", entry: entry({ googleEventId: "ev1" }) });
    expect(res.eventId).toBe("ev2");
  });

  it("recreates the calendar if it was deleted", async () => {
    mockGoogle({
      "POST /calendars/gone/events": [404, {}],
      "GET /users/me/calendarList": [200, { items: [] }],
      "POST /calendars": [200, { id: "new@group" }],
      "POST /calendars/new@group/events": [200, { id: "ev3" }],
    });
    const res = await pushEntry("tok", { calendarId: "gone", timeZone: "UTC", entry: entry() });
    expect(res).toEqual({ calendarId: "new@group", eventId: "ev3" });
  });

  it("propagates other errors", async () => {
    mockGoogle({ "POST /calendars/cal/events": [500, {}] });
    await expect(pushEntry("tok", { calendarId: "cal", timeZone: "UTC", entry: entry() })).rejects.toThrow("500");
  });
});

describe("deleteEvent", () => {
  it("deletes, treating an already-missing event as success", async () => {
    const calls = mockGoogle({ "DELETE /calendars/cal/events/ev1": [204, null] });
    await deleteEvent("tok", "cal", "ev1");
    expect(calls[0].method).toBe("DELETE");
    mockGoogle({ "DELETE /calendars/cal/events/ev1": [410, {}] });
    await expect(deleteEvent("tok", "cal", "ev1")).resolves.toBeUndefined();
  });
});

describe("keeping actual time out of the plan", () => {
  it("ignores the app's own events when reading the plan", () => {
    const raw = {
      id: "x",
      summary: "Write report",
      start: { dateTime: "2026-10-08T09:00:00Z" },
      end: { dateTime: "2026-10-08T10:00:00Z" },
      extendedProperties: { private: { tmEntryId: "entry1" } },
    };
    expect(normalizeEvent(raw, "primary")).toBeNull();
  });

  it("never treats the Actual time calendar as a planning calendar", () => {
    expect(planCalendarIds([], "actual@group")).toEqual(["primary"]);
    expect(
      planCalendarIds(
        [
          { calendarId: "work", enabled: true },
          { calendarId: "actual@group", enabled: true },
          { calendarId: "old", enabled: false },
        ],
        "actual@group",
      ),
    ).toEqual(["work"]);
  });

  it("detects the write permission", () => {
    expect(canWriteCalendar(`openid email https://www.googleapis.com/auth/calendar.readonly ${WRITE_SCOPE}`)).toBe(true);
    expect(canWriteCalendar("openid https://www.googleapis.com/auth/calendar.readonly")).toBe(false);
    expect(canWriteCalendar(null)).toBe(false);
  });
});
