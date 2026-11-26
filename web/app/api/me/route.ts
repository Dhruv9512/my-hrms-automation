// Everything the dashboard needs, without any secrets.
import { NextResponse } from "next/server";
import { isPaused, sql } from "@/lib/db.ts";
import { isAdminEmail, requireEmployee } from "@/lib/session.ts";
import { ist } from "@/lib/time.ts";
import { DRY_RUN } from "@/lib/engine.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await requireEmployee();
  if ("error" in r) return r.error;
  const e = r.emp;
  const today = ist().date;
  const [[plan], [run], history, logs, paused] = await Promise.all([
    sql`SELECT id, plan_date::text AS plan_date, to_char(leave_time, 'HH24:MI') AS leave_time,
               update_text, channel, channel_label, status, result
        FROM day_plans WHERE employee_id = ${e.id} AND status = 'pending'
        ORDER BY plan_date LIMIT 1`,
    sql`SELECT kind, status, message, target_at, next_check_at, updated_at, check_in_at, break_seconds,
               worked_seconds, on_break, checked_at FROM daily_runs
        WHERE employee_id = ${e.id} AND run_date = ${today}`,
    sql`SELECT plan_date::text AS plan_date, status, result FROM day_plans
        WHERE employee_id = ${e.id} AND status <> 'pending' ORDER BY plan_date DESC, id DESC LIMIT 5`,
    sql`SELECT at, level, message FROM run_logs WHERE employee_id = ${e.id} ORDER BY at DESC LIMIT 8`,
    isPaused(),
  ]);
  const [autoUpdate] = await sql`SELECT update_text, channel, channel_label, status, result FROM auto_updates
                                 WHERE employee_id = ${e.id} AND update_date = ${today}`;
  return NextResponse.json({
    name: e.name,
    email: e.email,
    mode: e.mode,
    adminDisabled: e.admin_disabled,
    paused,
    isAdmin: isAdminEmail(e.email),
    slackConnected: !!e.slack_token_enc,
    defaultChannel: e.default_channel,
    defaultChannelLabel: e.default_channel_label || (e.default_channel ? `#${e.default_channel}` : ""),
    dryRun: DRY_RUN,
    today,
    plan: plan || null,
    autoUpdate: autoUpdate || null,
    run: run || null,
    history,
    logs,
  });
}
