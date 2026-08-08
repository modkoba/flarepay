/**
 * FlarePay HTTP server — multi-merchant platform edition.
 *
 * Two boot modes, decided by env:
 *  - PLATFORM (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY set): Supabase Auth
 *    (GoTrue JWTs from the dashboard) + per-account fpk_ API keys, Postgres
 *    persistence, tenant-scoped everything, seeded demo account.
 *  - LOCAL (no keys): the original single-tenant JSON store — nothing that was
 *    proven before Supabase existed stops working.
 *
 * Node's built-in http only. Run: pnpm --filter @flarekit/pay-server start
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { FlarePay, type ChargeView, type Persistence } from "./flarepay.js";
import { Store, LocalPersistence } from "./store.js";
import { Db, safeEqual, sha256 } from "./db.js";
import { payDemoCharge } from "./demo-payer.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

// Load .env (KEY=VALUE lines) without a dependency.
const envFile = path.resolve(here, "../.env");
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf-8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim();
  }
}

const deployments = readJson(path.join(repoRoot, "packages/contracts/deployments.json"));
const escrowArtifact = readJson(path.join(repoRoot, "packages/contracts/out/FlarePayEscrow.json"));
const { privateKey } = readJson(path.join(repoRoot, "phase0-research/.secrets.json"));
const xrplWallets = readJson(path.join(repoRoot, "phase0-research/.xrpl-testnet.json"));

const PORT = Number(process.env.PORT ?? 8787);
const SUPABASE_URL = process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const PLATFORM = Boolean(SUPABASE_URL && SERVICE_KEY);
const VERIFIER_URL = "https://fdc-verifiers-testnet.flare.network";
const VERIFIER_KEY = "00000000-0000-0000-0000-000000000000";

const db = PLATFORM ? new Db(SUPABASE_URL, SERVICE_KEY) : null;
const localStore = PLATFORM ? null : new Store(path.resolve(here, "../data/flarepay.json"));
const persistence: Persistence = PLATFORM ? (db as unknown as Persistence) : new LocalPersistence(localStore!);

const flarePay = new FlarePay(
  {
    rpcUrl: "https://coston2-api.flare.network/ext/C/rpc",
    privateKey,
    escrowAddress: deployments.coston2.FlarePayEscrow,
    escrowAbi: escrowArtifact.abi,
    merchantXrplAddress: xrplWallets.merchant.address,
    xrplWss: "wss://s.altnet.rippletest.net:51233",
    explorerUrl: "https://coston2.flarescan.com",
  },
  persistence
);

let demoAccountId = "local";

/** The digital good behind the paywall — the thing a charge unlocks. */
const PROTECTED_RESOURCE = {
  title: "XRP Market Intelligence — August 2026",
  body: "Settled cross-chain: this content was released by an on-chain proof that a native XRP payment reached the merchant. No processor, no custody, no chargebacks.",
  generatedAt: new Date().toISOString(),
};

// ─── helpers ──────────────────────────────────────────────────────────
function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const payload = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Payment, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    ...headers,
  });
  res.end(payload);
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  if (chunks.length === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    return {};
  }
}

/** Resolve the caller: Supabase JWT (dashboard) or fpk_ API key (programmatic). */
async function authenticate(req: IncomingMessage): Promise<{ id: string; email: string } | null> {
  const header = req.headers.authorization ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;

  if (PLATFORM) {
    if (token.startsWith("fpk_")) return db!.accountFromApiKey(token);
    return db!.accountFromToken(token);
  }
  // Local mode: the legacy single API key grants the implicit local account.
  return safeEqual(token, localStore!.apiKey) ? { id: "local", email: "local@flarepay" } : null;
}

