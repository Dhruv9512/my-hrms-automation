// Called every minute by cron-job.org with "Authorization: Bearer <CRON_SECRET>".
// Replies at once (cron-job.org gives up after 30s) and keeps working in the background.
import { NextResponse, after } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { runTick } from "@/lib/engine.ts";
import { logEvent } from "@/lib/db.ts";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: Request) {
  const want = Buffer.from(`Bearer ${process.env.CRON_SECRET || ""}`);
  const got = Buffer.from(req.headers.get("authorization") || "");
  return !!process.env.CRON_SECRET && want.length === got.length && timingSafeEqual(want, got);
}

async function handle(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  after(async () => {
    try {
      const r = await runTick();
      if (r.processed) console.log("tick", r);
    } catch (e) {
      console.error("tick failed", e);
      await logEvent(null, `Tick failed: ${(e as Error).message}`, "error").catch(() => {});
    }
  });
  return NextResponse.json({ ok: true });
}

export const GET = handle;
export const POST = handle;
