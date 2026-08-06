/**
 * FlareKit Phase 0 — Live End-to-End Test
 *
 * Runs the complete FDC XRP AddressValidity verification flow on Coston2 testnet.
 * (Using AddressValidity because BTC testnet4 transactions may not be indexed yet.)
 *
 * Usage: npx tsx scripts/run-phase0-test.ts
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

// ─── CONFIG ───────────────────────────────────────────────────────
const SECRETS = JSON.parse(fs.readFileSync(path.join(process.cwd(), ".secrets.json"), "utf-8"));
const ENV = fs.readFileSync(path.join(process.cwd(), ".env"), "utf-8");
const RPC = ENV.match(/COSTON2_RPC_URL=(.+)/)?.[1] || "https://coston2-api.flare.network/ext/C/rpc";
const PRIVATE_KEY = SECRETS.privateKey;

const ADDRESSES = {
  registry: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
  fdcHub: "0x48aC463d7975828989331F4De43341627b9c5f1D",
  fdcVerification: "0x906507E0B64bcD494Db73bd0459d1C667e14B933",
  relay: "0xa10B672D1c62e5457b17af63d4302add6A99d7dE",
  feeConfig: "0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e",
  inflationConfig: "0x5C670a6950111D6f38B0D7cAdEB58D534fd9D209",
};

const VERIFIER_URL = "https://fdc-verifiers-testnet.flare.network";
const VERIFIER_API_KEY = "00000000-0000-0000-0000-000000000000";
const DA_LAYER_URL = "https://ctn2-data-availability.flare.network";

// XRP address to validate (known valid XRPL address)
const TEST_XRP_ADDRESS = "rN7n47y6fG6a8g1yHdUXLHpwyzfj9FmZKj";

// ─── SETUP ────────────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

interface StepTime {
  step: string;
  start: number;
  end: number;
  durationMs: number;
}
const timings: StepTime[] = [];
function time(step: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  console.log(`\n⏱  [${step}] Starting...`);
  return fn()
    .then(() => {
      const end = Date.now();
      timings.push({ step, start, end, durationMs: end - start });
      console.log(`   ✓ ${step} done in ${((end - start) / 1000).toFixed(1)}s`);
    })
    .catch((err) => {
      const end = Date.now();
      timings.push({ step, start, end, durationMs: end - start });
      console.log(`   ✗ ${step} FAILED after ${((end - start) / 1000).toFixed(1)}s: ${(err as Error).message}`);
      throw err;
    });
}

function utf8RightPad32(str: string): string {
  return "0x" + Buffer.from(ethers.toUtf8Bytes(str)).toString("hex").padEnd(64, "0");
}

async function main() {
  console.log("━".repeat(60));
  console.log("  FlareKit Phase 0 — Live End-to-End Test");
  console.log("━".repeat(60));
  console.log("Wallet:", wallet.address);

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "FLR");
  if (balance === 0n) {
    console.log("⚠ Wallet is empty! Fund it first.");
    return;
  }

  const results: Record<string, unknown> = {};

  // ─── STEP 1: Prepare attestation request ────────────────────────
  await time("Step 1: Prepare request (verifier API)", async () => {
    const url = `${VERIFIER_URL}/verifier/xrp/AddressValidity/prepareRequest`;
    const body = {
      attestationType: utf8RightPad32("AddressValidity"),
      sourceId: utf8RightPad32("testXRP"),
      requestBody: { addressStr: TEST_XRP_ADDRESS },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "X-API-KEY": VERIFIER_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Verifier returned ${res.status}: ${text}`);
    }

    const data = await res.json();
    if (data.status && data.status !== "VALID") {
      throw new Error(`Verifier returned status: ${data.status}`);
    }

    results.abiEncodedRequest = data.abiEncodedRequest;
    console.log("   abiEncodedRequest:", data.abiEncodedRequest.slice(0, 70) + "...");
  });

  // ─── STEP 2: Estimate fee ───────────────────────────────────────
  await time("Step 2: Estimate fee", async () => {
    const feeContract = new ethers.Contract(
      ADDRESSES.feeConfig,
      ["function getRequestFee(bytes) external view returns (uint256)"],
      provider
    );

    const fee = await feeContract.getRequestFee(results.abiEncodedRequest as string);
    results.feeWei = fee;
    results.feeFlr = ethers.formatEther(fee);
    console.log("   Fee:", results.feeFlr, "FLR");

    const hubContract = new ethers.Contract(
      ADDRESSES.fdcHub,
      ["function requestAttestation(bytes) external payable"],
      provider
    );
    const gasEstimate = await hubContract.requestAttestation.estimateGas(
      results.abiEncodedRequest,
      { value: fee }
    );
    results.gasEstimate = gasEstimate.toString();
    console.log("   Gas estimate:", gasEstimate.toString());

    const feeData = await provider.getFeeData();
    results.gasPrice = feeData.gasPrice?.toString() || "0";
    const totalCost = fee + gasEstimate * (feeData.gasPrice || 0n);
    results.totalCostFlr = ethers.formatEther(totalCost);
    console.log("   Total estimated cost:", results.totalCostFlr, "FLR");
  });

  // ─── STEP 3: Submit attestation request ─────────────────────────
  await time("Step 3: Submit attestation request", async () => {
    const hubContract = new ethers.Contract(
      ADDRESSES.fdcHub,
      [
        "function requestAttestation(bytes) external payable",
        "event AttestationRequest(bytes data, uint256 fee)",
      ],
      wallet
    );

    const tx = await hubContract.requestAttestation(results.abiEncodedRequest as string, {
      value: results.feeWei as bigint,
    });
    console.log("   TX hash:", tx.hash);
    console.log("   Waiting for confirmation...");

    const receipt = await tx.wait();
    results.txHash = tx.hash;
    results.blockNumber = receipt?.blockNumber;
    console.log("   Block:", receipt?.blockNumber);

    const block = await provider.getBlock(receipt!.blockNumber!);
    results.blockTimestamp = block?.timestamp;
    console.log("   Block timestamp:", block?.timestamp);
  });

  // ─── STEP 4: Calculate voting round and wait ────────────────────
  await time("Step 4: Calculate voting round + wait", async () => {
    const registry = new ethers.Contract(
      ADDRESSES.registry,
      ["function getContractAddressByName(string) external view returns (address)"],
      provider
    );

    const fsmAddr = await registry.getContractAddressByName("FlareSystemsManager");
    const fsm = new ethers.Contract(
      fsmAddr,
      [
        "function firstVotingRoundStartTs() external view returns (uint256)",
        "function votingEpochDurationSeconds() external view returns (uint256)",
      ],
      provider
    );

    const firstStart = await fsm.firstVotingRoundStartTs();
    const epochDuration = await fsm.votingEpochDurationSeconds();
    const blockTs = BigInt(results.blockTimestamp as number);

    const roundId = Number((blockTs - firstStart) / BigInt(epochDuration));
    results.votingRoundId = roundId;
    console.log(`   Round ID: ${roundId}`);

    const fdcVerif = new ethers.Contract(
      ADDRESSES.fdcVerification,
      ["function fdcProtocolId() external view returns (uint8)"],
      provider
    );
    const protocolId = await fdcVerif.fdcProtocolId();
    results.protocolId = protocolId;
    console.log(`   Protocol ID: ${protocolId}`);

    const relay = new ethers.Contract(
      ADDRESSES.relay,
      ["function isFinalized(uint256, uint256) external view returns (bool)"],
      provider
    );

    let finalized = false;
    let polls = 0;
    const maxPolls = 30;

    while (!finalized && polls < maxPolls) {
      await new Promise((r) => setTimeout(r, 10000));
      polls++;
      finalized = await relay.isFinalized(protocolId, roundId);
      console.log(`   Poll ${polls}: isFinalized = ${finalized}`);
    }

    if (!finalized) {
      throw new Error(`Round ${roundId} not finalized after ${polls * 10}s`);
    }
    results.roundPolls = polls;
    results.roundWaitSeconds = polls * 10;
  });

  // ─── STEP 5: Retrieve proof from DA Layer ───────────────────────
  await time("Step 5: Retrieve proof from DA Layer", async () => {
    const proofEndpoint = `${DA_LAYER_URL}/api/v1/fdc/proof-by-request-round-raw`;
    const requestBody = {
      votingRoundId: results.votingRoundId,
      requestBytes: results.abiEncodedRequest,
    };

    let proofResponse = await fetch(proofEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (proofResponse.status === 400) {
      console.log("   DA Layer returned 400, retrying in 15s...");
      await new Promise((r) => setTimeout(r, 15000));
      proofResponse = await fetch(proofEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
    }

    if (!proofResponse.ok) {
      const text = await proofResponse.text();
      throw new Error(`DA Layer returned ${proofResponse.status}: ${text}`);
    }

    const proofData = await proofResponse.json();
    results.proof = proofData;
    console.log("   Proof received:");
    console.log("     attestation_type:", proofData.attestation_type);
    console.log("     proof has", proofData.proof?.length || 0, "elements");
    console.log("     response_hex:", proofData.response_hex?.slice(0, 50) + "...");
  });

  // ─── STEP 6: Verify proof on-chain ──────────────────────────────
  await time("Step 6: Verify proof on-chain", async () => {
    const proofData = results.proof as { response_hex: string; proof: string[] };

    // IAddressValidity.Response = (bytes32, bytes32, uint64, uint64, RequestBody, ResponseBody)
    // RequestBody = (string addressStr)
    // ResponseBody = (bool isValid, string standardAddress, bytes32 standardAddressHash)
    const RESPONSE_ABI = [
      "tuple(bytes32 attestationType, bytes32 sourceId, uint64 votingRound, uint64 lowestUsedTimestamp, tuple(string addressStr) requestBody, tuple(bool isValid, string standardAddress, bytes32 standardAddressHash) responseBody)"
    ];

    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(
      RESPONSE_ABI,
      proofData.response_hex
    );

    const response = decoded[0];
    results.decodedResponse = {
      attestationType: response.attestationType,
      sourceId: response.sourceId,
      votingRound: response.votingRound.toString(),
      lowestUsedTimestamp: response.lowestUsedTimestamp.toString(),
      responseBody: {
        isValid: response.responseBody.isValid,
        standardAddress: response.responseBody.standardAddress || "",
        standardAddressHash: response.responseBody.standardAddressHash || "0x" + "00".repeat(32),
      },
    };

    console.log("   Decoded response:");
    console.log("     votingRound:", results.decodedResponse.votingRound);
    console.log("     isValid:", results.decodedResponse.responseBody.isValid);
    console.log("     standardAddress:", results.decodedResponse.responseBody.standardAddress);
    console.log("     standardAddressHash:", results.decodedResponse.responseBody.standardAddressHash);

    const fdcVerif = new ethers.Contract(
      ADDRESSES.fdcVerification,
      ["function verifyAddressValidity(bytes32[],bytes32,bytes32,uint64,uint64,(string),(bool,string,bytes32)) external view returns (bool)"],
      provider
    );

    const proofStruct = {
      merkleProof: proofData.proof,
      data: response,
    };

    try {
      const isValid = await fdcVerif.verifyAddressValidity.staticCall(
        proofStruct.merkleProof,
        proofStruct.data
      );
      results.verified = isValid;
      console.log("   verifyAddressValidity result:", isValid ? "✓ VALID" : "✗ INVALID (address not valid per FDC)");
    } catch (err) {
      console.log("   verifyAddressValidity reverted:", (err as Error).message);
      results.verified = false;
      results.verifyError = (err as Error).message;
    }
  });

  // ─── SUMMARY ────────────────────────────────────────────────────
  console.log("\n" + "━".repeat(60));
  console.log("  RESULTS SUMMARY");
  console.log("━".repeat(60));

  console.log("\nAttestation Details:");
  console.log("  Type: XRP AddressValidity (testXRP)");
  console.log("  Address:", TEST_XRP_ADDRESS);
  console.log("  TX Hash:", results.txHash);
  console.log("  Block:", results.blockNumber);
  console.log("  Voting Round:", results.votingRoundId);
  console.log("  Round wait:", results.roundPolls, "polls (~", results.roundWaitSeconds, "s)");
  console.log("  Fee paid:", results.feeFlr, "FLR");
  console.log("  Total cost:", results.totalCostFlr, "FLR");

  console.log("\nVerification:");
  console.log("  Verified:", results.verified);
  console.log("  isValid:", results.decodedResponse?.responseBody?.isValid);
  console.log("  standardAddress:", results.decodedResponse?.responseBody?.standardAddress);

  console.log("\nTimings:");
  let totalMs = 0;
  for (const t of timings) {
    console.log(`  ${t.step.padEnd(30)} ${(t.durationMs / 1000).toFixed(1).padStart(6)}s`);
    totalMs += t.durationMs;
  }
  console.log(`  ${"TOTAL".padEnd(30)} ${(totalMs / 1000).toFixed(1).padStart(6)}s`);

  // Save results
  const outputDir = path.join(process.cwd(), "output");
  if (!fs.existsSync(outputDir)) fs.mkdirSync(outputDir, { recursive: true });
  const output = {
    timestamp: new Date().toISOString(),
    wallet: wallet.address,
    attestationType: "AddressValidity",
    sourceId: "testXRP",
    testAddress: TEST_XRP_ADDRESS,
    results,
    timings,
  };
  fs.writeFileSync(path.join(outputDir, "phase0-live-test.json"), JSON.stringify(output, (_k, v) => typeof v === "bigint" ? v.toString() : v, 2));
  console.log("\n✓ Results saved to output/phase0-live-test.json");
}

main().catch((err) => {
  console.error("\n✗ Test failed:", err);
  process.exit(1);
});
