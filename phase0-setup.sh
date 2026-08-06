#!/bin/bash
# FlareKit Phase 0 — Environment Setup Script
# This script sets up the Coston2 development environment for FDC research

set -e

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  FlareKit Phase 0 — Environment Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Check Node.js version
echo "▶ Checking Node.js version..."
NODE_VERSION=$(node -v 2>/dev/null || echo "not found")
echo "  Node.js: $NODE_VERSION"

MAJOR=$(echo $NODE_VERSION | cut -d'.' -f1 | sed 's/v//')
if [ "$MAJOR" -lt 18 ]; then
  echo "  ⚠ Node.js 18+ required. Please upgrade."
  exit 1
fi
echo "  ✓ OK"
echo ""

# 2. Create project structure
echo "▶ Creating project structure..."
mkdir -p phase0-research/{scripts,output,abi}
echo "  ✓ Created phase0-research/"
echo ""

# 3. Install dependencies
echo "▶ Installing dependencies..."
cd phase0-research

cat > package.json << 'EOF'
{
  "name": "flarekit-phase0",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "research": "tsx scripts/research.ts",
    "measure": "tsx scripts/measure.ts",
    "test-failures": "tsx scripts/test-failures.ts"
  },
  "dependencies": {
    "ethers": "^6.13.0"
  },
  "devDependencies": {
    "typescript": "^5.6.0",
    "tsx": "^4.7.0",
    "@types/node": "^22.0.0"
  }
}
EOF

npm install 2>&1 | tail -5
echo "  ✓ Dependencies installed"
echo ""

# 4. Create TypeScript config
cat > tsconfig.json << 'EOF'
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ES2022",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "outDir": "./dist",
    "rootDir": "./scripts"
  },
  "include": ["scripts/**/*"]
}
EOF
echo "  ✓ TypeScript config created"
echo ""

# 5. Create research scaffold script
cat > scripts/research.ts << 'SCRIPT'
/**
 * FlareKit Phase 0 — Research Scaffold
 *
 * This script helps you walk through the FDC payment verification flow.
 * Fill in the TODO sections as you research.
 *
 * Usage: npx tsx scripts/research.ts
 */

import { ethers } from "ethers";

// ─── CONFIGURATION ───────────────────────────────────────────────
// Fill these in after you:
// 1. Fund a wallet from the Coston2 faucet
// 2. Get a Coston2 RPC endpoint
// 3. Find the FDC contract addresses

const COSTON2_RPC = "https://coston2.flare.network/ext/C/rpc";
const PRIVATE_KEY = "YOUR_PRIVATE_KEY_HERE"; // DO NOT COMMIT THIS

// TODO: Fill in after research
const CONTRACTS = {
  fdcHub:          "0x...", // TODO
  fdcVerification: "0x...", // TODO
  relay:           "0x...", // TODO
  feeConfiguration:"0x...", // TODO
};

// TODO: ABIs will be fetched by the research agent
// For now, stub interfaces
const ABIS = {
  fdcHub: [],          // TODO: fill from Flare repo
  fdcVerification: [], // TODO
  relay: [],           // TODO
  feeConfiguration: [],// TODO
};

// ─── SETUP ───────────────────────────────────────────────────────
const provider = new ethers.JsonRpcProvider(COSTON2_RPC);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

console.log("━".repeat(50));
console.log("  FlareKit Phase 0 — Research Scaffold");
console.log("━".repeat(50));
console.log("");
console.log("Wallet:", wallet.address);

// Check balance
async function checkBalance() {
  const balance = await provider.getBalance(wallet.address);
  console.log("FLR Balance:", ethers.formatEther(balance), "FLR");
  if (Number(balance) === 0n) {
    console.log("⚠ Wallet has 0 FLR. Fund it from the faucet first!");
    console.log("  Faucet: https://faucet.flare.network/");
    return false;
  }
  return true;
}

// ─── RESEARCH TASKS ─────────────────────────────────────────────
// Fill these in as you work through the flow

