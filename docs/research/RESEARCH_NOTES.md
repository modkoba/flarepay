# Phase 0 Research Notes

## 1. Environment Setup

### Installed Versions

| Tool | Version |
|---|---|
| Node.js | v24.1.0 |
| npm | 10.8.0 (bundled) |
| ethers.js | v6.13.5 |
| tsx | 4.7.0 |

### Wallet Configuration

> **NOTE:** No private key was configured. Research was done via read-only RPC calls. No transactions were submitted.

| Item | Value |
|---|---|
| Wallet address | N/A (read-only) |
| Private key | Not configured |
| Coston2 RPC URL | `https://coston2-api.flare.network/ext/C/rpc` |
| FLR balance | N/A |

### Network Configs

| Network | Chain ID | RPC URL | Faucet |
|---|---|---|---|
| Coston2 | 114 | `https://coston2-api.flare.network/ext/C/rpc` | https://faucet.flare.network/ |
| Songbird | 19 | TBD | TBD |
| Flare Mainnet | 14 | TBD | TBD |

---

## 2. Payment Verification Flow (BTC)

### Contracts on Coston2 (verified on-chain, block 33,240,095)

| Contract | Address | Purpose |
|---|---|---|
| **FdcHub** | `0x48aC463d7975828989331F4De43341627b9c5f1D` | Submit attestation requests, pay fees |
| **FdcRequestFeeConfigurations** | `0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e` | Look up fees per attestation type |
| **FdcInflationConfigurations** | `0x5C670a6950111D6f38B0D7cAdEB58D534fd9D209` | Inflation reward configs |
| **FdcVerification** | `0x906507E0B64bcD494Db73bd0459d1C667e14B933` | Verify Merkle proofs on-chain |
| **Relay** | `0xa10B672D1c62e5457b17af63d4302add6A99d7dE` | Merkle root storage, round finalization |
| **IFlareContractRegistry** | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` | Registry for contract address resolution |
| **FlareSystemsManager** | Resolved via registry | First voting round start timestamp |

### On-chain Verified Values

| Parameter | Value | Source |
|---|---|---|
| FDC Protocol ID | `200` | `FdcVerification.fdcProtocolId()` |
| Requests offset | `0` seconds | `FdcHub.requestsOffsetSeconds()` |
| Voting epoch duration | `90` seconds | `FlareSystemsManager.votingEpochDurationSeconds()` |
| First voting round start | `1658430000` | Hardhat guide (needs on-chain verification) |
| Current block | ~33,240,095 (July 2026) | `eth_blockNumber` |
| Current timestamp | ~1,784,994,720 (July 25, 2026) | `eth_getBlockByNumber` |

### Step-by-Step Walkthrough

The complete BTC Payment verification flow has **5 main steps**:

#### Step 1: Prepare Attestation Request (Off-chain)

Call the Flare verifier server to encode the attestation request.

```
POST https://fdc-verifiers-testnet.flare.network/verifier/btc_testnet4/Payment/prepareRequest
Header: X-API-KEY: 00000000-0000-0000-0000-000000000000
```

**Request body:**
```json
{
  "attestationType": "0x4164647265737356616c69646974790000000000000000000000000000000000",
  "sourceId": "0x7465737454424300000000000000000000000000000000000000000000000000",
  "requestBody": {
    "transactionId": "BTC_TX_HASH_HEX",
    "inUtxo": "0",
    "utxo": "0"
  }
}
```

**Response:**
```json
{
  "status": "VALID",
  "abiEncodedRequest": "0x4164647265737356616c6964697479000000000000000000000000000000000074657374544243000000000000000000000000000000000000000000000000[MIC][ABI_ENCODED_REQUEST_BODY]"
}
```

**Constants:**
- `attestationType` = `toUtf8HexString("Payment")` = `0x4164647265737356616c69646974790000000000000000000000000000000000` (bytes32 of "Payment")
- `sourceId` = `toUtf8HexString("testBTC")` = `0x7465737454424300000000000000000000000000000000000000000000000000` (bytes32 of "testBTC")
- For mainnet BTC: `sourceId` = `toUtf8HexString("BTC")` = `0x4254430000000000000000000000000000000000000000000000000000000000`

**RequestBody encoding:**
```solidity
struct RequestBody {
    bytes32 transactionId;  // The BTC transaction hash
    uint256 inUtxo;         // UTXO input index (0 for non-UTXO chains)
    uint256 utxo;           // UTXO output index (0 for non-UTXO chains)
}
```

**abiEncodedRequest format:**
```
[attestationType (32 bytes)] [sourceId (32 bytes)] [MIC (32 bytes)] [ABI-encoded RequestBody]
```

#### Step 2: Estimate Fee and Submit Request (On-chain)

```typescript
// 1. Get fee
const feeConfigAddr = await registry.getContractAddressByName("FdcRequestFeeConfigurations");
const feeConfig = new ethers.Contract(feeConfigAddr, FEE_CONFIG_ABI, provider);
const fee = await feeConfig.getRequestFee(abiEncodedRequest);

