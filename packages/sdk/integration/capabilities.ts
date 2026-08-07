/**
 * Live probe (read-only, no wallet, no gas): which (type, chain) pairs do the
 * Coston2 verifiers serve right now?
 * Run: npx tsx integration/capabilities.ts
 */

import { FlareKit } from "../src/index.js";
import { saveResult } from "./_setup.js";

const kit = new FlareKit({ network: "coston2" });
const capabilities = await kit.fdc.capabilities();

for (const cap of capabilities) {
  const mark = cap.status === "available" ? "✓" : "✗";
  console.log(
    `${mark} ${cap.type.padEnd(16)} ${String(cap.chain).padEnd(5)} ${cap.status}` +
      (cap.detail ? `  (${cap.detail})` : "")
  );
}

const available = capabilities.filter((c) => c.status === "available").length;
console.log(`\n${available}/${capabilities.length} routes available`);
if (available === 0) throw new Error("no verifier routes available — network problem?");

saveResult("capabilities", { capabilities });
console.log("capabilities integration PASSED ✓");