async function researchFlow() {
  console.log("\n📋 Phase 0 Research Checklist");
  console.log("─".repeat(50));

  const tasks = [
    { id: "0.1", desc: "Set up dev environment", done: false },
    { id: "0.2", desc: "Read FDC payment verification guide", done: false },
    { id: "0.3", desc: "Identify all contract addresses", done: false },
    { id: "0.4", desc: "Measure ABI encoding step", done: false },
    { id: "0.5", desc: "Measure fee estimation step", done: false },
    { id: "0.6", desc: "Measure fee payment step", done: false },
    { id: "0.7", desc: "Measure waiting for voting round", done: false },
    { id: "0.8", desc: "Measure proof retrieval step", done: false },
    { id: "0.9", desc: "Measure proof verification step", done: false },
    { id: "0.10", desc: "Document all error scenarios", done: false },
    { id: "0.11", desc: "Complete XRP verification flow", done: false },
    { id: "0.12", desc: "Complete balance attestation flow", done: false },
    { id: "0.13", desc: "Research fee flow (dynamic? cache?)", done: false },
    { id: "0.14", desc: "Create benchmark document", done: false },
    { id: "0.15", desc: "Draft SDK API design", done: false },
  ];

  tasks.forEach(t => {
    const status = t.done ? "✓" : " ";
    console.log(`  ${status} [${t.id}] ${t.desc}`);
  });
  console.log("─".repeat(50));
}

// ─── MAIN ────────────────────────────────────────────────────────
async function main() {
  const funded = await checkBalance();
  if (!funded) {
    console.log("\nNext steps:");
    console.log("1. Go to https://faucet.flare.network/");
    console.log("2. Request FLR for:", wallet.address);
    console.log("3. Re-run this script");
    process.exit(1);
  }

  await researchFlow();

  console.log("\n📝 Next: Read the FDC docs at https://dev.flare.network/fdc/overview");
  console.log("   Then fill in the CONTRACTS and ABIS objects above.");
  console.log("   The research agents are fetching contract details in parallel.");
}

main().catch(console.error);
SCRIPT

echo "  ✓ Research scaffold script created"
echo ""

# 6. Create measurement script
cat > scripts/measure.ts << 'SCRIPT'
/**
 * FlareKit Phase 0 — Timing Measurement Helper
 *
 * Usage: npx tsx scripts/measure.ts
 */

interface TimingResult {
  step: string;
  start: number;
  end: number;
  duration: number;
}

const results: TimingResult[] = [];

function time<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const start = Date.now();
  console.log(`\n⏱  [${label}] Starting...`);
  return fn()
    .then((result) => {
      const end = Date.now();
      const duration = end - start;
      results.push({ step: label, start, end, duration });
      console.log(`   ✓ Done in ${duration}ms (${(duration / 1000).toFixed(1)}s)`);
      return result;
    })
    .catch((err) => {
      const end = Date.now();
      results.push({ step: label, start, end, duration: end - start });
      console.log(`   ✗ Failed after ${end - start}ms:`, err.message);
      throw err;
    });
}

function printSummary() {
  console.log("\n" + "━".repeat(50));
  console.log("  Timing Summary");
  console.log("━".repeat(50));

  let total = 0;
  results.forEach(r => {
    console.log(`  ${r.step.padEnd(30)} ${(r.duration / 1000).toFixed(1).padStart(6)}s`);
    total += r.duration;
  });

  console.log("─".repeat(50));
  console.log(`  ${"TOTAL".padEnd(30)} ${(total / 1000).toFixed(1).padStart(6)}s`);
  console.log("━".repeat(50));
}

// Export for use in research scripts
export { time, printSummary, results, TimingResult };
SCRIPT

echo "  ✓ Measurement helper created"
echo ""

# 7. Create failure testing script
cat > scripts/test-failures.ts << 'SCRIPT'
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
SCRIPT

echo "  ✓ Failure test scaffold created"
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup Complete!"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Next steps:"
echo "  1. cd phase0-research"
echo "  2. Edit scripts/research.ts — fill in private key and contract addresses"
echo "  3. npm run research"
echo ""
echo "⚠  Remember: Never commit your private key!"
echo "   Add phase0-research/.env to .gitignore"
echo ""
