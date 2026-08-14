# FlarePay

**Settle by proof, not by signature.**

An agent — or a customer — pays in **native XRP**: no EVM wallet, no token standard, no gas,
no bridge. Flare's Data Connector proves the payment landed on the XRP Ledger, and a contract
on Flare releases the goods. Nobody takes custody and there are no chargebacks.

Built on **[FlareKit](packages/sdk)** — our open-source TypeScript SDK for Flare's enshrined
protocols (FDC · FTSOv2 · Secure Random), which powers every step.

> Flare Summer Signal · Bounty 1 — Interoperable Asset Products · live on Coston2 + XRPL testnet

## The problem, in one line

XRP settles to anyone on Earth in ~4 seconds for ~$0.0002 — but XRPL has no smart contracts,
so accepting it means trusting a custodial processor (~1% + custody risk) or receiving a bare
payment with no escrow, no programmable release, and no verifiable receipt.

## Why not just use x402?

x402's `exact` scheme needs the asset to be an ERC-20 implementing **EIP-3009**. Flare's own
x402 guide says so verbatim — *"FXRP will be supported once it implements the required EIP-3009
standard"* — and demos with a mock token in the meantime.

|  | x402 `exact` | FlarePay `xrpl-payment` |
|---|---|---|
| Asset | ERC-20 with EIP-3009 | native XRP |
| Payer needs | EVM wallet + gas + bridged token | an XRPL wallet |
| Settled by | a signature the payer produces | a **proof** that a payment happened |
| Works with XRP today | no | yes |

We settle a proof of a payment rather than a token authorization, so the payer never touches
the EVM at all.

**Honest scope:** this is the x402 *pattern* with our own `xrpl-payment` scheme — a legitimate
custom scheme (x402 is designed to be pluggable), but **not wire-compatible with EIP-3009
facilitators**.

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

## What the proof buys that a database can't

A credit balance in a server's database can only ever be honoured by that server. Any *other*
contract has to take the server's word for it, which on-chain means it cannot be used at all.

**[XrpAccessPass](packages/contracts/src/XrpAccessPass.sol)** makes the consequence contract
state instead. A native XRP payment grants an on-chain pass, and **PremiumVault** — a
deliberately unrelated contract that knows nothing about payments, XRP, or FlarePay — gates on
it by reading the pass and nothing else.

The recipient is pinned into the charge metadata on-chain *before* the payment exists, and
`claim()` rebuilds the expected string from the supplied recipient and compares hashes. So
`claim()` is permissionless — anyone, including a relayer paying gas for a payer who holds no
FLR — and still cannot redirect the grant. **You supply an address, never a wallet: no key, no
gas, no signature.**

[`/pass.html`](packages/demo/pass.html) runs the loop and reads both contracts **directly from
Coston2 in the browser** over a public RPC, not through our API — so if the server lied about a
grant, the panel would contradict it.

## Proven live on Coston2 + XRPL testnet

| Flow | Result | Evidence |
|---|---|---|
| **Browser checkout** | $2.00 → 1.932266 XRP @ $1.035054, settled, receipt rendered | charge 7, round 1,419,449, settle `0xad6d0dc1…` |
| **x402 agent flow** | `402` → pay → proof → `200` + resource, 160 s | charge 5, round 1,419,445, settle `0x856eef3e…` |
| **Access pass** (script) | `canRead` false → **true**; redirect to attacker rejected, replay rejected | charge 23, tag 1022, round 1,421,774, settle `0xaa3d1aa1…`, claim `0x60b1084b…` |
| **Access pass** (in-browser) | fresh `0x566EddAc…` false → true, `premiumValue()` → 347 | charge 24, tag 1023, round 1,421,780, claim `0xc8598f1b…` |
| **Kelvin API** (example merchant) | top-up settled at t=120 s, then 5 calls at 2.51 / 1.34 / 0.78 / 0.71 / 0.66 ms | charge 22, round 1,421,768, settle `0x7a652d31…` |
| **Crash recovery** | killed mid-attestation at 16 s → resumed the same round, fee paid once | round 1,419,632, settle `0xd22f16ee…` |
| **Contract acceptance test** | createCharge → pay → settle → `isPaid` true, replay rejected | [settle-charge.json](packages/contracts/integration/out/settle-charge.json) |
| `fdc.verifyXrpPayment` | `verified: true`, tag/amount/memo/sender all intact | 123.9 s, round 1,419,428 |
| **Demo-payer cap** | $2 charge pays, $50 charge refused (faucet-drain guard) | `DEMO_PAY_MAX_CENTS` |

