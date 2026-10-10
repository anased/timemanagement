import { CalendarBanner, WriteAccessBanner } from "@/components/CalendarBanner";
import { ActualCalendarForm, CalendarsForm, CategoriesForm, PreferencesForm } from "@/components/SettingsForms";
import { CalendarAuthError, hasWriteAccess, listCalendars, type CalendarInfo } from "@/lib/google-calendar";
import { categoriesWithDefaults, currentScope } from "@/lib/session";

export const dynamic = "force-dynamic";

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;

export default async function SettingsPage() {
  const scope = await currentScope();
  const [user, selections, categories, canWrite] = await Promise.all([
    scope.settings.get(),
    scope.settings.calendarSelections(),
    categoriesWithDefaults(scope),
    hasWriteAccess(scope.userId),
  ]);

  let calendars: CalendarInfo[] = [];
  let calendarError: { reason: "auth" | "error"; message: string } | null = null;
  try {
    // The app's own "Actual time" calendar is output, never part of the plan.
    calendars = (await listCalendars(scope.userId)).filter((c) => c.id !== user.actualCalendarId);
  } catch (err) {
    calendarError = {
      reason: err instanceof CalendarAuthError ? "auth" : "error",
      message: err instanceof Error ? err.message : String(err),
    };
  }

  // With no saved selection only the primary calendar counts as the plan.
  const saved = new Map(selections.map((s) => [s.calendarId, s.role]));
  const roleOf = (c: CalendarInfo) => (selections.length ? (saved.get(c.id) ?? "OFF") : c.primary ? "PLAN" : "OFF");

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Settings</h1>
      {calendarError && <CalendarBanner result={{ ok: false, ...calendarError }} />}

      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">Calendars</h2>
          <p className="text-xs text-muted">
            <strong>Plan</strong>: events are your time blocks and count towards plan vs. actual. <strong>Show</strong>:
            events appear on Today and Week for reference (a colleague, family, holidays) but don&rsquo;t count.
            Calendars you add or subscribe to in Google Calendar appear here automatically. Using Notion Calendar? It
            writes your time blocks to the Google calendars you connected there, so set those to Plan.
          </p>
        </div>
        <CalendarsForm calendars={calendars.map((c) => ({ ...c, role: roleOf(c) }))} />
      </section>

      <section className="card space-y-3">
        <div>
          <h2 className="font-semibold">Actual time calendar</h2>
          <p className="text-xs text-muted">
            When you click <strong>Done</strong> (or log or edit time), the task is added to a separate Google calendar
            called &ldquo;Actual time&rdquo; that this app creates. It shows up next to your plan in Google Calendar and
            Notion Calendar, where you can show or hide it. Your planning calendars are never changed.
          </p>
        </div>
        {!canWrite && <WriteAccessBanner />}
        {canWrite && (
          <p className="text-xs text-muted">
            {user.actualCalendarId ? "✓ Connected." : "✓ Permission granted. The calendar is created with your first finished task."}{" "}
            <a className="underline" href="https://calendar.google.com/calendar/r" target="_blank" rel="noreferrer">
              Open Google Calendar
            </a>
          </p>
        )}
        <ActualCalendarForm enabled={user.syncToCalendar} canWrite={canWrite} />
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
