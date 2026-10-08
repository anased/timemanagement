import { Prisma } from "@prisma/client";
import { NotFoundError } from "@/lib/db-scoped";
import { ZodError } from "zod";

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function run(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (err) {
    if (err instanceof ZodError) return { ok: false, error: err.issues.map((i) => i.message).join(", ") };
    if (err instanceof NotFoundError) return { ok: false, error: err.message };
    if (err instanceof Error && err.message === "End must be after start") return { ok: false, error: err.message };
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return { ok: false, error: "That name is already in use" };
    }
    // Let Next.js redirects (e.g. to /signin) propagate.
    if (err && typeof err === "object" && "digest" in err) throw err;
    console.error(err);
    return { ok: false, error: "Something went wrong" };
  }
}
