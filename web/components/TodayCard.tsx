"use client";
// The one bright moment: today's checkout time as a stamp, and the workday drawn as a line
// from check-in to checkout, with the 8-hour mark and "now".

export type Run = {
  kind: string; status: string; message: string | null;
  target_at: string | null; next_check_at?: string | null; updated_at?: string | null;
  check_in_at: string | null; break_seconds: number | null; worked_seconds: number | null;
  on_break: boolean | null; checked_at: string | null;
} | null;

const TARGET_MS = 8 * 3600 * 1000;

export function clock(d: Date | number | string) {
  const s = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true }).format(new Date(d));
  const [time, ampm] = s.split(" ");
  return { time, ampm, full: s };
}

export function dur(ms: number) {
  const m = Math.max(0, Math.round(ms / 60000));
  return m >= 60 ? `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m` : `${m}m`;
}

const ceilMinute = (ms: number) => Math.ceil(ms / 60000) * 60000;

export default function TodayCard({ run, mode, dateLabel, now }: {
  run: Run; mode: "off" | "day_plan" | "auto"; dateLabel: string; now: number;
}) {
  const modeName = (run?.kind ?? mode) === "day_plan" ? "Scheduled day" : "Auto checkout";
  const dry = !!run?.message?.startsWith("DRY RUN");
  const checkIn = run?.check_in_at ? new Date(run.check_in_at).getTime() : null;
  const checkedAt = run?.checked_at ? new Date(run.checked_at).getTime() : null;
  const breaksMs = (run?.break_seconds ?? 0) * 1000;
  const waiting = run?.status === "waiting";
  const done = run?.status === "done";

  // Worked time keeps counting between scheduler checks unless you are on a break.
  const worked = run?.worked_seconds != null && checkedAt
    ? run.worked_seconds * 1000 + (waiting && !run.on_break ? Math.max(0, now - checkedAt) : 0)
    : null;
  const out = waiting && run?.target_at ? ceilMinute(new Date(run.target_at).getTime()) : done ? checkedAt : null;
  const goal = checkIn != null ? checkIn + TARGET_MS + breaksMs : null;

  let status: [string, string];
  if (!run) status = mode === "off" ? ["", "Off"] : ["accent", "Starting"];
  else if (waiting) status = run.target_at ? ["accent", "Scheduled"] : ["", "Waiting for check-in"];
  else if (done) status = dry ? ["warn", "Test run"] : ["on", "Checked out"];
  else if (run.status === "failed") status = ["bad", "Failed"];
  else status = ["", "Skipped"];

  let stamp: { time: string; ampm?: string; cls: string };
  let sub: React.ReactNode;
  if (out && (waiting || done)) {
    const c = clock(out);
    stamp = { time: c.time, ampm: c.ampm, cls: waiting ? "live" : "" };
    sub = waiting
      ? <>Checkout in <b className="num">{dur(out - now)}</b> · {modeName}</>
      : <>{dry ? "Simulated checkout, test mode is on" : "Checked out"} · {modeName}</>;
  } else if (!run) {
    stamp = { time: mode === "off" ? "Off" : "—:—", cls: "idle" };
    sub = mode === "off" ? "Nothing scheduled. Turn on one of the modes below" : "The first check runs within a minute, 12 PM to 11 PM on weekdays";
  } else {
    stamp = { time: "—:—", cls: "idle" };
    sub = run.message || "";
  }

  // The line spans check-in to whichever is last: checkout, the 8h mark or now.
  let line: React.ReactNode = null;
  if (checkIn && goal) {
    const end = Math.max(out ?? 0, goal, waiting ? now : 0);
    const pos = (t: number) => `${Math.min(100, Math.max(0, ((t - checkIn) / (end - checkIn)) * 100))}%`;
    const fillTo = done && out ? out : Math.min(now, end);
    const showGoal = !out || Math.abs(goal - out) > 2 * 60000;
    line = (
      <div className="dayline" aria-hidden>
        <div className="track">
          <div className="fill" style={{ width: pos(fillTo) }} />
          {showGoal && <div className="tick goal" style={{ left: pos(goal) }} />}
          {out && <div className="tick out" style={{ left: pos(out) }} />}
          {waiting && <div className="tick now" style={{ left: pos(now) }} />}
        </div>
        <div className="scale mono">
          <span className="first">{clock(checkIn).full}<em>Check-in</em></span>
          {showGoal && <span className={out ? "" : "last"} style={{ left: pos(goal) }}>{clock(goal).full}<em>8 hours</em></span>}
          {out && <span className="last" style={{ left: pos(out) }}>{clock(out).full}<em>Checkout</em></span>}
        </div>
      </div>
    );
  }

  const showNote = run?.message && (done || run.status === "failed" || run.status === "skipped" || run.on_break);

  return (
    <section className="card today">
      <div className="today-head">
        <span className="today-label">Today, {dateLabel}</span>
        <span className="status"><span className={`dot ${status[0]}`} />{status[1]}</span>
      </div>
      <div className="stamp-row">
        <div>
          <div className={`stamp ${stamp.cls}`}>{stamp.time}{stamp.ampm && <span className="ampm">{stamp.ampm}</span>}</div>
          <div className="stamp-sub">{sub}</div>
        </div>
        {worked != null && checkIn && (
          <div className="figures">
            <div className="figure"><div className="k">Worked</div><div className="v">{dur(worked)}</div></div>
            <div className="figure"><div className="k">Breaks</div><div className="v">{dur(breaksMs)}</div></div>
            {waiting && out && <div className="figure"><div className="k">Left</div><div className="v">{dur(out - now)}</div></div>}
          </div>
        )}
      </div>
      {line}
      {showNote && <div className="today-note">{run!.message}</div>}
    </section>
  );
}
