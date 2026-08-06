# FlareKit — Action Items

## Phase 0: Research & Validation (Days 1–3)

**Objective:** Understand every part of the FDC developer experience by doing it manually. Never write SDK code before this is complete.

### Day 1: Payment Verification Flow

- [ ] **0.1** Set up development environment
  - [ ] Install Node.js 18+
  - [ ] Install ethers.js v6
  - [ ] Set up MetaMask with Coston2 network
  - [ ] Fund demo wallet from Coston2 faucet

- [ ] **0.2** Run official Payment Verification guide end-to-end
  - [ ] Read the official Flare FDC payment verification guide
  - [ ] Identify all contracts involved (FdcHub, Relay, FdcVerification, FeeConfiguration)
  - [ ] Note contract addresses on Coston2
  - [ ] Step through each contract call manually
  - [ ] Record: number of commands, files edited, time taken, pain points

- [ ] **0.3** Measure every step
  - [ ] Time: ABI encoding
  - [ ] Time: fee estimation
  - [ ] Time: fee payment transaction
  - [ ] Time: waiting for voting round
  - [ ] Time: proof retrieval
  - [ ] Time: proof verification
  - [ ] Time: response decoding

- [ ] **0.4** Document the flow
  - [ ] Create sequence diagram for payment verification
  - [ ] List all contract methods called (name, inputs, outputs)
  - [ ] List all ABI encodings required
  - [ ] Map fee calculation logic

### Day 2: Additional Attestations + Failure Cases

- [ ] **0.5** Complete XRP verification
  - [ ] Same exercise as BTC — what changes?
  - [ ] Identify common abstractions vs. differences
  - [ ] Can we design `verifyPayment()` to handle both?

- [ ] **0.6** Complete balance attestation
  - [ ] Verify an XRP account balance
  - [ ] Compare flow to payment verification
  - [ ] Can we design `verifyBalance()`?

- [ ] **0.7** Test failure scenarios
  - [ ] Submit with fee too low — what error?
  - [ ] Submit invalid request — what error?
  - [ ] Simulate verifier offline — what happens?
  - [ ] Trigger timeout — what happens?
  - [ ] Submit wrong proof — what error?
  - [ ] Document each error with: error message, contract, recovery action

- [ ] **0.8** Research fee flow
  - [ ] Is fee dynamic or fixed?
  - [ ] How is fee calculated per attestation type?
  - [ ] What happens to unconfirmed request fees?
  - [ ] Can fees be sponsored?
  - [ ] Is there a fee cache?

### Day 3: Architecture + Benchmark

- [ ] **0.9** Trace every contract interaction
  - [ ] FdcHub: inputs, outputs, events
  - [ ] Relay: inputs, outputs, events
  - [ ] FdcVerification: inputs, outputs, events
  - [ ] FeeConfiguration: inputs, outputs, events
  - [ ] DA Layer: how to query, what format

- [ ] **0.10** Create benchmark document
  - [ ] Manual flow: command count, file count, time per step
  - [ ] SDK flow: planned function calls, estimated time
  - [ ] Before/after comparison table

- [ ] **0.11** Draft SDK API
  - [ ] Based on research, design the public API
  - [ ] `kit.payment.verify(txHash, currency)` → typed result
  - [ ] `kit.payment.quoteFee(currency)` → fee estimate
  - [ ] Error classes for each failure mode
  - [ ] Provider interface (ethers, viem, custom)
  - [ ] Wallet interface (private key, MetaMask)

### Phase 0 Deliverable

- [ ] `docs/RESEARCH_NOTES.md` — Full research findings
- [ ] `docs/BENCHMARK.md` — Manual vs. SDK comparison
- [ ] `docs/API_DESIGN.md` — Proposed public API with types
- [ ] `docs/SEQUENCE_DIAGRAMS.md` — Flow diagrams for each attestation type

---

