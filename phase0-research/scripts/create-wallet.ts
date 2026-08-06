import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";

const DIR = process.cwd();
const ENV_FILE = path.join(DIR, ".env");
const SECRETS_FILE = path.join(DIR, ".secrets.json");

function main() {
  // Generate wallet
  const wallet = ethers.Wallet.createRandom();

  // Save private key to .secrets.json (gitignored, chmod 600)
  fs.writeFileSync(SECRETS_FILE, JSON.stringify({
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase,
  }, null, 2));
  fs.chmodSync(SECRETS_FILE, 0o600);

  // Write .env with RPC (no secrets in .env)
  const envContent = `COSTON2_RPC_URL=https://coston2-api.flare.network/ext/C/rpc\n`;
  fs.writeFileSync(ENV_FILE, envContent);
  fs.chmodSync(ENV_FILE, 0o600);

  // Only print the address to stdout
  console.log("Wallet address:", wallet.address);
  console.log("Saved to .secrets.json (chmod 600)");
  console.log("RPC saved to .env");
}

main();
