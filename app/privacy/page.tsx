import Link from "next/link";

export const metadata = { title: "Privacy policy · Plan vs. Actual" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl space-y-4 px-4 py-12 text-sm leading-relaxed">
      <h1 className="text-2xl font-semibold">Privacy policy</h1>
      <p>
        Plan vs. Actual is a personal time-tracking tool. It compares the time blocks in your calendar with the time you
        track, so you can see how your day really went.
      </p>
      <h2 className="pt-2 text-lg font-semibold">What we access</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your Google name, email address and profile picture, to sign you in.</li>
        <li>
          <strong>Read-only</strong> access to your Google Calendar (<code>calendar.readonly</code>), to show your
          planned events next to your tracked time. The app never creates, changes or deletes calendar events.
        </li>
      </ul>
      <h2 className="pt-2 text-lg font-semibold">What we store</h2>
      <ul className="list-disc space-y-1 pl-5">
        <li>Your account (name, email) and the Google sign-in tokens needed to read your calendar.</li>
        <li>The time entries, categories, check-ins and settings you create in the app.</li>
        <li>
          Calendar events are read when you open a page and are not stored, apart from the title and times of a block
          you link an entry to or check in on.
        </li>
      </ul>
      <h2 className="pt-2 text-lg font-semibold">Who can see it</h2>
      <p>
        Only you. Each account&apos;s data is kept separate and is never shared, sold or used for advertising. Data is
        stored in the app&apos;s database (hosted on Vercel and Neon) and used only to run the app.
      </p>
      <h2 className="pt-2 text-lg font-semibold">Your choices</h2>
      <p>
        You can remove the app&apos;s access to your Google account at any time at{" "}
        <a className="underline" href="https://myaccount.google.com/permissions">
          myaccount.google.com/permissions
        </a>
        . To have your data deleted, contact the owner of this app.
      </p>
      <p className="pt-4">
        <Link className="underline" href="/signin">
          Back to sign in
        </Link>
      </p>
    </main>
  );
}
