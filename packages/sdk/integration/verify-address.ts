/**
 * Live test: full FDC AddressValidity lifecycle on Coston2 (~2-3 min, costs testnet FLR).
 * Run: npx tsx integration/verify-address.ts
 */

import { liveKit, saveResult } from "./_setup.js";

const kit = liveKit();
// Real funded XRPL testnet account (source of an observed payment).
// Note: the doc-example address rN7n47y6fG6a8g1yHdUXLHpwyzfj9FmZKj fails
// base58 checksum — FDC provably attests it as INVALID (verified:true,
// isValid:false), which is the protocol working, not an error.
const address = "rGQWGoq3FFG8PJfVgWVigaYuyv6dXpkbn2";

console.log(`verifying XRP address validity: ${address}\n`);
const startedAt = Date.now();

const result = await kit.fdc.verifyAddress(
  { chain: "XRP", address },
  {
    onProgress: (e) =>
      console.log(
        `  [${String(Math.round(e.elapsedMs / 1000)).padStart(3)}s] ${e.step}` +
          (e.etaSeconds ? ` (eta ~${e.etaSeconds}s)` : "") +
          (e.detail ? ` ${JSON.stringify(e.detail).slice(0, 110)}` : "")
      ),
  }
);

const totalSeconds = (Date.now() - startedAt) / 1000;
console.log(`\nverified: ${result.verified}`);
console.log(`isValid: ${result.response.isValid} standardAddress: ${result.response.standardAddress}`);
console.log(`round: ${result.votingRoundId} fee: ${result.feePaidWei} wei tx: ${result.requestTxHash}`);
console.log(`total: ${totalSeconds.toFixed(1)}s`);

if (!result.verified) throw new Error("on-chain verification returned false");
if (!result.response.isValid) throw new Error("verifier says address is invalid — expected valid");

// Proof reuse: a cached proof must verify again without a new attestation.
const again = await kit.fdc.verifyProof(result.proof);
console.log(`cached proof re-verifies: ${again}`);
if (!again) throw new Error("cached proof failed re-verification");

saveResult("verify-address", { address, totalSeconds, result });
console.log("\nverify-address integration PASSED ✓");
