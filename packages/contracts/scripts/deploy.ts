/**
 * Deploy FlarePayEscrow to Coston2 and record the address.
 * Run: pnpm --filter @flarekit/contracts deploy
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, Wallet } from "ethers";

const here = path.dirname(fileURLToPath(import.meta.url));
const artifactPath = path.resolve(here, "../out/FlarePayEscrow.json");
const deploymentsPath = path.resolve(here, "../deployments.json");
const secretsPath = path.resolve(here, "../../../phase0-research/.secrets.json");

const RPC = "https://coston2-api.flare.network/ext/C/rpc";
const EXPLORER = "https://coston2.flarescan.com";

if (!fs.existsSync(artifactPath)) {
  console.error("No artifact — run `pnpm --filter @flarekit/contracts build` first.");
  process.exit(1);
}

const { abi, bytecode } = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));
const { privateKey } = JSON.parse(fs.readFileSync(secretsPath, "utf-8"));

const provider = new JsonRpcProvider(RPC);
const wallet = new Wallet(privateKey, provider);
console.log(`deploying FlarePayEscrow from ${wallet.address}`);

const factory = new ContractFactory(abi, bytecode, wallet);
const contract = await factory.deploy();
console.log(`  tx ${contract.deploymentTransaction()?.hash} — waiting…`);
await contract.waitForDeployment();

const address = await contract.getAddress();
console.log(`\nFlarePayEscrow deployed: ${address}`);
console.log(`  ${EXPLORER}/address/${address}`);

const deployments = fs.existsSync(deploymentsPath)
  ? JSON.parse(fs.readFileSync(deploymentsPath, "utf-8"))
  : {};
deployments.coston2 = {
  FlarePayEscrow: address,
  deployedAt: new Date().toISOString(),
  deployTx: contract.deploymentTransaction()?.hash,
  explorer: `${EXPLORER}/address/${address}`,
};
fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
console.log(`recorded in deployments.json`);
