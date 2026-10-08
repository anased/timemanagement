import "server-only";
import { requireUserId } from "@/lib/auth";
import { forUser } from "@/lib/db-scoped";

const DEFAULT_CATEGORIES: [string, string][] = [
  ["Deep work", "#6366f1"],
  ["Meetings", "#0ea5e9"],
  ["Admin & email", "#f59e0b"],
  ["Learning", "#10b981"],
  ["Break", "#a3a3a3"],
  ["Distraction", "#ef4444"],
];

/** The signed-in user's data scope. Redirects to /signin when signed out. */
export async function currentScope() {
  return forUser(await requireUserId());
}

/** Categories for the user, creating a starter set the first time. */
export async function categoriesWithDefaults(scope: ReturnType<typeof forUser>) {
  const existing = await scope.categories.list();
  if (existing.length > 0) return existing;
  for (const [name, color] of DEFAULT_CATEGORIES) {
    await scope.categories.create(name, color).catch(() => undefined);
  }
  return scope.categories.list();
}
