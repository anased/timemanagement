import type { EntrySource, PrismaClient, ReviewStatus } from "@prisma/client";
import { prisma as defaultClient } from "@/lib/db";

export class NotFoundError extends Error {
  constructor(what: string) {
    super(`${what} not found`);
  }
}

export interface EntryInput {
  title: string;
  start: Date;
  end: Date | null;
  categoryId?: string | null;
  note?: string | null;
  source?: EntrySource;
  plannedEventId?: string | null;
  plannedTitle?: string | null;
  plannedStart?: Date | null;
  plannedEnd?: Date | null;
}

export interface PlannedSnapshot {
  calendarEventId: string;
  plannedTitle: string;
  plannedStart: Date;
  plannedEnd: Date;
}

/**
 * Every database read or write for app data goes through here. The userId is
 * bound once (from the server session) and added to every query, so one user
 * can never read or modify another user's rows, even with a guessed id.
 */
export function forUser(userId: string, db: PrismaClient = defaultClient) {
  async function assertCategory(categoryId: string | null | undefined) {
    if (!categoryId) return;
    const found = await db.category.findFirst({ where: { id: categoryId, userId }, select: { id: true } });
    if (!found) throw new NotFoundError("Category");
  }

  function validateRange(start: Date, end: Date | null) {
    if (end && end <= start) throw new Error("End must be after start");
  }

  const entries = {
    /** Entries overlapping [from, to), including a running timer. */
    listInRange(from: Date, to: Date) {
      return db.timeEntry.findMany({
        where: { userId, start: { lt: to }, OR: [{ end: null }, { end: { gt: from } }] },
        orderBy: { start: "asc" },
      });
    },
    running() {
      return db.timeEntry.findFirst({ where: { userId, end: null } });
    },
    get(id: string) {
      return db.timeEntry.findFirst({ where: { id, userId } });
    },
    async create(input: EntryInput) {
      validateRange(input.start, input.end);
      await assertCategory(input.categoryId);
      return db.timeEntry.create({ data: { ...input, userId } });
    },
    async update(id: string, input: Partial<EntryInput>) {
      const current = await entries.get(id);
      if (!current) throw new NotFoundError("Entry");
      validateRange(input.start ?? current.start, input.end === undefined ? current.end : input.end);
      await assertCategory(input.categoryId);
      const { count } = await db.timeEntry.updateMany({ where: { id, userId }, data: input });
      if (count === 0) throw new NotFoundError("Entry");
    },
    async remove(id: string) {
      const { count } = await db.timeEntry.deleteMany({ where: { id, userId } });
      if (count === 0) throw new NotFoundError("Entry");
    },
  };

  const timer = {
    /** Starts a timer, stopping whichever one was running. */
    async start(input: Omit<EntryInput, "start" | "end" | "source">, now = new Date()) {
      await assertCategory(input.categoryId);
      return db.$transaction(async (tx) => {
        await tx.timeEntry.updateMany({ where: { userId, end: null }, data: { end: now } });
        return tx.timeEntry.create({ data: { ...input, userId, start: now, end: null, source: "TIMER" } });
      });
    },
    async stop(now = new Date()) {
      const running = await entries.running();
      if (!running) return null;
      // A timer stopped within the same second it started would have zero length.
      const end = now > running.start ? now : new Date(running.start.getTime() + 1000);
      await db.timeEntry.updateMany({ where: { id: running.id, userId }, data: { end } });
      return { ...running, end };
    },
  };

  const categories = {
    list() {
      return db.category.findMany({ where: { userId }, orderBy: { name: "asc" } });
    },
    create(name: string, color: string) {
      return db.category.create({ data: { userId, name, color } });
    },
    async update(id: string, data: { name?: string; color?: string }) {
      const { count } = await db.category.updateMany({ where: { id, userId }, data });
      if (count === 0) throw new NotFoundError("Category");
    },
    async remove(id: string) {
      await assertCategory(id);
      // Delete via the relation-aware API so entries are un-categorised (SetNull).
      await db.category.delete({ where: { id } });
    },
  };

  const reviews = {
    listInRange(from: Date, to: Date) {
      return db.plannedBlockReview.findMany({
        where: { userId, plannedStart: { lt: to }, plannedEnd: { gt: from } },
      });
    },
    upsert(snapshot: PlannedSnapshot, status: ReviewStatus, note?: string | null) {
      return db.plannedBlockReview.upsert({
        where: { userId_calendarEventId: { userId, calendarEventId: snapshot.calendarEventId } },
        create: { userId, ...snapshot, status, note },
        update: { ...snapshot, status, note },
      });
    },
    async remove(calendarEventId: string) {
      await db.plannedBlockReview.deleteMany({ where: { userId, calendarEventId } });
    },
  };

  const settings = {
    get() {
      return db.user.findUniqueOrThrow({
        where: { id: userId },
        select: { id: true, name: true, email: true, image: true, timeZone: true, dayStartMin: true, dayEndMin: true, minGapMin: true },
      });
    },
    async update(data: { timeZone?: string; dayStartMin?: number; dayEndMin?: number; minGapMin?: number }) {
      await db.user.update({ where: { id: userId }, data });
    },
    calendarSelections() {
      return db.calendarSelection.findMany({ where: { userId } });
    },
    async setCalendarSelections(rows: { calendarId: string; name: string; enabled: boolean }[]) {
      await db.$transaction([
        db.calendarSelection.deleteMany({ where: { userId } }),
        db.calendarSelection.createMany({ data: rows.map((r) => ({ ...r, userId })) }),
      ]);
    },
  };

  return { userId, entries, timer, categories, reviews, settings };
}

export type UserScope = ReturnType<typeof forUser>;
