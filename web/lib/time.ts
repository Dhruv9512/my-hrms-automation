// All HRMS times are India time (IST, UTC+05:30, no daylight saving).
// Vercel servers run in UTC, so never use local Date getters for business logic.

const IST_OFFSET_MS = (5 * 60 + 30) * 60 * 1000;

export type IstParts = {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM:SS
  weekday: number; // 0 = Sunday ... 6 = Saturday
  minutesOfDay: number;
};

export function ist(d: Date = new Date()): IstParts {
  const s = new Date(d.getTime() + IST_OFFSET_MS); // shift, then read as UTC
  const pad = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`,
    time: `${pad(s.getUTCHours())}:${pad(s.getUTCMinutes())}:${pad(s.getUTCSeconds())}`,
    weekday: s.getUTCDay(),
    minutesOfDay: s.getUTCHours() * 60 + s.getUTCMinutes(),
  };
}

/** IST date "YYYY-MM-DD" + IST time "HH:MM[:SS]" -> absolute Date. */
export function istDateTime(date: string, time: string): Date {
  const t = time.length === 5 ? `${time}:00` : time;
  return new Date(`${date}T${t}+05:30`);
}

export function isWeekday(d: Date = new Date()): boolean {
  const w = ist(d).weekday;
  return w >= 1 && w <= 5;
}

/** First whole minute at or after d. */
export function ceilMinute(d: Date): Date {
  const m = new Date(d);
  if (m.getUTCSeconds() || m.getUTCMilliseconds()) {
    m.setUTCSeconds(0, 0);
    m.setUTCMinutes(m.getUTCMinutes() + 1);
  }
  return m;
}

export function hm(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 3600)}h ${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}m`;
}

export function fmtIstTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return ist(new Date(d)).time.slice(0, 5);
}
