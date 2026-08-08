/**
 * Demo convenience only: pay a charge from our funded XRPL testnet wallet so a
 * judge can watch the whole flow without installing a wallet. Real payers use
 * any XRPL wallet — the protocol has no idea this file exists.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, Wallet } from "xrpl";
import type { ChargeView } from "./flarepay.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const walletsPath = path.resolve(here, "../../../phase0-research/.xrpl-testnet.json");

export async function payDemoCharge(charge: ChargeView): Promise<string> {
  const wallets = JSON.parse(fs.readFileSync(walletsPath, "utf-8")) as {
    payer: { address: string; seed: string };
  };

  const client = new Client("wss://s.altnet.rippletest.net:51233");
  await client.connect();
  try {
    const wallet = Wallet.fromSeed(wallets.payer.seed);
    const prepared = await client.autofill({
      TransactionType: "Payment",
      Account: wallet.address,
      Destination: charge.merchantAddress,
      Amount: charge.drops,
      DestinationTag: charge.destinationTag,
    } as never);
    const signed = wallet.sign(prepared);
    const outcome = await client.submitAndWait(signed.tx_blob);

    const meta = outcome.result.meta;
    const code = typeof meta === "object" && meta !== null ? (meta as { TransactionResult?: string }).TransactionResult : undefined;
    if (code !== "tesSUCCESS") throw new Error(`XRPL payment failed: ${code}`);
    return outcome.result.hash;
  } finally {
    await client.disconnect();
  }
}
