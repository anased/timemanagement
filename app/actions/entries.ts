"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { syncEntry, unsyncEntry } from "@/lib/calendar-sync";
import { getPlannedEvents } from "@/lib/google-calendar";
import { currentScope } from "@/lib/session";
import { fromLocalInput } from "@/lib/time";
import { run, type ActionResult } from "./result";

const planned = z
  .object({
    id: z.string().min(1),
    title: z.string(),
    start: z.coerce.date(),
    end: z.coerce.date(),
  })
  .nullish();

const title = z.string().trim().min(1, "Title is required").max(200);
const categoryId = z.string().min(1).nullish();
const localDateTime = z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/, "Invalid date/time");

function plannedFields(p: z.infer<typeof planned>) {
  return p
    ? { plannedEventId: p.id, plannedTitle: p.title, plannedStart: p.start, plannedEnd: p.end }
    : { plannedEventId: null, plannedTitle: null, plannedStart: null, plannedEnd: null };
}

const startTimerSchema = z.object({ title, categoryId, planned });

export async function startTimer(input: z.input<typeof startTimerSchema>): Promise<ActionResult> {
  return run(async () => {
    const data = startTimerSchema.parse(input);
    const scope = await currentScope();
    const { stoppedId } = await scope.timer.start({
      title: data.title,
      categoryId: data.categoryId ?? null,
      ...plannedFields(data.planned),
    });
    // Switching tasks finishes the previous one, so it goes to the calendar too.
    if (stoppedId) after(() => syncEntry(scope.userId, stoppedId));
    revalidatePath("/", "layout");
  });
}

export async function stopTimer(): Promise<ActionResult> {
  return run(async () => {
    const scope = await currentScope();
    const stopped = await scope.timer.stop();
    if (stopped) after(() => syncEntry(scope.userId, stopped.id));
    revalidatePath("/", "layout");
  });
}

const finishSchema = z.object({
  title,
  categoryId,
  note: z.string().max(2000).nullish(),
  /** undefined = keep the current link */
  planned,
  /** only sent when the user changed them */
  start: localDateTime.optional(),
  end: localDateTime.optional(),
});

/** "Done": completes the running timer with its final details and adds it to the calendar. */
export async function finishTimer(input: z.input<typeof finishSchema>): Promise<ActionResult> {
  return run(async () => {
    const data = finishSchema.parse(input);
    const scope = await currentScope();
    const { timeZone } = await scope.settings.get();
    const id = await scope.timer.finish(
      {
        title: data.title,
        categoryId: data.categoryId ?? null,
        note: data.note || null,
        ...(data.planned === undefined ? {} : plannedFields(data.planned)),
        ...(data.start ? { start: fromLocalInput(data.start, timeZone) } : {}),
      },
      data.end ? fromLocalInput(data.end, timeZone) : undefined,
    );
    after(() => syncEntry(scope.userId, id));
    revalidatePath("/", "layout");
  });
}

export async function discardTimer(): Promise<ActionResult> {
  return run(async () => {
    const scope = await currentScope();
    await scope.timer.discard();
    revalidatePath("/", "layout");
  });
}

export interface TaskSuggestions {
  /** planned blocks happening around now */
  current: { id: string; title: string; start: Date; end: Date }[];
  recent: string[];
}

/** Suggestions for the New task / Done panels: current planned blocks and recent task names. */
export async function getTaskSuggestions(): Promise<TaskSuggestions> {
  const scope = await currentScope();
  const now = Date.now();
  const [planned, recent] = await Promise.all([
    getPlannedEvents(scope.userId, new Date(now - 15 * 60_000), new Date(now + 15 * 60_000)),
    scope.entries.recentTitles(6),
  ]);
  return {
    current: planned.events.map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end })),
    recent,
  };
}

const entrySchema = z.object({
  id: z.string().min(1).optional(),
  title,
  categoryId,
  start: localDateTime,
  /** empty = still running (only allowed when editing the running entry) */
  end: localDateTime.or(z.literal("")),
  note: z.string().max(2000).nullish(),
  planned,
});

export async function saveEntry(input: z.input<typeof entrySchema>): Promise<ActionResult> {
  return run(async () => {
    const data = entrySchema.parse(input);
    const scope = await currentScope();
    const { timeZone } = await scope.settings.get();
    const start = fromLocalInput(data.start, timeZone);
    const end = data.end ? fromLocalInput(data.end, timeZone) : null;
    const fields = {
      title: data.title,
      categoryId: data.categoryId ?? null,
      start,
      end,
      note: data.note || null,
      // On edit, an omitted `planned` keeps the existing link.
      ...(data.planned === undefined && data.id ? {} : plannedFields(data.planned)),
    };
    let id = data.id;
    if (id) {
      const existing = await scope.entries.get(id);
      if (end === null && existing?.end !== null) throw new Error("End must be after start");
      await scope.entries.update(id, fields);
    } else {
      if (end === null) throw new Error("End must be after start");
      id = (await scope.entries.create({ ...fields, source: "MANUAL" })).id;
    }
    const savedId = id;
    after(() => syncEntry(scope.userId, savedId));
    revalidatePath("/", "layout");
  });
}

export async function deleteEntry(id: string): Promise<ActionResult> {
  return run(async () => {
    const scope = await currentScope();
    const removed = await scope.entries.remove(z.string().min(1).parse(id));
    after(() => unsyncEntry(scope.userId, removed.googleEventId));
    revalidatePath("/", "layout");
  });
}