/** Free, instant XRPL address validation via the FDC verifier (no attestation fee). */
async function validateXrplAddress(address: string): Promise<boolean> {
  const pad32 = (text: string) => "0x" + Buffer.from(text, "utf8").toString("hex").padEnd(64, "0");
  try {
    const res = await fetch(`${VERIFIER_URL}/verifier/xrp/AddressValidity/prepareResponse`, {
      method: "POST",
      headers: { "X-API-KEY": VERIFIER_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        attestationType: pad32("AddressValidity"),
        sourceId: pad32("testXRP"),
        requestBody: { addressStr: address },
      }),
      signal: AbortSignal.timeout(8000),
    });
    const data = (await res.json()) as { response?: { responseBody?: { isValid?: boolean } } };
    return data.response?.responseBody?.isValid === true;
  } catch {
    // Verifier down → fall back to a shape check so signup isn't blocked.
    return /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address);
  }
}

/** Tiny per-IP token bucket for auth-adjacent and charge-creating routes. */
const buckets = new Map<string, { tokens: number; refilled: number }>();
function rateLimited(req: IncomingMessage, cost = 1, capacity = 20): boolean {
  const ip = req.socket.remoteAddress ?? "?";
  const now = Date.now();
  const bucket = buckets.get(ip) ?? { tokens: capacity, refilled: now };
  bucket.tokens = Math.min(capacity, bucket.tokens + ((now - bucket.refilled) / 60_000) * capacity);
  bucket.refilled = now;
  if (bucket.tokens < cost) return true;
  bucket.tokens -= cost;
  buckets.set(ip, bucket);
  return false;
}

async function merchantAddressFor(accountId: string): Promise<string> {
  if (!PLATFORM || accountId === demoAccountId) return xrplWallets.merchant.address;
  const payout = await db!.getPayout(accountId, "XRP");
  if (!payout) throw new Error("no XRP payout address configured — set one in the dashboard first");
  return payout.value;
}

