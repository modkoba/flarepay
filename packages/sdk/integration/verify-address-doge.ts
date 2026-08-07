/**
 * Live test: full FDC AddressValidity lifecycle for DOGE on Coston2 (~2-3 min).
 *
 * Proves the complete DOGE chain path (verifier → hub → round → proof →
 * on-chain verify). DOGE Payment shares this exact pipeline but needs a
 * Dogecoin *testnet* tx id, and no public testnet explorer exists to source
 * one — the Payment route itself is confirmed up (probe: "TRANSACTION DOES
 * NOT EXIST" for a dummy id, 2026-08-07).
 *
 * Run: npx tsx integration/verify-address-doge.ts
 */

import { getBytes, hexlify, sha256 } from "ethers";
import { liveKit, saveResult } from "./_setup.js";

// Deterministic, checksum-valid Dogecoin *testnet* P2PKH address
// (version 0x71 + 20-byte hash160 + double-sha256 checksum, base58).
function dogeTestnetAddress(hash160: Uint8Array): string {
  const payload = new Uint8Array([0x71, ...hash160]);
  const checksum = getBytes(sha256(sha256(hexlify(payload)))).slice(0, 4);
  return base58(new Uint8Array([...payload, ...checksum]));
}

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes: Uint8Array): string {
  let value = BigInt(hexlify(bytes));
  let out = "";
  while (value > 0n) {
    out = ALPHABET[Number(value % 58n)] + out;
    value /= 58n;
  }
  for (const byte of bytes) {
    if (byte !== 0) break;
    out = "1" + out;
  }
  return out;
}

const kit = liveKit();
const address = dogeTestnetAddress(new Uint8Array(20).fill(7));
console.log(`verifying DOGE testnet address validity: ${address}\n`);

const startedAt = Date.now();
const result = await kit.fdc.verifyAddress(
  { chain: "DOGE", address },
  {
    onProgress: (e) =>
      console.log(
        `  [${String(Math.round(e.elapsedMs / 1000)).padStart(3)}s] ${e.step}` +
          (e.etaSeconds ? ` (eta ~${e.etaSeconds}s)` : "")
      ),
  }
);

const totalSeconds = (Date.now() - startedAt) / 1000;
console.log(`\nverified: ${result.verified}`);
console.log(`isValid: ${result.response.isValid} standardAddress: ${result.response.standardAddress}`);
console.log(`round: ${result.votingRoundId} fee: ${result.feePaidWei} wei tx: ${result.requestTxHash}`);
console.log(`total: ${totalSeconds.toFixed(1)}s`);

if (!result.verified) throw new Error("on-chain verification returned false");
if (!result.response.isValid) throw new Error("checksum-valid DOGE address reported invalid");

saveResult("verify-address-doge", { address, totalSeconds, result });
console.log("\nverify-address-doge integration PASSED ✓");
