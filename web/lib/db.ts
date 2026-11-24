import { neon } from "@neondatabase/serverless";

let _sql: ReturnType<typeof neon> | null = null;

/** Tagged-template SQL over HTTP (fits serverless). Usage: await sql`SELECT ... ${value}` */
export function sql(strings: TemplateStringsArray, ...values: unknown[]) {
  if (!_sql) {
    if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
    _sql = neon(process.env.DATABASE_URL);
  }
  return _sql(strings, ...values) as Promise<Record<string, any>[]>;
}

export async function isPaused(): Promise<boolean> {
  const rows = await sql`SELECT value FROM settings WHERE key = 'paused'`;
  return rows[0]?.value === "true";
}

export async function logEvent(employeeId: number | null, message: string, level: "info" | "warn" | "error" = "info") {
  await sql`INSERT INTO run_logs (employee_id, level, message) VALUES (${employeeId}, ${level}, ${message})`;
}
