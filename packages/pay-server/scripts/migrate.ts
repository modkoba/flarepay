/**
 * Apply supabase/migrations/*.sql to the project's Postgres, in order, once.
 * Usage: SUPABASE_DB_URL=postgres://… pnpm --filter @flarekit/pay-server migrate
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.resolve(here, "../../../supabase/migrations");

const envFile = path.resolve(here, "../.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("SUPABASE_DB_URL missing (Settings → Database → connection string, URI format).");
  process.exit(1);
}

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();

await client.query(`create table if not exists public._flarepay_migrations (
  name text primary key, applied_at timestamptz not null default now()
)`);

const applied = new Set(
  (await client.query("select name from public._flarepay_migrations")).rows.map((r) => r.name)
);

for (const file of fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort()) {
  if (applied.has(file)) {
    console.log(`skip   ${file} (applied)`);
    continue;
  }
  const sql = fs.readFileSync(path.join(migrationsDir, file), "utf-8");
  console.log(`apply  ${file} …`);
  await client.query("begin");
  try {
    await client.query(sql);
    await client.query("insert into public._flarepay_migrations (name) values ($1)", [file]);
    await client.query("commit");
    console.log(`done   ${file}`);
  } catch (err) {
    await client.query("rollback");
    console.error(`FAILED ${file}:`, (err as Error).message);
    process.exit(1);
  }
}

await client.end();
console.log("migrations complete");
