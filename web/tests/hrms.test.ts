// Run with TZ=UTC to mimic Vercel:  TZ=UTC npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { workedSeconds, dayState } from "../lib/hrms.ts";
import { ist, istDateTime, ceilMinute, isWeekday } from "../lib/time.ts";

test("IST helpers ignore server timezone", () => {
  // 2026-11-20 23:30 UTC = 2026-11-21 05:00 IST (Saturday)
  const d = new Date("2026-11-20T23:30:00Z");
  assert.equal(ist(d).date, "2026-11-21");
  assert.equal(ist(d).time, "05:00:00");
  assert.equal(ist(d).weekday, 6);
  assert.equal(isWeekday(d), false);
  assert.equal(istDateTime("2026-11-20", "18:22:12").toISOString(), "2026-11-20T12:52:12.000Z");
  assert.equal(ceilMinute(new Date("2026-11-20T12:52:12Z")).toISOString(), "2026-11-20T12:53:00.000Z");
  assert.equal(ceilMinute(new Date("2026-11-20T12:52:00Z")).toISOString(), "2026-11-20T12:52:00.000Z");
});

test("09:30 check-in, 45m break, read 17:00 IST -> 6h45m", () => {
  const info = { attendance: { check_in_time: "09:30:00" }, breaks: [{ break_start: "13:00:00", break_end: "13:45:00" }] };
  const r = workedSeconds(info, istDateTime("2026-11-20", "17:00:00"));
  assert.equal(r.worked, 6 * 3600 + 45 * 60);
  assert.equal(r.onBreak, false);
  assert.equal(dayState(info), "working");
});

test("real 20 Nov record matches HRMS hours_worked (7.246 h at 17:08:31)", () => {
  const info = {
    attendance: { check_in_time: "09:53:41" },
    breaks: [
      { break_start: "14:13:23", break_end: "14:41:00" },
      { break_start: "15:02:52", break_end: "15:02:57" },
      { break_start: "15:03:11", break_end: "15:03:14" },
    ],
  };
  // HRMS reported 7.2463889 h (26087 s) at checkout 17:36:13 with these breaks.
  const r = workedSeconds(info, istDateTime("2026-11-20", "17:36:13"));
  assert.ok(Math.abs(r.worked - 26087) <= 2, `got ${r.worked}`);
});

test("open break counts as on break", () => {
  const info = { attendance: { check_in_time: "10:00:00" }, breaks: [{ break_start: "13:00:00", break_end: null }] };
  const r = workedSeconds(info, istDateTime("2026-11-20", "13:30:00"));
  assert.equal(r.worked, 3 * 3600);
  assert.equal(r.onBreak, true);
});

test("states", () => {
  assert.equal(dayState({ attendance: null }), "not_checked_in");
  assert.equal(dayState({ attendance: { check_in_time: "09:00:00", check_out_time: "18:00:00" } }), "checked_out");
});
