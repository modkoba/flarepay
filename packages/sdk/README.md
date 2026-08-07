# @flarekit/sdk

TypeScript SDK for Flare's enshrined protocols: **FDC** cross-chain attestations,
**FTSOv2** price feeds, and **Secure Random**. Node 18+, browsers, and edge runtimes.
`ethers` v6 is the only dependency.

## Install

```bash
pnpm add @flarekit/sdk ethers
```

## Verify a cross-chain payment (FDC)

```ts
import { FlareKit } from "@flarekit/sdk";

const kit = new FlareKit({ network: "coston2", privateKey: process.env.PRIVATE_KEY });

const result = await kit.fdc.verifyPayment(
  { chain: "XRP", txId: "1EC97479…" },          // XRPL testnet tx hash
  { onProgress: (e) => console.log(e.step, e.etaSeconds) },
);

result.verified;                  // true — on-chain FdcVerification staticCall
result.response.receivedAmount;   // bigint (drops)
result.response.status;           // 0n = success
result.proof;                     // serializable; verifies forever
```

The voting round takes ~90–180s — that's FDC protocol time. `onProgress` streams
`preparing → prepared → submitting → submitted → waiting-round (with ETA) →
round-finalized → fetching-proof → proof-received → verifying → done` so your UI can
tell the truth about it.

### Address validity

```ts
const check = await kit.fdc.verifyAddress({ chain: "XRP", address: "rGQW…" });
check.verified;                // proof is valid on-chain
check.response.isValid;        // the address itself is valid (false is a *proven* negative)
```

### EVM transactions (Sepolia)

```ts
const evm = await kit.fdc.verifyEvmTransaction({ chain: "ETH", txHash: "0x…" });
evm.response.status;    // 1n = success (EVM receipt status)
evm.response.events;    // decoded logs: emitter, topics, data
evm.response.input;     // calldata (provideInput defaults true)
```

### What works right now?

```ts
const matrix = await kit.fdc.capabilities();  // free — no transactions
// [{ type: "Payment", chain: "XRP", status: "available" },
//  { type: "Payment", chain: "BTC", status: "unavailable", detail: "…verifier down…" }, …]
```

### Estimate before spending

```ts
const quote = await kit.fdc.estimate({ type: "Payment", chain: "XRP", txId });
quote.feeWei;      // 1000n on Coston2 today
quote.etaSeconds;  // honest end-to-end estimate
```

### Reuse proofs / resume across restarts

```ts
await kit.fdc.verifyProof(savedProof);      // read-only re-verification, any time
await kit.fdc.resume(handle);               // continue after a process restart
```

## FTSOv2 prices & secure random (no wallet needed)

```ts
const kit = new FlareKit({ network: "coston2" });
const { price } = await kit.ftso.read("BTC/USD");
const { value, isSecure } = await kit.random.get();
```

## Wallets

```ts
new FlareKit({ privateKey });                  // server
new FlareKit({ signer });                      // your ethers Signer
new FlareKit({ eip1193: window.ethereum });    // browser / MetaMask
new FlareKit({});                              // read-only (ftso/random/estimate/verifyProof)
```

## Errors

Every failure is a typed `FlareKitError` with `code`, `retryable`, and a human `fix`:
`VerifierRejectedError`, `VerifierUnavailableError`, `InsufficientFeeError`,
`RoundTimeoutError`, `ProofUnavailableError`, `ProofInvalidError`,
`WalletRequiredError`, `NetworkError`, `ConfigError`.

## Guarantees

- Contract addresses resolve from the on-chain **FlareContractRegistry**; selectors are
  derived from published ABIs — nothing hand-rolled (unit tests assert the selectors).
- `verified` comes from the on-chain verification `staticCall`, never a tx receipt.
- Live integration tests in `integration/` are the acceptance gate; latest recorded runs
  ship in `integration/out/`.

## Tests

```bash
npm test                                  # unit (offline)
npx tsx integration/read-only.ts          # live Coston2, no wallet
npx tsx integration/verify-payment.ts     # live Coston2, funded key required
```
