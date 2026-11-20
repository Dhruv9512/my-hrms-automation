# my-hrms-automation

Auto-checkout bot for the Amilek HRMS. Calls the HRMS API directly (no browser).

1. **Schedule checkout** runs at 16:30 and 18:30 IST on weekdays. It reads today's worked time
   (breaks excluded) and creates a one-shot cron-job.org job for the minute 8h is reached.
2. That job triggers **Checkout**, which re-checks the hours and checks out, or reschedules
   if a break pushed the time back.

## Setup
Repo → Settings → Secrets and variables → Actions → add:

| Secret | Value |
|---|---|
| `HRMS_EMAIL` | HRMS login email |
| `HRMS_PASSWORD` | HRMS password |
| `CRONJOB_API_KEY` | cron-job.org API key |
| `GH_DISPATCH_TOKEN` | Fine-grained PAT with **Actions: Read and write** on this repo |

## Turn it on / off
Repo → Settings → Secrets and variables → Actions → **Variables** tab → `AUTO_CHECKOUT_ENABLED`:
- `false` → paused (both workflows are skipped)
- `true` or variable missing → active

Local check (read-only): `HRMS_EMAIL=... HRMS_PASSWORD=... python hrms.py status`
