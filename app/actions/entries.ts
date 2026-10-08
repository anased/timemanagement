"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
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
    await scope.timer.start({ title: data.title, categoryId: data.categoryId ?? null, ...plannedFields(data.planned) });
    revalidatePath("/", "layout");
  });
}

export async function stopTimer(): Promise<ActionResult> {
  return run(async () => {
    const scope = await currentScope();
    await scope.timer.stop();
    revalidatePath("/", "layout");
  });
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
    if (data.id) {
      const existing = await scope.entries.get(data.id);
      if (end === null && existing?.end !== null) throw new Error("End must be after start");
      await scope.entries.update(data.id, fields);
    } else {
      if (end === null) throw new Error("End must be after start");
      await scope.entries.create({ ...fields, source: "MANUAL" });
    }
    revalidatePath("/", "layout");
  });
}

export async function deleteEntry(id: string): Promise<ActionResult> {
  return run(async () => {
    const scope = await currentScope();
    await scope.entries.remove(z.string().min(1).parse(id));
    revalidatePath("/", "layout");
  });
}
