import { CalendarBanner } from "@/components/CalendarBanner";
import { CalendarsForm, CategoriesForm, PreferencesForm } from "@/components/SettingsForms";
import { CalendarAuthError, listCalendars, type CalendarInfo } from "@/lib/google-calendar";
import { categoriesWithDefaults, currentScope } from "@/lib/session";

export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export default async function SettingsPage() {
  const scope = await currentScope();
  const [user, selections, categories] = await Promise.all([
    scope.settings.get(),
    scope.settings.calendarSelections(),
    categoriesWithDefaults(scope),
  ]);

  let calendars: CalendarInfo[] = [];
  let calendarError: { reason: "auth" | "error"; message: string } | null = null;
  try {
    calendars = await listCalendars(scope.userId);
  } catch (err) {
    calendarError = {
      reason: err instanceof CalendarAuthError ? "auth" : "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // With no saved selection only the primary calendar counts as the plan.
  const enabled = new Set(
    selections.length ? selections.filter((s) => s.enabled).map((s) => s.calendarId) : calendars.filter((c) => c.primary).map((c) => c.id),
  );

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      {calendarError && <CalendarBanner result={{ ok: false, events: [], ...calendarError }} />}

      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">Planning calendars</h2>
          <p className="text-xs text-muted">
            Events from these Google calendars count as your plan. Using Notion Calendar? It writes your time blocks to the
            Google calendars you connected there, so pick those here.
          </p>
        </div>
        <CalendarsForm calendars={calendars.map((c) => ({ ...c, enabled: enabled.has(c.id) }))} />
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Your day</h2>
        <PreferencesForm
          initial={{
            timeZone: user.timeZone,
            dayStart: hhmm(user.dayStartMin),
            dayEnd: hhmm(user.dayEndMin),
            minGapMin: user.minGapMin,
          }}
        />
      </section>

      <section className="card space-y-3">
        <h2 className="font-semibold">Categories</h2>
        <CategoriesForm categories={categories} />
      </section>
    </div>
  );
}
