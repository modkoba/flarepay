/**
 * FlarePay HTTP server — checkout API + x402 payment-gated resource.
 *
 * Node's built-in http only: the point is the settlement flow, not a framework.
 * Run: pnpm --filter @flarekit/pay-server start
 */

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { FlarePay, type ChargeView } from "./flarepay.js";
import { payDemoCharge } from "./demo-payer.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");

function readJson(file: string) {
  return JSON.parse(fs.readFileSync(file, "utf-8"));
}

const deployments = readJson(path.join(repoRoot, "packages/contracts/deployments.json"));
const escrowArtifact = readJson(path.join(repoRoot, "packages/contracts/out/FlarePayEscrow.json"));
const { privateKey } = readJson(path.join(repoRoot, "phase0-research/.secrets.json"));
const xrplWallets = readJson(path.join(repoRoot, "phase0-research/.xrpl-testnet.json"));

const PORT = Number(process.env.PORT ?? 8787);
const flarePay = new FlarePay({
  rpcUrl: "https://coston2-api.flare.network/ext/C/rpc",
  privateKey,
  escrowAddress: deployments.coston2.FlarePayEscrow,
  escrowAbi: escrowArtifact.abi,
  merchantXrplAddress: xrplWallets.merchant.address,
  xrplWss: "wss://s.altnet.rippletest.net:51233",
  explorerUrl: "https://coston2.flarescan.com",
});

/** The digital good behind the paywall — the thing a charge unlocks. */
const PROTECTED_RESOURCE = {
  title: "XRP Market Intelligence — August 2026",
  body: "Settled cross-chain: this content was released by an on-chain proof that a native XRP payment reached the merchant. No processor, no custody, no chargebacks.",
  generatedAt: new Date().toISOString(),
};

function send(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  const payload = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, X-Payment",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
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

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const route = `${req.method} ${url.pathname}`;

  try {
    if (req.method === "OPTIONS") return send(res, 204, {});

    // ── Checkout API ────────────────────────────────────────────────
    if (route === "POST /api/charges") {
      const body = await readBody(req);
      const usdCents = Number(body.usdCents ?? 200);
      const metadata = String(body.metadata ?? PROTECTED_RESOURCE.title);
      const charge = await flarePay.createCharge(usdCents, metadata);
      // Watch + settle in the background; the client polls GET /api/charges/:id
      void flarePay.awaitAndSettle(charge.id);
      return send(res, 201, charge);
    }

    if (route.startsWith("GET /api/charges/")) {
      const id = url.pathname.split("/").pop()!;
      const charge = flarePay.get(id);
      return charge ? send(res, 200, charge) : send(res, 404, { error: "unknown charge" });
    }

    if (route === "GET /api/charges") {
      return send(res, 200, flarePay.list());
    }

    /** Demo convenience: pay a charge from our funded testnet payer wallet. */
    if (route.startsWith("POST /api/charges/") && url.pathname.endsWith("/demo-pay")) {
      const id = url.pathname.split("/")[3];
      const charge = flarePay.get(id);
      if (!charge) return send(res, 404, { error: "unknown charge" });
      const hash = await payDemoCharge(charge);
      return send(res, 202, { xrplTxHash: hash });
    }

    // ── x402: HTTP-native payments for APIs and agents ──────────────
    if (route === "GET /api/report") {
      const paymentHeader = req.headers["x-payment"];
      if (!paymentHeader) {
        // Reuse a fresh unpaid quote instead of minting (and paying gas for) a
        // new charge on every unauthenticated poll.
        const reusable = flarePay
          .list()
          .find((c) => c.state === "awaiting_payment" && c.expiresAt * 1000 > Date.now() + 60_000);
        const charge = reusable ?? (await flarePay.createCharge(200, "x402: market report"));
        if (!reusable) void flarePay.awaitAndSettle(charge.id);
        return send(
          res,
          402,
          {
            error: "Payment Required",
            // x402-style requirements, settled by FDC proof rather than an
            // EVM token authorization — so the payer needs only an XRPL wallet.
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
        return send(res, 402, {
          error: "payment not settled yet",
          state: charge.state,
          steps: charge.steps.slice(-3),
        });
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

    if (route === "GET /api/rate") {
      return send(res, 200, await flarePay.rate());
    }

    if (route === "GET /api/health") {
      return send(res, 200, {
        ok: true,
        escrow: deployments.coston2.FlarePayEscrow,
        merchant: xrplWallets.merchant?.address,
        charges: flarePay.list().length,
      });
    }

    return send(res, 404, { error: `no route for ${route}` });
  } catch (err) {
    console.error(`${route} failed:`, err);
    return send(res, 500, { error: (err as Error).message });
  }
});

server.listen(PORT, () => {
  console.log(`FlarePay server on http://localhost:${PORT}`);
  console.log(`  escrow   ${deployments.coston2.FlarePayEscrow}`);
  console.log(`  merchant ${xrplWallets.merchant?.address} (XRPL testnet)`);
});

export type { ChargeView };
