"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod";
import { syncEntry } from "@/lib/calendar-sync";
import { currentScope } from "@/lib/session";
import { fromLocalInput } from "@/lib/time";
import { run, type ActionResult } from "./result";

const schema = z
  .object({
    block: z.object({
      id: z.string().min(1),
      title: z.string(),
      start: z.coerce.date(),
      end: z.coerce.date(),
    }),
    status: z.enum(["DONE", "PARTIAL", "SKIPPED", "REPLACED"]),
    /** PARTIAL / REPLACED: the actual time range (local date-time strings) */
    start: z.string().optional(),
    end: z.string().optional(),
    /** REPLACED: what was done instead */
    title: z.string().trim().max(200).optional(),
    categoryId: z.string().min(1).nullish(),
    note: z.string().max(2000).nullish(),
  })
  .refine((v) => v.status !== "REPLACED" || !!v.title, { message: "Say what you did instead" });

/**
 * Records how a past planned block went. DONE/PARTIAL/REPLACED also create a
 * time entry so the actual time shows up in reports.
 */
export async function reviewBlock(input: z.input<typeof schema>): Promise<ActionResult> {
  return run(async () => {
    const data = schema.parse(input);
    const scope = await currentScope();
    const { timeZone } = await scope.settings.get();
    const { block } = data;

    const start = data.start ? fromLocalInput(data.start, timeZone) : block.start;
    const end = data.end ? fromLocalInput(data.end, timeZone) : block.end;
    const snapshot = { plannedEventId: block.id, plannedTitle: block.title, plannedStart: block.start, plannedEnd: block.end };

    let createdId: string | null = null;
    if (data.status === "DONE" || data.status === "PARTIAL") {
      createdId = (await scope.entries.create({
        title: block.title,
        start: data.status === "DONE" ? block.start : start,
        end: data.status === "DONE" ? block.end : end,
        categoryId: data.categoryId ?? null,
        note: data.note ?? null,
        source: "CHECKIN",
        ...snapshot,
      })).id;
    } else if (data.status === "REPLACED") {
      createdId = (await scope.entries.create({
        title: data.title!,
        start,
        end,
        categoryId: data.categoryId ?? null,
        note: data.note ?? null,
        source: "CHECKIN",
      })).id;
    }
    if (createdId) {
      const id = createdId;
      after(() => syncEntry(scope.userId, id));
    }

    await scope.reviews.upsert(
      { calendarEventId: block.id, plannedTitle: block.title, plannedStart: block.start, plannedEnd: block.end },
      data.status,
      data.note ?? null,
    );
    revalidatePath("/", "layout");
  });
}

export async function undoReview(calendarEventId: string): Promise<ActionResult> {
  return run(async () => {
    const scope = await currentScope();
    await scope.reviews.remove(z.string().min(1).parse(calendarEventId));
    revalidatePath("/", "layout");
  });
}
