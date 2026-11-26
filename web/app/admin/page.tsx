"use client";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, PauseCircle, Power } from "lucide-react";
import Logo from "@/components/Logo";

type Emp = {
  id: number; name: string; email: string; mode: string; admin_disabled: boolean; slack: boolean;
  plan_date: string | null; run_status: string | null; run_message: string | null;
};

const MODE: Record<string, string> = { off: "Off", day_plan: "Scheduled day", auto: "Auto checkout" };
const RUN_DOT: Record<string, string> = { waiting: "accent", done: "on", failed: "bad", skipped: "" };
const RUN_LABEL: Record<string, string> = { waiting: "Scheduled", done: "Done", failed: "Failed", skipped: "Skipped" };

export default function Admin() {
  const [data, setData] = useState<{ paused: boolean; employees: Emp[] } | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/admin", { cache: "no-store" });
    if (res.status === 401) return (window.location.href = "/");
    if (res.status === 403) return setError("This page is for admins only");
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

  const header = (
    <header className="topbar">
      <Logo label="Auto Checkout admin" />
      <nav><a className="btn btn-ghost" href="/dashboard"><ArrowLeft />My dashboard</a></nav>
    </header>
  );

  if (error) return <main className="shell">{header}<div className="notice bad"><PauseCircle /><span>{error}</span></div></main>;
  if (!data) return <main className="shell">{header}<div className="card"><span className="muted">Loading</span></div></main>;

  const active = data.employees.filter((e) => e.mode !== "off" && !e.admin_disabled).length;

  return (
    <main className="shell">
      {header}

      <section className={`mode ${data.paused ? "" : "on"}`}>
        <div className="mode-head">
          <span className="mode-icon"><Power /></span>
          <div style={{ flex: 1 }}>
            <h2 className="mode-title">All employees</h2>
            <p className="mode-desc">
              {data.paused ? "Paused. No checkouts and no Slack updates for anyone" : <><span className="mono">{active}</span> of <span className="mono">{data.employees.length}</span> employees have a mode on</>}
            </p>
          </div>
          <button
            className="switch" role="switch" aria-checked={!data.paused} aria-label="Master switch" disabled={busy}
            onClick={() => post({ paused: !data.paused }, data.paused ? "Resume automation for everyone?" : "Pause both modes for all employees?")}
          />
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2 className="section-title">Employees</h2></div>
        <div className="card tight">
          <div className="tablewrap">
            <table>
              <thead><tr><th>Employee</th><th>Mode</th><th>Today</th><th>Slack</th><th>Allowed</th></tr></thead>
              <tbody>
                {data.employees.map((e) => (
                  <tr key={e.id} className={e.admin_disabled ? "off" : ""}>
                    <td>{e.name || "—"}<div className="soft small">{e.email}</div></td>
                    <td>{MODE[e.mode] || e.mode}{e.plan_date && <div className="soft small mono">{e.plan_date}</div>}</td>
                    <td>
                      {e.run_status ? <>
                        <span className="status"><span className={`dot ${RUN_DOT[e.run_status] ?? ""}`} />{RUN_LABEL[e.run_status] ?? e.run_status}</span>
                        <div className="soft small">{e.run_message}</div>
                      </> : <span className="muted">—</span>}
                    </td>
                    <td><span className="status"><span className={`dot ${e.slack ? "on" : ""}`} />{e.slack ? "Connected" : "No"}</span></td>
                    <td>
                      <button
                        className="switch" role="switch" aria-checked={!e.admin_disabled} aria-label={`Allow ${e.email}`} disabled={busy}
                        onClick={() => post({ employeeId: e.id, disabled: !e.admin_disabled }, e.admin_disabled ? `Allow automation for ${e.email}?` : `Turn off both modes for ${e.email}?`)}
                      />
                    </td>
                  </tr>
                ))}
                {data.employees.length === 0 && <tr><td colSpan={5} className="muted">No one has registered yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
