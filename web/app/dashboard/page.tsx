"use client";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CalendarClock, Check, FlaskConical, LogOut, MessageSquare, PauseCircle, Pencil, Plus, Shield, Timer, Trash2, TriangleAlert, CircleCheck, Info,
} from "lucide-react";
import SlackPicker from "@/components/SlackPicker";
import TodayCard, { clock, type Run } from "@/components/TodayCard";
import Logo from "@/components/Logo";

type Me = {
  name: string; email: string; mode: "off" | "day_plan" | "auto"; adminDisabled: boolean; paused: boolean; isAdmin: boolean;
  slackConnected: boolean; defaultChannel: string; defaultChannelLabel: string; dryRun: boolean; today: string;
  plan: { plan_date: string; leave_time: string | null; update_text: string; channel: string; channel_label: string | null } | null;
  autoUpdate: { update_text: string; channel: string; channel_label: string | null; status: "pending" | "sent" | "failed"; result: string | null } | null;
  run: Run;
  history: { plan_date: string; status: string; result: string | null }[];
  logs: { at: string; level: string; message: string }[];
};

type Flash = ["ok" | "bad" | "warn", string];

const SLACK_MSG: Record<string, Flash> = {
  connected: ["ok", "Slack connected. Updates are sent as you"],
  cancelled: ["warn", "Slack connection was cancelled"],
  failed: ["bad", "Could not connect Slack. Try again"],
  bad_state: ["bad", "The Slack connection expired. Try again"],
  not_configured: ["warn", "Slack is not set up yet by the admin"],
};

const destLabel = (channel: string, label: string | null | undefined) => label || (channel ? `#${channel}` : "");

// Leave-time dropdown: 12:00 PM to 10:00 PM in 5-minute steps (+ the saved value if it is off-step).
const LEAVE_TIMES = Array.from({ length: 121 }, (_, i) => {
  const m = 12 * 60 + i * 5;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
});
const leaveOptions = (current: string) => (current && !LEAVE_TIMES.includes(current) ? [...LEAVE_TIMES, current].sort() : LEAVE_TIMES);
const nowIst = () => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date());
const to12h = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

const prettyDate = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
const stampAt = (at: string) => {
  const d = new Date(at);
  return `${d.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" })}, ${clock(d).full}`;
};
const HISTORY_DOT: Record<string, string> = { done: "on", failed: "bad", missed: "warn", cancelled: "" };

