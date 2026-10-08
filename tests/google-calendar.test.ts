import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarAuthError, fetchEvents, normalizeEvent } from "@/lib/google-calendar";

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