**Deployed on Coston2**

| Contract | Address |
|---|---|
| FlarePayEscrow | [`0xec5b10b6e81e3832bb32923aEcEd58F0747aBBDD`](https://coston2.flarescan.com/address/0xec5b10b6e81e3832bb32923aEcEd58F0747aBBDD) |
| XrpAccessPass | [`0x91Cf78f8b2063C13Fc1FB5E4eE542413cD82B440`](https://coston2.flarescan.com/address/0x91Cf78f8b2063C13Fc1FB5E4eE542413cD82B440) |
| PremiumVault | [`0x4E4aCE078e3cC725DBFE6E2499315A576ce56CBc`](https://coston2.flarescan.com/address/0x4E4aCE078e3cC725DBFE6E2499315A576ce56CBc) |

## Trust model

**Trustless:** payment existence, amount and tag (FDC proof, verified on-chain) · USD→XRP
conversion (FTSOv2, pinned at charge time) · release conditions (contract code, replay-guarded)
· the access grant (contract state any contract can read).

**Not trusted:** the FlarePay server — it only *relays* proofs, and anyone may submit them, so
we can **stall** a settlement but never **block** one · custody — funds go payer → merchant on
the XRPL and never touch us.

**Honest about latency:** settlement finality is one FDC voting round (~90–180 s, measured).
Days faster than card settlement, with no chargebacks — but not point-of-sale coffee. The UI
shows real ETAs and never fakes progress.

**Honest about cost:** on mainnet FIP.16 sets the attestation fee at ~20 FLR plus ~550k gas per
settlement. That is a flat network cost, not a percentage — good for a $25 charge, and it means
cent-sized payments genuinely don't work. Batch them instead (see Kelvin, below).

## The latency answer: pay the proof once, amortise it

[Kelvin API](packages/pay-server/src/example-merchant.ts) is a fictional customer built on
FlarePay using only the public API an outside integrator would have. It sells prepaid credits,
which is the honest answer to proof-settled latency: the FDC round is spent **once**, at top-up,
and every call afterwards draws down a balance that was already proven on-chain.

Measured: **120 seconds once, then sub-millisecond forever.** It is also what makes a 20 FLR
mainnet attestation rational — per pack, not per request.

## The product

FlarePay runs as a **multi-tenant payment platform**, and the same server also runs
single-tenant on your own box (the BTCPay model) with no external dependencies:

- **Platform mode** (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) — Supabase Auth signup/login,
  per-account `fpk_` API keys, Postgres persistence, every route tenant-scoped, demo account
  seeded.
- **Local mode** (no keys) — the original single-tenant JSON store. Nothing proven before
  Supabase existed stopped working.

Either way you get:

- **Merchant dashboard** (`/dashboard.html`) — login gate, revenue tiles, per-charge settlement
  chart, live charge table with checkout/XRPL/Flare links, create-charge with copyable hosted
  checkout link, payout address, API key panel, activity feed.
- **Hosted checkout** (`/pay.html`) — shareable link, wallet-extension payments (GemWallet),
  `?charge=N` restores a refresh-proof, proof-backed receipt.
- **Crash-safe settlement** — killed mid-attestation, the server *resumes* the same voting round
  via `kit.fdc.resume()` on boot, so the attestation fee is never paid twice.
- **Webhooks** — HMAC-SHA256-signed (`X-FlarePay-Signature`), retried, delivery-logged.
- **Merchant API** — Bearer-key admin API for charges, stats and the activity feed.
- **Asset menu from live capability probes** — `kit.fdc.capabilities()` decides what is
  offered, so DOGE and BTC are listed with the real reason they are unavailable rather than
  hidden or faked.

**Pricing:** 0% of your revenue. The only cost is the flat network fee per settlement.

## Run it

```bash
pnpm install
pnpm --filter @flarekit/contracts build       # compile FlarePayEscrow + XrpAccessPass
pnpm --filter @flarekit/pay-server start      # server on :8787 (prints your API key)
pnpm --filter @flarekit/demo dev              # landing + checkout + dashboard on :5173
```

Needs a funded Coston2 key (`phase0-research/.secrets.json`) and XRPL testnet wallets
(auto-funded from the faucet on first run). Both are gitignored. Set the Supabase keys in
`packages/pay-server/.env` for platform mode, or leave them out to run single-tenant.

Pages: `/` landing · `/auth.html` signup · `/dashboard.html` merchant · `/pay.html` checkout ·
`/pass.html` proof-of-access · `/example.html` Kelvin API.

### Deploy

[`vercel.json`](vercel.json) builds the front end and rewrites the three public
endpoints that send no CORS headers (Flare's verifier, the DA layer, XRPL testnet), so
the landing page runs — live FDC round included — with no back end at all. Charges need
the server, so once it's hosted add one more rewrite:

```json
{ "source": "/pay-api/:path*", "destination": "https://YOUR-SERVER/:path*" }
```

Until then the asset grid falls back to what the deployed contracts support and says so,
rather than posing as a live probe.

## Repo layout

```
packages/sdk           @flarekit/sdk — FDC (5 attestation types), FTSOv2, Secure Random
packages/contracts     FlarePayEscrow.sol · XrpAccessPass.sol + PremiumVault
                       compile/deploy scripts + live-settlement tests
packages/pay-server    charges, XRPL watcher, settlement relay, x402 endpoints,
                       multi-tenant platform (Supabase) or local JSON store
packages/demo          landing, auth, dashboard, checkout, proof-of-access, Kelvin
supabase/migrations    Postgres schema for the platform mode
docs/research          measured benchmark · Phase 0 protocol research
```

## The engine: FlareKit

Every chain interaction above runs through [`@flarekit/sdk`](packages/sdk):

```ts
const kit = new FlareKit({ network: "coston2", privateKey });
const result = await kit.fdc.verifyXrpPayment({ txId, proofOwner: escrow });
result.response.destinationTag;   // 1006n — typed, straight from the proof
```

Doing this by hand means six contracts and hand-rolled selectors. FlareKit is one call, with
fee estimation, progress events and crash-resume.

Coverage today: **5 FDC attestation types** (Payment, AddressValidity, EVMTransaction,
XRPPayment, plus `capabilities()` probing), FTSOv2 feeds, Secure Random — every one gated on a
live Coston2 test. See [packages/sdk/README.md](packages/sdk/README.md) and the measured
[benchmark](docs/research/BENCHMARK.md).

## Roadmap

- **Next** — `@flarekit/pay` (drop-in checkout widget + server middleware) · FlarePayEscrowV2
  with asset-agnostic charges and `settleUtxo`, which is the only thing standing between the
  live DOGE verifier and DOGE checkout
- **Then** — Smart Accounts so payers can also *act* on Flare; optional FXRP/USDT0 payout leg
  so merchants receive a DeFi-ready asset
- **Later** — mainnet after fee/UX validation (20 FLR per attestation under FIP.16)

## Status

Testnet only, not audited. Coston2 is the verified network; `flare`/`songbird` presets exist
but have not passed the same live gate. XRP is the only asset that settles today — the asset
menu says so, live, rather than implying otherwise.