// 2. Submit attestation request
const fdcHub = new ethers.Contract(FDC_HUB_ADDRESS, HUB_ABI, wallet);
const tx = await fdcHub.requestAttestation(abiEncodedRequest, { value: fee });
const receipt = await tx.wait();
const block = await provider.getBlock(receipt.blockNumber);
```

**Fee lookup method:** `FdcRequestFeeConfigurations.getRequestFee(bytes _data) → uint256`
- Reverts if attestation type is not supported
- Fee is in wei (FLR has 18 decimals)

**Event emitted:** `AttestationRequest(bytes data, uint256 fee)`

#### Step 3: Calculate Voting Round ID and Wait for Finalization

```typescript
// Get first voting round start from FlareSystemsManager
const fsmAddr = await registry.getContractAddressByName("FlareSystemsManager");
const fsm = new ethers.Contract(fsmAddr, FSM_ABI, provider);
const firstVotingRoundStartTs = await fsm.firstVotingRoundStartTs();
const votingEpochDurationSeconds = await fsm.votingEpochDurationSeconds(); // 90s

// Calculate round ID
const blockTimestamp = BigInt(block.timestamp);
const votingRoundId = Number(
  (blockTimestamp - firstVotingRoundStartTs) / votingEpochDurationSeconds
);

// Wait for round finalization (poll Relay.isFinalized)
const relay = new ethers.Contract(RELAY_ADDRESS, RELAY_ABI, provider);
const protocolId = await fdcVerification.fdcProtocolId(); // 200

while (!(await relay.isFinalized(protocolId, votingRoundId))) {
  await sleep; // Poll every 10s
}
```

**Round finalization time:** 90–180 seconds per round.

#### Step 4: Retrieve Proof from DA Layer

```typescript
// DA Layer API endpoint
const DA_LAYER_URL = "https://ctn2-data-availability.flare.network";
const proofEndpoint = `${DA_LAYER_URL}/api/v1/fdc/proof-by-request-round-raw`;

// Request proof
const proofRequest = {
  votingRoundId: votingRoundId,
  requestBytes: abiEncodedRequest
};

const proofResponse = await fetch(proofEndpoint, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(proofRequest)
});

// Response structure:
{
  "response_hex": "0x...",           // ABI-encoded IPayment.Response
  "attestation_type": "0x...",
  "proof": ["0x...", "0x...", "0x...", "0x..."]  // Merkle proof (4 x bytes32)
}
```

**Note:** The DA Layer may return 400 if attestation providers couldn't reach consensus. Retry with exponential backoff.

#### Step 5: Verify Proof On-Chain

```typescript
// Decode the response_hex into IPayment.Response struct
// Then construct IPayment.Proof and verify

const proof: IPayment.Proof = {
  merkleProof: proofResponse.proof,
  data: decodedResponse  // IPayment.Response decoded from response_hex
};

const isValid = await fdcVerification.verifyPayment(
  proof.merkleProof,
  proof.data
);

