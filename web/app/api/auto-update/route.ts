// Feature 2 extra: optional "today's update", posted to Slack right after today's auto checkout.
import { NextResponse } from "next/server";
import { sql } from "@/lib/db.ts";
import { requireEmployee } from "@/lib/session.ts";
import { ist } from "@/lib/time.ts";

async function alreadyHandled(employeeId: number, today: string) {
  const [u] = await sql`SELECT status FROM auto_updates WHERE employee_id = ${employeeId} AND update_date = ${today}`;
  return u && u.status !== "pending";
}

export async function POST(req: Request) {
  const r = await requireEmployee();
  if ("error" in r) return r.error;
  const b = await req.json().catch(() => ({}));
  const updateText = String(b.updateText || "").trim();
  const channel = String(b.channel || "").trim().replace(/^[#@]/, "");
  const channelLabel = String(b.channelLabel || "").trim().slice(0, 120) || `#${channel}`;
  const today = ist().date;

  if (r.emp.mode !== "auto") return NextResponse.json({ error: "Turn on Auto checkout first" }, { status: 400 });
  if (!updateText) return NextResponse.json({ error: "Write today's update" }, { status: 400 });
  if (updateText.length > 3000) return NextResponse.json({ error: "Update is too long (max 3000 characters)" }, { status: 400 });
  if (!/^[A-Za-z0-9._-]{1,80}$/.test(channel))
    return NextResponse.json({ error: "Choose where to send the update (a channel or a person)" }, { status: 400 });
  if (await alreadyHandled(r.emp.id, today))
    return NextResponse.json({ error: "Today's checkout is already done, so this update can no longer be changed" }, { status: 409 });

  await sql`INSERT INTO auto_updates (employee_id, update_date, update_text, channel, channel_label)
            VALUES (${r.emp.id}, ${today}, ${updateText}, ${channel}, ${channelLabel})
            ON CONFLICT (employee_id, update_date)
            DO UPDATE SET update_text = EXCLUDED.update_text, channel = EXCLUDED.channel,
                          channel_label = EXCLUDED.channel_label, updated_at = now()`;
  await sql`UPDATE employees SET default_channel = ${channel}, default_channel_label = ${channelLabel}, updated_at = now() WHERE id = ${r.emp.id}`;
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const r = await requireEmployee();
  if ("error" in r) return r.error;
  await sql`DELETE FROM auto_updates WHERE employee_id = ${r.emp.id} AND update_date = ${ist().date} AND status = 'pending'`;
  return NextResponse.json({ ok: true });
}
