"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { currentScope } from "@/lib/session";
import { isValidTimeZone } from "@/lib/time";
import { run, type ActionResult } from "./result";

const hhmm = z.string().regex(/^\d{2}:\d{2}$/);
const toMin = (v: string) => Number(v.slice(0, 2)) * 60 + Number(v.slice(3, 5));

const prefsSchema = z
  .object({
    timeZone: z.string().refine(isValidTimeZone, "Unknown time zone"),
    dayStart: hhmm,
    dayEnd: hhmm,
    minGapMin: z.coerce.number().int().min(0).max(240),
  })
  .refine((v) => toMin(v.dayEnd) > toMin(v.dayStart), { message: "Day end must be after day start" });

export async function savePreferences(input: z.input<typeof prefsSchema>): Promise<ActionResult> {
  return run(async () => {
    const data = prefsSchema.parse(input);
    const scope = await currentScope();
    await scope.settings.update({
      timeZone: data.timeZone,
      dayStartMin: toMin(data.dayStart),
      dayEndMin: toMin(data.dayEnd),
      minGapMin: data.minGapMin,
    });
    revalidatePath("/", "layout");
  });
}

/** Called once from the browser so day boundaries match the user's clock. */
export async function syncTimeZone(timeZone: string): Promise<ActionResult> {
  return run(async () => {
    if (!isValidTimeZone(timeZone)) return;
    const scope = await currentScope();
    const { timeZone: current } = await scope.settings.get();
    if (current === "UTC" && timeZone !== "UTC") {
      await scope.settings.update({ timeZone });
      revalidatePath("/", "layout");
    }
  });
}

const calendarsSchema = z.array(
  z.object({ calendarId: z.string().min(1), name: z.string(), enabled: z.boolean() }),
);

export async function saveCalendars(input: z.input<typeof calendarsSchema>): Promise<ActionResult> {
  return run(async () => {
    const rows = calendarsSchema.parse(input);
    const scope = await currentScope();
    await scope.settings.setCalendarSelections(rows);
    revalidatePath("/", "layout");
  });
}

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Invalid color");
const name = z.string().trim().min(1, "Name is required").max(60);

export async function createCategory(input: { name: string; color: string }): Promise<ActionResult> {
  return run(async () => {
    const data = z.object({ name, color }).parse(input);
    const scope = await currentScope();
    await scope.categories.create(data.name, data.color);
    revalidatePath("/", "layout");
  });
}

export async function updateCategory(input: { id: string; name: string; color: string }): Promise<ActionResult> {
  return run(async () => {
    const data = z.object({ id: z.string().min(1), name, color }).parse(input);
    const scope = await currentScope();
    await scope.categories.update(data.id, { name: data.name, color: data.color });
    revalidatePath("/", "layout");
  });
}

export async function deleteCategory(id: string): Promise<ActionResult> {
  return run(async () => {
    const scope = await currentScope();
    await scope.categories.remove(z.string().min(1).parse(id));
    revalidatePath("/", "layout");
  });
}
