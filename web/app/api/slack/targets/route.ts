// Channels + people for the "Send update to" picker. Uses the employee's own Slack token.
import { NextResponse } from "next/server";
import { decrypt } from "@/lib/crypto.ts";
import { requireEmployee } from "@/lib/session.ts";
import { SlackScopeError, slackTargets } from "@/lib/slack.ts";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const r = await requireEmployee();
  if ("error" in r) return r.error;
  if (!r.emp.slack_token_enc)
    return NextResponse.json({ error: "Connect Slack first", needsConnect: true }, { status: 409 });
  try {
    const targets = await slackTargets(decrypt(r.emp.slack_token_enc), r.emp.slack_user_id);
    return NextResponse.json({ targets });
  } catch (e) {
    if (e instanceof SlackScopeError)
      return NextResponse.json({ error: "Reconnect Slack to search channels and people", needsReconnect: true }, { status: 409 });
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}
