/**
 * Shared setup for live Coston2 integration tests.
 * Uses the funded phase0 research wallet (never committed; see .gitignore).
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { FlareKit } from "../src/index.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const secretsPath = path.resolve(here, "../../../phase0-research/.secrets.json");

export function liveKit(): FlareKit {
  if (!fs.existsSync(secretsPath)) {
    console.error(`No funded wallet found at ${secretsPath} — create/fund one first (faucet.flare.network).`);
    process.exit(2);
  }
  const { privateKey } = JSON.parse(fs.readFileSync(secretsPath, "utf-8"));
  return new FlareKit({ network: "coston2", privateKey });
}

export function saveResult(name: string, data: unknown): void {
  const outDir = path.join(here, "out");
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `${name}.json`);
  fs.writeFileSync(
    file,
    JSON.stringify({ generatedAt: new Date().toISOString(), ...(data as object) }, bigintSafe, 2)
  );
  console.log(`saved → ${path.relative(process.cwd(), file)}`);
}

function bigintSafe(_key: string, value: unknown) {
  return typeof value === "bigint" ? value.toString() : value;
}
