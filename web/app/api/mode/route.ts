// Feature 2 on/off (auto checkout Mon-Fri at 8h). Only one feature can be on.
import { NextResponse } from "next/server";
import { sql } from "@/lib/db.ts";
import { requireEmployee } from "@/lib/session.ts";
import { ist } from "@/lib/time.ts";

export async function POST(req: Request) {
  const r = await requireEmployee();
  if ("error" in r) return r.error;
  const { mode } = await req.json().catch(() => ({}));
  if (mode !== "auto" && mode !== "off") return NextResponse.json({ error: "Invalid mode" }, { status: 400 });

  // Turning auto on (or everything off) cancels any pending day plan.
  await sql`UPDATE day_plans SET status = 'cancelled', result = ${mode === "auto" ? "Replaced by Auto checkout" : "Turned off"}
            WHERE employee_id = ${r.emp.id} AND status = 'pending'`;
  await sql`UPDATE employees SET mode = ${mode}, updated_at = now() WHERE id = ${r.emp.id}`;
  // Drop today's not-yet-finished schedule so the scheduler rebuilds it for the new mode.
  // Turning auto on rebuilds today's run even if an earlier one today already finished.
  if (mode === "auto") await sql`DELETE FROM daily_runs WHERE employee_id = ${r.emp.id} AND run_date = ${ist().date}`;
  else await sql`DELETE FROM daily_runs WHERE employee_id = ${r.emp.id} AND run_date = ${ist().date} AND status = 'waiting'`;
  return NextResponse.json({ ok: true, mode });
}