// ─── server ───────────────────────────────────────────────────────────
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const route = `${req.method} ${url.pathname}`;

  try {
    if (req.method === "OPTIONS") return send(res, 204, {});

    // ── Public: checkout API ────────────────────────────────────────
    if (route === "POST /api/charges") {
      if (rateLimited(req, 4)) return send(res, 429, { error: "slow down" });
      const body = await readBody(req);
      const usdCents = Number(body.usdCents ?? 200);
      const metadata = String(body.metadata ?? PROTECTED_RESOURCE.title);
      const charge = await flarePay.createCharge(usdCents, metadata, { accountId: demoAccountId });
      void flarePay.awaitAndSettle(charge.id);
      return send(res, 201, charge);
    }

    if (route.startsWith("GET /api/charges/")) {
      const id = url.pathname.split("/").pop()!;
      const charge = flarePay.get(id);
      return charge ? send(res, 200, charge) : send(res, 404, { error: "unknown charge" });
    }

    /** Demo convenience: pay a charge from our funded testnet payer wallet. */
    if (route.startsWith("POST /api/charges/") && url.pathname.endsWith("/demo-pay")) {
      if (rateLimited(req, 4)) return send(res, 429, { error: "slow down" });
      const id = url.pathname.split("/")[3];
      const charge = flarePay.get(id);
      if (!charge) return send(res, 404, { error: "unknown charge" });
      const hash = await payDemoCharge(charge);
      return send(res, 202, { xrplTxHash: hash });
    }

    // ── Public: x402 ────────────────────────────────────────────────
    if (route === "GET /api/report") {
      const paymentHeader = req.headers["x-payment"];
      if (!paymentHeader) {
        const reusable = flarePay
          .list(demoAccountId)
          .find((c) => c.state === "awaiting_payment" && c.expiresAt * 1000 > Date.now() + 60_000);
        const charge =
          reusable ?? (await flarePay.createCharge(200, "x402: market report", { accountId: demoAccountId }));
        if (!reusable) void flarePay.awaitAndSettle(charge.id);
        return send(
          res,
          402,
          {
            error: "Payment Required",
            accepts: [
              {
                scheme: "xrpl-payment",
                network: "xrpl-testnet",
                payTo: charge.merchantAddress,
                destinationTag: charge.destinationTag,
                amount: charge.xrpAmount,
                asset: "XRP",
                chargeId: charge.id,
                settlement: "flare-fdc-xrppayment",
              },
            ],
            hint: `Pay, then retry with header: X-Payment: ${charge.id}`,
          },
          { "X-Charge-Id": charge.id }
        );
      }

      const charge = flarePay.get(String(paymentHeader));
      if (!charge) return send(res, 402, { error: "unknown charge in X-Payment" });
      if (charge.state !== "paid") {
        return send(res, 402, { error: "payment not settled yet", state: charge.state, steps: charge.steps.slice(-3) });
      }
      return send(res, 200, {
        ...PROTECTED_RESOURCE,
        settlement: {
          chargeId: charge.id,
          xrplTx: charge.xrplTxHash,
          votingRound: charge.votingRound,
          settleTx: charge.settleTx,
        },
      });
    }

    // ── Public: telemetry ───────────────────────────────────────────
    if (route === "GET /api/rate") return send(res, 200, await flarePay.rate());

    if (route === "GET /api/health") {
      return send(res, 200, {
        ok: true,
        mode: PLATFORM ? "platform" : "local",
        escrow: deployments.coston2.FlarePayEscrow,
        charges: flarePay.list().length,
      });
    }

    // ── Authenticated: account + admin ──────────────────────────────
    if (url.pathname.startsWith("/api/me") || url.pathname.startsWith("/api/admin/")) {
      if (rateLimited(req)) return send(res, 429, { error: "slow down" });
      const account = await authenticate(req);
      if (!account) return send(res, 401, { error: "sign in (dashboard) or pass a valid fpk_ API key" });

      // account info + payout + keys
      if (route === "GET /api/me") {
        const payout = PLATFORM ? await db!.getPayout(account.id, "XRP") : { value: xrplWallets.merchant.address, validatedAt: null };
        const keys = PLATFORM ? await db!.listApiKeys(account.id) : [{ label: "local", createdAt: "", lastUsedAt: null }];
        return send(res, 200, { account, payout, keys, mode: PLATFORM ? "platform" : "local" });
      }

      if (route === "PUT /api/me/payout") {
        if (!PLATFORM) return send(res, 400, { error: "local mode uses the built-in merchant wallet" });
        const body = await readBody(req);
        const address = String(body.address ?? "").trim();
        const valid = await validateXrplAddress(address);
        if (!valid) return send(res, 400, { error: "address rejected by the Flare verifier" });
        await db!.setPayout(account.id, "XRP", address, true);
        return send(res, 200, { payout: { value: address, validatedAt: new Date().toISOString() } });
      }

      if (route === "POST /api/me/apikey") {
        if (!PLATFORM) return send(res, 400, { error: "local mode has a single key (server log)" });
        const key = await db!.createApiKey(account.id);
        return send(res, 201, { apiKey: key, note: "shown once — store it now" });
      }

      if (route === "DELETE /api/me/apikey") {
        if (!PLATFORM) return send(res, 400, { error: "local mode key is fixed" });
        await db!.revokeApiKeys(account.id);
        return send(res, 200, { revoked: true });
      }

      if (route === "GET /api/admin/overview") {
        const [events, deliveries, webhook] = PLATFORM
          ? await Promise.all([
              db!.listEvents(account.id),
              db!.listWebhookDeliveries(account.id),
              db!.getWebhook(account.id),
            ])
          : [
              [...localStore!.events].reverse().slice(0, 40),
              [...localStore!.webhookDeliveries].reverse().slice(0, 10),
              localStore!.webhook ?? null,
            ];
        return send(res, 200, {
          account,
          stats: flarePay.stats(account.id),
          charges: flarePay.list(account.id),
          events,
          webhook: webhook ? { url: webhook.url, secret: webhook.secret } : null,
          webhookDeliveries: deliveries,
          escrow: deployments.coston2.FlarePayEscrow,
          network: "coston2",
          mode: PLATFORM ? "platform" : "local",
        });
      }

      if (route === "POST /api/admin/charges") {
        const body = await readBody(req);
        const usdCents = Math.round(Number(body.usd ?? 0) * 100) || Number(body.usdCents ?? 0);
        if (!usdCents || usdCents < 1) return send(res, 400, { error: "usd amount required" });
        const merchantXrplAddress = await merchantAddressFor(account.id);
        const charge = await flarePay.createCharge(usdCents, String(body.metadata ?? "Charge"), {
          accountId: account.id,
          merchantXrplAddress,
        });
        void flarePay.awaitAndSettle(charge.id);
        return send(res, 201, charge);
      }

      if (route === "PUT /api/admin/webhook") {
        const body = await readBody(req);
        const urlValue = String(body.url ?? "");
        const webhook = PLATFORM ? await db!.setWebhook(account.id, urlValue) : localStore!.setWebhookUrl(urlValue);
        return send(res, 200, { webhook: webhook ?? null });
      }

      if (route === "POST /api/admin/webhook-test") {
        const sample = flarePay.list(account.id)[0];
        if (!sample) return send(res, 400, { error: "create a charge first" });
        await flarePay.deliverWebhook("webhook.test", sample);
        const log = PLATFORM ? await db!.listWebhookDeliveries(account.id, 3) : [...localStore!.webhookDeliveries].reverse().slice(0, 3);
        return send(res, 200, { delivered: true, log });
      }

      return send(res, 404, { error: `no route for ${route}` });
    }

    return send(res, 404, { error: `no route for ${route}` });
  } catch (err) {
    console.error(`${route} failed:`, err);
    return send(res, 500, { error: (err as Error).message });
  }
});

