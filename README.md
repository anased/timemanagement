# Plan vs. Actual: time-blocking tracker

You time-block your day in the calendar, then life happens. This app puts your **plan** (calendar blocks) next to what you **actually** did, so you can see:

- how long each planned task really took (and how late you started it)
- what you did in the **free slots** between planned blocks
- what you did *instead* when a block didn't go to plan
- which recurring tasks always run long, and how much of your day goes untracked

Each user signs in with Google. All data is stored per user, and nobody can see anyone else's entries.

## Notion Calendar

Notion Calendar has no public API. It works on top of your Google Calendar accounts, though: every block you create in Notion Calendar is saved to a Google calendar. This app reads your Google Calendar (read-only), so blocks you make in Notion Calendar show up here automatically. Under **Settings → Planning calendars**, pick the calendar(s) you time-block in.

## Features

| Where | What |
|---|---|
| **Timer bar** (every page) | Start or stop a live timer. Typing a new task and pressing *Switch* stops the current timer and starts the next one. The timer is stored in the database, so it survives refreshes and works across devices. |
| **Today** | Planned and actual side by side on one time axis. ▶ on a block starts a timer linked to it; **+** logs time against it. Click a free slot to log what you did there, or click an entry to edit or delete it. |
| **Check in** | Lists past blocks with nothing tracked. One tap: *As planned*, *Partly* (adjust the times), *Something else* (say what), or *Skipped*. |
| **Free time** | Each gap between blocks, broken down into the activities tracked in it plus untracked time. |
| **Plan vs. actual table** | Planned vs. actual minutes, difference, start drift, status, and what happened "meanwhile" for each block. |
| **Week** | Per-day totals: planned, on plan, off plan, free time used, untracked, adherence. Also time by category. |
| **Reports** (7 / 30 / 90 days) | Planned vs. actual chart, time by category, what fills your free time, tasks that run long or short, and skipped or replaced blocks. |
| **Settings** | Planning calendars, time zone, the hours that count as your day (07:00–22:00 by default), minimum free-slot length, and categories. |

**Plan adherence** = for blocks that have started, the share of planned minutes actually spent on that block's task (capped at 100% per block).

## Tech

Next.js 15 (App Router, server actions) · TypeScript · Tailwind v4 · Auth.js v5 (Google) · Prisma + Postgres · Recharts · Vitest.

- `lib/auth.ts`, `auth.config.ts`, `middleware.ts`: Google sign-in requesting `calendar.readonly` with offline access. Every page except `/signin` requires a session.
- `lib/db-scoped.ts`: **all** app data access goes through `forUser(userId)`, which adds the user id to every query. The user id comes only from the server session (`lib/session.ts`), never from the client.
- `lib/google-calendar.ts`: refreshes the Google access token and lists calendars and events. All-day, cancelled, declined and out-of-office events are ignored.
- `lib/analytics.ts`: pure plan-vs-actual functions (free slots, block comparison, gap usage, summaries, task stats), fully unit-tested.
- `lib/period.ts`: loads a range of days and runs the analytics, in the user's time zone.

## Google Cloud setup

1. Go to <https://console.cloud.google.com/> and create (or pick) a project.
2. **APIs & Services → Library**: enable the **Google Calendar API**.
3. **APIs & Services → OAuth consent screen**: choose *External*, fill in the app name and your email, and add the scope `.../auth/calendar.readonly`. While the app is in *Testing*, add every Google account that should be able to sign in under *Test users*.
4. **APIs & Services → Credentials → Create credentials → OAuth client ID** → *Web application*:
   - Authorized JavaScript origin: `http://localhost:3000` (plus your production URL)
   - Authorized redirect URI: `http://localhost:3000/api/auth/callback/google` (plus `https://<your-domain>/api/auth/callback/google`)
5. Copy the client ID and secret into `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`.

## Run locally

```bash
cp .env.example .env          # then fill in AUTH_SECRET and the Google values
npx auth secret               # or: openssl rand -base64 32  → AUTH_SECRET
docker compose up -d          # Postgres on localhost:5432
npm install
npx prisma migrate deploy     # create the tables
npm run dev                   # http://localhost:3000
```

## Checks

```bash
npm run lint
npm run typecheck
npm test                      # unit tests; the isolation test also runs if TEST_DATABASE_URL is set
```

The user-isolation test (`tests/isolation.test.ts`) needs a separate, migrated database:

```bash
createdb timemanagement_test   # or via docker exec
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/timemanagement_test npx prisma migrate deploy
# in .env: TEST_DATABASE_URL="postgresql://postgres:postgres@localhost:5432/timemanagement_test"
```

## Deploy (Vercel + Neon)

Step-by-step instructions, including Google Cloud setup, are in **[DEPLOY.md](DEPLOY.md)**. In short: import the repo in Vercel, add a Neon database from Vercel's Storage tab (this sets `DATABASE_URL` and `DATABASE_URL_UNPOOLED`), and set `AUTH_SECRET`, `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET`. The `vercel-build` script runs the database migrations on every deploy.

If you self-host with `npm start`, also set `AUTH_TRUST_HOST=true`.