## Phase 1: SDK MVP (Days 4–8)

**Objective:** Build the minimum SDK that powers the demo.

### Day 4: Project Setup

- [ ] **1.1** Initialize monorepo
  - [ ] Create project structure
  - [ ] Set up pnpm workspaces
  - [ ] Configure TypeScript (strict mode)
  - [ ] Configure ESLint + Prettier
  - [ ] Set up Vitest for testing

- [ ] **1.2** Create SDK package skeleton
  - [ ] `packages/sdk/package.json`
  - [ ] `packages/sdk/tsconfig.json`
  - [ ] `packages/sdk/src/index.ts` — public exports
  - [ ] `packages/sdk/src/FlareKit.ts` — main class

### Day 5: Core Infrastructure

- [ ] **1.3** Provider abstraction
  - [ ] `Provider` interface (connect, getBlock, estimateGas)
  - [ ] `EthersProvider` implementation
  - [ ] Network presets (Coston2, Songbird, Mainnet)

- [ ] **1.4** Wallet abstraction
  - [ ] `Wallet` interface (signTransaction, getAddress)
  - [ ] `PrivateKeyWallet` implementation
  - [ ] `MetaMaskWallet` implementation

- [ ] **1.5** Contract interfaces
  - [ ] TypeScript types for FdcHub, Relay, FdcVerification
  - [ ] ABIs (imported from Flare's repo or generated)

### Day 6: Payment Verification

- [ ] **1.6** Fee quoting
  - [ ] `kit.payment.quoteFee(currency)` — reads FeeConfiguration contract
  - [ ] Gas estimation for request transaction
  - [ ] Returns total cost in FLR

- [ ] **1.7** Fee payment + request submission
  - [ ] `kit.payment.request(txHash, currency)` — calls FdcHub
  - [ ] ABI encoding of attestation request
  - [ ] Transaction submission with fee
  - [ ] Transaction receipt handling

### Day 7: Polling + Proof Retrieval

- [ ] **1.8** Polling mechanism
  - [ ] `kit.payment.waitForProof(requestId, timeout)` — polls DA Layer
  - [ ] Exponential backoff
  - [ ] Configurable timeout (default: 5 minutes)
  - [ ] Progress events (optional, for demo)

- [ ] **1.9** Proof retrieval + verification
  - [ ] Fetch proof from DA Layer
  - [ ] Submit proof to FdcVerification
  - [ ] Decode response
  - [ ] Return typed result

### Day 8: Error Handling + Polish

- [ ] **1.10** Error hierarchy
  - [ ] `FlareKitError` — base class
  - [ ] `FeeTooLowError`
  - [ ] `VerifierOfflineError`
  - [ ] `ProofTimeoutError`
  - [ ] `InvalidRequestError`
  - [ ] `NetworkError`

- [ ] **1.11** Unit tests
  - [ ] Test fee quoting (mock contract)
  - [ ] Test request submission (mock contract)
  - [ ] Test polling (mock DA Layer)
  - [ ] Test error handling

- [ ] **1.12** Integration test on Coston2
  - [ ] End-to-end test with real BTC testnet transaction
  - [ ] Verify all steps work in sequence
  - [ ] Record actual timings

### Phase 1 Deliverable

- [ ] `packages/sdk/src/` — Complete SDK source
- [ ] `packages/sdk/test/` — Unit + integration tests
- [ ] `packages/sdk/README.md` — SDK documentation
- [ ] Verified working end-to-end on Coston2

---

## Phase 2: Demo Application (Days 9–11)

**Objective:** Build a demo app that showcases the SDK for judges.

### Day 9: Demo Setup

- [ ] **2.1** Initialize demo project
  - [ ] Create `demo/` directory
  - [ ] Set up Vite + vanilla TypeScript
  - [ ] Add Tailwind CSS
  - [ ] Link SDK package

- [ ] **2.2** Build UI shell
  - [ ] Header with FlareKit branding
  - [ ] Input section (tx hash input + verify button)
  - [ ] Results section
  - [ ] Benchmark section
  - [ ] Footer

### Day 10: Demo Logic

- [ ] **2.3** Wire up SDK to UI
  - [ ] Import FlareKit in demo
  - [ ] Connect verify button to `kit.payment.verify()`
  - [ ] Show progress during verification
  - [ ] Display results on completion

- [ ] **2.4** Add benchmark display
  - [ ] Show manual flow vs. SDK flow comparison
  - [ ] Display actual timings from integration test
  - [ ] Calculate percentage improvement

- [ ] **2.5** Error handling in demo
  - [ ] Show user-friendly error messages
  - [ ] Handle network failures gracefully
  - [ ] Show retry button on failure

### Day 11: Polish + Deploy

- [ ] **2.6** Visual polish
  - [ ] Responsive design (mobile-friendly)
  - [ ] Loading states
  - [ ] Color scheme (Flare brand colors)
  - [ ] Add Flare logo/branding

- [ ] **2.7** Demo data
  - [ ] Find stable BTC testnet transaction
  - [ ] Pre-fill input with sample tx hash
  - [ ] Test with sample data

- [ ] **2.8** Deploy
  - [ ] Deploy to Vercel / Netlify
  - [ ] Test from fresh browser
  - [ ] Verify public URL works

### Phase 2 Deliverable

- [ ] Live demo at public URL
- [ ] Demo works end-to-end on Coston2
- [ ] Mobile responsive
- [ ] Judges can test without local setup

---

## Phase 3: Documentation + Submission (Days 12–14)

**Objective:** Create submission materials and finalize the project.

### Day 12: Documentation

- [ ] **3.1** Write README.md
  - [ ] Project description + tagline
  - [ ] Installation (`npm install @flarekit/sdk`)
  - [ ] 2-minute quickstart code example
  - [ ] Benchmark comparison
  - [ ] Architecture overview
  - [ ] Contributing guide
  - [ ] License

- [ ] **3.2** Write BENCHMARK.md
  - [ ] Manual flow: step-by-step with timings
  - [ ] SDK flow: step-by-step with timings
  - [ ] Comparison table
  - [ ] Methodology notes

- [ ] **3.3** Write GETTING_STARTED.md
  - [ ] Prerequisites
  - [ ] Installation
  - [ ] First verification (step-by-step)
  - [ ] Common mistakes
  - [ ] Troubleshooting

### Day 13: Submission Preparation

- [ ] **3.4** Record demo video
  - [ ] 60-second screen recording
  - [ ] Problem → Demo → Benchmark → Code
  - [ ] Upload to YouTube (unlisted)

- [ ] **3.5** Prepare submission text
  - [ ] Project name
  - [ ] Bounty selection
  - [ ] Product description (200 words)
  - [ ] Target user
  - [ ] Demo link
  - [ ] GitHub repo link
  - [ ] Flare integration explanation
  - [ ] New work description
  - [ ] Deployment details (Coston2)
  - [ ] Roadmap (3 bullets)
  - [ ] Benchmark numbers

- [ ] **3.6** Final repository cleanup
  - [ ] Remove any secrets/keys
  - [ ] Clean up console.logs
  - [ ] Ensure all tests pass
  - [ ] Add LICENSE file
  - [ ] Pin dependency versions

### Day 14: Submit + Buffer

- [ ] **3.7** Submit to DoraHacks
- [ ] **3.8** Share in Flare Hackathon Telegram
- [ ] **3.9** Buffer for last-minute fixes
  - [ ] Fix any bugs found during submission prep
  - [ ] Update README if needed
  - [ ] Verify demo is still live

### Phase 3 Deliverable

- [ ] Submitted to Flare Summer Signal
- [ ] Demo video published
- [ ] GitHub repo is clean and public
- [ ] All documentation complete
