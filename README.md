# FlareKit

**The TypeScript toolkit for Flare's enshrined protocols.** Verify cross-chain payments
with FDC, read FTSOv2 price feeds, and get secure randomness — one SDK, one call each,
typed end-to-end.

```ts
import { FlareKit } from "@flarekit/sdk";

const kit = new FlareKit({ network: "coston2", privateKey });

// Prove an XRPL payment happened — cryptographically, on Flare
const result = await kit.fdc.verifyPayment({ chain: "XRP", txId });
result.verified;                 // true — from the on-chain staticCall
result.response.receivedAmount;  // 86n (drops), fully typed

// Live price + secure random, no wallet needed
const btc = await kit.ftso.read("BTC/USD");
const rnd = await kit.random.get();
```

## Why

FDC — Flare's enshrined cross-chain attestation protocol — is unique and powerful, and
nearly unusable by hand: 10 steps, 6 contracts, 2 REST APIs, undocumented encoding rules,
and a ~2-minute voting round in the middle. Our own carefully-measured manual attempt got
the final verification step silently wrong. FlareKit turns all of it into one function
call with honest progress reporting. See the measured comparison in
[docs/research/BENCHMARK.md](docs/research/BENCHMARK.md).

## Proven live on Coston2

Every feature ships only after its live integration test passes (PRD §12). Latest runs
(2026-08-07, artifacts in `packages/sdk/integration/out/`):

| What | Result | Evidence |
|---|---|---|
| `fdc.verifyPayment` — real XRPL testnet payment | `verified: true` in 77.1s | round 1,418,242, tx `0x9506faa4…f98e12` |
| `fdc.verifyAddress` — XRPL address | `verified: true` in 132.6s, cached proof re-verifies | round 1,418,002, tx `0x87d6259d…d39799` |
| `ftso.read` FLR/BTC/XRP vs USD | live prices | `integration/out/read-only.json` |
| `random.get` | secure random | 〃 |
| `fdc.estimate` | 1000 wei + honest ETA | 〃 |

## Quickstart

```bash
pnpm install
pnpm build
cd packages/sdk

# read-only (no wallet): prices, random, fee estimate
npx tsx integration/read-only.ts

# full FDC lifecycle (needs a funded Coston2 key — faucet.flare.network)
npx tsx integration/verify-payment.ts
```

## FlarePay demo

A checkout that accepts XRPL testnet payments and settles them with FDC proofs —
built entirely on public SDK APIs, with an honest ~2-minute progress UI (the voting
round is real protocol time; the demo never fakes it) plus an instant replay of a
recorded live run.

```bash
# optional, enables live mode: packages/demo/.env.local
#   VITE_DEMO_PRIVATE_KEY=0x… (funded Coston2 key)
pnpm --filter @flarekit/demo dev
```

## Design principles

1. **One call per job** — protocol hidden, progress exposed, escape hatches available.
2. **Typed end-to-end** — request params → proof struct → Solidity ABI, one type system.
3. **Honest about time** — progress events with real ETAs; no fake 4-second claims.
4. **Errors say what/why/how-to-fix** — every failure is a typed `FlareKitError` with
   `code`, `retryable`, and `fix`.
5. **Never hand-roll what the chain can tell us** — addresses from the on-chain
   ContractRegistry, selectors derived from published ABIs (and asserted in tests).
6. **Done = ran on Coston2** — unit tests check logic; only live tests check truth.

## Repo layout

```
packages/sdk        @flarekit/sdk — FDC, FTSOv2, Secure Random clients
packages/demo       FlarePay demo (Vite)
docs/planning       PRD (full product), demo plan
docs/research       benchmark + Phase 0 protocol research
phase0-research     the original manual FDC run the SDK was ported from
```

## Roadmap

- **Hackathon (Aug 14)** — this: SDK core (XRP payment + address paths, BTC/DOGE ready
  pending verifier availability), FTSO reads, demo, measured benchmark.
- **v0.2** — `@flarekit/testing` (instant-finality mocks, fixture record/replay), CLI
  (`flarekit verify|doctor`), React hooks, MCP server.
- **v1.0** — full attestation catalog (EVMTransaction, Web2Json, …), Solidity consumer
  contracts, mainnet/Songbird, docs site with llms.txt.

Full scope: [docs/planning/PRD.md](docs/planning/PRD.md).

## Status & caveats

- Coston2 is the verified network; `flare`/`songbird` presets are structural placeholders
  until their endpoints pass the same live gate.
- The Coston2 **BTC verifier route is currently down** upstream (`fault filter abort`,
  observed 2026-08-07) — BTC paths are implemented and will be gated in when Flare's
  verifier returns.
- Not audited; testnet use only for now.