// ─── boot ─────────────────────────────────────────────────────────────
async function boot() {
  if (PLATFORM) {
    // Seed the demo account (idempotent) so judges can sign in instantly.
    const email = process.env.DEMO_EMAIL ?? "demo@flarepay.dev";
    const password = process.env.DEMO_PASSWORD ?? "flarepay-demo-2026";
    const { data: users } = await db!.supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    let demoUser = users?.users.find((u) => u.email === email);
    if (!demoUser) {
      const { data, error } = await db!.supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (error) throw new Error(`demo account seed failed: ${error.message}`);
      demoUser = data.user!;
      console.log(`  seeded demo account ${email}`);
    }
    demoAccountId = demoUser.id;
    await db!.setPayout(demoAccountId, "XRP", xrplWallets.merchant.address, true);

    const charges = await db!.loadAllCharges();
    flarePay.hydrate(charges.values());
    console.log(`  hydrated ${charges.size} charge(s) from Supabase`);
  } else {
    const charges = Object.entries(localStore!.loadCharges<ChargeView>()).map(([id, c]) => ({
      ...c,
      id,
      accountId: "local",
    }));
    flarePay.hydrate(charges);
  }

  server.listen(PORT, () => {
    console.log(`FlarePay server on http://localhost:${PORT}  [${PLATFORM ? "PLATFORM (Supabase)" : "LOCAL"} mode]`);
    console.log(`  escrow    ${deployments.coston2.FlarePayEscrow}`);
    if (!PLATFORM) console.log(`  API key   ${localStore!.apiKey}`);
    if (PLATFORM) console.log(`  demo login  ${process.env.DEMO_EMAIL ?? "demo@flarepay.dev"} / ${process.env.DEMO_PASSWORD ?? "flarepay-demo-2026"}`);
    const recovered = flarePay.recover();
    if (recovered > 0) console.log(`  recovered ${recovered} in-flight charge(s) after restart`);
  });
}

void boot().catch((err) => {
  console.error("boot failed:", err);
  process.exit(1);
});

export type { ChargeView };
