// The scheduler. /api/cron/tick calls runTick() every minute (weekdays, working hours).
//
// Per employee per day there is one row in daily_runs:
//   waiting -> (login HRMS, read hours) -> checkout at target time -> done
// The row's next_check_at says when to look again, so HRMS is only contacted a few
// times per employee per day (check-in wait, then once at the exact target minute).

import { sql, isPaused, logEvent } from "./db.ts";
import { decrypt } from "./crypto.ts";
import { HrmsError, TARGET_SECONDS, dayState, hrmsCheckout, hrmsLogin, hrmsToday, workedSeconds } from "./hrms.ts";
import { slackPost } from "./slack.ts";
import { ceilMinute, fmtIstTime, hm, ist, istDateTime, isWeekday } from "./time.ts";

export const DRY_RUN = (process.env.DRY_RUN || "true").toLowerCase() !== "false";
const BATCH = 8; // employees processed per tick
const GIVE_UP_AFTER = 8; // consecutive failed attempts
const LAST_CHECK_IN_MINUTE = 23 * 60; // stop waiting for check-in at 23:00 IST

/** Create today's rows + expire old plans. Cheap, idempotent. */
export async function seedToday(now = new Date()) {
  const today = ist(now).date;

  // Day plans whose date passed without running -> missed; feature switches off.
  await sql`UPDATE day_plans SET status = 'missed', result = 'Date passed before it could run'
            WHERE status = 'pending' AND plan_date < ${today}`;
  await sql`UPDATE employees e SET mode = 'off', updated_at = now()
            WHERE e.mode = 'day_plan' AND NOT EXISTS (
              SELECT 1 FROM day_plans p WHERE p.employee_id = e.id AND p.status = 'pending' AND p.plan_date >= ${today})`;

  // Feature 1: a plan for today.
  await sql`INSERT INTO daily_runs (employee_id, run_date, kind, plan_id, message)
            SELECT e.id, ${today}, 'day_plan', p.id, 'Waiting'
            FROM employees e JOIN day_plans p ON p.employee_id = e.id AND p.status = 'pending' AND p.plan_date = ${today}
            WHERE e.mode = 'day_plan' AND NOT e.admin_disabled
            ON CONFLICT (employee_id, run_date) DO NOTHING`;

  // Feature 2: auto checkout, Monday to Friday.
  if (isWeekday(now)) {
    await sql`INSERT INTO daily_runs (employee_id, run_date, kind, message)
              SELECT e.id, ${today}, 'auto', 'Waiting'
              FROM employees e WHERE e.mode = 'auto' AND NOT e.admin_disabled
              ON CONFLICT (employee_id, run_date) DO NOTHING`;
  }
}

/** Atomically take due rows so overlapping ticks never process the same employee twice. */
export async function claimDue(now = new Date()) {
  const today = ist(now).date;
  return sql`UPDATE daily_runs r
             SET next_check_at = now() + interval '4 minutes', attempts = r.attempts + 1, updated_at = now()
             FROM (SELECT employee_id FROM daily_runs
                   WHERE run_date = ${today} AND status = 'waiting' AND next_check_at <= now()
                   ORDER BY next_check_at LIMIT ${BATCH}
                   FOR UPDATE SKIP LOCKED) d
             WHERE r.employee_id = d.employee_id AND r.run_date = ${today}
             RETURNING r.employee_id, r.run_date::text AS run_date, r.kind, r.plan_id, r.attempts`;
}

type Run = Record<string, any>;

async function setRun(run: Run, fields: { status?: string; next?: Date; target?: Date | null; message: string; resetAttempts?: boolean }) {
  await sql`UPDATE daily_runs SET
              status = COALESCE(${fields.status ?? null}, status),
              next_check_at = COALESCE(${fields.next?.toISOString() ?? null}::timestamptz, next_check_at),
              target_at = CASE WHEN ${fields.target === undefined} THEN target_at ELSE ${fields.target?.toISOString() ?? null}::timestamptz END,
              attempts = CASE WHEN ${!!fields.resetAttempts} THEN 0 ELSE attempts END,
              message = ${fields.message}, updated_at = now()
            WHERE employee_id = ${run.employee_id} AND run_date = ${run.run_date}`;
}

async function finishPlan(run: Run, status: "done" | "failed" | "missed", result: string) {
  if (!run.plan_id) return;
  await sql`UPDATE day_plans SET status = ${status}, result = ${result}, executed_at = now() WHERE id = ${run.plan_id}`;
  // A day plan is one-off: afterwards the feature switches back off (auto does NOT turn on by itself).
  await sql`UPDATE employees SET mode = 'off', updated_at = now()
            WHERE id = ${run.employee_id} AND mode = 'day_plan'
              AND NOT EXISTS (SELECT 1 FROM day_plans WHERE employee_id = ${run.employee_id} AND status = 'pending' AND id <> ${run.plan_id})`;
}

