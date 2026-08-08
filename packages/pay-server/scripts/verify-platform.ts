/**
 * Live platform verification: signup → login → payout validation → API keys →
 * charge creation → two-account isolation.
 *
 * Run against a booted PLATFORM-mode server:
 *   npx tsx scripts/verify-platform.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const here = path.dirname(fileURLToPath(import.meta.url));
const env = fs.readFileSync(path.resolve(here, "../.env"), "utf-8");
const value = (name: string) => {
  const line = env.split("\n").find((l) => l.startsWith(`${name}=`));
  return line ? line.slice(name.length + 1).trim() : "";
};

const SUPABASE_URL = value("NEXT_PUBLIC_SUPABASE_URL") || value("SUPABASE_URL");
const PUBLISHABLE = value("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY");
const SECRET = value("SUPABASE_SECRET_KEY");
const API = "http://localhost:8787";

const anon = createClient(SUPABASE_URL, PUBLISHABLE, { auth: { persistSession: false } });
const admin = createClient(SUPABASE_URL, SECRET, { auth: { persistSession: false } });

let failures = 0;
function check(condition: boolean, label: string, detail = "") {
  console.log(`  ${condition ? "✓" : "✗"} ${label}${detail ? ` — ${detail}` : ""}`);
  if (!condition) failures++;
}

async function api(pathname: string, token: string, init: RequestInit = {}) {
  const res = await fetch(`${API}${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init.headers },
  });
  return { status: res.status, body: (await res.json()) as Record<string, never> };
}

/** Create a confirmed user (bypasses the email-confirmation setting) + sign in. */
async function makeMerchant(email: string, password: string) {
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error && !error.message.includes("already")) throw error;
  const { data: session, error: signInError } = await anon.auth.signInWithPassword({ email, password });
  if (signInError) throw signInError;
  return { id: created?.user?.id ?? session.user!.id, token: session.session!.access_token };
}

console.log("\n1. Signup exactly as the browser does (POST /api/auth/signup → sign in)");
const selfEmail = `merchant-${Date.now()}@flarepay.dev`;
const password = "flarepay-test-2026";
const signupRes = await fetch(`${API}/api/auth/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: selfEmail, password }),
});
check(signupRes.status === 201, "signup accepted", `HTTP ${signupRes.status}`);

const { data: firstLogin, error: firstLoginError } = await anon.auth.signInWithPassword({ email: selfEmail, password });
check(!firstLoginError && Boolean(firstLogin?.session), "can sign in immediately (no email confirmation)", firstLoginError?.message ?? "session issued");

const dupe = await fetch(`${API}/api/auth/signup`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: selfEmail, password }),
});
check(dupe.status === 409, "duplicate signup rejected", `HTTP ${dupe.status}`);

if (firstLogin?.user) {
  const { data: profile } = await admin.from("profiles").select("id, email").eq("id", firstLogin.user.id).maybeSingle();
  check(Boolean(profile), "profiles row auto-created by trigger", profile?.email ?? "missing");
}

const selfMe = await api("/api/me", firstLogin!.session!.access_token);
check(selfMe.status === 200, "new account reaches the API", `HTTP ${selfMe.status}`);

console.log("\n2. Two independent merchants (login + JWT auth)");
const alice = await makeMerchant(`alice-${Date.now()}@flarepay.dev`, "flarepay-alice-2026");
const bob = await makeMerchant(`bob-${Date.now()}@flarepay.dev`, "flarepay-bob-2026");
const aliceMe = await api("/api/me", alice.token);
check(aliceMe.status === 200, "GET /api/me with Supabase JWT", `HTTP ${aliceMe.status}`);
check((aliceMe.body as never as { account: { id: string } }).account.id === alice.id, "JWT resolves to the right account");

console.log("\n3. Payout address validated by the Flare verifier");
const goodAddress = "rBRXicTVkAwqvSt3gNNfYwiEycV7WFK75i"; // real XRPL testnet account
const bad = await api("/api/me/payout", alice.token, {
  method: "PUT",
  body: JSON.stringify({ address: "rNOTAVALIDADDRESS!!!" }),
});
check(bad.status === 400, "invalid address rejected", `HTTP ${bad.status}`);
const good = await api("/api/me/payout", alice.token, {
  method: "PUT",
  body: JSON.stringify({ address: goodAddress }),
});
check(good.status === 200, "valid address accepted + stored", `HTTP ${good.status}`);

console.log("\n4. API keys (programmatic auth)");
const created = await api("/api/me/apikey", alice.token, { method: "POST" });
const apiKey = (created.body as never as { apiKey: string }).apiKey;
check(created.status === 201 && apiKey?.startsWith("fpk_"), "key issued", apiKey ? `${apiKey.slice(0, 12)}…` : "none");
const viaKey = await api("/api/me", apiKey);
check(viaKey.status === 200, "API key authenticates", `HTTP ${viaKey.status}`);
check(
  (viaKey.body as never as { account: { id: string } }).account.id === alice.id,
  "API key resolves to its owner"
);
const forged = await api("/api/me", "fpk_deadbeefdeadbeefdeadbeefdeadbeef");
check(forged.status === 401, "forged key rejected", `HTTP ${forged.status}`);

console.log("\n5. Tenant isolation");
await api("/api/me/payout", bob.token, { method: "PUT", body: JSON.stringify({ address: goodAddress }) });
const aliceCharge = await api("/api/admin/charges", alice.token, {
  method: "POST",
  body: JSON.stringify({ usd: 1.25, metadata: "Alice — isolation test" }),
});
const chargeId = (aliceCharge.body as never as { id: string }).id;
check(aliceCharge.status === 201, "Alice creates a charge on-chain", `charge ${chargeId}`);

const aliceView = await api("/api/admin/overview", alice.token);
const bobView = await api("/api/admin/overview", bob.token);
const aliceIds = (aliceView.body as never as { charges: { id: string }[] }).charges.map((c) => c.id);
const bobIds = (bobView.body as never as { charges: { id: string }[] }).charges.map((c) => c.id);
check(aliceIds.includes(chargeId), "Alice sees her charge", `${aliceIds.length} charge(s)`);
check(!bobIds.includes(chargeId), "Bob cannot see Alice's charge", `${bobIds.length} charge(s)`);
check(
  (bobView.body as never as { stats: { total: number } }).stats.total === bobIds.length,
  "stats are per-account"
);

console.log("\n6. Persistence in Postgres");
const { data: dbCharge } = await admin.from("charges").select("id, account_id, usd_cents").eq("id", chargeId).maybeSingle();
check(Boolean(dbCharge), "charge row in Supabase", dbCharge ? `usd_cents=${dbCharge.usd_cents}` : "missing");
check(dbCharge?.account_id === alice.id, "row scoped to the creating account");

console.log(failures === 0 ? "\nALL PLATFORM CHECKS PASSED ✓\n" : `\n${failures} CHECK(S) FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
