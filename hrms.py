"""Auto-checkout bot for the Amilek HRMS.

Talks to the HRMS REST API directly (same calls the web app makes), so no
browser or HTML selectors are needed.

Modes:
  python hrms.py schedule   # read today's worked time, schedule a one-shot
                            # cron-job.org job that triggers checkout.yml at 8h
  python hrms.py checkout   # check out if 8h are done; otherwise reschedule
  python hrms.py status     # just print today's attendance (no changes)

Env vars: HRMS_EMAIL, HRMS_PASSWORD, and for scheduling also
CRONJOB_API_KEY, GH_DISPATCH_TOKEN, GITHUB_REPOSITORY (set automatically in Actions).
"""

import os
import sys
import time
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import requests

API = os.environ.get("HRMS_API", "https://hrms-amilek-wrdu.onrender.com")
IST = ZoneInfo("Asia/Kolkata")
TARGET_SECONDS = int(os.environ.get("TARGET_MINUTES", "480")) * 60  # 480 = 8h
BUFFER_MINUTES = int(os.environ.get("BUFFER_MINUTES", "2"))
JOB_TITLE = "hrms-auto-checkout"
CHECKOUT_WORKFLOW = "checkout.yml"


# ---------------------------------------------------------------- HRMS API

def _request(method, path, token=None, **kw):
    headers = {"Content-Type": "application/json", "X-Is-Touch": "false"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    # Render free tier can cold-start slowly: retry with generous timeouts.
    last = None
    for attempt in range(4):
        try:
            r = requests.request(method, API + path, headers=headers, timeout=90, **kw)
            data = r.json() if r.content else {}
            if not r.ok:
                raise RuntimeError(f"{method} {path} -> {r.status_code}: {data.get('error', data)}")
            return data
        except requests.RequestException as e:
            last = e
            time.sleep(10 * (attempt + 1))
    raise RuntimeError(f"{method} {path} failed: {last}")


def login():
    data = _request("POST", "/api/auth/login",
                    json={"email": os.environ["HRMS_EMAIL"], "password": os.environ["HRMS_PASSWORD"]})
    return data["token"]


def today(token):
    return _request("GET", "/api/attendance/today", token=token)


def do_checkout(token):
    # lat/lng null is exactly what the web app sends when location is unavailable.
    return _request("POST", "/api/attendance/checkout", token=token,
                    json={"lat": None, "lng": None, "is_break": False})


# ------------------------------------------------------- worked-time maths

def _to_ist(value, base_date):
    """Accept 'HH:MM[:SS]' (IST) or an ISO datetime string."""
    if value is None:
        return None
    if "T" in value or len(value) > 8:
        dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        return dt.astimezone(IST) if dt.tzinfo else dt.replace(tzinfo=IST)
    parts = [int(p) for p in value.split(":")]
    h, m, s = (parts + [0, 0])[:3]
    return datetime.combine(base_date, datetime.min.time(), IST).replace(hour=h, minute=m, second=s)


def worked_seconds(info, now):
    """Same rule as the dashboard: check-in -> now, minus breaks."""
    att = info.get("attendance") or {}
    start = _to_ist(att.get("check_in_time"), now.date())
    if not start:
        return 0, False
    total = (now - start).total_seconds()
    on_break = False
    for b in info.get("breaks") or []:
        bs = _to_ist(b.get("break_start"), now.date())
        be = _to_ist(b.get("break_end"), now.date())
        if bs is None:
            continue
        if be is None:
            on_break = True
            be = now
        total -= max(0, (be - bs).total_seconds())
    return max(0, int(total)), on_break


def state(info):
    att = info.get("attendance") or {}
    if not att.get("check_in_time"):
        return "not_checked_in"
    if att.get("check_out_time"):
        return "checked_out"
    return "working"


# ----------------------------------------------------- cron-job.org + GitHub

def _cron(method, path, **kw):
    r = requests.request(method, "https://api.cron-job.org" + path, timeout=30,
                         headers={"Authorization": f"Bearer {os.environ['CRONJOB_API_KEY']}",
                                  "Content-Type": "application/json"}, **kw)
    r.raise_for_status()
    return r.json() if r.content else {}


def clear_old_jobs():
    for job in _cron("GET", "/jobs").get("jobs", []):
        if job.get("title") == JOB_TITLE:
            _cron("DELETE", f"/jobs/{job['jobId']}")


def schedule_checkout(at):
    repo = os.environ["GITHUB_REPOSITORY"]
    expires = at + timedelta(minutes=30)
    clear_old_jobs()
    _cron("PUT", "/jobs", json={"job": {
        "title": JOB_TITLE,
        "url": f"https://api.github.com/repos/{repo}/actions/workflows/{CHECKOUT_WORKFLOW}/dispatches",
        "enabled": True,
        "saveResponses": True,
        "requestMethod": 1,  # POST
        "schedule": {
            "timezone": "Asia/Kolkata",
            "expiresAt": int(expires.strftime("%Y%m%d%H%M%S")),
            "hours": [at.hour], "minutes": [at.minute],
            "mdays": [at.day], "months": [at.month], "wdays": [-1],
        },
        "extendedData": {
            "headers": {
                "Authorization": f"Bearer {os.environ['GH_DISPATCH_TOKEN']}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "hrms-auto-checkout",
            },
            "body": '{"ref":"main"}',
        },
    }})


# ------------------------------------------------------------------- main

_summary = []


def log(msg):
    """Print to the Actions log and collect for the run's summary page."""
    print(msg, flush=True)
    _summary.append(msg)


def write_summary():
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a") as f:
            f.write("### HRMS auto-checkout\n\n" + "\n".join(f"- {m}" for m in _summary) + "\n")


def hm(seconds):
    seconds = max(0, int(seconds))
    return f"{seconds // 3600}h {seconds % 3600 // 60:02d}m"


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "status"
    now = datetime.now(IST)
    log(f"Mode: {mode} | Time now: {now:%Y-%m-%d %H:%M:%S} IST | Target: {hm(TARGET_SECONDS)}")

    log("Logging in to HRMS...")
    token = login()
    log("Login OK")

    info = today(token)
    att = info.get("attendance") or {}
    st = state(info)
    worked, on_break = worked_seconds(info, now)
    remaining = TARGET_SECONDS - worked
    log(f"Check-in: {att.get('check_in_time') or '-'} | Check-out: {att.get('check_out_time') or '-'}"
        f" | Breaks: {len(info.get('breaks') or [])}{' (ON BREAK now)' if on_break else ''}")
    log(f"Status: {st} | Worked: {hm(worked)} | Remaining to target: {hm(remaining)}")

    if st == "not_checked_in":
        log("RESULT: You have not checked in today. Nothing to do.")
        return
    if st == "checked_out":
        log("RESULT: Already checked out today. Nothing to do.")
        return
    if mode == "status":
        log("RESULT: Status only, no action taken.")
        return

    if remaining <= 0 or (mode == "checkout" and remaining <= BUFFER_MINUTES * 60):
        log("Target reached -> calling CHECKOUT...")
        res = do_checkout(token)
        log(f"RESULT: CHECKED OUT. HRMS says: {res.get('message', res)}")
        return

    # Not done yet (or a break was taken after scheduling): (re)schedule.
    at = (now + timedelta(seconds=remaining)).replace(second=0, microsecond=0) + timedelta(minutes=2)
    schedule_checkout(at)
    log(f"RESULT: Target not reached yet. Checkout alarm set on cron-job.org for {at:%H:%M} IST")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        log(f"ERROR: {e}")
        raise
    finally:
        write_summary()
