/**
 * Live test: full FDC EVMTransaction lifecycle on Coston2 for a real Sepolia
 * transaction (~2-3 min).
 * Run: npx tsx integration/verify-evm-tx.ts [sepoliaTxHash]
 */

import { liveKit, saveResult } from "./_setup.js";

const SEPOLIA_RPC = "https://sepolia.gateway.tenderly.co";

async function findRecentSepoliaTx(): Promise<string> {
  const rpc = async (method: string, params: unknown[]) => {
    const res = await fetch(SEPOLIA_RPC, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    return ((await res.json()) as { result: never }).result;
  };
  const tip = parseInt(await rpc("eth_blockNumber", []), 16);
  // a few blocks deep so requiredConfirmations:1 is comfortably met
  const block = (await rpc("eth_getBlockByNumber", [`0x${(tip - 6).toString(16)}`, false])) as unknown as {
    transactions: string[];
  };
  if (!block.transactions.length) throw new Error("empty Sepolia block, retry");
  return block.transactions[0];
}

const kit = liveKit();
const txHash = process.argv[2] ?? (await findRecentSepoliaTx());
console.log(`verifying Sepolia tx on Flare: ${txHash}\n`);

const startedAt = Date.now();
const result = await kit.fdc.verifyEvmTransaction(
  { chain: "ETH", txHash },
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
console.log(`sepolia block: ${result.response.blockNumber} status: ${result.response.status}`);
console.log(`from: ${result.response.sourceAddress} to: ${result.response.receivingAddress}`);
console.log(`value: ${result.response.value} wei, events: ${result.response.events.length}`);
console.log(`round: ${result.votingRoundId} fee: ${result.feePaidWei} wei tx: ${result.requestTxHash}`);
console.log(`total: ${totalSeconds.toFixed(1)}s`);

if (!result.verified) throw new Error("on-chain verification returned false");
if (result.response.blockNumber <= 0n) throw new Error("blockNumber not positive");

saveResult("verify-evm-tx", { txHash, totalSeconds, result });
console.log("\nverify-evm-tx integration PASSED ✓");
