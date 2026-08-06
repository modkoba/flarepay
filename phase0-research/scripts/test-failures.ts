/**
 * FlareKit Phase 0 — Failure Scenario Testing
 *
 * Tests what happens when things go wrong with FDC.
 * Each test documents: error message, error code, recovery action.
 */

import { ethers } from "ethers";

// TODO: Configure after research
const COSTON2_RPC = "https://coston2.flare.network/ext/C/rpc";
const PRIVATE_KEY = "YOUR_PRIVATE_KEY_HERE";
const CONTRACTS = {
  fdcHub: "0x...",
  feeConfiguration: "0x...",
};

const provider = new ethers.JsonRpcProvider(COSTON2_RPC);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

interface FailureTest {
  name: string;
  description: string;
  run: () => Promise<void>;
}

const tests: FailureTest[] = [
  {
    name: "Fee too low",
    description: "Submit attestation request with fee below minimum",
    run: async () => {
      // TODO: Implement after contract ABIs are known
      console.log("TODO: Implement after ABIs are available");
    },
  },
  {
    name: "Invalid request format",
    description: "Submit attestation with malformed parameters",
    run: async () => {
      console.log("TODO: Implement");
    },
  },
  {
    name: "Insufficient FLR balance",
    description: "Try to pay fee with empty wallet",
    run: async () => {
      console.log("TODO: Implement");
    },
  },
  {
    name: "Wrong proof submitted",
    description: "Submit a valid-looking but incorrect proof",
    run: async () => {
      console.log("TODO: Implement");
    },
  },
  {
    name: "Network timeout",
    description: "Simulate slow/unresponsive RPC",
    run: async () => {
      console.log("TODO: Implement");
    },
  },
];

async function runTests() {
  console.log("━".repeat(50));
  console.log("  Failure Scenario Tests");
  console.log("━".repeat(50));
  console.log("");

  for (const test of tests) {
    console.log(`\n🧪 [${test.name}]`);
    console.log(`   ${test.description}`);
    try {
      await test.run();
      console.log("   ✓ Completed (check output above)");
    } catch (err) {
      console.log("   ✗ Error:", err);
    }
  }
}

runTests();