export default function Dashboard() {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<Flash | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ date: "", leaveTime: "", updateText: "", channel: "", channelLabel: "" });
  const [autoEditing, setAutoEditing] = useState(false);
  const [autoForm, setAutoForm] = useState({ updateText: "", channel: "", channelLabel: "" });
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (res.status === 401) return (window.location.href = "/");
    const data: Me = await res.json();
    setMe(data);
    setNow(Date.now());
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
    const c = setInterval(() => setNow(Date.now()), 15000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [load]);

  function openPlanForm(data: Me) {
    setForm({
      date: data.plan?.plan_date || data.today,
      leaveTime: data.plan?.leave_time || "",
      updateText: data.plan?.update_text || "",
      channel: data.plan?.channel || data.defaultChannel || "",
      channelLabel: data.plan ? destLabel(data.plan.channel, data.plan.channel_label) : data.defaultChannelLabel || "",
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

  if (!me) {
    return (
      <main className="shell">
        <header className="topbar"><Logo /></header>
        <div className="card today"><span className="muted">Loading your day</span></div>
      </main>
    );
  }

  const planOn = me.mode === "day_plan";
  const autoOn = me.mode === "auto";
  const blocked = me.paused || me.adminDisabled;
  const showForm = editing || (planOn && !me.plan);

  async function togglePlan() {
    if (planOn) {
      if (confirm("Turn off the scheduled day? Your plan will be cancelled.")) await api("/api/plan", "DELETE", undefined, "Scheduled day turned off");
      setEditing(false);
    } else if (editing) {
      setEditing(false);
    } else {
      if (autoOn && !confirm("Only one mode can be on.\n\nTurning on Scheduled day switches off Auto checkout after you save the plan. Continue?")) return;
      openPlanForm(me!);
    }
  }

  async function toggleAuto() {
    if (autoOn) return api("/api/mode", "POST", { mode: "off" }, "Auto checkout turned off");
    if (planOn && !confirm(`Only one mode can be on.\n\nTurning on Auto checkout cancels your scheduled day${me!.plan ? ` (${prettyDate(me!.plan.plan_date)})` : ""}. Continue?`)) return;
    setEditing(false);
    await api("/api/mode", "POST", { mode: "auto" }, "Auto checkout is on. You are checked out at 8 hours, Monday to Friday");
  }

  function openAutoForm() {
    const u = me!.autoUpdate;
    setAutoForm({
      updateText: u?.update_text || "",
      channel: u?.channel || me!.defaultChannel || "",
      channelLabel: u ? destLabel(u.channel, u.channel_label) : me!.defaultChannelLabel || "",
    });
    setAutoEditing(true);
  }

  async function submitAutoUpdate(e: FormEvent) {
    e.preventDefault();
    if (!autoForm.channel) return setFlash(["bad", "Choose where to send the update"]);
    const ok = await api("/api/auto-update", "POST", autoForm, `Saved. It goes to ${autoForm.channelLabel} right after today's checkout`);
    if (ok) setAutoEditing(false);
  }

  async function submitPlan(e: FormEvent) {
    e.preventDefault();
    if (!form.channel) return setFlash(["bad", "Choose where to send the update"]);
    const ok = await api("/api/plan", "POST", form, `Scheduled for ${prettyDate(form.date)}${form.leaveTime ? ` at ${to12h(form.leaveTime)}` : " at 8 hours worked"}`);
    if (ok) setEditing(false);
  }

  const FlashIcon = flash?.[0] === "ok" ? CircleCheck : TriangleAlert;

  return (
    <main className="shell">
      <header className="topbar">
        <Logo />
        <nav>
          <span className="who">{me.name || me.email}</span>
          {me.isAdmin && <a className="btn btn-ghost" href="/admin"><Shield />Admin</a>}
          <button className="btn btn-ghost" onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/"; }}><LogOut />Sign out</button>
        </nav>
      </header>

      <div className="stack">
        {me.paused && <div className="notice bad"><PauseCircle /><span><b>Paused by the admin.</b> Nothing runs for anyone until it is resumed</span></div>}
        {me.adminDisabled && <div className="notice bad"><PauseCircle /><span><b>Turned off for your account by the admin.</b> Your modes stay saved</span></div>}
        {me.dryRun && <div className="notice warn"><FlaskConical /><span><b>Test mode.</b> Checkouts are simulated and nothing is sent to HRMS. Slack updates are sent for real</span></div>}
        {flash && <div className={`notice ${flash[0]}`}><FlashIcon /><span>{flash[1]}</span></div>}

        <TodayCard run={me.run} mode={me.mode} dateLabel={prettyDate(me.today)} now={now} />
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <h2 className="section-title">Checkout mode</h2>
            <p className="section-sub">Choose one. Turning one on switches the other off</p>
          </div>
        </div>
        <div className="modes">
          <article className={`mode ${planOn ? "on" : editing ? "on" : autoOn ? "dim" : ""}`}>
            <div className="mode-head">
              <span className="mode-icon"><CalendarClock /></span>
              <div style={{ flex: 1 }}>
                <h3 className="mode-title">Scheduled day</h3>
                <p className="mode-desc">Pick a date and a leave time. You are checked out then and your update is sent</p>
              </div>
              <button className="switch" role="switch" aria-checked={planOn} aria-label="Scheduled day" disabled={busy || blocked} onClick={togglePlan} />
            </div>
            {planOn && me.plan && !editing ? (
              <>
                <ul className="kv">
                  <li><span>Date</span><span>{prettyDate(me.plan.plan_date)}</span></li>
                  <li><span>Leave at</span><span className="mono">{me.plan.leave_time ? to12h(me.plan.leave_time) : "At 8 hours worked"}</span></li>
                  <li><span>Send to</span><span>{destLabel(me.plan.channel, me.plan.channel_label)}</span></li>
                  <li><span>Update</span><span className="pre">{me.plan.update_text}</span></li>
                </ul>
                <div className="mode-foot">
                  <span className="status"><span className="dot accent" />On</span>
                  <button className="btn btn-secondary" onClick={() => openPlanForm(me)} disabled={busy || blocked}><Pencil />Edit plan</button>
                </div>
              </>
            ) : (
              <div className="mode-foot">
                <span className="status">
                  <span className={`dot ${planOn || editing ? "accent" : ""}`} />
                  {planOn ? "On" : editing ? "Draft, save the plan below to turn it on" : autoOn ? "Off, turning it on switches off Auto checkout" : "Off"}
                </span>
              </div>
            )}
          </article>

          <article className={`mode ${autoOn ? "on" : planOn || editing ? "dim" : ""}`}>
            <div className="mode-head">
              <span className="mode-icon"><Timer /></span>
              <div style={{ flex: 1 }}>
                <h3 className="mode-title">Auto checkout</h3>
                <p className="mode-desc">Monday to Friday, checks you out the minute you complete 8 hours. Breaks are not counted</p>
              </div>
              <button className="switch" role="switch" aria-checked={autoOn} aria-label="Auto checkout" disabled={busy || blocked} onClick={toggleAuto} />
            </div>
            <div className="mode-foot">
              <span className="status">
                <span className={`dot ${autoOn ? "accent" : ""}`} />
                {autoOn ? "On, every weekday" : planOn ? "Off, turning it on cancels your scheduled day" : "Off"}
              </span>
            </div>
          </article>
        </div>
      </section>

      {autoOn && (
        <section className="section">
          <div className="section-head">
            <div>
              <h2 className="section-title">Today's update <span className="muted" style={{ fontWeight: 400 }}>optional</span></h2>
              <p className="section-sub">Sent right after today's checkout. Without one, you are only checked out</p>
            </div>
            {me.autoUpdate && (
              me.autoUpdate.status === "sent" ? <span className="status"><span className="dot on" />Sent</span>
              : me.autoUpdate.status === "failed" ? <span className="status"><span className="dot bad" />Not sent</span>
              : <span className="status"><span className="dot accent" />Sends after checkout</span>
            )}
          </div>
          <div className="card">
            {me.autoUpdate && !autoEditing ? (
              <>
                <ul className="kv flush">
                  <li><span>Send to</span><span>{destLabel(me.autoUpdate.channel, me.autoUpdate.channel_label)}</span></li>
                  <li><span>Update</span><span className="pre">{me.autoUpdate.update_text}</span></li>
                  {me.autoUpdate.status !== "pending" && me.autoUpdate.result && <li><span>Result</span><span className="soft">{me.autoUpdate.result}</span></li>}
                </ul>
                {me.autoUpdate.status === "pending" && (
                  <div className="actions">
                    <button className="btn btn-secondary" disabled={busy || blocked} onClick={openAutoForm}><Pencil />Edit</button>
                    <button className="btn btn-danger" disabled={busy || blocked} onClick={() => api("/api/auto-update", "DELETE", undefined, "Today's update removed. Checkout only")}><Trash2 />Remove</button>
                  </div>
                )}
              </>
            ) : autoEditing ? (
              <form onSubmit={submitAutoUpdate}>
                <label htmlFor="aupdate" style={{ marginTop: 0 }}>Update for {prettyDate(me.today)}</label>
                <textarea id="aupdate" required maxLength={3000} placeholder={"- Finished the login page\n- Fixed the payroll bug"} value={autoForm.updateText} onChange={(e) => setAutoForm({ ...autoForm, updateText: e.target.value })} />
                <label htmlFor="achannel">Send to</label>
                <SlackPicker id="achannel" value={{ id: autoForm.channel, label: autoForm.channelLabel }} onChange={(d) => setAutoForm({ ...autoForm, channel: d.id, channelLabel: d.label })} />
                <p className="hint">A channel you are in, a person as a direct message, or yourself. Sent as you</p>
                {!me.slackConnected && <div className="notice warn" style={{ marginTop: 16 }}><Info /><span>Slack is not connected, so this update will not be sent. Connect it below</span></div>}
                <div className="actions">
                  <button className="btn btn-primary" disabled={busy}><Check />{busy ? "Saving" : "Save update"}</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setAutoEditing(false)} disabled={busy}>Cancel</button>
                </div>
              </form>
            ) : (
              <div className="spread">
                <p className="empty">No update for today</p>
                <button className="btn btn-secondary" disabled={busy || blocked} onClick={openAutoForm}><Plus />Add update</button>
              </div>
            )}
          </div>
        </section>
      )}

      {showForm && (
        <section className="section">
          <form className="card" onSubmit={submitPlan}>
            <h2 className="form-title">Schedule a day</h2>
            <p className="section-sub" style={{ marginTop: 0 }}>You are checked out at the leave time and your update is sent</p>
            <div className="grid2">
              <div>
                <label htmlFor="date">Date</label>
                <input id="date" type="date" className="mono" required min={me.today} value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
              </div>
              <div>
                <label htmlFor="leave">Leave time <span className="opt">optional</span></label>
                <select id="leave" value={form.leaveTime} onChange={(e) => setForm({ ...form, leaveTime: e.target.value })}>
                  <option value="">At 8 hours worked</option>
                  {leaveOptions(form.leaveTime).map((t) => {
                    const past = form.date === me.today && t <= nowIst();
                    return <option key={t} value={t} disabled={past}>{to12h(t)}{past ? "  passed" : ""}</option>;
                  })}
                </select>
                <p className="hint">12:00 PM to 10:00 PM, every 5 minutes</p>
              </div>
            </div>
            {form.leaveTime && <div className="notice warn" style={{ marginTop: 16 }}><TriangleAlert /><span>If this is before you complete 8 hours, HRMS may mark an <b>early checkout</b> or a <b>half day</b></span></div>}
            <label htmlFor="update">Today's update</label>
            <textarea id="update" required maxLength={3000} placeholder={"- Finished the login page\n- Fixed the payroll bug\n- Tomorrow: reports"} value={form.updateText} onChange={(e) => setForm({ ...form, updateText: e.target.value })} />
            <label htmlFor="channel">Send to</label>
            <SlackPicker id="channel" value={{ id: form.channel, label: form.channelLabel }} onChange={(d) => setForm({ ...form, channel: d.id, channelLabel: d.label })} />
            <p className="hint">A channel you are in, a person as a direct message, or yourself. Sent as you</p>
            {!me.slackConnected && <div className="notice warn" style={{ marginTop: 16 }}><Info /><span>Slack is not connected, so this update will not be sent. Connect it below</span></div>}
            <div className="actions">
              <button className="btn btn-primary" disabled={busy}><Check />{busy ? "Saving" : planOn ? "Save changes" : autoOn ? "Save and switch off Auto checkout" : "Save plan"}</button>
              <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="section grid-aside">
        <div className="card tight">
          <div className="spread" style={{ alignItems: "flex-start" }}>
            <div className="row" style={{ gap: 12, alignItems: "flex-start", flexWrap: "nowrap" }}>
              <span className="mode-icon"><MessageSquare /></span>
              <div>
                <h3 className="mode-title">Slack</h3>
                <span className="status" style={{ marginTop: 4 }}><span className={`dot ${me.slackConnected ? "on" : ""}`} />{me.slackConnected ? "Connected" : "Not connected"}</span>
              </div>
            </div>
          </div>
          <p className="hint" style={{ marginTop: 16 }}>Updates are sent as you. No Slack password is stored</p>
          <div className="actions" style={{ marginTop: 16 }}>
            {me.slackConnected ? (
              <>
                <a className="btn btn-secondary" href="/api/slack/connect">Reconnect</a>
                <button className="btn btn-ghost" disabled={busy} onClick={() => api("/api/slack/disconnect", "POST", undefined, "Slack disconnected")}>Disconnect</button>
              </>
            ) : (
              <a className="btn btn-primary" href="/api/slack/connect">Connect Slack</a>
            )}
          </div>
        </div>

        <div className="card tight">
          <h3 className="mode-title" style={{ marginBottom: 12 }}>Recent activity</h3>
          {me.logs.length === 0 && me.history.length === 0 ? <p className="empty">Nothing yet</p> : (
            <ul className="log">
              {me.logs.map((l, i) => (
                <li key={`l${i}`}>
                  <time className="mono">{stampAt(l.at)}</time>
                  <span style={l.level === "error" ? { color: "var(--bad)" } : undefined}>{l.message}</span>
                </li>
              ))}
              {me.history.filter((h) => h.status !== "done").map((h, i) => (
                <li key={`h${i}`}>
                  <time className="mono">{prettyDate(h.plan_date)}</time>
                  <span>
                    <span className="status"><span className={`dot ${HISTORY_DOT[h.status] ?? ""}`} />Plan {h.status}</span>
                    <span className="soft" style={{ display: "block" }}>{h.result}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </main>
  );
}
