/**
 * Compile FlarePayEscrow with solc-js. No Hardhat/Foundry: one contract, no
 * external imports, so a 30-line compile script beats a framework here.
 * Run: pnpm --filter @flarekit/contracts build
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const solc = require("solc");

const here = path.dirname(fileURLToPath(import.meta.url));
const srcDir = path.resolve(here, "../src");
const outDir = path.resolve(here, "../out");

const sources: Record<string, { content: string }> = {};
for (const file of fs.readdirSync(srcDir).filter((f) => f.endsWith(".sol"))) {
  sources[file] = { content: fs.readFileSync(path.join(srcDir, file), "utf-8") };
}

const input = {
  language: "Solidity",
  sources,
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: "london",
    outputSelection: { "*": { "*": ["abi", "evm.bytecode.object"] } },
  },
};

const output = JSON.parse(solc.compile(JSON.stringify(input)));

const errors = (output.errors ?? []).filter((e: { severity: string }) => e.severity === "error");
for (const err of output.errors ?? []) {
  console.log(`${err.severity}: ${err.formattedMessage.trim()}`);
}
if (errors.length > 0) {
  console.error(`\n${errors.length} compilation error(s)`);
  process.exit(1);
}

fs.mkdirSync(outDir, { recursive: true });
for (const [file, contracts] of Object.entries(output.contracts ?? {})) {
  for (const [name, artifact] of Object.entries(contracts as Record<string, any>)) {
    const target = path.join(outDir, `${name}.json`);
    fs.writeFileSync(
      target,
      JSON.stringify({ abi: artifact.abi, bytecode: "0x" + artifact.evm.bytecode.object }, null, 2)
    );
    const sizeKb = (artifact.evm.bytecode.object.length / 2 / 1024).toFixed(1);
    console.log(`compiled ${name} (${file}) → out/${name}.json  [${sizeKb} KB]`);
  }
}
