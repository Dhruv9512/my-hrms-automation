# Auto Checkout portal (branch `web-portal`, folder `web/`)

Next.js (React) app for Vercel + Neon Postgres. Separate from the GitHub Actions bot on `main`.

## What employees get
- **Sign in / register** with HRMS email + password, checked live against HRMS. Password stored AES-256-GCM encrypted.
- **Connect Slack** once ("Sign in with Slack"), so updates are posted as them. No Slack password.
- Two features, both **OFF by default**, **only one can be on**:
  1. **📅 Scheduled day**: date + leave time (empty = 8 hours worked) + today's update + Slack channel.
     At that time: checkout, then the update is posted to the channel. One-off: afterwards the feature turns off.
  2. **⏱ Auto checkout**: Monday to Friday, checkout the minute 8 hours are completed (breaks excluded).
- **Admin** (emails in `ADMIN_EMAILS`): master switch for everyone + per-employee switch, at `/admin`.

## How the scheduling works
cron-job.org calls `GET /api/cron/tick` every minute (weekdays 08:00–23:59 IST) with
`Authorization: Bearer <CRON_SECRET>`. The tick replies at once and in the background:
- creates today's schedule row for every employee with a feature on,
- for rows that are due: logs in to HRMS, reads hours, and either checks out (if the time is reached)
  or sets the next check for the exact minute (HRMS is contacted only a few times per person per day).

## Deploy (Vercel)
1. vercel.com → Add New → Project → import `my-hrms-automation`.
2. **Root Directory: `web`**. Framework: Next.js (auto).
3. Settings → Git → **Production Branch: `web-portal`** (until this is merged to `main`).
4. Environment variables (see `.env.example`): `DATABASE_URL`, `ENCRYPTION_KEY`, `SESSION_SECRET`,
   `CRON_SECRET`, `ADMIN_EMAILS`, `APP_URL` (your https://….vercel.app), `SLACK_CLIENT_ID`,
   `SLACK_CLIENT_SECRET`, `DRY_RUN`.
   **`ENCRYPTION_KEY` must never change** after people register (their stored passwords use it).
5. Database tables (once): `cd web && node --env-file=.env.local scripts/db-init.mjs`.

## Slack app (once, by a Slack workspace admin)
1. api.slack.com/apps → Create New App → From scratch → pick the workspace.
2. OAuth & Permissions → **Redirect URL**: `https://<your-app>.vercel.app/api/slack/callback`.
3. **User Token Scopes**: add `chat:write` (no bot scopes needed).
4. Basic Information → copy **Client ID** and **Client Secret** into Vercel env.
5. Manage Distribution is not needed for one workspace. Employees then click **Connect Slack**.

## cron-job.org (once, after deploy)
Create one job: URL `https://<your-app>.vercel.app/api/cron/tick`, every minute,
hours 8–23, weekdays Mon–Fri, timezone Asia/Kolkata, header `Authorization: Bearer <CRON_SECRET>`.
(Limited hours keep Neon's free compute allowance of 100 CU-hours/month. For the same reason the
Scheduled day form accepts weekdays only.)

## Test safely
`DRY_RUN=true` (default): everything runs, checkouts are only simulated (Slack updates are real).
Set `DRY_RUN=false` for real checkouts.

## Local
```
cd web && npm install
cp .env.example .env.local   # fill in
npm run build && npm start   # http://localhost:3000
TZ=UTC npm test              # time maths tests
```
