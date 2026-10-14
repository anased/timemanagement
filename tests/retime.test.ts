import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { forUser } from "@/lib/db-scoped";

/** Runs against a real Postgres database (TEST_DATABASE_URL); skipped otherwise. */
const url = process.env.TEST_DATABASE_URL;

const scope = vi.hoisted(() => ({ current: null as unknown }));
vi.mock("@/lib/session", () => ({ currentScope: async () => scope.current }));
vi.mock("@/lib/calendar-sync", () => ({ syncEntry: vi.fn(), unsyncEntry: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/server", () => ({ after: vi.fn() }));

describe.skipIf(!url)("retimeEntry", () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  const emails = ["retime-a@test.local", "retime-b@test.local"];
  let alice: ReturnType<typeof forUser>;
  let bob: ReturnType<typeof forUser>;
  const t = (hhmm: string) => new Date(`2026-10-08T${hhmm}:00Z`);

  beforeAll(async () => {
    await db.user.deleteMany({ where: { email: { in: emails } } });
    alice = forUser((await db.user.create({ data: { email: emails[0] } })).id, db);
    bob = forUser((await db.user.create({ data: { email: emails[1] } })).id, db);
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await db.$disconnect();
  });

  it("changes a finished entry's times and nothing else", async () => {
    const { retimeEntry } = await import("@/app/actions/entries");
    const e = await alice.entries.create({ title: "Write", start: t("09:00"), end: t("10:00") });
    scope.current = alice;
    expect(await retimeEntry({ id: e.id, start: t("09:15"), end: t("11:00") })).toEqual({ ok: true });
    const after = await alice.entries.get(e.id);
    expect([after?.start, after?.end, after?.title]).toEqual([t("09:15"), t("11:00"), "Write"]);
  });

  it("rejects an end before the start", async () => {
    const { retimeEntry } = await import("@/app/actions/entries");
    const e = await alice.entries.create({ title: "Read", start: t("12:00"), end: t("13:00") });
    scope.current = alice;
    expect(await retimeEntry({ id: e.id, start: t("13:00"), end: t("12:30") })).toEqual({ ok: false, error: "End must be after start" });
  });

  it("only moves the start of a running entry", async () => {
    const { retimeEntry } = await import("@/app/actions/entries");
    const start = new Date(Date.now() - 60 * 60_000);
    const e = await alice.entries.create({ title: "Running", start, end: null });
    scope.current = alice;
    const earlier = new Date(start.getTime() - 15 * 60_000);
    expect(await retimeEntry({ id: e.id, start: earlier, end: null })).toEqual({ ok: true });
    expect((await alice.entries.get(e.id))?.end).toBeNull();
    expect((await retimeEntry({ id: e.id, start: earlier, end: new Date() })).ok).toBe(false);
    expect((await retimeEntry({ id: e.id, start: new Date(Date.now() + 60_000), end: null })).ok).toBe(false);
    await alice.entries.remove(e.id);
  });

  it("can't touch another user's entry", async () => {
    const { retimeEntry } = await import("@/app/actions/entries");
    const e = await alice.entries.create({ title: "Private", start: t("15:00"), end: t("16:00") });
    scope.current = bob;
    expect((await retimeEntry({ id: e.id, start: t("08:00"), end: t("09:00") })).ok).toBe(false);
    expect((await alice.entries.get(e.id))?.start).toEqual(t("15:00"));
  });
});