async function postUpdate(emp: Record<string, any>, plan: Record<string, any> | undefined): Promise<string> {
  if (!plan) return "";
  if (!emp.slack_token_enc) return " Slack: not connected, update NOT sent.";
  try {
    await slackPost(decrypt(emp.slack_token_enc), plan.channel, plan.update_text);
    return ` Update posted to #${plan.channel.replace(/^#/, "")}.`;
  } catch (e) {
    return ` Slack failed: ${(e as Error).message}`;
  }
}

export async function processRun(run: Run, now = new Date()) {
  const [emp] = await sql`SELECT * FROM employees WHERE id = ${run.employee_id}`;
  const plan = run.plan_id ? (await sql`SELECT * FROM day_plans WHERE id = ${run.plan_id}`)[0] : undefined;

  // Re-check switches at run time (admin or employee may have changed them).
  if (!emp || (await isPaused())) return setRun(run, { status: "skipped", message: "Paused by admin" });
  if (emp.admin_disabled) return setRun(run, { status: "skipped", message: "Disabled by admin" });
  if (run.kind === "auto" && emp.mode !== "auto") return setRun(run, { status: "skipped", message: "Auto checkout was turned off" });
  if (run.kind === "day_plan" && (emp.mode !== "day_plan" || plan?.status !== "pending"))
    return setRun(run, { status: "skipped", message: "Day plan was turned off" });

  try {
    const { token } = await hrmsLogin(emp.email, decrypt(emp.hrms_password_enc));
    const info = await hrmsToday(token);
    const state = dayState(info);
    const t = ist(now);

    if (state === "not_checked_in") {
      if (t.minutesOfDay >= LAST_CHECK_IN_MINUTE) {
        await finishPlan(run, "missed", "No check-in today");
        return setRun(run, { status: "skipped", message: "No check-in today" });
      }
      return setRun(run, { next: new Date(now.getTime() + 15 * 60000), message: "Waiting for you to check in (re-checks every 15 min)", resetAttempts: true });
    }

    if (state === "checked_out") {
      const extra = await postUpdate(emp, plan);
      await finishPlan(run, "done", `You checked out yourself.${extra}`);
      await logEvent(emp.id, `Already checked out manually.${extra}`);
      return setRun(run, { status: "done", message: `You checked out yourself.${extra}` });
    }

    // Working: when is the target?
    const { worked, onBreak } = workedSeconds(info, now);
    const target =
      run.kind === "day_plan" && plan?.leave_time
        ? istDateTime(t.date, String(plan.leave_time))
        : new Date(now.getTime() + (TARGET_SECONDS - worked) * 1000);

    if (now.getTime() >= target.getTime()) {
      let msg: string;
      if (DRY_RUN) {
        msg = `DRY RUN: would check out now (worked ${hm(worked)}).`;
      } else {
        const res = await hrmsCheckout(token);
        msg = `Checked out at ${t.time.slice(0, 5)} (worked ${hm(worked)}). HRMS: ${res.message || "OK"}.`;
      }
      msg += await postUpdate(emp, plan);
      await finishPlan(run, "done", msg);
      await logEvent(emp.id, msg);
      return setRun(run, { status: "done", message: msg, target });
    }

    const at = ceilMinute(target);
    return setRun(run, {
      next: at,
      target,
      resetAttempts: true,
      message: `Checkout scheduled for ${fmtIstTime(at)}${onBreak ? " (you are on a break; will re-check then)" : ""}. Worked so far ${hm(worked)}.`,
    });
  } catch (e) {
    const err = e as Error;
    if (err instanceof HrmsError && err.status === 401) {
      await finishPlan(run, "failed", "HRMS password changed");
      await logEvent(emp.id, "HRMS login failed: password changed. Sign in to the portal again.", "error");
      return setRun(run, { status: "failed", message: "HRMS password changed — sign in to the portal again to update it." });
    }
    const attempts = Number(run.attempts || 1);
    if (attempts >= GIVE_UP_AFTER) {
      await finishPlan(run, "failed", err.message);
      await logEvent(emp.id, `Gave up: ${err.message}`, "error");
      return setRun(run, { status: "failed", message: `Gave up after ${attempts} tries: ${err.message}` });
    }
    const waitMin = Math.min(2 ** attempts, 15);
    await logEvent(emp.id, `Attempt ${attempts} failed: ${err.message}`, "warn");
    return setRun(run, { next: new Date(now.getTime() + waitMin * 60000), message: `Retrying in ${waitMin} min: ${err.message}` });
  }
}

export async function runTick() {
  if (await isPaused()) return { paused: true, processed: 0 };
  await seedToday();
  const due = await claimDue();
  const results = await Promise.allSettled(due.map((r) => processRun(r)));
  return { paused: false, processed: due.length, errors: results.filter((r) => r.status === "rejected").length };
}
