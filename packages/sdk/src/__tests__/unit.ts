/**
 * FlareKit SDK — unit tests (pure logic; live-chain behavior is covered by
 * integration/ which is the real acceptance gate per PRD §12).
 * Run: npx tsx src/__tests__/unit.ts
 */

import { id as keccakId, Interface, ParamType } from "ethers";
import { resultToPlain } from "../fdc.js";
import { feedId, normalizeTxId, pad32Utf8 } from "../encoding.js";
import { FDC_HUB_ABI, FDC_FEE_CONFIG_ABI, RELAY_ABI, FDC_VERIFICATION_ABI, RESPONSE_TUPLES } from "../abis.js";
import { COSTON2, getNetwork } from "../networks.js";
import { ConfigError, FlareKitError, RoundTimeoutError, WalletRequiredError } from "../errors.js";
import { FlareKit } from "../kit.js";
import { AbiCoder } from "ethers";

let failures = 0;
function assert(condition: boolean, message: string): void {
  if (!condition) {
    failures += 1;
    console.error(`  ✗ ${message}`);
  } else {
    console.log(`  ✓ ${message}`);
  }
}

async function assertThrows(fn: () => unknown | Promise<unknown>, type: new (...a: never[]) => Error, message: string) {
  try {
    await fn();
    failures += 1;
    console.error(`  ✗ ${message} (did not throw)`);
  } catch (err) {
    assert(err instanceof type, `${message} (threw ${(err as Error).constructor.name})`);
  }
}