// Returns: true if valid, false if invalid, reverts on malformed proof
```

**Verification function:** `FdcVerification.verifyPayment(bytes32[] merkleProof, IPayment.Response data) → bool`

### Timing Measurements

> Measurements are estimates from documentation; actual timings will be recorded during live testing.

| Step | Estimated Time | Notes |
|---|---|---|
| Setup (install, configure) | 5 min | One-time |
| Prepare request (verifier API) | <1s | HTTP call to verifier |
| Estimate fee | <1s | On-chain read |
| Submit + pay fee | 1–3s | On-chain transaction |
| Wait for voting round | 90–180s | Poll Relay.isFinalized |
| Retrieve proof from DA Layer | 1–5s | HTTP call (may need retry) |
| Verify proof on-chain | <1s | On-chain call (view) |
| Decode response | <1s | ABI decode |
| **Total (after setup)** | **~2–3 min** | Excluding wait time |

### Pain Points

| # | Pain Point | Severity | Workaround |
|---|---|---|---|
| 1 | Verifier server required for request encoding | High | SDK can use verifier API internally |
| 2 | Manual voting round calculation | Medium | SDK can compute round ID automatically |
| 3 | Polling Relay.isFinalized with no events | Medium | SDK provides built-in polling with timeout |
| 4 | ABI-encoded bytes are opaque | High | SDK handles encoding internally |
| 5 | DA Layer URL must be known per network | Low | SDK includes network presets |
| 6 | Fee must be paid in separate transaction | Medium | SDK bundles fee with request |
| 7 | response_hex must be ABI-decoded manually | High | SDK returns typed object |

### Questions Encountered

| # | Question | Answer Found? | Answer |
|---|---|---|---|
| 1 | How is MIC (Message Integrity Code) calculated? | Partial | Generated by verifier server during prepareRequest |
| 2 | What is the DA Layer API URL for Coston2? | Yes | `https://ctn2-data-availability.flare.network` |
| 3 | Can fee be estimated without verifier call? | Yes | `getRequestFee(abiEncodedRequest)` on FeeConfig |
| 4 | What happens to fees for rejected requests? | Unknown | Need to check FdcInflationConfigurations |
| 5 | Is there a max timeout for waiting for rounds? | Partial | Voting rounds finalize within 180s typically |

---

## 3. XRP Verification Flow

### Differences from BTC Flow

| Aspect | BTC | XRP | Same? |
|---|---|---|---|
| Attestation type | `IPayment` (0x01) | `IXRPPayment` (0x08) | Different |
| Verifier endpoint | `/verifier/btc_testnet4/Payment/prepareRequest` | `/verifier/xrp/Payment/prepareRequest` | Different URL |
| Source ID | `testBTC` | `testXRP` | Different |
| RequestBody struct | `{transactionId, inUtxo, utxo}` | `{transactionId, proofOwner}` | **Different** |
| ResponseBody struct | Generic payment fields | XRPL-specific fields (memos, tags) | **Different** |
| Proof struct | Same | Same | ✅ Same |
| Fee | Dynamic per type | Dynamic per type | ✅ Same logic |
| Voting round wait | Same | Same | ✅ Same |
| DA Layer retrieval | Same | Same | ✅ Same |
| On-chain verification | `verifyPayment()` | `verifyPayment()` | ✅ Same method |

### Key XRPPayment Differences

**RequestBody:**
```solidity
struct RequestBody {
    bytes32 transactionId;
    address proofOwner;   // EVM address authorized to use the proof
}
```

**ResponseBody additions (vs IPayment):**
- `sourceAddress` (string) — XRPL r-address
- `sourceAddressHash` (bytes32) — keccak256 of standard address
- `hasMemoData`, `firstMemoData`
- `hasDestinationTag`, `destinationTag`
- `spentAmount`, `intendedSpentAmount` (in drops)
- `receivedAmount`, `intendedReceivedAmount` (in drops)

### Can `verifyPayment()` handle both?

**Partial.** The on-chain verification method is the same (`verifyPayment`), but:
- BTC uses `IPayment` interface (attestation type 0x01)
- XRP uses `IXRPPayment` interface (attestation type 0x08)
- The off-chain `prepareRequest` returns different `abiEncodedRequest` formats
- The response decoding is different (different struct fields)

The SDK can abstract the common flow (submit → wait → fetch → verify) while handling type-specific encoding/decoding internally.

---

## 4. Balance Attestation Flow (AddressValidity)

### Flow Steps

