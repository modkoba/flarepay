/**
 * FlareKit SDK — Unit tests for encoder and types.
 * Run: npx tsx src/__tests__/unit.ts
 */

import { encodeAttestationType, encodeAddressValidityRequest, SELECTORS } from "../encoder.js";
import { COSTON2 } from "../networks.js";

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`  ✓ ${message}`);
}

async function main() {
  console.log("FlareKit SDK — Unit Tests\n");

  // ─── Attestation type encoding ───────────────────────────────────
  const encoded = encodeAttestationType("AddressValidity");
  assert(encoded.startsWith("0x"), "encoded starts with 0x");
  assert(encoded.length === 66, `encoded is 32 bytes (66 hex chars): got ${encoded.length}`);
  assert(encoded === "0x" + Buffer.from("AddressValidity").toString("hex").padEnd(64, "0"), "correct UTF-8 right-pad");

  // ─── Selectors are 10 chars (0x + 8 hex) ─────────────────────────
  assert(SELECTORS.verifyAddressValidity.startsWith("0x") && SELECTORS.verifyAddressValidity.length === 10,
    "verifyAddressValidity selector format");
  assert(SELECTORS.requestAttestation.startsWith("0x") && SELECTORS.requestAttestation.length === 10,
    "requestAttestation selector format");
  assert(SELECTORS.isFinalized.startsWith("0x") && SELECTORS.isFinalized.length === 10,
    "isFinalized selector format");

  // ─── Network config ──────────────────────────────────────────────
  assert(COSTON2.chainId === 114, "Coston2 chainId is 114");
  assert(COSTON2.contracts.fdcHub.startsWith("0x"), "fdcHub address is valid hex");
  assert(COSTON2.contracts.fdcVerification.startsWith("0x"), "fdcVerification address is valid hex");
  assert(COSTON2.contracts.relay.startsWith("0x"), "relay address is valid hex");
  assert(COSTON2.rpcUrl.includes("flare.network"), "rpcUrl points to Flare");

  // ─── AddressValidity request encoding ────────────────────────────
  const attestationType = encodeAttestationType("AddressValidity");
  const sourceId = "0x" + "00".repeat(32);
  const mic = "0x" + "00".repeat(32);
  const requestEncoded = encodeAddressValidityRequest(attestationType, sourceId, mic, {
    addressStr: "rN7n47y6fG6a8g1yHdUXLHpwyzfj9FmZKj",
  });
  assert(requestEncoded.startsWith("0x"), "encoded request starts with 0x");
  assert(requestEncoded.length > 100, `encoded request has sufficient length: ${requestEncoded.length}`);

  console.log("\nAll unit tests passed ✓\n");
}

main().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
