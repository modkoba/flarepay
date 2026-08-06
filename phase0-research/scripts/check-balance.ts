import * as fs from "fs";
import * as path from "path";
import { ethers } from "ethers";

const SECRETS_FILE = path.join(process.cwd(), ".secrets.json");
const SECRETS = JSON.parse(fs.readFileSync(SECRETS_FILE, "utf-8"));
const ENV_FILE = path.join(process.cwd(), ".env");

// Load RPC from .env
const envContent = fs.readFileSync(ENV_FILE, "utf-8");
const RPC = envContent.match(/COSTON2_RPC_URL=(.+)/)?.[1] || "https://coston2-api.flare.network/ext/C/rpc";

const provider = new ethers.JsonRpcProvider(RPC);
const wallet = new ethers.Wallet(SECRETS.privateKey, provider);

async function main() {
  console.log("Address:", wallet.address);
  console.log("Checking balance...");

  const balance = await provider.getBalance(wallet.address);
  console.log("Balance:", ethers.formatEther(balance), "FLR");

  if (balance > 0n) {
    console.log("\n✓ Wallet funded! Ready for Phase 0 testing.");
  } else {
    console.log("\n⚠ Still empty. Waiting 15s...");
    await new Promise((r) => setTimeout(r, 15000));
    const balance2 = await provider.getBalance(wallet.address);
    console.log("Balance after wait:", ethers.formatEther(balance2), "FLR");
  }
}

main().catch(console.error);