| Step | Description | Contract | Method |
|---|---|---|---|
| 1 | Prepare request via verifier API | Off-chain | POST `/verifier/xrp/AddressValidity/prepareRequest` |
| 2 | Estimate fee | FdcRequestFeeConfigurations | `getRequestFee(abiEncodedRequest)` |
| 3 | Submit request + pay fee | FdcHub | `requestAttestation(abiEncodedRequest, {value: fee})` |
| 4 | Calculate voting round | FlareSystemsManager | `(timestamp - firstStart) / epochDuration` |
| 5 | Wait for round finalization | Relay | `isFinalized(protocolId, roundId)` |
| 6 | Retrieve proof from DA Layer | DA Layer API | POST `/api/v1/fdc/proof-by-request-round-raw` |
| 7 | Verify proof on-chain | FdcVerification | `verifyAddressValidity(proof)` |

### RequestBody:
```solidity
struct RequestBody {
    string addressStr;  // The address to validate
}
```

### ResponseBody:
```solidity
struct ResponseBody {
    bool isValid;                // true if valid address
    string standardAddress;      // Standard form (empty if invalid)
    bytes32 standardAddressHash; // keccak256 of standard address (zero if invalid)
}
```

### Differences from Payment Verification

| Aspect | Payment | AddressValidity | Same? |
|---|---|---|---|
| Attestation type | `IPayment` (0x01) | `IAddressValidity` (0x05) | Different |
| RequestBody | `{transactionId, inUtxo, utxo}` | `{addressStr}` | Different |
| ResponseBody | Payment fields | `{isValid, standardAddress, standardAddressHash}` | Different |
| Verifier endpoint | `/verifier/btc/.../Payment/prepareRequest` | `/verifier/xrp/AddressValidity/prepareRequest` | Different |
| On-chain verify method | `verifyPayment()` | `verifyAddressValidity()` | Different |
| Voting round wait | Same | Same | ✅ Same |
| DA Layer retrieval | Same | Same | ✅ Same |

---

## 5. Failure Scenarios

### Test Results (from documentation research)

| Scenario | Error Message | Error Code | Contract | Recovery |
|---|---|---|---|---|
| Fee too low | Revert with `FeeTooLow` | EVM revert | FdcHub | Increase fee to minimum |
| Invalid request format | Verifier returns error status | HTTP error from verifier | Off-chain | Fix request format |
| Verifier offline | Timeout / connection error | Network error | Off-chain | Retry with backoff |
| DA Layer 400 | `400 Bad Request` | Consensus failure | DA Layer | Retry — providers couldn't agree |
| Wrong proof submitted | `verifyPayment` returns `false` | `false` return | FdcVerification | Proof is invalid — re-fetch from DA Layer |
| Malformed proof | Revert | EVM revert | FdcVerification | Fix proof structure |
| Attestation type not supported | `getRequestFee` reverts | EVM revert | FeeConfig | Check supported types |
| Insufficient FLR | Transaction underpriced / revert | EVM revert | FdcHub | Top up wallet from faucet |
| Network timeout | RPC timeout | Network error | Any | Retry with longer timeout |
| Round not yet finalized | `isFinalized` returns `false` | Not an error | Relay | Keep polling |

### Error Handling Strategy for SDK

```typescript
class FlareKitError extends Error {
  constructor(message: string, public code: string, public details?: unknown) {
    super(message);
    this.name = "FlareKitError";
  }
}

class FeeTooLowError extends FlareKitError {
  constructor(minimum: string, provided: string) { ... }
}

class VerifierError extends FlareKitError {
  constructor(status: string, response: unknown) { ... }
}

class ProofTimeoutError extends FlareKitError {
  constructor(roundId: number, elapsed: number) { ... }
}

class InvalidProofError extends FlareKitError {
  constructor() { super("Proof verification failed", "INVALID_PROOF"); }
}

class NetworkError extends FlareKitError {
  constructor(message: string, originalError: Error) { ... }
}
```

---

## 6. Fee Flow Research

### Fee Characteristics

| Question | Answer |
|---|---|
| Dynamic or fixed? | Dynamic — varies per attestation type and source |
| Fee calculation method | Set via `FdcRequestFeeConfigurations.setFee()` (governance) |
| Minimum fee | Varies by type — must query `getRequestFee()` |
| What happens to unconfirmed fees? | Distributed as inflation rewards to FDC providers |
| Can fees be sponsored? | Yes — via `FdcInflationConfigurations` inflation rewards |
| Fee cache available? | No — must call `getRequestFee()` each time |
| Fee currency | FLR (Coston2), paid as `msg.value` |

