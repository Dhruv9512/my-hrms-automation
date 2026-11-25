// Feature 1: day plan (date + optional leave time + today's update -> Slack channel).
import { NextResponse } from "next/server";
import { sql } from "@/lib/db.ts";
import { requireEmployee } from "@/lib/session.ts";
import { ist } from "@/lib/time.ts";

export async function POST(req: Request) {
  const r = await requireEmployee();
  if ("error" in r) return r.error;
  const b = await req.json().catch(() => ({}));
  const date = String(b.date || "");
  const leaveTime = b.leaveTime ? String(b.leaveTime) : null;
  const updateText = String(b.updateText || "").trim();
  const channel = String(b.channel || "").trim().replace(/^#/, "");
  const today = ist().date;

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date < today)
    return NextResponse.json({ error: "Pick today or a future date" }, { status: 400 });
  const weekday = new Date(`${date}T12:00:00+05:30`).getUTCDay();
  if (weekday === 0 || weekday === 6)
    return NextResponse.json({ error: "Pick a weekday (Monday to Friday)" }, { status: 400 });
  if (leaveTime && !/^\d{2}:\d{2}$/.test(leaveTime))
    return NextResponse.json({ error: "Leave time must be HH:MM" }, { status: 400 });
  // The scheduler runs 12:00-23:00 IST (cron-job.org window), so leave times must fall inside it.
  if (leaveTime && (leaveTime < "12:00" || leaveTime > "22:59"))
    return NextResponse.json({ error: "Leave time must be between 12:00 PM and 10:59 PM" }, { status: 400 });
  if (date === today && leaveTime && leaveTime <= ist().time.slice(0, 5))
    return NextResponse.json({ error: "That leave time has already passed today" }, { status: 400 });
  if (!updateText) return NextResponse.json({ error: "Write today's update" }, { status: 400 });
  if (updateText.length > 3000) return NextResponse.json({ error: "Update is too long (max 3000 characters)" }, { status: 400 });
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(channel))
    return NextResponse.json({ error: "Enter a channel name like general or team-updates" }, { status: 400 });

  // One plan at a time; this also switches Auto checkout off (only one feature can be on).
  await sql`UPDATE day_plans SET status = 'cancelled', result = 'Replaced by a new plan'
            WHERE employee_id = ${r.emp.id} AND status = 'pending'`;
  await sql`INSERT INTO day_plans (employee_id, plan_date, leave_time, update_text, channel)
            VALUES (${r.emp.id}, ${date}, ${leaveTime}, ${updateText}, ${channel})`;
  await sql`UPDATE employees SET mode = 'day_plan', default_channel = ${channel}, updated_at = now() WHERE id = ${r.emp.id}`;
  await sql`DELETE FROM daily_runs WHERE employee_id = ${r.emp.id} AND run_date = ${today} AND status = 'waiting'`;
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const r = await requireEmployee();
  if ("error" in r) return r.error;
  await sql`UPDATE day_plans SET status = 'cancelled', result = 'Turned off' WHERE employee_id = ${r.emp.id} AND status = 'pending'`;
  await sql`UPDATE employees SET mode = 'off', updated_at = now() WHERE id = ${r.emp.id} AND mode = 'day_plan'`;
  await sql`DELETE FROM daily_runs WHERE employee_id = ${r.emp.id} AND run_date = ${ist().date} AND status = 'waiting'`;
  return NextResponse.json({ ok: true });
}
