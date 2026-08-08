/**
 * XRPL testnet helper — fund a wallet from the faucet and send a
 * destination-tagged payment, signing locally (public XRPL nodes refuse
 * server-side signing).
 *
 * `xrpl` is a devDependency used only by integration tests: FlarePay only needs
 * to *observe* XRPL payments, so the shipped SDK stays ethers-only.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Wallet } from "xrpl";

const XRPL_RPC = "https://s.altnet.rippletest.net:51234/";
const FAUCET = "https://faucet.altnet.rippletest.net/accounts";
const here = path.dirname(fileURLToPath(import.meta.url));
const walletFile = path.resolve(here, "../../../phase0-research/.xrpl-testnet.json");

export interface XrplWallet {
  address: string;
  seed: string;
}

type WalletRole = "payer" | "merchant";

export async function rpc<T = any>(method: string, params: object = {}): Promise<T> {
  const res = await fetch(XRPL_RPC, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ method, params: [params] }),
  });
  const json = (await res.json()) as { result: T };
  return json.result;
}

function loadWallets(): Partial<Record<WalletRole, XrplWallet>> {
  if (!fs.existsSync(walletFile)) return {};
  const raw = JSON.parse(fs.readFileSync(walletFile, "utf-8"));
  // Migrate the single-wallet format written by earlier runs.
  return raw.address ? { payer: raw as XrplWallet } : (raw as Partial<Record<WalletRole, XrplWallet>>);
}

/**
 * Load (or faucet-fund and cache) a testnet wallet for the given role.
 * FlarePay needs two: a payer and a merchant — XRPL rejects self-payments.
 */
export async function getFundedWallet(role: WalletRole = "payer"): Promise<XrplWallet> {
  const wallets = loadWallets();
  const cached = wallets[role];
  if (cached) {
    const info = await rpc<{ account_data?: { Balance: string } }>("account_info", {
      account: cached.address,
      ledger_index: "validated",
    });
    if (info.account_data) {
      console.log(`XRPL ${role}: ${cached.address} (${Number(info.account_data.Balance) / 1e6} XRP)`);
      return cached;
    }
  }

  console.log(`funding a new XRPL testnet ${role} wallet from the faucet…`);
  const res = await fetch(FAUCET, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  const data = (await res.json()) as { account: { address: string; secret?: string }; seed?: string };
  const wallet: XrplWallet = {
    address: data.account.address,
    seed: data.account.secret ?? data.seed ?? "",
  };
  if (!wallet.seed) throw new Error("faucet did not return a seed");
  wallets[role] = wallet;
  fs.writeFileSync(walletFile, JSON.stringify(wallets, null, 2), { mode: 0o600 });
  console.log(`funded ${role} ${wallet.address} (seed cached in ${path.basename(walletFile)}, gitignored)`);
  await new Promise((r) => setTimeout(r, 4000)); // let the faucet tx validate
  return wallet;
}

/** Send a destination-tagged XRP payment, signed locally, and wait for validation. */
export async function sendTaggedPayment(opts: {
  wallet: XrplWallet;
  destination: string;
  drops: string | number;
  destinationTag: number;
  memo?: string;
}): Promise<{ hash: string; ledgerIndex: number }> {
  const client = new Client("wss://s.altnet.rippletest.net:51233");
  await client.connect();
  try {
    const wallet = Wallet.fromSeed(opts.wallet.seed);
    const payment: Record<string, unknown> = {
      TransactionType: "Payment",
      Account: wallet.address,
      Destination: opts.destination,
      Amount: String(opts.drops),
      DestinationTag: opts.destinationTag,
    };
    if (opts.memo) {
      payment.Memos = [
        { Memo: { MemoData: Buffer.from(opts.memo, "utf8").toString("hex").toUpperCase() } },
      ];
    }

    const prepared = await client.autofill(payment as never);
    const signed = wallet.sign(prepared);
    console.log(`  submitting ${signed.hash} …`);
    const outcome = await client.submitAndWait(signed.tx_blob);

    const meta = outcome.result.meta;
    const code = typeof meta === "object" && meta !== null ? (meta as { TransactionResult?: string }).TransactionResult : undefined;
    if (code !== "tesSUCCESS") throw new Error(`XRPL tx failed: ${code}`);

    const ledgerIndex = outcome.result.ledger_index ?? 0;
    console.log(`  validated in ledger ${ledgerIndex}`);
    return { hash: outcome.result.hash, ledgerIndex };
  } finally {
    await client.disconnect();
  }
}
