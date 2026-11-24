// Admin only (ADMIN_EMAILS): master switch for everyone + per-employee switch.
import { NextResponse } from "next/server";
import { isPaused, logEvent, sql } from "@/lib/db.ts";
import { requireEmployee } from "@/lib/session.ts";
import { ist } from "@/lib/time.ts";

export const dynamic = "force-dynamic";

export async function GET() {
  const r = await requireEmployee(true);
  if ("error" in r) return r.error;
  const employees = await sql`
    SELECT e.id, e.name, e.email, e.mode, e.admin_disabled, (e.slack_token_enc IS NOT NULL) AS slack,
           p.plan_date::text AS plan_date, d.status AS run_status, d.message AS run_message
    FROM employees e
    LEFT JOIN LATERAL (SELECT plan_date FROM day_plans WHERE employee_id = e.id AND status = 'pending' ORDER BY plan_date LIMIT 1) p ON true
    LEFT JOIN daily_runs d ON d.employee_id = e.id AND d.run_date = ${ist().date}
    ORDER BY e.name`;
  return NextResponse.json({ paused: await isPaused(), employees });
}

export async function POST(req: Request) {
  const r = await requireEmployee(true);
  if ("error" in r) return r.error;
  const b = await req.json().catch(() => ({}));
  if (typeof b.paused === "boolean") {
    await sql`UPDATE settings SET value = ${String(b.paused)} WHERE key = 'paused'`;
    await logEvent(null, `Admin ${r.emp.email} ${b.paused ? "PAUSED" : "resumed"} all employees`);
  } else if (Number.isInteger(b.employeeId) && typeof b.disabled === "boolean") {
    await sql`UPDATE employees SET admin_disabled = ${b.disabled}, updated_at = now() WHERE id = ${b.employeeId}`;
    if (b.disabled)
      await sql`UPDATE daily_runs SET status = 'skipped', message = 'Disabled by admin'
                WHERE employee_id = ${b.employeeId} AND run_date = ${ist().date} AND status = 'waiting'`;
    await logEvent(b.employeeId, `Admin ${b.disabled ? "disabled" : "enabled"} automation for this employee`, "warn");
  } else {
    return NextResponse.json({ error: "Nothing to change" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
