# Put the app online (Vercel + Neon), step by step

When you're done you'll have your own web address (like `https://timemanagement-yourname.vercel.app`) that works on your laptop and phone. Everything below is free for personal use. It takes about 15–20 minutes.

You'll set up three things:

1. **Vercel** hosts the app.
2. **Neon** is the database where your time entries are stored. It's created from inside Vercel.
3. **Google Cloud** lets the app ask for read-only access to your calendar.

---

## 1. Create the app on Vercel

1. Go to <https://vercel.com/signup> and choose **Continue with GitHub**. Use the GitHub account that owns `anased/timemanagement`.
2. Click **Add New… → Project**.
3. Find **timemanagement** in the list and click **Import**. If it isn't listed, click **Adjust GitHub App Permissions** and give Vercel access to the repo.
4. Leave every setting as it is. Click **Deploy**.
   - **The first deploy will fail. That's expected:** the database and passwords aren't set up yet. Steps 2–4 fix that.
5. Find your app's address: open the project and go to **Settings → Domains**. It looks like `timemanagement-xxxx.vercel.app`. Write it down; below it's called **YOUR-APP**.

> **Which branch?** Vercel deploys the repo's main branch (`main`). The code currently lives on the branch `claude/pensive-wozniak-o9tas2`. Merge it into `main` first (ask Claude to open a pull request, then click **Merge** on GitHub), or in Vercel go to **Settings → Git** and set the production branch to `claude/pensive-wozniak-o9tas2`.

## 2. Add the database (Neon)

1. In your Vercel project, open the **Storage** tab.
2. Click **Create Database**, choose **Neon** (Serverless Postgres), and click **Continue**.
3. Accept the defaults (Free plan; pick the region closest to you) and click **Create**.
4. When it asks which environments to connect, keep everything ticked and click **Connect**.

This automatically adds `DATABASE_URL` and `DATABASE_URL_UNPOOLED` to your project's settings. You don't need to copy anything.

## 3. Let the app read your Google Calendar

1. Go to <https://console.cloud.google.com/> and sign in with the Google account whose calendar you use (the one connected to Notion Calendar).
2. At the top, click the project picker, then **New Project**. Name it `Time tracker` and click **Create**. Make sure it's selected afterwards.
3. **Turn on the Calendar API.** Search the top bar for **Google Calendar API**, open it, and click **Enable**.
4. **Consent screen.** Open the menu (☰) and go to **APIs & Services → OAuth consent screen** (it may be called **Google Auth Platform → Branding**). Click **Get started**:
   - App name: `Time tracker`. User support email: your email.
   - Audience: **External**.
   - Contact email: your email. Agree to the policy and click **Create**.
5. **Scopes.** Go to **Data Access → Add or remove scopes**. Search for `calendar.readonly`, tick **…/auth/calendar.readonly**, then click **Update** and **Save**.
6. **Publish the app.** Go to **Audience** and click **Publish app → Confirm**.
   - **Why this matters:** while the app is in *Testing*, Google cuts off calendar access every 7 days and you'd have to reconnect each week.
   - You don't need to submit it for Google's review for personal use. When you sign in, Google shows a "Google hasn't verified this app" screen. Click **Advanced → Go to Time tracker (unsafe)**. It's your own app, so this is fine.
   - If you'd rather keep it in Testing, add your email under **Test users** instead.
7. **Create the login keys.** Go to **Clients → Create client** (or **Credentials → Create credentials → OAuth client ID**):
   - Application type: **Web application**. Name: `Vercel`.
   - **Authorized JavaScript origins → Add URI:** `https://YOUR-APP`
   - **Authorized redirect URIs → Add URI:** `https://YOUR-APP/api/auth/callback/google`
   - Click **Create**. Keep the window open: you'll need the **Client ID** and **Client secret** in the next step.

## 4. Add the settings in Vercel

1. In your Vercel project, go to **Settings → Environment Variables**.
2. Add these three. For each, enter the **Key**, paste the **Value**, leave all environments ticked, and click **Save**.

   | Key | Value |
   |---|---|
   | `AUTH_GOOGLE_ID` | the **Client ID** from step 3.7 |
   | `AUTH_GOOGLE_SECRET` | the **Client secret** from step 3.7 |
   | `AUTH_SECRET` | a long random password. Get one at <https://generate-secret.vercel.app/32> and copy the text it shows. |

3. Go to the **Deployments** tab, click **⋯** on the top deployment, then **Redeploy**.
4. Wait for **Ready**. This also creates the database tables.

## 5. Start using it

1. Open `https://YOUR-APP` and click **Continue with Google**. Allow calendar access.
2. Go to **Settings → Planning calendars**. Tick the calendar(s) where you time-block in Notion Calendar, then **Save calendars**.
3. In **Your day**, check the time zone and set the hours you want counted (for example 08:00–20:00), then **Save**.
4. Go back to **Today**. Your calendar blocks are in the *Planned* column. Use the timer bar, **+ Log time**, the free slots and the check-ins to record what really happened.

**On your phone:** open the address in Safari (iPhone) or Chrome (Android), tap **Share → Add to Home Screen** (or **⋮ → Add to Home screen**), and it opens like an app.

---

## If something goes wrong

| What you see | Fix |
|---|---|
| Google says **`redirect_uri_mismatch`** | The redirect URI in step 3.7 must exactly match `https://YOUR-APP/api/auth/callback/google`: `https`, no trailing slash, and your real Vercel address. Edit the client in Google Cloud and save; it can take a few minutes to apply. |
| Google says **`access_denied`** or "app is being tested" | The app is still in Testing. Publish it (step 3.6) or add your email as a test user. |
| Yellow **"Reconnect Google"** banner in the app | Click it and allow calendar access again. If it keeps coming back every week, the app is still in Testing; publish it (step 3.6). |
| No planned blocks appear | In **Settings → Planning calendars**, tick the calendar you actually time-block in. Notion Calendar saves events to the Google calendar you picked in Notion Calendar's settings. |
| Vercel build fails mentioning **`DATABASE_URL`** or **`DATABASE_URL_UNPOOLED`** | Repeat step 2 and make sure the database is connected to all environments, then redeploy. If your database provider uses other names, add `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct) yourself under Environment Variables. |
| Sign-in page shows **"Sign-in failed"** | Check that the three values from step 4 are present and correct, then redeploy. Each change to environment variables needs a redeploy. |

Your data is private to your Google login. If someone else signs in, they get their own empty account and can't see yours. To keep the app to yourself, leave it in Testing with only your email as a test user (and reconnect once a week).
