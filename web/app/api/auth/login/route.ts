// Register / sign in with HRMS credentials, validated by a LIVE HRMS login.
import { NextResponse } from "next/server";
import { sql } from "@/lib/db.ts";
import { encrypt } from "@/lib/crypto.ts";
import { HrmsError, hrmsLogin } from "@/lib/hrms.ts";
import { createSession, isAdminEmail } from "@/lib/session.ts";

export const maxDuration = 120; // HRMS backend may need time to wake up

export async function POST(req: Request) {
  const { email, password } = await req.json().catch(() => ({}));
  if (typeof email !== "string" || typeof password !== "string" || !email.includes("@") || !password)
    return NextResponse.json({ error: "Enter your HRMS email and password" }, { status: 400 });

  let user;
  try {
    ({ user } = await hrmsLogin(email.trim(), password));
  } catch (e) {
    const err = e as HrmsError;
    const status = err.status === 401 || err.status === 400 ? 401 : 502;
    return NextResponse.json({ error: status === 401 ? "HRMS rejected this email/password" : err.message }, { status });
  }

  const enc = encrypt(password);
  const [emp] = await sql`
    INSERT INTO employees (email, name, hrms_password_enc)
    VALUES (${user.email.toLowerCase()}, ${user.name || ""}, ${enc})
    ON CONFLICT (email) DO UPDATE SET hrms_password_enc = EXCLUDED.hrms_password_enc, name = EXCLUDED.name, updated_at = now()
    RETURNING id, email, (xmax = 0) AS created`;
  await createSession({ eid: emp.id, email: emp.email });
  return NextResponse.json({ ok: true, created: emp.created, admin: isAdminEmail(emp.email) });
}
