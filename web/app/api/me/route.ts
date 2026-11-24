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
  const [plan] = await sql`SELECT id, plan_date::text AS plan_date, to_char(leave_time, 'HH24:MI') AS leave_time,
                                  update_text, channel, status, result
                           FROM day_plans WHERE employee_id = ${e.id} AND status = 'pending'
                           ORDER BY plan_date LIMIT 1`;
  const [run] = await sql`SELECT kind, status, message, target_at, updated_at FROM daily_runs
                          WHERE employee_id = ${e.id} AND run_date = ${today}`;
  const history = await sql`SELECT plan_date::text AS plan_date, status, result FROM day_plans
                            WHERE employee_id = ${e.id} AND status <> 'pending' ORDER BY plan_date DESC, id DESC LIMIT 5`;
  const logs = await sql`SELECT at, level, message FROM run_logs WHERE employee_id = ${e.id} ORDER BY at DESC LIMIT 8`;
  return NextResponse.json({
    name: e.name,
    email: e.email,
    mode: e.mode,
    adminDisabled: e.admin_disabled,
    paused: await isPaused(),
    isAdmin: isAdminEmail(e.email),
    slackConnected: !!e.slack_token_enc,
    defaultChannel: e.default_channel,
    dryRun: DRY_RUN,
    today,
    plan: plan || null,
    run: run || null,
    history,
    logs,
  });
}
