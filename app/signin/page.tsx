import { redirect } from "next/navigation";
import { auth, signIn } from "@/lib/auth";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  const { callbackUrl, error } = await searchParams;
  // Only ever redirect back to a path on this site (callbackUrl may be absolute).
  let target = "/";
  try {
    const parsed = new URL(callbackUrl ?? "/", "http://local");
    target = parsed.pathname + parsed.search;
  } catch {}
  if (session?.user) redirect(target);

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="card w-full max-w-sm space-y-5 p-8 text-center">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Plan vs. Actual</h1>
          <p className="text-sm text-muted">
            See how your time-blocked calendar compares with where your time really went.
          </p>
        </div>
        {error && (
          <p className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600">
            Sign-in failed. Please try again.
          </p>
        )}
        <form
          action={async () => {
            "use server";
            await signIn("google", { redirectTo: target });
          }}
        >
          <button className="btn-primary w-full py-2.5" type="submit">
            Continue with Google
          </button>
        </form>
        <p className="text-xs text-muted">
          We ask for read-only access to your Google Calendar. If you plan in Notion Calendar, connect the same
          Google account there and your time blocks show up here automatically.
        </p>
        <a href="/privacy" className="block text-xs text-muted underline">
          Privacy policy
        </a>
      </div>
    </main>
  );
}
