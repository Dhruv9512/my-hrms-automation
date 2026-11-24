"""Multi-user HRMS auto-checkout (branch: multi-user).

Reuses the HRMS / cron-job.org helpers from hrms.py (unchanged) and adds:
  - many users from one JSON secret (HRMS_USERS)
  - one permanent cron-job.org alarm per user ("hrms-multi-checkout-<id>"),
    updated in place each day (PATCH) to stay within the free API quota
  - DRY_RUN (default ON): everything runs, but no real checkout is sent

HRMS_USERS format (GitHub secret):
  {"dhruv": {"email": "a@b.com", "password": "...", "enabled": true}, ...}

Usage:
  python hrms_multi.py schedule [user_id]   # all enabled users, or just one
  python hrms_multi.py checkout <user_id>   # called by that user's alarm
"""

import json
import os
import re
import sys
import time
from datetime import datetime, timedelta

import requests

from hrms import IST, TARGET_SECONDS, _cron, _request, do_checkout, state, today, worked_seconds

JOB_PREFIX = "hrms-multi-checkout-"
CHECKOUT_WORKFLOW = "checkout-multi.yml"
DRY_RUN = os.environ.get("DRY_RUN", "true").lower() != "false"
LOG_DETAILS = os.environ.get("LOG_DETAILS", "false").lower() == "true"
BRANCH = os.environ.get("GITHUB_REF_NAME", "multi-user")

_summary = []


def log(msg):
    print(msg, flush=True)
    _summary.append(msg)


def detail(msg):
    """Personal data (times, hours) only when LOG_DETAILS=true (use with a private repo)."""
    if LOG_DETAILS:
        log("    " + msg)


def hm(seconds):
    seconds = max(0, int(seconds))
    return f"{seconds // 3600}h {seconds % 3600 // 60:02d}m"


def write_summary():
    path = os.environ.get("GITHUB_STEP_SUMMARY")
    if path:
        with open(path, "a") as f:
            f.write("### HRMS multi-user auto-checkout\n\n" + "\n".join(f"- {m}" for m in _summary) + "\n")


# ------------------------------------------------------------------ users

def load_users():
    users = json.loads(os.environ["HRMS_USERS"])
    for uid, u in users.items():
        if not re.fullmatch(r"[a-z0-9_-]{1,40}", uid):
            raise ValueError(f"Invalid user id {uid!r}: use lowercase letters, digits, - or _")
        # GitHub masks the whole secret, not values parsed from it: mask each one.
        for key in ("email", "password"):
            if u.get(key):
                print(f"::add-mask::{u[key]}", flush=True)
    return users


def login_as(user):
    return _request("POST", "/api/auth/login",
                    json={"email": user["email"], "password": user["password"]})["token"]


# ------------------------------------------------------ cron-job.org alarms

def alarm_payload(uid, at):
    repo = os.environ["GITHUB_REPOSITORY"]
    return {
        "title": JOB_PREFIX + uid,
        "url": f"https://api.github.com/repos/{repo}/actions/workflows/{CHECKOUT_WORKFLOW}/dispatches",
        "enabled": True,
        "saveResponses": True,
        "requestMethod": 1,  # POST
        "schedule": {
            "timezone": "Asia/Kolkata",
            "expiresAt": int((at + timedelta(minutes=30)).strftime("%Y%m%d%H%M%S")),
            "hours": [at.hour], "minutes": [at.minute],
            "mdays": [at.day], "months": [at.month], "wdays": [-1],
        },
        "extendedData": {
            "headers": {
                "Authorization": f"Bearer {os.environ['GH_DISPATCH_TOKEN']}",
                "Accept": "application/vnd.github+json",
                "User-Agent": "hrms-auto-checkout-multi",
            },
            "body": json.dumps({"ref": BRANCH, "inputs": {"user": uid}}),
        },
    }


class Alarms(dict):
    """{user_id: jobId} for our own prefix only (never touches other jobs).
    Listed lazily: one API call, and only if an alarm actually has to be set."""

    def __init__(self):
        super().__init__()
        self.loaded = False

    def load(self):
        if not self.loaded:
            for j in _cron("GET", "/jobs").get("jobs", []):
                if j.get("title", "").startswith(JOB_PREFIX):
                    self[j["title"][len(JOB_PREFIX):]] = j["jobId"]
            self.loaded = True
        return self


_last_create = [0.0]


def set_alarm(uid, at, alarms):
    payload = alarm_payload(uid, at)
    alarms.load()
    if uid in alarms:
        _cron("PATCH", f"/jobs/{alarms[uid]}", json={"job": payload})  # 1 call, no per-minute cap
    else:
        # Creating is limited to 1/s and 5/min: space creates out (first run per user only).
        wait = 13 - (time.time() - _last_create[0])
        if wait > 0:
            time.sleep(wait)
        alarms[uid] = _cron("PUT", "/jobs", json={"job": payload})["jobId"]
        _last_create[0] = time.time()


# ------------------------------------------------------------- per user

def process(uid, user, mode, alarms):
    """Returns a short result string; raises on error."""
    now = datetime.now(IST)
    token = login_as(user)
    info = today(token)
    st = state(info)
    worked, on_break = worked_seconds(info, now)
    remaining = TARGET_SECONDS - worked
    att = info.get("attendance") or {}
    detail(f"check-in {att.get('check_in_time') or '-'} | worked {hm(worked)}"
           f"{' (on break)' if on_break else ''} | remaining {hm(remaining)}")

    if st == "not_checked_in":
        return "not checked in - nothing to do"
    if st == "checked_out":
        return "already checked out - nothing to do"

    if remaining <= 0:
        if DRY_RUN:
            return "DRY RUN - WOULD check out now"
        res = do_checkout(token)
        detail(f"HRMS says: {res.get('message', res)}")
        return "CHECKED OUT"

    exact = now + timedelta(seconds=remaining)
    at = exact.replace(second=0, microsecond=0)
    if at < exact:
        at += timedelta(minutes=1)
    set_alarm(uid, at, alarms)
    return f"alarm set for {at:%H:%M} IST" if LOG_DETAILS else "alarm set"


def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else ""
    only = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2] else None
    if mode not in ("schedule", "checkout") or (mode == "checkout" and not only):
        sys.exit("Usage: hrms_multi.py schedule [user_id] | checkout <user_id>")

    users = load_users()
    now = datetime.now(IST)
    log(f"Mode: {mode} | {now:%Y-%m-%d %H:%M:%S} IST | Target: {hm(TARGET_SECONDS)}"
        f" | {'DRY RUN (no real checkout)' if DRY_RUN else 'LIVE'} | branch: {BRANCH}")

    if only:
        if only not in users:
            sys.exit(f"Unknown user id: {only}")
        targets = {only: users[only]}
    else:
        targets = {k: v for k, v in users.items() if v.get("enabled", True)}
    if mode == "checkout" and not users[only].get("enabled", True):
        log(f"{only}: disabled in HRMS_USERS - skipping")
        return

    alarms = Alarms()
    failed = 0
    for uid, user in targets.items():
        try:
            log(f"{uid}: {process(uid, user, mode, alarms)}")
        except (requests.RequestException, RuntimeError, KeyError, ValueError) as e:
            failed += 1
            msg = str(e)
            for key in ("email", "password"):  # never echo credentials
                if user.get(key):
                    msg = msg.replace(user[key], "***")
            log(f"{uid}: ERROR - {msg}")

    log(f"Done: {len(targets)} user(s), {failed} error(s)")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    try:
        main()
    finally:
        write_summary()
