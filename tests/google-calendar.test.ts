import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarAuthError, fetchCalendars, fetchEvents, normalizeAllDay, normalizeEvent } from "@/lib/google-calendar";

const ev = (over: Record<string, unknown> = {}) => ({
  id: "e1",
  summary: "Deep work",
  start: { dateTime: "2026-10-08T09:00:00+02:00" },
  end: { dateTime: "2026-10-08T11:00:00+02:00" },
  ...over,
});

describe("normalizeEvent", () => {
  it("keeps timed events", () => {
    expect(normalizeEvent(ev(), "primary")).toMatchObject({
      id: "e1",
      title: "Deep work",
      start: new Date("2026-10-08T07:00:00Z"),
      end: new Date("2026-10-08T09:00:00Z"),
    });
  });

  it("skips all-day, cancelled, declined and out-of-office events", () => {
    expect(normalizeEvent(ev({ start: { date: "2026-10-08" }, end: { date: "2026-10-09" } }), "p")).toBeNull();
    expect(normalizeEvent(ev({ status: "cancelled" }), "p")).toBeNull();
    expect(normalizeEvent(ev({ attendees: [{ self: true, responseStatus: "declined" }] }), "p")).toBeNull();
    expect(normalizeEvent(ev({ eventType: "outOfOffice" }), "p")).toBeNull();
    expect(normalizeEvent(ev({ eventType: "focusTime" }), "p")).not.toBeNull();
  });

  it("names untitled blocks", () => {
    expect(normalizeEvent(ev({ summary: "  " }), "p")?.title).toBe("(untitled)");
  });
});

describe("normalizeAllDay", () => {
  const allDay = (over: Record<string, unknown> = {}) => ev({ start: { date: "2026-10-08" }, end: { date: "2026-10-10" }, ...over });

  it("keeps all-day events with an exclusive end day", () => {
    expect(normalizeAllDay(allDay({ summary: "Trip" }), "family")).toMatchObject({
      title: "Trip",
      calendarId: "family",
      startDay: "2026-10-08",
      endDay: "2026-10-10",
    });
  });

  it("skips timed, cancelled and declined events", () => {
    expect(normalizeAllDay(ev(), "p")).toBeNull();
    expect(normalizeAllDay(allDay({ status: "cancelled" }), "p")).toBeNull();
    expect(normalizeAllDay(allDay({ attendees: [{ self: true, responseStatus: "declined" }] }), "p")).toBeNull();
  });
});

describe("fetchCalendars", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("splits plan, shown and all-day events and keeps shared events as plan", async () => {
    const at = (h: number) => ({ dateTime: `2026-10-08T${String(h).padStart(2, "0")}:00:00Z` });
    const items: Record<string, unknown[]> = {
      primary: [ev({ id: "meeting", start: at(9), end: at(10) }), ev({ id: "hol", start: { date: "2026-10-08" }, end: { date: "2026-10-09" } })],
      colleague: [
        ev({ id: "meeting", start: at(9), end: at(10) }),
        ev({ id: "their-call", start: at(13), end: at(14) }),
        ev({ id: "hol", start: { date: "2026-10-08" }, end: { date: "2026-10-09" } }),
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: URL) => {
        const cal = decodeURIComponent(url.pathname.split("/")[4]);
        return new Response(JSON.stringify({ items: items[cal] }), { status: 200 });
      }),
    );

    const res = await fetchCalendars(
      "tok",
      { plan: ["primary"], show: ["colleague"] },
      new Date("2026-10-08T00:00:00Z"),
      new Date("2026-10-09T00:00:00Z"),
    );
    expect(res.events.map((e) => e.id)).toEqual(["meeting"]);
    expect(res.shown.map((e) => [e.id, e.calendarId])).toEqual([["their-call", "colleague"]]);
    expect(res.allDay.map((e) => e.id)).toEqual(["hol"]);
  });
});

describe("fetchEvents", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("pages through results, merges calendars and de-duplicates", async () => {
    const fetchMock = vi.fn(async (url: URL) => {
      const cal = decodeURIComponent(url.pathname.split("/")[4]);
      const page = url.searchParams.get("pageToken");
      const body =
        cal === "primary" && !page
          ? { items: [ev({ id: "b", start: { dateTime: "2026-10-08T12:00:00Z" }, end: { dateTime: "2026-10-08T13:00:00Z" } })], nextPageToken: "2" }
          : cal === "primary"
            ? { items: [ev({ id: "a", start: { dateTime: "2026-10-08T08:00:00Z" }, end: { dateTime: "2026-10-08T09:00:00Z" } })] }
            : { items: [ev({ id: "a" }), ev({ id: "allday", start: { date: "2026-10-08" }, end: { date: "2026-10-09" } })] };
      return new Response(JSON.stringify(body), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const events = await fetchEvents("tok", ["primary", "work@example.com"], new Date("2026-10-08T00:00:00Z"), new Date("2026-10-09T00:00:00Z"));
    expect(events.map((e) => e.id)).toEqual(["a", "b"]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    const firstUrl = fetchMock.mock.calls[0][0] as URL;
    expect(firstUrl.searchParams.get("singleEvents")).toBe("true");
  });

  it("raises an auth error on 401", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 401 })));
    await expect(fetchEvents("bad", ["primary"], new Date(), new Date())).rejects.toBeInstanceOf(CalendarAuthError);
  });
});
