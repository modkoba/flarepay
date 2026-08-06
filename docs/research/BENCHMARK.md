# FlareKit — Benchmark: Manual FDC Flow vs. SDK Flow

## Methodology

All measurements are from running the FDC payment verification flow manually on Coston2 testnet.
SDK flow numbers are estimates based on the planned API design.

---

## Manual FDC Flow

### Setup

| Step | Command / Action | Time | Pain? |
|---|---|---|---|
| 1 | Install Node.js + dependencies | | |
| 2 | Install ethers.js | | |
| 3 | Create project directory | | |
| 4 | Configure Coston2 RPC | | |
| 5 | Set up MetaMask + Coston2 | | |
| 6 | Fund wallet from faucet | | |
| 7 | Find contract addresses | | |
| 8 | Copy ABIs | | |
| **Setup Total** | **__ commands, __ files** | **__ min** | |

### Verification (One Payment)

| Step | Commands | Code Lines | Time | Pain? |
|---|---|---|---|---|
| 1. ABI encode attestation request | | | | |
| 2. Read fee from FeeConfiguration | | | | |
| 3. Estimate gas | | | | |
| 4. Submit attestation request (FdcHub) | | | | |
| 5. Pay fee in separate tx | | | | |
| 6. Record request ID + block timestamp | | | | |
| 7. Calculate voting round | | | | |
| 8. Wait for voting round to complete | | | | |
| 9. Query DA Layer for response | | | | |
| 10. Fetch Merkle proof | | | | |
| 11. Submit proof to FdcVerification | | | | |
| 12. Decode verification response | | | | |
| **Verification Total** | **__** | **__** | **__ min** | |

### Grand Total

| Metric | Manual |
|---|---|
| Commands (setup + verify) | __ |
| Files edited | __ |
| Code lines written | __ |
| Total time | __ min |
| Conceptual understanding required | High |

---

## FlareKit SDK Flow (Planned)

### Setup

| Step | Command | Time |
|---|---|---|
| 1 | `npm install @flarekit/sdk` | |
| 2 | `import { FlareKit } from "@flarekit/sdk"` | |
| 3 | `const kit = new FlareKit({ network: "coston2" })` | |
| **Setup Total** | **1 command** | **__ min** |

### Verification (One Payment)

| Step | Code | Time |
|---|---|---|
| 1 | `await kit.payment.verify({ txHash, currency: "BTC" })` | |
| **Verification Total** | **1 call** | **__ sec** |

### Grand Total

| Metric | FlareKit |
|---|---|
| Commands (setup + verify) | __ |
| Files edited | __ |
| Code lines written | __ |
| Total time | __ min |
| Conceptual understanding required | Low |

---

## Comparison

| Metric | Manual | FlareKit | Improvement |
|---|---|---|---|
| Setup commands | | | |
| Verification calls | | | |
| Total commands | | | |
| Setup time | | | |
| Verification time | | | |
| Total time | | | |
| Code lines | | | |
| Conceptual load | | | |

---

## Measurement Log

_(Record actual measurements here during Phase 0 research)_

### Run 1: BTC Payment Verification on Coston2

| Step | Start | End | Duration | Notes |
|---|---|---|---|---|
| Setup | | | | |
| ABI encoding | | | | |
| Fee estimation | | | | |
| Submit request | | | | |
| Pay fee | | | | |
| Wait for round | | | | |
| Retrieve proof | | | | |
| Verify proof | | | | |
| Decode result | | | | |
| **Total** | | | | |

- **BTC tx hash used:**
- **Request ID:**
- **Block number:**
- **Voting round:**
- **Result:**

### Run 2: BTC Payment Verification (repeat for consistency)

| Step | Start | End | Duration | Notes |
|---|---|---|---|---|
| Setup | | | | Already done |
| ABI encoding | | | | |
| Fee estimation | | | | |
| Submit request | | | | |
| Pay fee | | | | |
| Wait for round | | | | |
| Retrieve proof | | | | |
| Verify proof | | | | |
| Decode result | | | | |
| **Total** | | | | |

- **BTC tx hash used:**
- **Request ID:**
- **Block number:**
- **Voting round:**
- **Result:**
