import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { forUser, NotFoundError } from "@/lib/db-scoped";

/**
 * Runs against a real Postgres database (TEST_DATABASE_URL, migrated with
 * `prisma migrate deploy`). Skipped when it isn't configured.
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("per-user data isolation", () => {
  const db = new PrismaClient({ datasources: { db: { url } } });
  let alice: ReturnType<typeof forUser>;
  let bob: ReturnType<typeof forUser>;
  const from = new Date("2026-10-08T00:00:00Z");
  const to = new Date("2026-10-09T00:00:00Z");

  beforeAll(async () => {
    await db.user.deleteMany({ where: { email: { in: ["alice@test.local", "bob@test.local"] } } });
    const a = await db.user.create({ data: { email: "alice@test.local" } });
    const b = await db.user.create({ data: { email: "bob@test.local" } });
    alice = forUser(a.id, db);
    bob = forUser(b.id, db);
  });

  afterAll(async () => {
    await db.user.deleteMany({ where: { email: { in: ["alice@test.local", "bob@test.local"] } } });
    await db.$disconnect();
  });

  it("never returns or modifies another user's entries", async () => {
    const e = await alice.entries.create({ title: "Alice secret", start: new Date("2026-10-08T09:00:00Z"), end: new Date("2026-10-08T10:00:00Z") });

    expect(await bob.entries.listInRange(from, to)).toEqual([]);
    expect(await bob.entries.get(e.id)).toBeNull();
    await expect(bob.entries.update(e.id, { title: "hacked" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(bob.entries.remove(e.id)).rejects.toBeInstanceOf(NotFoundError);

    const still = await alice.entries.get(e.id);
    expect(still?.title).toBe("Alice secret");
  });

  it("rejects using another user's category", async () => {
    const cat = await alice.categories.create("Private", "#123456");
    expect(await bob.categories.list()).toEqual([]);
    await expect(
      bob.entries.create({ title: "x", start: new Date("2026-10-08T11:00:00Z"), end: new Date("2026-10-08T12:00:00Z"), categoryId: cat.id }),
    ).rejects.toBeInstanceOf(NotFoundError);
    await expect(bob.categories.update(cat.id, { name: "mine" })).rejects.toBeInstanceOf(NotFoundError);
    await expect(bob.categories.remove(cat.id)).rejects.toBeInstanceOf(NotFoundError);
  });

  it("keeps timers and reviews separate", async () => {
    await alice.timer.start({ title: "Alice timer" });
    await bob.timer.start({ title: "Bob timer" });
    expect((await alice.entries.running())?.title).toBe("Alice timer");
    expect((await bob.entries.running())?.title).toBe("Bob timer");

    // Starting a new timer only stops your own.
    await bob.timer.start({ title: "Bob timer 2" });
    expect((await alice.entries.running())?.title).toBe("Alice timer");
    expect(await bob.timer.stop()).not.toBeNull();
    expect(await bob.entries.running()).toBeNull();
    expect(await alice.entries.running()).not.toBeNull();

    const snapshot = { calendarEventId: "evt", plannedTitle: "x", plannedStart: from, plannedEnd: to };
    await alice.reviews.upsert(snapshot, "DONE");
    expect(await bob.reviews.listInRange(from, to)).toEqual([]);
    await bob.reviews.remove("evt");
    expect(await alice.reviews.listInRange(from, to)).toHaveLength(1);
  });

  it("rejects entries that end before they start", async () => {
    await expect(
      alice.entries.create({ title: "bad", start: new Date("2026-10-08T10:00:00Z"), end: new Date("2026-10-08T09:00:00Z") }),
    ).rejects.toThrow("End must be after start");
  });
});
