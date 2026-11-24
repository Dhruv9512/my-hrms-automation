"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";

type Me = {
  name: string; email: string; mode: "off" | "day_plan" | "auto"; adminDisabled: boolean; paused: boolean; isAdmin: boolean;
  slackConnected: boolean; defaultChannel: string; dryRun: boolean; today: string;
  plan: { plan_date: string; leave_time: string | null; update_text: string; channel: string } | null;
  run: { kind: string; status: string; message: string | null } | null;
  history: { plan_date: string; status: string; result: string | null }[];
  logs: { at: string; level: string; message: string }[];
};

const SLACK_MSG: Record<string, [string, string]> = {
  connected: ["ok", "Slack connected. Your updates will be posted as you."],
  cancelled: ["warn", "Slack connection was cancelled."],
  failed: ["bad", "Could not connect Slack. Please try again."],
  bad_state: ["bad", "Slack connection expired. Please try again."],
  not_configured: ["warn", "Slack is not set up yet by the admin."],
};

const prettyDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const timeAgo = (at: string) => new Date(at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export default function Dashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<[string, string] | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ date: "", leaveTime: "", updateText: "", channel: "" });

  const load = useCallback(async () => {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (res.status === 401) return (window.location.href = "/");
    const data: Me = await res.json();
    setMe(data);
    return data;
  }, []);

  useEffect(() => {
    load();
    const s = new URLSearchParams(window.location.search).get("slack");
    if (s && SLACK_MSG[s]) {
      setFlash(SLACK_MSG[s]);
      window.history.replaceState(null, "", "/dashboard");
    }
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  function openPlanForm(data: Me) {
    setForm({
      date: data.plan?.plan_date || data.today,
      leaveTime: data.plan?.leave_time || "",
      updateText: data.plan?.update_text || "",
      channel: data.plan?.channel || data.defaultChannel || "",
    });
    setEditing(true);
  }

  async function api(path: string, method: string, body?: unknown, ok?: string) {
    setBusy(true);
    setFlash(null);
    try {
      const res = await fetch(path, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Something went wrong");
      if (ok) setFlash(["ok", ok]);
      await load();
      return true;
    } catch (e) {
      setFlash(["bad", (e as Error).message]);
      return false;
    } finally {
      setBusy(false);
    }
  }

  if (!me) return <main className="wrap"><p className="muted">Loading…</p></main>;

  const planOn = me.mode === "day_plan";
  const autoOn = me.mode === "auto";
  const blocked = me.paused || me.adminDisabled;
  const showForm = editing || (planOn && !me.plan);

  async function togglePlan() {
    if (planOn) {
      if (confirm("Turn off the scheduled day? Your plan will be cancelled.")) await api("/api/plan", "DELETE", undefined, "Scheduled day turned off.");
      setEditing(false);
    } else {
      if (autoOn && !confirm("Only one feature can be on.\n\nTurning on 'Scheduled day' will switch OFF 'Auto checkout' after you submit the form. Continue?")) return;
      openPlanForm(me!);
    }
  }

  async function toggleAuto() {
    if (autoOn) return api("/api/mode", "POST", { mode: "off" }, "Auto checkout turned off.");
    if (planOn && !confirm(`Only one feature can be on.\n\nTurning on 'Auto checkout' will CANCEL your scheduled day${me!.plan ? ` (${prettyDate(me!.plan.plan_date)})` : ""}. Continue?`)) return;
    setEditing(false);
    await api("/api/mode", "POST", { mode: "auto" }, "Auto checkout is ON. You'll be checked out at 8 hours, Monday to Friday.");
  }

  async function submitPlan(e: FormEvent) {
    e.preventDefault();
    const ok = await api("/api/plan", "POST", form, `Scheduled for ${prettyDate(form.date)}${form.leaveTime ? ` at ${form.leaveTime}` : " at 8 hours worked"}.`);
    if (ok) setEditing(false);
  }

  const runPill = me.run
    ? { waiting: ["brand", "Scheduled"], done: ["on", "Done"], failed: ["bad", "Failed"], skipped: ["", "Skipped"] }[me.run.status] || ["", me.run.status]
    : null;

  return (
    <main className="wrap stack">
      <header className="top">
        <div className="brand"><span className="dot" /> Auto Checkout</div>
        <div className="row">
          <span className="muted small">{me.name || me.email}</span>
          {me.isAdmin && <a className="btn ghost" href="/admin">Admin</a>}
          <button className="btn ghost" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/"; }}>Sign out</button>
        </div>
      </header>

      {me.paused && <div className="banner bad">⏸ The admin has paused automation for everyone. Nothing will run until it is resumed.</div>}
      {me.adminDisabled && <div className="banner bad">⏸ The admin has turned off automation for your account.</div>}
      {me.dryRun && <div className="banner info small">Test mode: checkouts are simulated (nothing is sent to HRMS). Slack updates are posted for real.</div>}
      {flash && <div className={`banner ${flash[0]}`}>{flash[1]}</div>}

      <section className="card">
        <div className="spread">
          <h3 style={{ margin: 0 }}>Today · {prettyDate(me.today)}</h3>
          {runPill && <span className={`pill ${runPill[0]}`}>{runPill[1]}</span>}
        </div>
        <p className="status-big" style={{ margin: "8px 0 0" }}>
          {me.run?.message || (planOn || autoOn ? "Will start checking your hours shortly." : "Nothing scheduled. Turn on one feature below.")}
        </p>
      </section>

      <section>
        <div className="or">CHOOSE ONE · ONLY ONE FEATURE CAN BE ON AT A TIME</div>
        <div className="grid2">
          <article className={`card feature ${planOn ? "active" : autoOn ? "dim" : ""}`}>
            <div className="spread">
              <div>
                <h2>📅 Scheduled day</h2>
                <p className="muted small" style={{ margin: 0 }}>Pick a date and leave time. At that time you're checked out and your update is posted to Slack.</p>
              </div>
              <button className="switch" role="switch" aria-checked={planOn || editing} aria-label="Scheduled day" disabled={busy || blocked} onClick={togglePlan} />
            </div>
            <div className="note">
              {planOn ? <span className="pill on">● ON</span> : <span className="pill">OFF</span>}
              {autoOn && <span className="muted"> · Turning this on switches off Auto checkout</span>}
            </div>
            {planOn && me.plan && !editing && (
              <div style={{ marginTop: 14 }}>
                <ul className="list">
                  <li><b>Date:</b> {prettyDate(me.plan.plan_date)}</li>
                  <li><b>Leave at:</b> {me.plan.leave_time || "8 hours after check-in"}</li>
                  <li><b>Channel:</b> #{me.plan.channel}</li>
                  <li><b>Update:</b> <span style={{ whiteSpace: "pre-wrap" }}>{me.plan.update_text}</span></li>
                </ul>
                <button className="btn ghost" style={{ marginTop: 8 }} onClick={() => openPlanForm(me)} disabled={busy || blocked}>Edit</button>
              </div>
            )}
          </article>

          <article className={`card feature ${autoOn ? "active" : planOn ? "dim" : ""}`}>
            <div className="spread">
              <div>
                <h2>⏱ Auto checkout</h2>
                <p className="muted small" style={{ margin: 0 }}>Every Monday to Friday, checks you out the minute you complete 8 hours (breaks not counted).</p>
              </div>
              <button className="switch" role="switch" aria-checked={autoOn} aria-label="Auto checkout" disabled={busy || blocked} onClick={toggleAuto} />
            </div>
            <div className="note">
              {autoOn ? <span className="pill on">● ON</span> : <span className="pill">OFF</span>}
              {planOn && <span className="muted"> · Turning this on cancels your scheduled day</span>}
            </div>
          </article>
        </div>
      </section>

      {showForm && (
        <form className="card" onSubmit={submitPlan}>
          <h2>📅 Schedule a day</h2>
          <div className="grid2">
            <div>
              <label htmlFor="date">Date</label>
              <input id="date" type="date" required min={me.today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
            </div>
            <div>
              <label htmlFor="leave">Leave time <span className="muted">(optional)</span></label>
              <input id="leave" type="time" value={form.leaveTime} onChange={(e) => setForm({ ...form, leaveTime: e.target.value })} />
              <p className="muted small" style={{ margin: "6px 0 0" }}>Empty = check out when you complete <b>8 hours</b>.</p>
            </div>
          </div>
          {form.leaveTime && <div className="banner warn small" style={{ marginTop: 12 }}>If this time is before you complete 8 hours, HRMS may mark an <b>early checkout</b> or <b>half day</b>.</div>}
          <label htmlFor="update">Today's update</label>
          <textarea id="update" required maxLength={3000} placeholder={"- Finished login page\n- Fixed payroll bug\n- Tomorrow: reports"} value={form.updateText} onChange={(e) => setForm({ ...form, updateText: e.target.value })} />
          <label htmlFor="channel">Slack channel</label>
          <div className="chan"><span>#</span><input id="channel" required placeholder="daily-updates" value={form.channel} onChange={(e) => setForm({ ...form, channel: e.target.value.replace(/^#/, "") })} /></div>
          <p className="muted small" style={{ margin: "6px 0 0" }}>Your update is posted here, as you. You must be a member of this channel.</p>
          {!me.slackConnected && <div className="banner warn small" style={{ marginTop: 12 }}>Slack is not connected yet, so the update won't be sent. Connect Slack below.</div>}
          <div className="row" style={{ marginTop: 16 }}>
            <button className="btn" disabled={busy}>{busy ? "Saving…" : planOn ? "Save changes" : autoOn ? "Submit & switch off Auto checkout" : "Submit"}</button>
            <button type="button" className="btn ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
          </div>
        </form>
      )}

      <div className="grid2">
        <section className="card">
          <h3>Slack</h3>
          {me.slackConnected ? (
            <div className="spread">
              <span className="pill on">✓ Connected</span>
              <button className="btn ghost" disabled={busy} onClick={() => api("/api/slack/disconnect", "POST", undefined, "Slack disconnected.")}>Disconnect</button>
            </div>
          ) : (
            <>
              <p className="muted small" style={{ marginTop: 0 }}>Connect once so your daily updates are posted as you. No Slack password needed.</p>
              <a className="btn" href="/api/slack/connect">Connect Slack</a>
            </>
          )}
        </section>
        <section className="card">
          <h3>Recent activity</h3>
          {me.logs.length === 0 && me.history.length === 0 ? <p className="muted small" style={{ margin: 0 }}>Nothing yet.</p> : (
            <ul className="list">
              {me.history.map((h, i) => (
                <li key={`h${i}`}><span className={`pill ${h.status === "done" ? "on" : h.status === "failed" ? "bad" : ""}`}>{h.status}</span> {prettyDate(h.plan_date)} — {h.result}</li>
              ))}
              {me.logs.map((l, i) => (
                <li key={`l${i}`}><span className="muted">{timeAgo(l.at)}</span> · {l.message}</li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
