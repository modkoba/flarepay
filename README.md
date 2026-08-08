# FlarePay

**Accept XRP like Stripe — except nobody holds your money.**

Native XRP payments with programmable settlement on Flare: a merchant charges in USD, the
payer sends XRP from any XRPL wallet, and the goods are released by a **cryptographic proof
of that payment verified on-chain**. No custodial processor, no chargebacks, and the payer
needs no EVM wallet, no gas, and no bridged tokens.

Built on **[FlareKit](packages/sdk)** — our open-source TypeScript SDK for Flare's enshrined
protocols (FDC · FTSOv2 · Secure Random), which powers every step.

> Flare Summer Signal · Bounty 1 — Interoperable Asset Products · live on Coston2 + XRPL testnet

## The problem, in one line

XRP settles to anyone on Earth in ~4 seconds for ~$0.0002 — but XRPL has no smart contracts,
so accepting it means trusting a custodial processor (~1% + custody risk) or receiving a bare
payment with no escrow, no programmable release, and no verifiable receipt.

## How a payment settles

```
1. Merchant opens a charge      FlarePayEscrow.createCharge()
                                $2.00 → 1.932266 XRP at the FTSOv2 rate, pinned on-chain
                                → destination tag 1006

2. Payer sends native XRP       any XRPL wallet, tag 1006          (~4 s)

3. FDC attests the payment      kit.fdc.verifyXrpPayment()          (~90–180 s, real protocol time)
                                proof carries tag, amount, sender, memo

4. Escrow settles on Flare      FlarePayEscrow.settle(chargeId, proof)
                                ✓ proof valid (FdcVerification.verifyXRPPayment)
                                ✓ destination tag matches the charge
                                ✓ recipient == merchant's XRPL address hash
                                ✓ XRPL status == success
                                ✓ amount ≥ USD price at the pinned FTSO rate (± tolerance)
                                ✓ one settlement per XRPL transaction (replay guard)
                                → goods released, proof-backed receipt issued
```

## Proven live (2026-08-08, Coston2 + XRPL testnet)

| Flow | Result | Evidence |
|---|---|---|
| **Browser checkout** | $2.00 → 1.932266 XRP @ $1.035054, settled, receipt rendered | charge 7, round 1,419,449, settle `0xad6d0dc1…` |
| **x402 agent flow** | `402` → pay → proof → `200` + resource, 160 s | charge 5, round 1,419,445, settle `0x856eef3e…` |
| **Contract acceptance test** | createCharge → pay → settle → `isPaid` true, replay rejected | [settle-charge.json](packages/contracts/integration/out/settle-charge.json) |
| `fdc.verifyXrpPayment` | `verified: true`, tag/amount/memo/sender all intact | 123.9 s, round 1,419,428 |

**FlarePayEscrow on Coston2:** [`0xec5b10b6e81e3832bb32923aEcEd58F0747aBBDD`](https://coston2.flarescan.com/address/0xec5b10b6e81e3832bb32923aEcEd58F0747aBBDD)

## Same rail, for AI agents (x402)

Flare's own x402 guide is blocked — verbatim: *"FXRP will be supported once it implements the
required EIP-3009 standard."* FlarePay settles a **proof of a native XRP payment** instead of a
token authorization, so it works today and the agent needs only an XRPL wallet:

```bash
$ curl https://flarepay.demo/api/report
HTTP/1.1 402 Payment Required
{ "accepts": [{ "scheme": "xrpl-payment", "payTo": "rBRX…K75i", "destinationTag": 1002,
                "amount": "1.93", "asset": "XRP", "settlement": "flare-fdc-xrppayment" }] }

$ curl -H "X-Payment: 5" https://flarepay.demo/api/report
HTTP/1.1 200 OK
{ "title": "XRP Market Intelligence…",
  "settlement": { "votingRound": 1419445, "settleTx": "0x856eef3e…" } }
```

## Trust model

**Trustless:** payment existence, amount and tag (FDC proof, verified on-chain) · USD→XRP
conversion (FTSOv2, pinned at charge time) · release conditions (contract code, replay-guarded).

**Not trusted:** the FlarePay server — it only *relays* proofs, and anyone (payer, merchant, a
third party) can submit them · custody — funds go payer → merchant on the XRPL and never touch us.

**Honest about latency:** settlement finality is one FDC voting round (~90–180 s, measured).
Days faster than card settlement, with no chargebacks — but not point-of-sale coffee. The UI
shows real ETAs and never fakes progress.

## The product, not a demo

FlarePay runs as a **self-hosted payment server** (the BTCPay model — your server, your
keys, your money path) with a merchant dashboard at `/dashboard.html`:

- **Durable**: every charge, proof, and attestation handle persists to disk; charges
  survive restarts.
- **Crash-safe**: killed mid-attestation, the server *resumes* the same voting round via
  `kit.fdc.resume()` on boot — the attestation fee is never paid twice. (Tested live:
  killed at 16s, recovered, settled in round 1,419,632.)
- **Merchant API**: Bearer-key admin API — create charges, stats, activity feed.
- **Webhooks**: HMAC-SHA256-signed (`X-FlarePay-Signature`), retried, delivery-logged.
- **Dashboard**: revenue tiles, per-charge settlement chart, live charge table with
  checkout/XRPL/Flare links, create-charge with copyable hosted checkout link.

## Run it

```bash
pnpm install
pnpm --filter @flarekit/contracts build       # compile FlarePayEscrow
pnpm --filter @flarekit/pay-server start      # server on :8787 (prints your API key)
pnpm --filter @flarekit/demo dev              # landing + checkout + dashboard on :5173
```

Needs a funded Coston2 key (`phase0-research/.secrets.json`) and XRPL testnet wallets
(auto-funded from the faucet on first run). Both are gitignored.

## Repo layout

```
packages/sdk           @flarekit/sdk — FDC (5 attestation types), FTSOv2, Secure Random
packages/contracts     FlarePayEscrow.sol + compile/deploy/live-settlement tests
packages/pay-server    charges, XRPL watcher, settlement relay, x402 endpoints
packages/demo          checkout UI + proof-backed receipts
docs/planning          PRD v3 (product) · earlier toolkit/hackathon PRDs
docs/research          measured benchmark · Phase 0 protocol research
```

## The engine: FlareKit

Every chain interaction above runs through [`@flarekit/sdk`](packages/sdk):

```ts
const kit = new FlareKit({ network: "coston2", privateKey });
const result = await kit.fdc.verifyXrpPayment({ txId, proofOwner: escrow });
result.response.destinationTag;   // 1006n — typed, straight from the proof
```

Coverage today: **5 FDC attestation types** (Payment, AddressValidity, EVMTransaction,
XRPPayment, plus `capabilities()` probing), FTSOv2 feeds, Secure Random — every one gated on a
live Coston2 test. See [packages/sdk/README.md](packages/sdk/README.md) and the measured
[benchmark](docs/research/BENCHMARK.md).

## Roadmap

- **Now** — hosted facilitator + `@flarekit/pay` (drop-in checkout widget + server middleware)
- **Next** — Smart Accounts integration so payers can also *act* on Flare; optional FXRP/USDT0
  payout leg so merchants receive a DeFi-ready asset
- **Then** — mainnet after fee/UX validation (20 FLR per attestation under FIP.16)

## Status

Testnet only, not audited. Coston2 is the verified network; `flare`/`songbird` presets exist
but have not passed the same live gate.
