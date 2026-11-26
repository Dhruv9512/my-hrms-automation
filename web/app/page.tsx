"use client";
import { useEffect, useState, type FormEvent } from "react";
import { ArrowRight, TriangleAlert } from "lucide-react";
import Logo from "@/components/Logo";
import TodayCard from "@/components/TodayCard";

// A real-looking day for the preview: in at 9:30 AM, a 25 minute lunch, out at 5:55 PM.
function sampleRun(now: number) {
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date(now));
  const at = (t: string) => new Date(`${day}T${t}+05:30`).getTime();
  const checkIn = at("09:30:00");
  const checkedAt = at("15:10:00");
  const breaks = 25 * 60;
  return {
    preview: {
      kind: "auto", status: "waiting", message: "Checkout scheduled for 5:55 PM",
      target_at: new Date(at("17:55:00")).toISOString(), check_in_at: new Date(checkIn).toISOString(),
      break_seconds: breaks, worked_seconds: Math.round((checkedAt - checkIn) / 1000) - breaks, on_break: false,
      checked_at: new Date(checkedAt).toISOString(),
    },
    now: at("15:12:00"),
  };
}

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sample, setSample] = useState<ReturnType<typeof sampleRun> | null>(null);

  useEffect(() => setSample(sampleRun(Date.now())), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Sign in failed");
      window.location.href = "/dashboard";
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="auth">
      <aside className="auth-side">
        <Logo />
        <div className="pitch">
          <h1>Leave on time. Your update goes out with you</h1>
          <p>Checks you out of Amilek HRMS the minute you complete 8 hours, or at the time you pick, and posts your daily update to Slack as you.</p>
        </div>
        <div className="preview" style={{ pointerEvents: "none" }}>
          {sample && <TodayCard run={sample.preview} mode="auto" dateLabel={new Date(sample.now).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" })} now={sample.now} />}
        </div>
      </aside>

      <section className="auth-main">
        <form className="auth-form" onSubmit={submit}>
          <div className="auth-logo-sm"><Logo /></div>
          <h2>Sign in with HRMS</h2>
          <p className="lead small">Use your Amilek HRMS email and password. The first sign in registers you. The password is checked live with HRMS and stored encrypted</p>
          <label htmlFor="email">HRMS email</label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@amilekconsultancy.com" />
          <label htmlFor="password">Password</label>
          <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          {error && <div className="notice bad" style={{ marginTop: 16 }}><TriangleAlert /><span>{error}</span></div>}
          <button className="btn btn-primary btn-lg full" style={{ marginTop: 24 }} disabled={busy}>
            {busy ? "Checking with HRMS" : <>Sign in<ArrowRight /></>}
          </button>
          {busy && <p className="hint" style={{ marginTop: 12 }}>HRMS can take up to a minute to wake up</p>}
        </form>
      </section>
    </main>
  );
}
