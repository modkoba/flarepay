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
