// Signed, httpOnly session cookie. SESSION_SECRET = long random string.
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { sql } from "./db.ts";

const COOKIE = "hrms_portal_session";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET || "");

export type Session = { eid: number; email: string };

export async function createSession(s: Session) {
  if ((process.env.SESSION_SECRET || "").length < 32) throw new Error("SESSION_SECRET must be at least 32 characters");
  const jwt = await new SignJWT({ ...s }).setProtectedHeader({ alg: "HS256" }).setIssuedAt().setExpirationTime("30d").sign(secret());
  (await cookies()).set(COOKIE, jwt, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSession() {
  (await cookies()).delete(COOKIE);
}

export async function getSession(): Promise<Session | null> {
  const jwt = (await cookies()).get(COOKIE)?.value;
  if (!jwt) return null;
  try {
    const { payload } = await jwtVerify(jwt, secret());
    return { eid: Number(payload.eid), email: String(payload.email) };
  } catch {
    return null;
  }
}

export function isAdminEmail(email: string) {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean)
    .includes(email.toLowerCase());
}

/** For API routes: returns the employee row or a 401/403 response. */
export async function requireEmployee(admin = false) {
  const s = await getSession();
  if (!s) return { error: NextResponse.json({ error: "Please sign in" }, { status: 401 }) } as const;
  const rows = await sql`SELECT * FROM employees WHERE id = ${s.eid}`;
  const emp = rows[0];
  if (!emp) return { error: NextResponse.json({ error: "Please sign in" }, { status: 401 }) } as const;
  if (admin && !isAdminEmail(emp.email)) return { error: NextResponse.json({ error: "Admins only" }, { status: 403 }) } as const;
  return { emp } as const;
}
