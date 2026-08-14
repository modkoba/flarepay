# FlarePay / FlareKit — TODO

> Solo build for Flare Summer Signal hackathon (deadline **Aug 14 — today**, Bounty 1).
> Scope source of truth: the PRD in the local (unpublished) planning notes.
> Done = live Coston2 test green per feature, not "code compiles."

## Now — submission blockers (Aug 14) #submission

Ship order: README first (judges read it before they run anything), then push, then
deploy, then video.

- [x] **README rewritten** (Aug 14) — leads with "Settle by proof, not by signature"
      to match the product; x402/EIP-3009 comparison table with the honest
      "not wire-compatible with EIP-3009 facilitators" scope note; XrpAccessPass
      section (the database-can't-do-this argument); Proven-live table expanded to 9
      rows incl. access pass, Kelvin, crash recovery; all three contract addresses;
      platform-vs-local modes replacing the stale "self-hosted only" framing;
      repo layout + roadmap corrected. Every link and claim verified against code.
- [x] **Pushed public: https://github.com/modkoba/flarepay** (Aug 14) — 34 commits, all
      authored modkoba. Before publishing: purged two live `fpk_` API keys (verification
      dumps in `packages/pay-server/out/`, since confirmed dead — absent from both
      Supabase and the local store), purged Ward and its ~7k lines of vendored Kinetic
      Solidity from history, and excluded `docs/planning/`. Local tag
      `backup-pre-opensource-20260814-2315` still holds the pre-purge history — never
      push tags, and delete it once you're happy.
- [ ] Deploy demo + charge server to a public URL (needs your hosting choice)
- [~] 3-min demo video — script + narration written (local planning notes, unpublished).
      Structure starts a real payment at 0:20 and fills the FDC round with the argument,
      so the 90–180 s wait is shown honestly with a running clock rather than cut around.
      ElevenLabs voiceover generated for all 8 beats; runs 3:49, so it needs trimming to
      fit 3:00. Remaining: dry run, trim, record, edit.
- [~] Submission writeup — vision, description (one-liner / short / full), proven-live
      table, contract addresses and roadmap drafted in the local planning notes.
      Still to write: judging-criteria mapping and the pre-existing vs new work split.

## Now — verified green (Aug 14 audit)

- [x] `pnpm -r build` clean across all four packages (sdk tsc, contracts solc,
      pay-server `tsc --noEmit`, demo vite build)
- [x] SDK unit suite: 17/17 pass
- [x] Server boots PLATFORM (Supabase) mode, hydrated 12 charges from Postgres;
      `/api/assets` live-probes the verifier (XRP available, DOGE/BTC honest reasons)
- [x] No secrets tracked by git — only `.env.example` files; `.secrets.json`,
      `.env`, wallet JSONs all ignored

## Next — P1 (traction & polish)

- [ ] 2–3 outside testers run the checkout; log results as traction signal
- [ ] npm publish `@flarekit/sdk`

## Deferred — multi-asset (was PRD v4 P0; not making the deadline) #platform

Cut honestly rather than faked: the asset menu already lists DOGE/BTC with a live
reason string, so the product tells the truth about what it can settle today.

- [ ] FlarePayEscrowV2: asset-agnostic charges (feedId param), settleXrp + settleUtxo,
      shared replay guard; deploy + re-prove XRP live (regression gate)
- [ ] DOGE: xpub → per-charge deposit address, verifier-indexer watcher, settleUtxo
      (Flare's DOGE verifier already probes *ready* — escrow v2 is the only blocker)
- [ ] Checkout: per-asset payment instructions (XRP-only today)
- [ ] x402 `accepts[]` driven by `assets()` instead of hardcoded XRP (correct output
      today, since XRP is the only settleable asset — becomes wrong the moment v2 lands)

## Done — platform: accounts + multi-tenancy (Aug 9–11) #platform

- [x] Auth: Supabase Auth (GoTrue JWTs, JWKS-verified via `getClaims`) replaced the
      planned scrypt/HMAC-cookie scheme; `auth.html` signup/login, demo account seeded
- [x] Multi-tenant store: Postgres (`supabase/migrations/0001_platform.sql`) — accounts,
      per-account `fpk_` API keys, webhooks, payout, charges, all tenant-scoped;
      LOCAL JSON mode still works with no Supabase keys set (nothing proven earlier broke)
- [x] Dashboard: login gate (redirects to `/auth.html`), payout settings, API key panel,
      asset picker
- [x] Asset menu driven by live `kit.fdc.capabilities()` probes — BTC/DOGE show why they
      are unavailable instead of being hidden or faked
- [x] Onboarding: collect the merchant's payout address before charges
- [x] Wallet-extension payments (GemWallet) + split hosted checkout onto its own page

## Done — proof-of-access demo (Aug 10–11) #product

- [x] `XrpAccessPass.sol` + `PremiumVault` deployed Coston2
      (`0x91Cf78f8b2063C13Fc1FB5E4eE542413cD82B440` / `0x4E4aCE078e3cC725DBFE6E2499315A576ce56CBc`)
      — a native XRP payment drives an unrelated Flare contract's state
- [x] Proof-of-access UI (`pass.html`): watch a Flare contract change state
- [x] Kelvin API — an example merchant built on FlarePay (credit packs, `example.html`)
- [x] Repositioned around agent payments: x402 first, merchants second
- [x] Landing page rebuilt on award-winning fintech patterns; three overclaims corrected
      and the demo payer capped
- [x] Ward moved out to its own repository (out of scope for this submission)

## Done — product hardening + dashboard (Aug 8) #product

- [x] Durable store: charges/proofs/attestation handles/config persist (JSON, atomic);
      charge expiry handled on recovery
- [x] Crash recovery via SDK resume(): killed mid-attestation at 16s, restarted,
      resumed same round 1,419,632, settled 0xd22f16ee… — fee paid once
- [x] Admin API (Bearer key, timing-safe) + HMAC-SHA256 webhooks (retries, delivery log,
      verified against a local sink: sigValid true)
- [x] Merchant dashboard (/dashboard.html): revenue tiles, settlement chart (dataviz-
      validated palette), live table, create-charge + hosted checkout link, webhook
      settings, activity feed — verified live ($3.50 settled, avg 1m 55s)

## Done — FlarePay product (Aug 8) #product

- [x] SDK `fdc.verifyXrpPayment()` — XRPPayment type (0x08) + proofOwner binding;
      live: verified true, tag/amount/memo/sender intact (123.9s, round 1,419,428)
- [x] SDK `waitForIndexMs` + `waiting-index` step — fresh payments aren't in the verifier's
      indexer yet; born from a real failure
- [x] `FlarePayEscrow.sol` deployed Coston2 `0xec5b10b6e81e3832bb32923aEcEd58F0747aBBDD`;
      proof + tag + merchant-hash + XRPL-status + FTSO-band + replay-guard checks
- [x] Live acceptance: createCharge → real XRPL payment → proof → settle → isPaid true,
      replay rejected (charge 1, round 1,419,435)
- [x] Charge server: FTSO-priced charges, XRPL watcher, settlement relay, proof caching,
      serialized tx queue (nonce race fix)
- [x] x402 mode proven live: 402 → pay → 200 + resource in 160s (charge 5, round 1,419,445)
- [x] Checkout UI + receipts proven live in browser (charge 7, round 1,419,449);
      `?charge=N` restores a shareable, refresh-proof receipt
- [x] README (product-first), BENCHMARK with FlarePay numbers + gas costs

## Done — FlareKit foundation (Aug 7–8) #sdk

- [x] SDK v2 ported from proven phase0 flow; registry-driven; no hardcoded selectors
- [x] Live Coston2: verifyAddress XRP + DOGE, verifyPayment XRP, EVMTransaction (Sepolia),
      FTSO reads, secure random, estimate, capabilities()
- [x] Deep research: full Flare surface map, flare-tx-sdk competitive intel, 90-winner study
- [x] PRD v3 product pivot; IDEA.md competitive claim corrected; Flare DevHub MCP configured

## Later — post-hackathon (PRD v3 §12)

- [ ] Hosted facilitator (bps fee) + `@flarekit/pay` npm (widget + middleware)
- [ ] Smart Accounts integration; FXRP/USDT0 payout leg
- [ ] Remaining attestation types (Web2Json, CBHE, BDT, RPN, XRPPaymentNonexistence)
- [ ] `@flarekit/testing` mock kit; CLI doctor; React hooks; MCP server
- [ ] BTC paths when the Coston2 verifier returns; DOGE Payment via verifier indexer
- [ ] Mainnet after fee/UX validation (20 FLR per attestation, FIP.16)
