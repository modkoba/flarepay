/**
 * Live gate: a charge paid to a merchant's OWN payout address settles end to end.
 *
 * This is the case the product is actually for and the one that was broken —
 * watchForPayment polled the platform wallet instead of the address the payer was
 * told to pay, so every real merchant's payment went undetected. Anything that
 * watches a hardcoded address will fail here, because the merchant below is a
 * freshly funded XRPL account that the platform has never seen.
 *
 * Costs one FDC attestation fee plus gas, and takes ~3 minutes.
 *
 *   npx tsx scripts/verify-merchant-payout.ts
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Wallet } from "xrpl";
import { FlarePay } from "../src/flarepay.js";
import { Store, LocalPersistence } from "../src/store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../..");
const readJson = (file: string) => JSON.parse(fs.readFileSync(file, "utf-8"));

const deployments = readJson(path.join(repoRoot, "packages/contracts/deployments.json"));
const escrowArtifact = readJson(path.join(repoRoot, "packages/contracts/out/FlarePayEscrow.json"));
const { privateKey } = readJson(path.join(repoRoot, "phase0-research/.secrets.json"));
const xrplWallets = readJson(path.join(repoRoot, "phase0-research/.xrpl-testnet.json"));

const XRPL_WSS = "wss://s.altnet.rippletest.net:51233";
const out = path.join(here, "../out");

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const log: Record<string, unknown> = { startedAt: new Date().toISOString() };

  // 1. A merchant the platform has never seen: fresh, faucet-funded account.
  console.log("funding a fresh merchant account on XRPL testnet…");
  const client = new Client(XRPL_WSS);
  await client.connect();
  const funded = await client.fundWallet();
  const merchant = funded.wallet;
  await client.disconnect();

  if (merchant.address === xrplWallets.merchant.address) throw new Error("faucet returned the platform wallet");
  console.log(`  merchant  ${merchant.address}  (platform wallet is ${xrplWallets.merchant.address})`);
  log.merchantAddress = merchant.address;
  log.platformAddress = xrplWallets.merchant.address;

  // 2. Engine wired exactly as the server wires it.
  const store = new Store(path.join(out, "verify-merchant-payout.json"));
  const flarePay = new FlarePay(
    {
      rpcUrl: "https://coston2-api.flare.network/ext/C/rpc",
      privateKey,
      escrowAddress: deployments.coston2.FlarePayEscrow,
      escrowAbi: escrowArtifact.abi,
      merchantXrplAddress: xrplWallets.merchant.address, // platform default, deliberately NOT the merchant
      xrplWss: XRPL_WSS,
      explorerUrl: "https://coston2.flarescan.com",
    },
    new LocalPersistence(store)
  );

  // 3. Charge payable to the merchant's own address.
  const charge = await flarePay.createCharge(150, "merchant payout gate", {
    accountId: "gate-account",
    merchantXrplAddress: merchant.address,
  });
  console.log(`charge ${charge.id}: ${charge.xrpAmount} XRP → ${charge.merchantAddress} tag ${charge.destinationTag}`);
  if (charge.merchantAddress !== merchant.address) throw new Error("charge was not addressed to the merchant");
  log.chargeId = charge.id;
  log.destinationTag = charge.destinationTag;

  // 4. Pay it from the funded payer wallet, exactly as a customer would.
  const settlePromise = flarePay.awaitAndSettle(charge.id);

  const payClient = new Client(XRPL_WSS);
  await payClient.connect();
  const payer = Wallet.fromSeed(xrplWallets.payer.seed);
  const prepared = await payClient.autofill({
    TransactionType: "Payment",
    Account: payer.address,
    Destination: charge.merchantAddress,
    Amount: charge.drops,
    DestinationTag: charge.destinationTag,
  } as never);
  const outcome = await payClient.submitAndWait(payer.sign(prepared).tx_blob);
  await payClient.disconnect();

  const meta = outcome.result.meta;
  const code = typeof meta === "object" && meta !== null ? (meta as { TransactionResult?: string }).TransactionResult : undefined;
  if (code !== "tesSUCCESS") throw new Error(`XRPL payment failed: ${code}`);
  console.log(`  paid ${outcome.result.hash}`);
  log.xrplTxHash = outcome.result.hash;

  // 5. The watcher must find a payment to an address it was never configured with.
  console.log("waiting for watch → attest → settle (~3 min)…");
  const settled = await settlePromise;

  log.state = settled.state;
  log.votingRound = settled.votingRound;
  log.settleTx = settled.settleTx;
  log.error = settled.error;
  log.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(out, "verify-merchant-payout.json.result"), JSON.stringify(log, null, 2));

  if (settled.state !== "paid") throw new Error(`charge did not settle: ${settled.state} — ${settled.error ?? "no error"}`);

  console.log("\nPASSED — a merchant's own payout address settles end to end");
  console.log(`  round     ${settled.votingRound}`);
  console.log(`  settleTx  ${settled.settleTx}`);
  console.log(`  merchant  ${merchant.address}`);
}

main().catch((err) => {
  console.error("\nFAILED —", (err as Error).message);
  process.exit(1);
});