async function main() {
  console.log("\n— encoding —");
  assert(
    pad32Utf8("Payment") === "0x5061796d656e7400000000000000000000000000000000000000000000000000",
    "pad32Utf8 right-pads (Payment)"
  );
  assert(
    pad32Utf8("AddressValidity") ===
      "0x" + Buffer.from("AddressValidity").toString("hex").padEnd(64, "0"),
    "pad32Utf8 matches phase0-verified encoding"
  );
  assert(
    feedId("BTC/USD") === "0x01" + Buffer.from("BTC/USD").toString("hex").padEnd(40, "0"),
    "feedId is bytes21: category 01 + right-padded symbol"
  );
  assert(feedId("BTC/USD").length === 2 + 42, "feedId is exactly 21 bytes");
  assert(
    normalizeTxId("4914BDE0071B48BA8E00A4C8CCD66225552F90038DE0CCEE82FD62EF99E788AA") ===
      "0x4914bde0071b48ba8e00a4c8ccd66225552f90038de0ccee82fd62ef99e788aa",
    "normalizeTxId lowercases and 0x-prefixes XRPL hashes"
  );
  await assertThrows(() => normalizeTxId("0xabc"), ConfigError, "normalizeTxId rejects short hashes");
  await assertThrows(() => feedId("THIS/SYMBOL/IS/FAR/TOO/LONG"), ConfigError, "feedId rejects oversized symbols");

  console.log("\n— ABIs derive the selectors verified on-chain in phase0 —");
  // Phase 0 proved these signatures against live Coston2 contracts. Deriving
  // selectors from the ABI (not hardcoding) is product principle 6.
  assert(
    new Interface(FDC_HUB_ABI).getFunction("requestAttestation")!.selector ===
      keccakId("requestAttestation(bytes)").slice(0, 10),
    "requestAttestation selector derived from ABI"
  );
  assert(
    new Interface(FDC_FEE_CONFIG_ABI).getFunction("getRequestFee")!.selector === "0x0a0f2476",
    "getRequestFee(bytes) selector matches keccak"
  );
  assert(
    new Interface(RELAY_ABI).getFunction("isFinalized")!.selector === "0x317ad33c",
    "isFinalized(uint256,uint256) selector matches keccak"
  );
  const verifyIface = new Interface(FDC_VERIFICATION_ABI);
  assert(verifyIface.getFunction("verifyAddressValidity") !== null, "verifyAddressValidity parses");
  assert(verifyIface.getFunction("verifyPayment") !== null, "verifyPayment parses");
  assert(verifyIface.getFunction("verifyEVMTransaction") !== null, "verifyEVMTransaction parses");

  console.log("\n— EVMTransaction tuple round-trip —");
  const evmSample = [
    pad32Utf8("EVMTransaction"),
    pad32Utf8("testETH"),
    1418250n,
    0n,
    ["0x" + "22".repeat(32), 1n, true, true, [0n, 3n]],
    [
      9000000n, 1786000000n, "0x" + "aa".repeat(20), false, "0x" + "bb".repeat(20),
      123456789n, "0xdeadbeef", 1n,
      [[0n, "0x" + "cc".repeat(20), ["0x" + "dd".repeat(32)], "0x1234", false]],
    ],
  ];
  const evmEncoded = AbiCoder.defaultAbiCoder().encode([RESPONSE_TUPLES.EVMTransaction], [evmSample]);
  const evmDecoded = AbiCoder.defaultAbiCoder().decode([RESPONSE_TUPLES.EVMTransaction], evmEncoded)[0];
  assert(evmDecoded.responseBody.value === 123456789n, "EVMTransaction value survives round-trip");
  assert(evmDecoded.responseBody.events.length === 1, "EVMTransaction events decode");
  assert(evmDecoded.responseBody.events[0].topics[0] === "0x" + "dd".repeat(32), "event topics decode");

  // Regression: empty decoded arrays must become [], not {} — a {} here made
  // ethers re-encoding fail with "invalid array value" (caught live, Sepolia).
  const evmEmpty = [
    pad32Utf8("EVMTransaction"), pad32Utf8("testETH"), 1n, 0n,
    ["0x" + "22".repeat(32), 1n, false, false, []],
    [1n, 1n, "0x" + "aa".repeat(20), false, "0x" + "bb".repeat(20), 0n, "0x", 1n, []],
  ];
  const emptyType = ParamType.from(RESPONSE_TUPLES.EVMTransaction);
  const emptyDecoded = AbiCoder.defaultAbiCoder().decode(
    [RESPONSE_TUPLES.EVMTransaction],
    AbiCoder.defaultAbiCoder().encode([RESPONSE_TUPLES.EVMTransaction], [evmEmpty])
  )[0];
  const plain = resultToPlain(emptyDecoded, emptyType) as {
    requestBody: { logIndices: unknown };
    responseBody: { events: unknown };
  };
  assert(Array.isArray(plain.responseBody.events) && (plain.responseBody.events as unknown[]).length === 0,
    "empty events → [] not {}");
  assert(Array.isArray(plain.requestBody.logIndices), "empty logIndices → [] not {}");
  const reencoded = AbiCoder.defaultAbiCoder().encode(
    [RESPONSE_TUPLES.EVMTransaction],
    [Object.values(plain as unknown as Record<string, unknown>).length ? plain : evmEmpty] as never
  );
  assert(reencoded.length > 2, "plain object re-encodes without 'invalid array value'");

  console.log("\n— response decode round-trip —");
  const coder = AbiCoder.defaultAbiCoder();
  const sample = [
    pad32Utf8("AddressValidity"),
    pad32Utf8("testXRP"),
    1406877n,
    0n,
    ["rN7n47y6fG6a8g1yHdUXLHpwyzfj9FmZKj"],
    [true, "rN7n47y6fG6a8g1yHdUXLHpwyzfj9FmZKj", "0x" + "ab".repeat(32)],
  ];
  const encoded = coder.encode([RESPONSE_TUPLES.AddressValidity], [sample]);
  const decoded = coder.decode([RESPONSE_TUPLES.AddressValidity], encoded)[0];
  assert(decoded.responseBody.isValid === true, "AddressValidity tuple round-trips");
  assert(decoded.votingRound === 1406877n, "votingRound survives round-trip");

  console.log("\n— networks —");
  assert(COSTON2.chainId === 114, "Coston2 chainId");
  assert(getNetwork("COSTON2").name === "coston2", "getNetwork is case-insensitive");
  await assertThrows(() => getNetwork("sepolia"), ConfigError, "getNetwork rejects unknown networks");

  console.log("\n— errors & wallet gating —");
  const timeout = new RoundTimeoutError(123, 300_000);
  assert(timeout.retryable && timeout.code === "ROUND_TIMEOUT" && timeout.fix.length > 0, "errors carry code/retryable/fix");
  assert(timeout instanceof FlareKitError, "errors extend FlareKitError");
  const readOnlyKit = new FlareKit({ network: "coston2" });
  await assertThrows(() => readOnlyKit.getSigner("test"), WalletRequiredError, "wallet-less kit refuses to sign");
  assert(readOnlyKit.fdc !== undefined && readOnlyKit.ftso !== undefined, "read-only kit constructs fine");

  if (failures > 0) {
    console.error(`\n${failures} test(s) FAILED\n`);
    process.exit(1);
  }
  console.log("\nAll unit tests passed ✓\n");
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});
