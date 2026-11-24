import { NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { requireEmployee } from "@/lib/session.ts";
import { appUrl, slackAuthorizeUrl } from "@/lib/slack.ts";

export async function GET() {
  const r = await requireEmployee();
  if ("error" in r) return NextResponse.redirect(`${appUrl()}/`);
  if (!process.env.SLACK_CLIENT_ID) return NextResponse.redirect(`${appUrl()}/dashboard?slack=not_configured`);
  const state = randomBytes(16).toString("hex");
  (await cookies()).set("slack_oauth_state", state, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 600, path: "/" });
  return NextResponse.redirect(slackAuthorizeUrl(state));
}
