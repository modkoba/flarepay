# FlareKit — TODO

> Solo build for Flare Summer Signal hackathon (Aug 14 deadline).
> Scope source of truth: `docs/planning/PRD.md` (v2 full product; Milestone 1 = hackathon).
> Done = live Coston2 integration test green (PRD §12), not "code compiles."

## Now — Milestone 1 P0 (submission-blocking) #sdk

- [ ] git init + push to GitHub (secrets audit first: .secrets.json, .env excluded)
- [ ] Rebuild SDK core as direct port of `phase0-research/scripts/run-phase0-test.ts`
      — registry-driven addresses, real ABIs via ethers.Contract, NO hardcoded selectors
- [ ] `kit.fdc.verifyAddress()` — green live test on Coston2 (proven path)
- [ ] `kit.fdc.verifyPayment()` XRP — green live test on Coston2
- [ ] Aug 9 gate: BTC testnet tx indexed by verifier? yes → BTC payment path; no → XRP-first demo
- [ ] `kit.fdc.estimate()` + progress events (`prepared → submitted → round → proof → verified`)
- [ ] Typed errors thrown from live-reproduced failures (not dead code)
- [ ] `kit.ftso.read()` price feed — green live test
- [ ] FlarePay checkout demo (honest ~2min progress UI + cached replay), deployed, public URL
- [ ] BENCHMARK.md with measured numbers (manual flow already timed; time the SDK flow)
- [ ] README quickstart (tested on someone else), 60s video
- [ ] npm publish `@flarekit/sdk@0.1`
- [ ] Submission writeup mapped to all five judging criteria

## Next — Milestone 1 P1 (only after P0 deployed) #dx

- [ ] `@flarekit/testing` mock kit — instant finality, fixture record/replay
- [ ] CLI: `flarekit verify`, `flarekit doctor`
- [ ] `@flarekit/react` hooks (`useVerifyPayment` status machine)
- [ ] `@flarekit/mcp` server — Claude zero-shot verify demo

## Later — post-hackathon (PRD Milestones 2–3)

- [ ] DOGE + EVMTransaction + Web2Json attestation types
- [ ] `@flarekit/contracts` — FdcConsumerBase + escrow/paywall examples
- [ ] Docs site with llms.txt, CI-compiled snippets
- [ ] Songbird + mainnet presets
- [ ] `flarekit init` scaffolding templates
- [ ] 3+ external adopters, MCP registry listing
