# FlareKit — Benchmark: Manual FDC Flow vs. SDK

All numbers below are **measured on Coston2**, not estimated. Manual-flow numbers are from
the Phase 0 live test (2026-07-25, `phase0-research/`); SDK numbers are from the live
integration runs (2026-08-07, `packages/sdk/integration/out/*.json`, tx hashes included).

## The honest framing

End-to-end wall clock is dominated by **protocol time** — the FDC voting round must
finalize (~90-180s) no matter what tooling you use. What an SDK removes is **developer
time**: the code, contracts, APIs, and encoding pitfalls between you and your first
successful verification. We measure the two separately.

## Protocol time (unavoidable, measured)

| Run | Attestation | Round wait | Total | Evidence |
|---|---|---|---|---|
| Phase 0 manual | XRP AddressValidity | 79.9s | ~108.6s | tx `0xa2a8ae…1c70f6`, round 1,406,877 |
| SDK `verifyAddress` | XRP AddressValidity | ~124s | 132.6s | tx `0x87d6259d…d39799`, round 1,418,002 |
| SDK `verifyPayment` | XRP Payment (real XRPL testnet tx) | ~65s | 77.1s | tx `0x9506faa4…f98e12`, round 1,418,242 |

Round-wait variance (65-124s) is protocol scheduling, not tooling. FlareKit surfaces it
truthfully via progress events with ETAs instead of a fake spinner.

## Developer time (what FlareKit removes)

| | Manual (Phase 0, actually done) | FlareKit (measured) |
|---|---|---|
| Working code to write | ~340 lines (`run-phase0-test.ts`) | **5 lines** |
| Contracts to learn | 6 (Registry, FdcHub, FeeConfig, FSM, Relay, FdcVerification) | **0** |
| REST APIs to learn | 2 (verifier, DA layer) + retry behavior | **0** |
| Encoding rules to discover | right-pad-32 ids, MIC via prepareRequest, drops-string amounts | **0** |
| Polling loops to write | 2 (Relay finalization, DA layer) | **0** |
| Wall clock to first working verification | ~2 days of research + iteration | **< 5 min** from `pnpm add` |
| Correctness achieved | **5/6 steps** — on-chain verify silently returned empty data (hand-built ABI signature was wrong) | **6/6**, `verified: true` from `staticCall` |

The last row is the real benchmark. The Phase 0 manual attempt was careful, measured
work — and its final verification step was *still* wrong (a hand-written function
signature produced a bad selector, the contract's fallback returned empty data, and
nothing failed loudly). A later hand-written SDK attempt (v1, preserved in git history)
hardcoded three selectors and got **all three** wrong. Hand-rolling FDC integration
doesn't just cost time; it fails silently. FlareKit derives every selector from published
ABIs and asserts them in CI.

## The 5 lines

```ts
import { FlareKit } from "@flarekit/sdk";

const kit = new FlareKit({ network: "coston2", privateKey });
const result = await kit.fdc.verifyPayment({ chain: "XRP", txId });
console.log(result.verified, result.response.receivedAmount);
```

## Bonus: protocols that took zero extra setup

Because the kit wraps all enshrined protocols, these came free (measured live):

- `kit.ftso.read("BTC/USD")` — live FTSOv2 price, one call, no wallet
- `kit.random.get()` — protocol secure random, one call, no wallet
- `kit.fdc.estimate(...)` — fee (1000 wei measured) + honest ETA before spending anything

## Reproduce

```bash
cd packages/sdk
npx tsx integration/read-only.ts        # no wallet needed
npx tsx integration/verify-address.ts   # needs funded Coston2 key
npx tsx integration/verify-payment.ts   # needs funded Coston2 key
```
