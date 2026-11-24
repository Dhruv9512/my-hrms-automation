// Creates the tables on Neon. Usage: DATABASE_URL=... npm run db:init
import { readFileSync } from "node:fs";
import { Pool } from "@neondatabase/serverless";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Set DATABASE_URL first (e.g. in web/.env.local, then: node --env-file=.env.local scripts/db-init.mjs)");
  process.exit(1);
}
const pool = new Pool({ connectionString: url });
const sql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
await pool.query(sql);
const { rows } = await pool.query(
  "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1"
);
console.log("Tables:", rows.map((r) => r.table_name).join(", "));
await pool.end();
