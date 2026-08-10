/**
 * Deploy XrpAccessPass + PremiumVault to Coston2.
 *
 * PremiumVault deliberately knows nothing about payments — it only reads the
 * pass — which is the point being demonstrated.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { ethers } from "ethers";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../../..");
const readJson = (p: string) => JSON.parse(fs.readFileSync(p, "utf-8"));

const { privateKey } = readJson(path.join(root, "phase0-research/.secrets.json"));
const deployments = readJson(path.join(here, "../deployments.json"));
const passArtifact = readJson(path.join(here, "../out/XrpAccessPass.json"));
const vaultArtifact = readJson(path.join(here, "../out/PremiumVault.json"));

const SECONDS_PER_CENT = 60; // $1.00 = 100 cents = 100 minutes of access

async function main() {
  const provider = new ethers.JsonRpcProvider("https://coston2-api.flare.network/ext/C/rpc");
  const wallet = new ethers.Wallet(privateKey, provider);
  const escrow = deployments.coston2.FlarePayEscrow;
  console.log(`deployer ${wallet.address}`);
  console.log(`escrow   ${escrow}`);

  const passFactory = new ethers.ContractFactory(passArtifact.abi, passArtifact.bytecode, wallet);
  const pass = await passFactory.deploy(escrow, SECONDS_PER_CENT);
  await pass.waitForDeployment();
  const passAddress = await pass.getAddress();
  console.log(`XrpAccessPass  ${passAddress}`);

  const vaultFactory = new ethers.ContractFactory(vaultArtifact.abi, vaultArtifact.bytecode, wallet);
  const vault = await vaultFactory.deploy(passAddress);
  await vault.waitForDeployment();
  const vaultAddress = await vault.getAddress();
  console.log(`PremiumVault   ${vaultAddress}`);

  deployments.coston2.XrpAccessPass = passAddress;
  deployments.coston2.PremiumVault = vaultAddress;
  deployments.coston2.accessPassDeployedAt = new Date().toISOString();
  fs.writeFileSync(path.join(here, "../deployments.json"), JSON.stringify(deployments, null, 2) + "\n");
  console.log("deployments.json updated");
}

main().catch((e) => { console.error(e); process.exit(1); });
