import { NextResponse } from "next/server";
import { sql } from "@/lib/db.ts";
import { requireEmployee } from "@/lib/session.ts";

export async function POST() {
  const r = await requireEmployee();
  if ("error" in r) return r.error;
  await sql`UPDATE employees SET slack_token_enc = NULL, slack_user_id = NULL, slack_team_id = NULL, updated_at = now() WHERE id = ${r.emp.id}`;
  return NextResponse.json({ ok: true });
}
