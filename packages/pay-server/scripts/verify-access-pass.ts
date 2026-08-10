/**
 * Live gate: a native XRP payment changes what an UNRELATED Flare contract
 * will do for you.
 *
 * PremiumVault has no knowledge of payments, XRP, or FlarePay. It only reads
 * XrpAccessPass. Before the payment it reverts; after the proof settles and
 * the pass is claimed, it answers. No server is trusted anywhere in that chain
 * — which is precisely what a database-backed credit balance can never offer.
 *
 *   npx tsx scripts/verify-access-pass.ts
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";
import { Client, Wallet } from "xrpl";
import { FlarePay } from "../src/flarepay.js";
import { Store, LocalPersistence } from "../src/store.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf-8"));

const deployments = readJson(path.join(root, "packages/contracts/deployments.json"));
const escrowArtifact = readJson(path.join(root, "packages/contracts/out/FlarePayEscrow.json"));
const passArtifact = readJson(path.join(root, "packages/contracts/out/XrpAccessPass.json"));
const vaultArtifact = readJson(path.join(root, "packages/contracts/out/PremiumVault.json"));
const { privateKey } = readJson(path.join(root, "phase0-research/.secrets.json"));
const xrplWallets = readJson(path.join(root, "phase0-research/.xrpl-testnet.json"));

const RPC = "https://coston2-api.flare.network/ext/C/rpc";
const XRPL_WSS = "wss://s.altnet.rippletest.net:51233";
const out = path.join(here, "../out");

async function main() {
  fs.mkdirSync(out, { recursive: true });
  const provider = new ethers.JsonRpcProvider(RPC);
  const wallet = new ethers.Wallet(privateKey, provider);

  // A fresh holder nobody has ever granted access to.
  const holder = ethers.Wallet.createRandom();
  console.log(`holder (fresh)  ${holder.address}`);

  const pass = new ethers.Contract(deployments.coston2.XrpAccessPass, passArtifact.abi, wallet);
  const vault = new ethers.Contract(deployments.coston2.PremiumVault, vaultArtifact.abi, wallet);

  const before = await vault.canRead(holder.address);
  console.log(`\n1. PremiumVault.canRead(holder) BEFORE payment: ${before}`);
  if (before) throw new Error("fresh holder already had access");

  // Charge is bound to the holder on-chain, at creation, before any payment.
  const flarePay = new FlarePay(
    {
      rpcUrl: RPC,
      privateKey,
      escrowAddress: deployments.coston2.FlarePayEscrow,
      escrowAbi: escrowArtifact.abi,
      merchantXrplAddress: xrplWallets.merchant.address,
      xrplWss: XRPL_WSS,
      explorerUrl: "https://coston2.flarescan.com",
    },
    new LocalPersistence(new Store(path.join(out, "verify-access-pass.json")))
  );

  const metadata = `pass:${holder.address.toLowerCase()}`;
  const charge = await flarePay.createCharge(100, metadata, { accountId: "gate" });
  console.log(`\n2. charge ${charge.id}: ${charge.xrpAmount} XRP → ${charge.merchantAddress} tag ${charge.destinationTag}`);
  console.log(`   metadata pinned on-chain: ${metadata}`);

  const settlePromise = flarePay.awaitAndSettle(charge.id);

  const client = new Client(XRPL_WSS);
  await client.connect();
  const payer = Wallet.fromSeed(xrplWallets.payer.seed);
  const prepared = await client.autofill({
    TransactionType: "Payment",
    Account: payer.address,
    Destination: charge.merchantAddress,
    Amount: charge.drops,
    DestinationTag: charge.destinationTag,
  } as never);
  const outcome = await client.submitAndWait(payer.sign(prepared).tx_blob);
  await client.disconnect();
  console.log(`\n3. paid on XRPL: ${outcome.result.hash}`);

  console.log(`\n4. waiting for FDC round…`);
  const settled = await settlePromise;
  if (settled.state !== "paid") throw new Error(`charge did not settle: ${settled.state} ${settled.error ?? ""}`);
  console.log(`   settled  round ${settled.votingRound}  tx ${settled.settleTx}`);

  // Permissionless: submitted by us, but the grant can only go to the holder.
  const claimTx = await pass.claim(charge.id, holder.address);
  const claimReceipt = await claimTx.wait();
  console.log(`\n5. claim tx ${claimReceipt.hash}`);

  const after = await vault.canRead(holder.address);
  console.log(`\n6. PremiumVault.canRead(holder) AFTER: ${after}`);
  if (!after) throw new Error("access was not granted");

  // Nobody can redirect the grant, and it cannot be replayed.
  const attacker = ethers.Wallet.createRandom();
  let redirected = false;
  try {
    await pass.claim.staticCall(charge.id, attacker.address);
    redirected = true;
  } catch { /* expected */ }
  console.log(`\n7. redirect grant to an attacker: ${redirected ? "SUCCEEDED (BAD)" : "rejected"}`);

  let replayed = false;
  try {
    await pass.claim.staticCall(charge.id, holder.address);
    replayed = true;
  } catch { /* expected */ }
  console.log(`8. replay the same charge: ${replayed ? "SUCCEEDED (BAD)" : "rejected"}`);

  if (redirected || replayed) throw new Error("guard failed");

  const expiry = await pass.expiresAt(holder.address);
  fs.writeFileSync(path.join(out, "verify-access-pass.result.json"), JSON.stringify({
    holder: holder.address, chargeId: charge.id, xrplTxHash: outcome.result.hash,
    votingRound: settled.votingRound, settleTx: settled.settleTx, claimTx: claimReceipt.hash,
    expiresAt: Number(expiry), pass: deployments.coston2.XrpAccessPass, vault: deployments.coston2.PremiumVault,
  }, null, 2));

  console.log(`\nPASSED — an XRP payment changed what an unrelated Flare contract does.`);
  console.log(`  access until ${new Date(Number(expiry) * 1000).toISOString()}`);
}

main().catch((e) => { console.error("\nFAILED —", (e as Error).message); process.exit(1); });
