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

/**
 * Parse the connection string by hand into discrete fields.
 * Postgres passwords routinely contain %, &, #, / — all of which make the
 * string an invalid URL, so `connectionString` (which uses `new URL`) throws.
 * Splitting on the LAST '@' also tolerates '@' inside the password.
 */
function parsePostgresUrl(raw: string) {
  const afterScheme = raw.slice(raw.indexOf("://") + 3);
  const at = afterScheme.lastIndexOf("@");
  const credentials = afterScheme.slice(0, at);
  const hostPart = afterScheme.slice(at + 1);
  const colon = credentials.indexOf(":");
  const user = credentials.slice(0, colon);
  const password = credentials.slice(colon + 1);
  const [hostPort, dbAndQuery = "postgres"] = hostPart.split("/");
  const [host, port = "5432"] = hostPort.split(":");
  return { user, password, host, port: Number(port), database: dbAndQuery.split("?")[0] || "postgres" };
}

const direct = parsePostgresUrl(url);

/**
 * Connect, falling back to the IPv4 pooler when needed.
 * Supabase's direct host (db.<ref>.supabase.co) is IPv6-only; on IPv4-only
 * networks it fails with EHOSTUNREACH/ENETUNREACH. Supavisor's pooler is
 * IPv4-reachable but its hostname embeds the project region, so probe for it.
 * `SUPABASE_DB_HOST` / `SUPABASE_DB_USER` skip the probe when set.
 */
async function connect(): Promise<pg.Client> {
  const attempts: { host: string; user: string; port: number; label: string }[] = [];

  if (process.env.SUPABASE_DB_HOST) {
    attempts.push({
      host: process.env.SUPABASE_DB_HOST,
      user: process.env.SUPABASE_DB_USER ?? direct.user,
      port: 5432,
      label: "configured pooler",
    });
  }
  attempts.push({ host: direct.host, user: direct.user, port: direct.port, label: "direct" });

  const ref = direct.host.startsWith("db.") ? direct.host.split(".")[1] : "";
  if (ref) {
    for (const region of [
      "ap-southeast-1", "ap-south-1", "us-east-1", "us-west-1", "eu-central-1",
      "eu-west-2", "ap-northeast-1", "us-east-2", "eu-west-1", "sa-east-1",
    ]) {
      attempts.push({
        host: `aws-0-${region}.pooler.supabase.com`,
        user: `postgres.${ref}`,
        port: 5432, // session mode: DDL and transactions need it
        label: `pooler ${region}`,
      });
    }
  }

  for (const attempt of attempts) {
    const client = new pg.Client({
      host: attempt.host,
      port: attempt.port,
      user: attempt.user,
      password: direct.password,
      database: direct.database,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 8000,
    });
    try {
      await client.connect();
      console.log(`connected via ${attempt.label} — ${attempt.host}:${attempt.port}/${direct.database}`);
      return client;
    } catch (err) {
      console.log(`  ${attempt.label.padEnd(22)} ${(err as Error).message.slice(0, 54)}`);
      try {
        await client.end();
      } catch {
        /* already closed */
      }
    }
  }
  throw new Error("could not reach the database on any host");
}

const client = await connect();

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