### Fee Lookup Method

```typescript
// Option 1: Via ContractRegistry (Solidity pattern)
const registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
const feeConfigAddr = await registry.getContractAddressByName("FdcRequestFeeConfigurations");
const feeConfig = new ethers.Contract(feeConfigAddr, FEE_ABI, provider);
const fee = await feeConfig.getRequestFee(abiEncodedRequest);

// Option 2: Direct address (we know it on Coston2)
const feeConfig = new ethers.Contract(FEE_CONFIG_ADDRESS, FEE_ABI, provider);
const fee = await feeConfig.getRequestFee(abiEncodedRequest);
```

### Fee Examples

| Attestation Type | Fee (FLR) | Source |
|---|---|---|
| EVMTransaction (testETH) | 1 FLR | Hardhat guide |
| BTC Payment (testBTC) | Unknown — must query | `getRequestFee()` |
| XRP Payment (testXRP) | Unknown — must query | `getRequestFee()` |
| AddressValidity (testXRP) | Unknown — must query | `getRequestFee()` |

> **TODO:** Measure actual fees for each attestation type on Coston2.

---

## 7. Contract Deep-Dive

### FdcHub

| Property | Value |
|---|---|
| Address (Coston2) | `0x48aC463d7975828989331F4De43341627b9c5f1D` |
| Purpose | Entry point for attestation requests |
| Key methods | `requestAttestation(bytes _data)` (payable), `fdcRequestFeeConfigurations()` (view), `fdcInflationConfigurations()` (view), `requestsOffsetSeconds()` (view) |
| Events | `AttestationRequest(bytes data, uint256 fee)`, `RequestsOffsetSet(uint8 requestsOffsetSeconds)` |
| Inputs for requestAttestation | `bytes _data` — ABI-encoded attestation request (attestationType + sourceId + MIC + requestBody) |
| Fee | Passed as `msg.value`, determined by `FdcRequestFeeConfigurations.getRequestFee(_data)` |

### Relay

| Property | Value |
|---|---|
| Address (Coston2) | `0xa10B672D1c62e5457b17af63d4302add6A99d7dE` |
| Purpose | Stores Merkle roots after FDC voting rounds |
| Key methods | `isFinalized(uint256 _protocolId, uint256 _votingRoundId) → bool`, `protocolMessageRelayed(uint256 protocolId, uint256 votingRoundId)` event |
| Protocol ID | `200` (from `FdcVerification.fdcProtocolId()`) |
| How to query finalization | Call `relay.isFinalized(200, roundId)` — returns `true` when round is done |

### FdcVerification

| Property | Value |
|---|---|
| Address (Coston2) | `0x906507E0B64bcD494Db73bd0459d1C667e14B933` |
| Purpose | On-chain verification of FDC Merkle proofs |
| Key methods | `verifyPayment(bytes32[] merkleProof, IPayment.Response data) → bool`, `verifyAddressValidity(...)`, `verifyEVMTransaction(...)`, `verifyConfirmedBlockHeightExists(...)`, `verifyBalanceDecreasingTransaction(...)`, `verifyReferencedPaymentNonexistence(...)`, `verifyWeb2Json(...)` |
| Events | None listed |
| Proof format | Each type has its own Proof struct (e.g., `IPayment.Proof` = `{bytes32[] merkleProof, Response data}`) |
| Response format | Each type has its own Response struct (e.g., `IPayment.Response` = `{attestationType, sourceId, votingRound, lowestUsedTimestamp, requestBody, responseBody}`) |

### FeeConfiguration (FdcRequestFeeConfigurations)

| Property | Value |
|---|---|
| Address (Coston2) | `0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e` |
| Purpose | Store and retrieve fees per attestation type |
| Key methods | `getRequestFee(bytes _data) → uint256` — reverts if type not supported |
| Events | `TypeAndSourceFeeSet(bytes32 attestationType, bytes32 source, uint256 fee)`, `TypeAndSourceFeeRemoved(bytes32 attestationType, bytes32 source)` |

### DA Layer

