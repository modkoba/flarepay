# FlarePay / FlareKit — TODO

> Solo build for Flare Summer Signal hackathon (deadline Aug 14, Bounty 1).
> Scope source of truth: `docs/planning/PRD.md` (v3, product-first: FlarePay powered by FlareKit).
> Done = live Coston2 test green per feature (PRD §10), not "code compiles."

## Now — FlarePay P0 (submission-blocking) #product

- [ ] SDK: `fdc.verifyXrpPayment()` — XRPPayment type + proofOwner; live test with a
      destination-tagged XRPL testnet payment (fallback if needed: classic Payment+memo, proven Aug 7)
- [ ] `FlarePayEscrow.sol` (packages/contracts): createCharge / settle(proof) with
      proof + tag + FTSO-price-band + replay checks; deploy Coston2; settle live once
- [ ] Charge server (packages/pay-server): create charge, XRPL watcher, x402 endpoint
- [ ] Checkout web (packages/demo evolves): charge page → QR/XRPL URI → honest progress
      ticker → unlock → receipt page with "verify yourself"
- [ ] Self-driving demo payment: funded XRPL-testnet wallet pays on click (BYO Xaman also works)
- [ ] Submission pack: product-first README, benchmark refresh, 60s one-take video,
      DoraHacks form with judging-criteria mapping + pre-existing/new-work split

## Next — P1 (only after P0 live) #traction

- [ ] Deploy public URL + post in hackathon Telegram + 2–3 outside testers (log results)
- [ ] npm publish `@flarekit/sdk`
- [ ] Webhook signatures + idempotency
- [ ] x402 agent CLI clip (curl → 402 → pay → 200)
- [ ] Push repo to GitHub (needs your go-ahead — public repo)

## Done — foundation (Aug 7–8) #sdk

- [x] SDK v2 ported from proven phase0 flow; registry-driven; no hardcoded selectors
- [x] Live Coston2: verifyAddress XRP (132.6s) + DOGE (166.1s), verifyPayment XRP (77.1s),
      EVMTransaction Sepolia (169.6s), FTSO reads, secure random, estimate, capabilities()
- [x] FlarePay demo shell with honest progress UI; verified live in browser (141.5s settle)
- [x] Measured BENCHMARK.md; READMEs; git history from baseline
- [x] Deep research: full Flare surface map, flare-tx-sdk competitive intel,
      90-winner pattern study; XRPPayment probes + verifyXRPPayment deployed-check
- [x] PRD v3 (product-first); IDEA.md competitive claim corrected; Flare DevHub MCP configured

## Later — post-hackathon (PRD v3 §12 + toolkit v2 backlog)

- [ ] Hosted facilitator (bps fee) + `@flarekit/pay` npm (widget + middleware)
- [ ] Smart Accounts integration; FXRP/USDT0 payout leg
- [ ] Remaining attestation types (Web2Json, CBHE, BDT, RPN, XRPPaymentNonexistence)
- [ ] `@flarekit/testing` mock kit; CLI doctor; React hooks; MCP server
- [ ] BTC paths when Coston2 verifier returns; DOGE Payment via verifier indexer
- [ ] Mainnet after fee/UX validation (20 FLR per attestation, FIP.16)
