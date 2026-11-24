"use client";
import { useCallback, useEffect, useState } from "react";

type Emp = {
  id: number; name: string; email: string; mode: string; admin_disabled: boolean; slack: boolean;
  plan_date: string | null; run_status: string | null; run_message: string | null;
};

const MODE: Record<string, string> = { off: "Off", day_plan: "📅 Scheduled day", auto: "⏱ Auto checkout" };

export default function Admin() {
  const [data, setData] = useState<{ paused: boolean; employees: Emp[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin", { cache: "no-store" });
    if (res.status === 401) return (window.location.href = "/");
    if (res.status === 403) return setError("Admins only.");
    setData(await res.json());
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  async function post(body: unknown, question?: string) {
    if (question && !confirm(question)) return;
    setBusy(true);
    await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    await load();
    setBusy(false);
  }

  if (error) return <main className="wrap"><div className="banner bad">{error}</div><p><a href="/dashboard">Back</a></p></main>;
  if (!data) return <main className="wrap"><p className="muted">Loading…</p></main>;

  const active = data.employees.filter((e) => e.mode !== "off" && !e.admin_disabled).length;

  return (
    <main className="wrap stack">
      <header className="top">
        <div className="brand"><span className="dot" /> Admin</div>
        <a className="btn ghost" href="/dashboard">← My dashboard</a>
      </header>

      <section className={`card feature ${data.paused ? "" : "active"}`}>
        <div className="spread">
          <div>
            <h2>Master switch: all employees</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {data.paused ? "PAUSED: no checkouts and no Slack updates for anyone." : `Running · ${active} of ${data.employees.length} employees have a feature on.`}
            </p>
          </div>
          <button
            className="switch" role="switch" aria-checked={!data.paused} aria-label="Master switch" disabled={busy}
            onClick={() => post({ paused: !data.paused }, data.paused ? "Resume automation for everyone?" : "Pause BOTH features for ALL employees?")}
          />
        </div>
      </section>

      <section className="card">
        <h3>Employees</h3>
        <div className="tablewrap">
          <table>
            <thead><tr><th>Employee</th><th>Feature</th><th>Today</th><th>Slack</th><th>Allowed</th></tr></thead>
            <tbody>
              {data.employees.map((e) => (
                <tr key={e.id} style={{ opacity: e.admin_disabled ? 0.6 : 1 }}>
                  <td><b>{e.name || "—"}</b><div className="muted">{e.email}</div></td>
                  <td>{MODE[e.mode] || e.mode}{e.plan_date && <div className="muted">for {e.plan_date}</div>}</td>
                  <td>{e.run_status ? <><span className={`pill ${e.run_status === "done" ? "on" : e.run_status === "failed" ? "bad" : e.run_status === "waiting" ? "brand" : ""}`}>{e.run_status}</span><div className="muted">{e.run_message}</div></> : <span className="muted">—</span>}</td>
                  <td>{e.slack ? <span className="pill on">✓</span> : <span className="pill">—</span>}</td>
                  <td>
                    <button
                      className="switch" role="switch" aria-checked={!e.admin_disabled} aria-label={`Allow ${e.email}`} disabled={busy}
                      onClick={() => post({ employeeId: e.id, disabled: !e.admin_disabled }, e.admin_disabled ? `Allow automation for ${e.email}?` : `Turn off BOTH features for ${e.email}?`)}
                    />
                  </td>
                </tr>
              ))}
              {data.employees.length === 0 && <tr><td colSpan={5} className="muted">No one has registered yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
