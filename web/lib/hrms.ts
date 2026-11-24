// Amilek HRMS API client (same endpoints the HRMS web app uses).
import { ist, istDateTime } from "./time.ts";

const API = process.env.HRMS_API || "https://hrms-amilek-wrdu.onrender.com";
export const TARGET_SECONDS = Number(process.env.TARGET_MINUTES || 480) * 60;

export class HrmsError extends Error {
  status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.status = status;
  }
}

async function call<T>(method: string, path: string, token?: string, body?: unknown, timeoutMs = 60000): Promise<T> {
  // The HRMS backend (Render) can cold-start slowly: one retry on network errors/timeouts.
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(API + path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Is-Touch": "false",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
        cache: "no-store",
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (!res.ok) throw new HrmsError(String(data.error || `HRMS ${res.status}`), res.status);
      return data as T;
    } catch (e) {
      if (e instanceof HrmsError) throw e; // real answer from HRMS: don't retry
      last = e;
    }
  }
  throw new HrmsError(`HRMS not reachable (${(last as Error)?.message || last})`);
}

export type HrmsUser = { id: number; name: string; email: string; role?: string };

export async function hrmsLogin(email: string, password: string) {
  return call<{ token: string; user: HrmsUser }>("POST", "/api/auth/login", undefined, { email, password });
}

export type Attendance = {
  attendance?: { check_in_time?: string | null; check_out_time?: string | null; date?: string } | null;
  breaks?: { break_start?: string | null; break_end?: string | null }[];
};

export async function hrmsToday(token: string) {
  return call<Attendance>("GET", "/api/attendance/today", token);
}

export async function hrmsCheckout(token: string) {
  // lat/lng null = exactly what the HRMS web app sends when location is unavailable.
  return call<{ message?: string }>("POST", "/api/attendance/checkout", token, { lat: null, lng: null, is_break: false });
}

export type DayState = "not_checked_in" | "working" | "checked_out";

export function dayState(info: Attendance): DayState {
  const a = info.attendance;
  if (!a?.check_in_time) return "not_checked_in";
  if (a.check_out_time) return "checked_out";
  return "working";
}

/** Same rule as the HRMS dashboard: check-in -> now, minus breaks. Times are IST "HH:MM:SS". */
export function workedSeconds(info: Attendance, now: Date = new Date()) {
  const a = info.attendance;
  if (!a?.check_in_time) return { worked: 0, onBreak: false, checkIn: null as Date | null };
  const today = ist(now).date;
  const at = (t: string) => istDateTime(today, t);
  const checkIn = at(a.check_in_time);
  let total = (now.getTime() - checkIn.getTime()) / 1000;
  let onBreak = false;
  for (const b of info.breaks || []) {
    if (!b.break_start) continue;
    const end = b.break_end ? at(b.break_end) : now;
    if (!b.break_end) onBreak = true;
    total -= Math.max(0, (end.getTime() - at(b.break_start).getTime()) / 1000);
  }
  return { worked: Math.max(0, Math.floor(total)), onBreak, checkIn };
}
