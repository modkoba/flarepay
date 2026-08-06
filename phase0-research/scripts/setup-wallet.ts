import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

const OUT_DIR = path.join(process.cwd(), "scripts");
const WALLET_FILE = path.join(OUT_DIR, ".phase0-wallet.json");

async function main() {
  // Generate or load wallet
  let wallet: ethers.Wallet;
  if (fs.existsSync(WALLET_FILE)) {
    const data = JSON.parse(fs.readFileSync(WALLET_FILE, "utf-8"));
    wallet = new ethers.Wallet(data.privateKey);
    console.log("Loaded existing wallet:", wallet.address);
  } else {
    wallet = ethers.Wallet.createRandom();
    const secret = {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic: wallet.mnemonic?.phrase,
    };
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.writeFileSync(WALLET_FILE, JSON.stringify(secret, null, 2));
    fs.chmodSync(WALLET_FILE, 0o600);
    console.log("Created new wallet:", wallet.address);
    console.log("Saved to .phase0-wallet.json (chmod 600)");
  }

  const RPC = "https://coston2-api.flare.network/ext/C/rpc";
  const provider = new ethers.JsonRpcProvider(RPC);
  const w = wallet.connect(provider);

  // Check balance
  const balance = await provider.getBalance(w.address);
  console.log("Balance:", ethers.formatEther(balance), "FLR");

  if (balance === 0n) {
    console.log("\nWallet is empty. Attempting to fund from faucet...");
    await fundFromFaucet(w.address);
    // Wait and recheck
    await new Promise((r) => setTimeout(r, 5000));
    const balance2 = await provider.getBalance(w.address);
    console.log("Balance after faucet:", ethers.formatEther(balance2), "FLR");
    if (balance2 === 0n) {
      console.log("\n⚠ Faucet did not fund the wallet.");
      console.log("Please fund manually at: https://faucet.flare.network/");
      console.log("Address:", w.address);
      return;
    }
  }

  console.log("\n✓ Wallet funded! Ready for Phase 0 live testing.");
}

async function fundFromFaucet(address: string) {
  const FALLBACK_FAUCETS = [
    "https://faucet.flare.network/",
    "https://coston2-faucet.flare.network/",
  ];

  for (const faucetUrl of FALLBACK_FAUCETS) {
    try {
      console.log(`Trying faucet: ${faucetUrl}`);
      // Try GET request with address param
      const url = `${faucetUrl}?address=${address}`;
      const res = await fetch(url, { redirect: "follow" });
      console.log(`  Status: ${res.status}`);
      if (res.ok) {
        console.log("  ✓ Faucet request submitted");
        return;
      }
    } catch (e) {
      console.log(`  ✗ Failed: ${(e as Error).message}`);
    }
  }

  console.log("All faucet attempts failed. Manual funding required.");
}

main().catch(console.error);
