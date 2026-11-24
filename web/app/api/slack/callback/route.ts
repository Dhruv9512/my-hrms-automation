import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { sql } from "@/lib/db.ts";
import { encrypt } from "@/lib/crypto.ts";
import { requireEmployee } from "@/lib/session.ts";
import { appUrl, slackExchangeCode } from "@/lib/slack.ts";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const jar = await cookies();
  const expected = jar.get("slack_oauth_state")?.value;
  jar.delete("slack_oauth_state");
  const r = await requireEmployee();
  if ("error" in r) return NextResponse.redirect(`${appUrl()}/`);
  if (url.searchParams.get("error")) return NextResponse.redirect(`${appUrl()}/dashboard?slack=cancelled`);
  if (!expected || url.searchParams.get("state") !== expected) return NextResponse.redirect(`${appUrl()}/dashboard?slack=bad_state`);
  try {
    const t = await slackExchangeCode(url.searchParams.get("code") || "");
    await sql`UPDATE employees SET slack_token_enc = ${encrypt(t.token)}, slack_user_id = ${t.userId},
              slack_team_id = ${t.teamId}, updated_at = now() WHERE id = ${r.emp.id}`;
    return NextResponse.redirect(`${appUrl()}/dashboard?slack=connected`);
  } catch {
    return NextResponse.redirect(`${appUrl()}/dashboard?slack=failed`);
  }
}
