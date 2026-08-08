/**
 * Live end-to-end test of the FlarePay settlement loop on Coston2:
 *
 *   createCharge (FTSO-priced)  →  real XRPL payment with the charge's tag
 *   →  FDC XRPPayment attestation  →  escrow.settle(proof)  →  isPaid == true
 *
 * This is the product's acceptance gate. Run:
 *   pnpm --filter @flarekit/contracts test:live
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";
import { FlareKit } from "@flarekit/sdk";
import { getFundedWallet, sendTaggedPayment } from "../../sdk/integration/_xrpl.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const { abi } = JSON.parse(fs.readFileSync(path.resolve(here, "../out/FlarePayEscrow.json"), "utf-8"));
const deployments = JSON.parse(fs.readFileSync(path.resolve(here, "../deployments.json"), "utf-8"));
const { privateKey } = JSON.parse(
  fs.readFileSync(path.resolve(here, "../../../phase0-research/.secrets.json"), "utf-8")
);

const ESCROW_ADDRESS: string = deployments.coston2.FlarePayEscrow;
const EXPLORER = "https://coston2.flarescan.com";

const provider = new JsonRpcProvider("https://coston2-api.flare.network/ext/C/rpc");
const wallet = new Wallet(privateKey, provider);
const escrow = new Contract(ESCROW_ADDRESS, abi, wallet);
const kit = new FlareKit({ network: "coston2", privateKey });

console.log(`FlarePayEscrow ${ESCROW_ADDRESS}`);

/**
 * Send with a gas buffer. FTSOv2's getFeedById is payable/non-view, so its cost
 * can rise between estimation and execution (feed state moves every ~1.8s) —
 * ethers uses the raw estimate as the limit, which then runs out of gas.
 */
async function sendBuffered(method: string, args: unknown[]) {
  const estimate = await escrow[method].estimateGas(...args);
  return escrow[method](...args, { gasLimit: (estimate * 150n) / 100n });
}

// ─── 1. Merchant opens a $2.00 charge ────────────────────────────────
const payer = await getFundedWallet("payer");
const merchant = await getFundedWallet("merchant");
const merchantHash = keccak256(toUtf8Bytes(merchant.address));

const usdCents = 200n;
console.log(`\ncreating charge: $${Number(usdCents) / 100} to ${merchant.address}`);
const createTx = await sendBuffered("createCharge", [merchantHash, usdCents, 200 /* 2% tolerance */, 3600, "Demo report"]);
const createReceipt = await createTx.wait();

const created = createReceipt.logs
  .map((log: { topics: string[]; data: string }) => {
    try {
      return escrow.interface.parseLog(log);
    } catch {
      return null;
    }
  })
  .find((parsed: { name: string } | null) => parsed?.name === "ChargeCreated");
if (!created) throw new Error("ChargeCreated event not found");

const chargeId: bigint = created.args.chargeId;
const destinationTag: bigint = created.args.destinationTag;
const quotedDrops: bigint = created.args.quotedDrops;
console.log(`  chargeId ${chargeId}, tag ${destinationTag}, quoted ${Number(quotedDrops) / 1e6} XRP`);
console.log(`  rate pinned: $${Number(created.args.rateValue) / 10 ** Number(created.args.rateDecimals)} / XRP`);
console.log(`  ${EXPLORER}/tx/${createReceipt.hash}`);

// ─── 2. Payer pays it on the XRP Ledger ──────────────────────────────
console.log(`\npayer sends ${Number(quotedDrops) / 1e6} XRP with tag ${destinationTag}`);
const payment = await sendTaggedPayment({
  wallet: payer,
  destination: merchant.address,
  drops: quotedDrops.toString(),
  destinationTag: Number(destinationTag),
});

// ─── 3. Prove it with FDC (proof bound to the escrow) ────────────────
console.log(`\nattesting via FDC XRPPayment…`);
const startedAt = Date.now();
const verification = await kit.fdc.verifyXrpPayment(
  { txId: payment.hash, proofOwner: ESCROW_ADDRESS },
  {
    onProgress: (e) =>
      console.log(
        `  [${String(Math.round(e.elapsedMs / 1000)).padStart(3)}s] ${e.step}` +
          (e.etaSeconds ? ` (eta ~${e.etaSeconds}s)` : "")
      ),
  }
);
if (!verification.verified) throw new Error("FDC verification returned false");

// ─── 4. Settle on-chain ──────────────────────────────────────────────
console.log(`\nsettling charge ${chargeId} on Flare…`);
const settleTx = await sendBuffered("settle", [chargeId, verification.proof]);
const settleReceipt = await settleTx.wait();
const settled = settleReceipt.logs
  .map((log: { topics: string[]; data: string }) => {
    try {
      return escrow.interface.parseLog(log);
    } catch {
      return null;
    }
  })
  .find((parsed: { name: string } | null) => parsed?.name === "ChargeSettled");
if (!settled) throw new Error("ChargeSettled event not emitted");

const totalSeconds = (Date.now() - startedAt) / 1000;
console.log(`  settled tx ${settleReceipt.hash}`);
console.log(`  ${EXPLORER}/tx/${settleReceipt.hash}`);
console.log(`  payer ${settled.args.payerAddress}, ${Number(settled.args.dropsReceived) / 1e6} XRP, round ${settled.args.votingRound}`);

// ─── 5. Assertions ───────────────────────────────────────────────────
const paid = await escrow.isPaid(chargeId);
console.log(`\nisPaid(${chargeId}) = ${paid}`);
if (!paid) throw new Error("charge not marked paid");

// Replay guard: the same proof must not settle anything twice.
let replayBlocked = false;
try {
  await escrow.settle.staticCall(chargeId, verification.proof);
} catch {
  replayBlocked = true;
}
console.log(`replay of the same charge rejected: ${replayBlocked}`);
if (!replayBlocked) throw new Error("replay guard failed");

const outDir = path.resolve(here, "out");
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(
  path.join(outDir, "settle-charge.json"),
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      escrow: ESCROW_ADDRESS,
      chargeId: chargeId.toString(),
      usdCents: usdCents.toString(),
      destinationTag: destinationTag.toString(),
      quotedDrops: quotedDrops.toString(),
      xrplTx: payment.hash,
      payer: payer.address,
      merchant: merchant.address,
      createTx: createReceipt.hash,
      settleTx: settleReceipt.hash,
      votingRound: verification.votingRoundId,
      attestationSeconds: totalSeconds,
    },
    null,
    2
  )
);

console.log("\nsettle-charge integration PASSED ✓");