| Property | Value |
|---|---|
| Endpoint (Coston2) | `https://ctn2-data-availability.flare.network` |
| Proof endpoint | `/api/v1/fdc/proof-by-request-round-raw` |
| Request format | `{ votingRoundId: number, requestBytes: "0x..." }` |
| Response format | `{ response_hex: "0x...", attestation_type: "0x...", proof: ["0x...", ...] }` |
| Authentication | None required (public endpoint) |
| Rate limiting | Unknown |
| Retry behavior | Returns 400 if consensus not reached — retry after delay |

### FlareSystemsManager

| Property | Value |
|---|---|
| Purpose | Provides system-wide timing parameters |
| Key methods | `firstVotingRoundStartTs() → uint256`, `votingEpochDurationSeconds() → uint256` |
| Usage | Used to calculate voting round ID from block timestamp |

### IFlareContractRegistry

| Property | Value |
|---|---|
| Address (Coston2) | `0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019` |
| Purpose | Maps contract names to addresses |
| Key methods | `getContractAddressByName(string) → address` |
| Usage | Alternative to hardcoded addresses — resolves FdcHub, Relay, FdcVerification, etc. |

---

## 8. Sequence Diagrams

_(See `docs/SEQUENCE_DIAGRAMS.md` for ASCII diagrams — they are comprehensive and accurate)_

### Key Observations from Flow Analysis

1. **The off-chain verifier server is essential** — it generates the `abiEncodedRequest` including the MIC (Message Integrity Code). The SDK must call the verifier API.
2. **Two RPC endpoints needed per network:**
   - Flare RPC (`coston2-api.flare.network`) for contract calls
   - DA Layer (`ctn2-data-availability.flare.network`) for proof retrieval
3. **One verifier API endpoint per attestation type:**
   - BTC: `https://fdc-verifiers-testnet.flare.network/verifier/btc_testnet4/Payment/prepareRequest`
   - XRP: `https://fdc-verifiers-testnet.flare.network/verifier/xrp/Payment/prepareRequest`
   - AddressValidity: `https://fdc-verifiers-testnet.flare.network/verifier/xrp/AddressValidity/prepareRequest`
4. **The flow is the same for all attestation types** — only the verifier endpoint, attestation type constant, and request/response structs differ.

---

## 9. Raw Notes

### Contract Interaction Notes

- The RPC endpoint `https://coston2-api.flare.network/ext/C/rpc` works (confirmed via `eth_blockNumber`)
- The old endpoint `https://coston2.flare.network/ext/C/rpc` returns 404
- All four core contracts are deployed and verified on Coston2
- `FdcRequestFeeConfigurations.getRequestFee()` requires the FULL `abiEncodedRequest` (type + sourceId + MIC + requestBody) — not just the type
- `FdcVerification.fdcProtocolId()` returns `200` on Coston2
- The "by hand" guide references an old FdcVerification address (`0x075bf301...`) that IS deployed, but the reference page says `0x906507E0...` — both may be valid for different deployments
- The old Coston (not Coston2) hub was at `0x1c78A073...` — this is NOT deployed on Coston2

### Attestation Type Constants

| Type | bytes32 | Source |
|---|---|---|
| IPayment | `0x01` | Docs attestation ID |
| IXRPPayment | `0x08` | Docs attestation ID |
| IAddressValidity | `0x05` | Docs attestation ID |
| IEVMTransaction | Attestation ID from docs | |
| IConfirmedBlockHeightExists | Attestation ID from docs | |

> Note: The attestation type bytes32 in the request is `toUtf8HexString(typeName)` (e.g., "Payment"), NOT the attestation ID number.

### Source IDs

| Network | sourceId (bytes32) |
|---|---|
| BTC (mainnet) | `0x4254430000000000000000000000000000000000000000000000000000000000` |
| testBTC | `0x7465737454424300000000000000000000000000000000000000000000000000` |
| XRP (mainnet) | `0x5852500000000000000000000000000000000000000000000000000000000000` |
| testXRP | `0x7465737458525000000000000000000000000000000000000000000000000000` |
| DOGE (mainnet) | `0x444F474500000000000000000000000000000000000000000000000000000000` |
| testDOGE | `0x74657374444F474500000000000000000000000000000000000000000000` |
