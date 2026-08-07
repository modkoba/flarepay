/**
 * Live test: full FDC Payment lifecycle on Coston2 for a real XRPL testnet
 * payment (~2-3 min, costs testnet FLR).
 * Run: npx tsx integration/verify-payment.ts [xrplTxHash]
 */

import { liveKit, saveResult } from "./_setup.js";

// Find a recent validated Payment on XRPL testnet (a few ledgers deep).
async function findRecentXrplPayment(): Promise<{ hash: string; account: string; dest: string }> {
  const rpc = async (method: string, params: object) => {
    const res = await fetch("https://s.altnet.rippletest.net:51234/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params: [params] }),
    });
    return res.json();
  };
  const info = await rpc("ledger", { ledger_index: "validated" });
  const tip = Number(info.result.ledger.ledger_index);
  for (let li = tip - 12; li < tip - 4; li++) {
    const ledger = await rpc("ledger", { ledger_index: li, transactions: true, expand: true });
    for (const tx of ledger.result.ledger.transactions ?? []) {
      const t = tx.tx_json ?? tx;
      const delivered = t.DeliverMax ?? t.Amount;
      // FDC attests native XRP payments only: amount is a drops string,
      // not an issued-currency object ({currency, issuer, value}).
      if (t.TransactionType === "Payment" && typeof delivered === "string" && (tx.hash || t.hash)) {
        return { hash: tx.hash ?? t.hash, account: t.Account, dest: t.Destination };
      }
    }
  }
  throw new Error("no recent Payment found on XRPL testnet");
}

const kit = liveKit();
const payment = process.argv[2]
  ? { hash: process.argv[2], account: "?", dest: "?" }
  : await findRecentXrplPayment();
console.log(`verifying XRPL testnet payment ${payment.hash}`);
console.log(`  ${payment.account} → ${payment.dest}\n`);

const startedAt = Date.now();
const result = await kit.fdc.verifyPayment(
  { chain: "XRP", txId: payment.hash },
  {
    onProgress: (e) =>
      console.log(
        `  [${String(Math.round(e.elapsedMs / 1000)).padStart(3)}s] ${e.step}` +
          (e.etaSeconds ? ` (eta ~${e.etaSeconds}s)` : "")
      ),
  }
);

const totalSeconds = (Date.now() - startedAt) / 1000;
console.log(`\nverified: ${result.verified}`);
console.log(`status: ${result.response.status} (0 = success)`);
console.log(`receivedAmount: ${result.response.receivedAmount} drops`);
console.log(`source block: ${result.response.blockNumber} @ ${result.response.blockTimestamp}`);
console.log(`round: ${result.votingRoundId} fee: ${result.feePaidWei} wei tx: ${result.requestTxHash}`);
console.log(`total: ${totalSeconds.toFixed(1)}s`);

if (!result.verified) throw new Error("on-chain verification returned false");
if (result.response.status !== 0n) throw new Error(`payment status ${result.response.status}, expected 0`);
if (result.response.receivedAmount <= 0n) throw new Error("receivedAmount not positive");

saveResult("verify-payment", { payment, totalSeconds, result });
console.log("\nverify-payment integration PASSED ✓");
