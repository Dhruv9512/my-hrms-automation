# Multi-user auto-checkout (branch `multi-user`)

Separate from the single-user setup on `main`. Nothing on `main` is used or changed.

## Flow
1. **M1. Schedule checkout (multi-user)** logs in as each enabled user, reads today's hours and
   sets that user's own cron-job.org alarm `hrms-multi-checkout-<id>` for the first minute after 8h.
2. Each alarm starts **M2. Checkout (multi-user)** for **that one user** only.
3. Each user has one permanent alarm job, updated daily (keeps within cron-job.org's free
   100 API calls/day, which is shared with the single-user setup).

One user's error (wrong password etc.) does not stop the others; the run is marked failed at the end.

## Setup
**Secret** `HRMS_USERS` (Settings → Secrets and variables → Actions → Secrets):
```json
{
  "dhruv": {"email": "dhruv@company.com", "password": "...", "enabled": true},
  "asha":  {"email": "asha@company.com",  "password": "...", "enabled": true}
}
```
User IDs: lowercase letters, digits, `-` or `_`. Set `"enabled": false` to skip one person.
Reuses the existing `CRONJOB_API_KEY` and `GH_DISPATCH_TOKEN` secrets.

**Variables** (Variables tab), all optional:

| Variable | Default | Meaning |
|---|---|---|
| `MULTI_CHECKOUT_ENABLED` | on | `false` pauses everyone |
| `MULTI_DRY_RUN` | **dry run** | `false` = real checkouts. Until then it only logs "WOULD check out" |
| `MULTI_LOG_DETAILS` | off | `true` shows times/hours in logs. Only with a **private** repo |

## Before going live
- Make the repo **private**: logs of a public repo are public.
- Every user must agree and add their own password.
- Don't list someone who also uses the single-user setup (they'd get two schedulers).
- Daily trigger (16:30 IST) is not created yet. Run M1 by hand from Actions → choose branch `multi-user`.
