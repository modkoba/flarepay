# FlareKit — SDK API Design (Draft)

> This is a draft based on Phase 0 research findings.
> Final API will be designed after all research is complete.

---

## FlareKit Class

```typescript
import { FlareKit } from "@flarekit/sdk";

const kit = new FlareKit({
  network: "coston2",          // "coston2" | "songbird" | "mainnet"
  provider: ethersProvider,    // ethers.JsonRpcProvider
  wallet: privateKey,          // string (private key) or ethers.Wallet
});

// Or with MetaMask (browser):
const kit = new FlareKit({
  network: "coston2",
  provider: window.ethereum,   // EIP-1193 provider
});
```

---

## Payment Module

### `kit.payment.verify()`

Verify a cross-chain payment exists and was confirmed.

```typescript
const result = await kit.payment.verify({
  txHash: "abc123...",
  currency: "BTC",           // "BTC" | "XRP" | "DOGE"
  confirmations: 6,          // optional, default: 6
});

// result:
{
  verified: true,
  currency: "BTC",
  txHash: "abc123...",
  blockHeight: 812345,
  confirmations: 6,
  feePaid: "0.001",          // FLR
  attestationId: "0x...",
  proof: { ... },            // Merkle proof data
  raw: { ... },              // Full attestation response
}
```

### `kit.payment.quoteFee()`

Estimate the fee for verifying a payment without submitting.

```typescript
const quote = await kit.payment.quoteFee({
  currency: "BTC",
});

// quote:
{
  fee: "0.001",              // FLR
  gasEstimate: 150000,
  currency: "BTC",
  attestationType: "BTC_PAYMENT",
}
```

---

## Balance Module (Future)

```typescript
const result = await kit.balance.verify({
  address: "rN7n47...",
  currency: "XRP",
});

// result:
{
  verified: true,
  currency: "XRP",
  address: "rN7n47...",
  balance: "100.5",
  blockHeight: 812345,
}
```

---

## Ownership Module (Future)

```typescript
const result = await kit.ownership.verify({
  address: "rN7n47...",
  currency: "XRP",
});

// result:
{
  verified: true,
  currency: "XRP",
  address: "rN7n47...",
  owner: "rN7n47...",
  blockHeight: 812345,
}
```

---

## Error Hierarchy

```typescript
class FlareKitError extends Error {
  constructor(message: string, public code: string, public details?: unknown) {
    super(message);
    this.name = "FlareKitError";
  }
}

class FeeTooLowError extends FlareKitError {
  constructor(minimumFee: string, providedFee: string) {
    super(
      `Fee too low. Minimum: ${minimumFee} FLR, provided: ${providedFee} FLR`,
      "FEE_TOO_LOW",
      { minimumFee, providedFee }
    );
  }
}

class InvalidRequestError extends FlareKitError { ... }
class VerifierOfflineError extends FlareKitError { ... }
class ProofTimeoutError extends FlareKitError { ... }
class NetworkError extends FlareKitError { ... }
class InsufficientBalanceError extends FlareKitError { ... }
```

---

## Provider Interface

```typescript
interface FlareKitProvider {
  getNetwork(): Promise<{ chainId: number }>;
  getBlock(blockTag: BlockTag): Promise<Block>;
  estimateGas(tx: TransactionLike): Promise<bigint>;
  sendTransaction(signedTx: string): Promise<TransactionResponse>;
  call(tx: TransactionLike): Promise<string>;
}

// Built-in implementations:
// - EthersProvider (ethers.JsonRpcProvider)
// - ViemProvider (viem PublicClient)
// - CustomProvider (user-implemented)
```

---

## Wallet Interface

```typescript
interface FlareKitWallet {
  getAddress(): Promise<string>;
  signTransaction(tx: TransactionLike): Promise<string>;
}

// Built-in implementations:
// - PrivateKeyWallet (from private key string)
// - MetaMaskWallet (from EIP-1193 provider)
```

---

## Network Presets

```typescript
interface NetworkConfig {
  chainId: number;
  rpcUrl: string;
  contracts: {
    fdcHub: string;
    fdcVerification: string;
    relay: string;
    feeConfiguration: string;
  };
  blockTime: number;         // seconds
  votingRoundDuration: number; // seconds
}

const NETWORKS: Record<string, NetworkConfig> = {
  coston2: {
    chainId: 114,
    rpcUrl: "https://coston2.flare.network/ext/C/rpc",
    contracts: {
      fdcHub: "0x...",
      fdcVerification: "0x...",
      relay: "0x...",
      feeConfiguration: "0x...",
    },
    blockTime: 1,
    votingRoundDuration: 180,
  },
  // ... songbird, mainnet
};
```

---

## Type Definitions

```typescript
interface PaymentVerificationParams {
  txHash: string;
  currency: "BTC" | "XRP" | "DOGE";
  confirmations?: number;
}

interface PaymentVerificationResult {
  verified: boolean;
  currency: string;
  txHash: string;
  blockHeight: number;
  confirmations: number;
  feePaid: string;
  attestationId: string;
  proof: MerkleProof;
  raw: AttestationResponse;
}

interface FeeQuote {
  fee: string;
  gasEstimate: bigint;
  currency: string;
  attestationType: string;
}
```
