# FlareKit — TODO

> Solo build for Flare Summer Signal hackathon (Aug 14 deadline).
> Scope source of truth: `docs/planning/PRD.md` (v2 full product; Milestone 1 = hackathon).
> Done = live Coston2 integration test green (PRD §12), not "code compiles."

## Now — Milestone 1 P0 (submission-blocking) #sdk

- [x] git init (secrets audit passed: only .env.example tracked)
- [ ] push to GitHub (public repo — needs your go-ahead)
- [x] Rebuild SDK core as direct port of `phase0-research/scripts/run-phase0-test.ts`
      — registry-driven addresses, real ABIs via ethers.Contract, NO hardcoded selectors
- [x] `kit.fdc.verifyAddress()` — green live test on Coston2 (132.6s, proof reuse ✓)
- [x] `kit.fdc.verifyPayment()` XRP — green live test on Coston2 (77.1s, real XRPL tx)
- [x] Aug 9 gate resolved early (Aug 7): Coston2 BTC verifier is DOWN upstream
      ("fault filter abort") → XRP-first demo; BTC/DOGE paths ready when verifier returns
- [x] `kit.fdc.estimate()` + progress events (`prepared → submitted → round → proof → verified`)
- [x] Typed errors thrown from live-reproduced failures (VerifierRejectedError proven
      live: "NOT NATIVE PAYMENT TRANSACTION" surfaced with code+fix)
- [x] `kit.ftso.read()` price feed — green live test (+ `random.get()`, free win)
- [x] FlarePay checkout demo (honest ~2min progress UI + recorded replay), verified in browser
- [ ] Deploy demo to public URL (Vercel/Netlify — needs your account/go-ahead;
      3 proxy rewrites documented in vite.config.ts)
- [x] BENCHMARK.md with measured numbers (manual phase0 vs SDK, tx hashes included)
- [x] Root README + SDK README rewritten against the real API
- [ ] npm publish `@flarekit/sdk@0.1` (publishing — needs your go-ahead)
- [ ] 60s demo video (needs you: screen record the demo replay + live run)
- [ ] Submission writeup mapped to all five judging criteria

## Next — Milestone 1 P1 (only after P0 deployed) #dx

- [ ] `@flarekit/testing` mock kit — instant finality, fixture record/replay
      (fixtures already recorded in packages/sdk/integration/out/)
- [ ] CLI: `flarekit verify`, `flarekit doctor`
- [ ] `@flarekit/react` hooks (`useVerifyPayment` status machine)
- [ ] `@flarekit/mcp` server — Claude zero-shot verify demo

## Later — post-hackathon (PRD Milestones 2–3)

- [ ] BTC + DOGE payment live tests (blocked upstream: Coston2 BTC verifier down 2026-08-07)
- [ ] EVMTransaction + Web2Json attestation types
- [ ] `@flarekit/contracts` — FdcConsumerBase + escrow/paywall examples
- [ ] Docs site with llms.txt, CI-compiled snippets
- [ ] Songbird + mainnet presets through the live gate
- [ ] `flarekit init` scaffolding templates
- [ ] 3+ external adopters, MCP registry listing
