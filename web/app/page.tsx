"use client";
import { useState, type FormEvent } from "react";

export default function SignIn() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

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
      <form className="card" onSubmit={submit}>
        <div className="brand" style={{ marginBottom: 14 }}><span className="dot" /> Auto Checkout</div>
        <h1>Sign in with HRMS</h1>
        <p className="muted small">Use your Amilek HRMS email and password. First time? This registers you. We check them live with HRMS and store the password encrypted.</p>
        <label htmlFor="email">HRMS email</label>
        <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@amilekconsultancy.com" />
        <label htmlFor="password">HRMS password</label>
        <input id="password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        {error && <div className="banner bad small" style={{ marginTop: 12 }}>{error}</div>}
        <button className="btn full" style={{ marginTop: 16 }} disabled={busy}>
          {busy ? "Checking with HRMS…" : "Sign in / Register"}
        </button>
        {busy && <p className="muted small" style={{ marginBottom: 0 }}>HRMS can take up to a minute to wake up. Please wait.</p>}
      </form>
    </main>
  );
}
