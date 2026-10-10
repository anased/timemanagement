import { signIn } from "@/lib/auth";

type CalendarStatus = { ok: true } | { ok: false; reason: "auth" | "error"; message: string };

/** Explains why calendar blocks are missing and offers to reconnect Google. */
export function CalendarBanner({ result }: { result: CalendarStatus }) {
  if (result.ok) return null;
  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
      <span className="flex-1">
        {result.reason === "auth"
          ? "We couldn't read your Google Calendar. Reconnect and allow calendar access to see your planned blocks."
          : `Couldn't load your calendar right now (${result.message}). Tracking still works.`}
      </span>
      {result.reason === "auth" && (
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: "/" });
          }}
        >
          <button className="btn" type="submit">
            Reconnect Google
          </button>
        </form>
      )}
    </div>
  );
}

/** Asks once for the extra permission needed to add finished tasks to Google Calendar. */
export function WriteAccessBanner() {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-accent/30 bg-accent/5 px-4 py-3 text-sm">
      <span className="flex-1">
        Want finished tasks added to an <strong>&ldquo;Actual time&rdquo;</strong> calendar in Google (and Notion
        Calendar)? Allow one more permission. Your planning calendars are never changed.
      </span>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <button className="btn" type="submit">
          Allow
        </button>
      </form>
    </div>
  );
}
