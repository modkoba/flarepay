/**
 * Live test (read-only, no gas): registry resolution, FTSO feeds, secure random.
 * Run: npx tsx integration/read-only.ts
 */

import { FlareKit } from "../src/index.js";
import { saveResult } from "./_setup.js";

const kit = new FlareKit({ network: "coston2" }); // no wallet — read-only must work

const feeds = await kit.ftso.readMany(["FLR/USD", "BTC/USD", "XRP/USD"]);
for (const feed of feeds) {
  console.log(`${feed.symbol.padEnd(8)} ${feed.price} (raw ${feed.value} / 10^${feed.decimals}, ts ${feed.timestamp})`);
  if (!(feed.value > 0n)) throw new Error(`${feed.symbol}: zero value`);
  if (Date.now() / 1000 - feed.timestamp > 600) throw new Error(`${feed.symbol}: stale (> 10 min)`);
}

const random = await kit.random.get();
console.log(`random   ${random.value.toString().slice(0, 24)}… secure=${random.isSecure} ts=${random.timestamp}`);
if (!(random.value > 0n)) throw new Error("random: zero value");

const estimate = await kit.fdc.estimate({
  type: "AddressValidity",
  chain: "XRP",
  address: "rN7n47y6fG6a8g1yHdUXLHpwyzfj9FmZKj",
});
console.log(`estimate AddressValidity: fee=${estimate.feeWei} wei, eta≈${estimate.etaSeconds}s`);

saveResult("read-only", { feeds, random, estimate });
console.log("\nread-only integration PASSED ✓");
