# FlarePay / FlareKit — TODO

> Solo build for Flare Summer Signal hackathon (deadline Aug 14, Bounty 1).
> Scope source of truth: `docs/planning/PRD.md` (v3, product-first: FlarePay powered by FlareKit).
> Done = live Coston2 test green per feature (PRD §10), not "code compiles."

## Now — remaining P0 (submission-blocking)

- [ ] Deploy demo + charge server to a public URL (needs your hosting choice)
- [ ] Push repo to GitHub (needs your go-ahead — public repo)
- [ ] 60s demo video: checkout (real timing, uncut) + x402 curl clip
- [ ] Submission writeup: judging-criteria mapping, pre-existing vs new work, contract
      addresses, roadmap

## Next — P1 (traction & polish)

- [ ] 2–3 outside testers run the checkout; log results as traction signal
- [ ] npm publish `@flarekit/sdk`
- [ ] Webhook signatures + idempotent delivery for merchants
- [ ] Charge expiry sweeper (expired charges currently just stop being payable)

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
