import { signOut } from "@/lib/auth";
import { categoriesWithDefaults, currentScope } from "@/lib/session";
import { NavLinks } from "@/components/NavLinks";
import { TimerBar } from "@/components/TimerBar";
import { TimeZoneSync } from "@/components/TimeZoneSync";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const scope = await currentScope();
  const [user, running, categories] = await Promise.all([
    scope.settings.get(),
    scope.entries.running(),
    categoriesWithDefaults(scope),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-16">
      <TimeZoneSync current={user.timeZone} />
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <div className="flex items-center gap-4">
          <span className="font-semibold">Plan vs. Actual</span>
          <NavLinks />
        </div>
        <form
          action={async () => {
            "use server";
            await signOut({ redirectTo: "/signin" });
          }}
          className="flex items-center gap-2 text-sm text-muted"
        >
          <span className="hidden sm:inline">{user.email}</span>
          <button className="btn" type="submit">
            Sign out
          </button>
        </form>
      </header>
      <TimerBar running={running} categories={categories} timeZone={user.timeZone} />
      <main className="mt-4">{children}</main>
    </div>
  );
}
