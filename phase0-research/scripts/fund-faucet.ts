import * as fs from "fs";
import * as path from "path";

const SECRETS_FILE = path.join(process.cwd(), ".secrets.json");
const SECRETS = JSON.parse(fs.readFileSync(SECRETS_FILE, "utf-8"));
const ADDRESS = SECRETS.address;

const FAUCETS = [
  "https://faucet.flare.network/",
  "https://coston2-faucet.flare.network/",
];

async function tryFaucet(url: string): Promise<boolean> {
  try {
    const getUrl = `${url}?address=${ADDRESS}`;
    const getRes = await fetch(getUrl, { redirect: "follow" });
    console.log(`  GET → ${getRes.status}`);
    if (getRes.ok) return true;

    const postRes = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address: ADDRESS }),
    });
    console.log(`  POST → ${postRes.status}`);
    if (postRes.ok) return true;

    return false;
  } catch (e) {
    console.log(`  Error: ${(e as Error).message}`);
    return false;
  }
}

async function main() {
  console.log("Funding address:", ADDRESS);
  console.log("");

  for (const faucet of FAUCETS) {
    console.log(`Trying faucet: ${faucet}`);
    const ok = await tryFaucet(faucet);
    if (ok) {
      console.log("  ✓ Faucet request succeeded");
      console.log("\nWaiting 10s for transaction to confirm...");
      await new Promise((r) => setTimeout(r, 10000));
      return;
    }
    console.log("  ✗ Faucet request did not succeed");
  }

  console.log("\n⚠ All faucet attempts failed.");
  console.log("Please fund manually at: https://faucet.flare.network/");
  console.log("Address:", ADDRESS);
}

main();
