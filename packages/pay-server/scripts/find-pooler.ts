/**
 * Find the IPv4-reachable Supabase pooler for this project.
 *
 * Supabase direct hosts (db.<ref>.supabase.co) are IPv6-only; on IPv4-only
 * networks you must use the Supavisor pooler, whose hostname embeds the
 * project's region. This probes regions and prints the working connection
 * details (never the password).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const here = path.dirname(fileURLToPath(import.meta.url));
const envFile = path.resolve(here, "../.env");
const env = fs.readFileSync(envFile, "utf-8");

function envValue(name: string): string {
  const line = env.split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : "";
}

const dbUrl = envValue("SUPABASE_DB_URL");
const afterScheme = dbUrl.slice(dbUrl.indexOf("://") + 3);
const credentials = afterScheme.slice(0, afterScheme.lastIndexOf("@"));
const password = credentials.slice(credentials.indexOf(":") + 1);
const ref = (envValue("NEXT_PUBLIC_SUPABASE_URL") || envValue("SUPABASE_URL"))
  .replace("https://", "")
  .split(".")[0];

const REGIONS = [
  "ap-south-1", "ap-southeast-1", "us-east-1", "us-west-1", "eu-central-1",
  "eu-west-2", "ap-northeast-1", "us-east-2", "eu-west-1", "sa-east-1",
  "ap-southeast-2", "ca-central-1", "eu-north-1", "us-west-2",
];

console.log(`project ref: ${ref}`);
for (const region of REGIONS) {
  const host = `aws-0-${region}.pooler.supabase.com`;
  const client = new pg.Client({
    host,
    port: 5432, // session mode — required for DDL/transactions
    user: `postgres.${ref}`,
    password,
    database: "postgres",
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 8000,
  });
  try {
    await client.connect();
    const { rows } = await client.query("select current_database() as db");
    console.log(`\nFOUND  region=${region}  host=${host}  db=${rows[0].db}`);
    console.log(`Add to .env:\n  SUPABASE_DB_HOST=${host}\n  SUPABASE_DB_USER=postgres.${ref}`);
    await client.end();
    process.exit(0);
  } catch (err) {
    console.log(`  ${region.padEnd(16)} ${(err as Error).message.slice(0, 58)}`);
    try {
      await client.end();
    } catch {
      /* already closed */
    }
  }
}
console.error("\nNo region matched — check the password in SUPABASE_DB_URL.");
process.exit(1);
