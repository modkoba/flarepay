/**
 * Live test: FDC XRPPayment lifecycle on Coston2 for a payment WE send, with a
 * destination tag — the exact primitive FlarePay settles on.
 *
 * Sends a real tagged XRPL testnet payment, attests it, and verifies the proof
 * on-chain, asserting the tag and amount survive the round trip.
 *
 * Run: npx tsx integration/verify-xrp-payment.ts
 */

import { liveKit, saveResult } from "./_setup.js";
import { getFundedWallet, sendTaggedPayment } from "./_xrpl.js";

const kit = liveKit();
const signer = await kit.getSigner("integration test");
const proofOwner = await signer.getAddress();

// A charge tag the way FlarePay would allocate one, plus a self-payment so the
// test needs no counterparty.
const destinationTag = Math.floor(Math.random() * 1_000_000);
const drops = 1_500_000; // 1.5 XRP

// Two wallets: XRPL rejects self-payments (temREDUNDANT), and payer→merchant
// is the shape FlarePay actually settles.
const payer = await getFundedWallet("payer");
const merchant = await getFundedWallet("merchant");

console.log(`\nsending ${drops / 1e6} XRP payer→merchant with destinationTag=${destinationTag}`);
const payment = await sendTaggedPayment({
  wallet: payer,
  destination: merchant.address,
  drops,
  destinationTag,
  memo: "flarepay-integration",
});

console.log(`\nattesting ${payment.hash} via FDC XRPPayment (proofOwner ${proofOwner})\n`);
const startedAt = Date.now();
const result = await kit.fdc.verifyXrpPayment(
  { txId: payment.hash, proofOwner },
  {
    onProgress: (e) =>
      console.log(
        `  [${String(Math.round(e.elapsedMs / 1000)).padStart(3)}s] ${e.step}` +
          (e.etaSeconds ? ` (eta ~${e.etaSeconds}s)` : "")
      ),
  }
);

const totalSeconds = (Date.now() - startedAt) / 1000;
const body = result.response;
console.log(`\nverified: ${result.verified}`);
console.log(`sourceAddress: ${body.sourceAddress}`);
console.log(`destinationTag: ${body.destinationTag} (hasTag=${body.hasDestinationTag})`);
console.log(`receivedAmount: ${body.receivedAmount} drops`);
console.log(`memo: ${body.hasMemoData ? Buffer.from(body.firstMemoData.slice(2), "hex").toString() : "(none)"}`);
console.log(`status: ${body.status} (0 = success)`);
console.log(`round: ${result.votingRoundId} tx: ${result.requestTxHash}`);
console.log(`total: ${totalSeconds.toFixed(1)}s`);

// These assertions are the FlarePay settlement conditions, off-chain.
if (!result.verified) throw new Error("on-chain verification returned false");
if (body.status !== 0n) throw new Error(`payment status ${body.status}, expected 0`);
if (!body.hasDestinationTag) throw new Error("destination tag missing from proof");
if (body.destinationTag !== BigInt(destinationTag)) {
  throw new Error(`tag mismatch: proof ${body.destinationTag} vs sent ${destinationTag}`);
}
if (body.receivedAmount !== BigInt(drops)) {
  throw new Error(`amount mismatch: proof ${body.receivedAmount} vs sent ${drops}`);
}
if (body.sourceAddress !== payer.address) {
  throw new Error(`source mismatch: proof ${body.sourceAddress} vs sender ${payer.address}`);
}

// The escrow will match on this hash, so prove it is derivable off-chain.
const { keccak256, toUtf8Bytes } = await import("ethers");
const merchantHash = keccak256(toUtf8Bytes(merchant.address));
console.log(`receivingAddressHash matches keccak256(merchant r-address): ${merchantHash === body.receivingAddressHash}`);

saveResult("verify-xrp-payment", {
  xrplTx: payment.hash,
  destinationTag,
  drops,
  payer: payer.address,
  merchant: merchant.address,
  merchantHashMatches: merchantHash === body.receivingAddressHash,
  proofOwner,
  totalSeconds,
  result,
});
console.log("\nverify-xrp-payment integration PASSED ✓");
