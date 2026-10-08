import { signIn } from "@/lib/auth";
import type { PlannedResult } from "@/lib/google-calendar";

/** Explains why calendar blocks are missing and offers to reconnect Google. */
export function CalendarBanner({ result }: { result: PlannedResult }) {
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
