# FlareKit — Sequence Diagrams

## Flow 1: Payment Verification (BTC)

```
┌──────────┐   ┌──────────┐   ┌────────┐   ┌───────┐   ┌──────────┐   ┌────────────────┐
│ Developer│   │ FlareKit │   │FdcHub  │   │ Relay │   │DA Layer  │   │FdcVerification│
│          │   │   SDK    │   │        │   │       │   │          │   │                │
└────┬─────┘   └────┬─────┘   └───┬────┘   └───┬───┘   └────┬─────┘   └───────┬────────┘
     │               │             │             │             │                  │
     │  verify()     │             │             │             │                  │
     │──────────────>│             │             │             │                  │
     │               │             │             │             │                  │
     │               │  readFee()  │             │             │                  │
     │               │────────────>│             │             │                  │
     │               │<────────────│             │             │                  │
     │               │             │             │             │                  │
     │               │  estimateGas()                     │                  │
     │               │────────────────────────────────────>│                  │
     │               │<────────────────────────────────────│                  │
     │               │             │             │             │                  │
     │               │  requestAttestation()               │                  │
     │               │────────────────────────────────────>│                  │
     │               │             │──store request────────>│                  │
     │               │             │<──requestId + txHash──│                  │
     │               │<────────────────────────────────────│                  │
     │               │             │             │             │                  │
     │               │  wait for voting round (polling)    │                  │
     │               │             │             │──finalize──>│                  │
     │               │             │             │<──merkleRoot│                  │
     │               │             │             │             │                  │
     │               │  fetchResponse()                    │                  │
     │               │────────────────────────────────────>│                  │
     │               │<────────────────────────────────────│──get response──────>│
     │               │             │             │             │<──response + proof─│
     │               │<────────────────────────────────────│                  │
     │               │             │             │             │                  │
     │               │  verifyProof()                      │                  │
     │               │────────────────────────────────────>│                  │
     │               │             │             │             │──submit proof────>│
     │               │             │             │             │<──verified + data──│
     │               │<────────────────────────────────────│                  │
     │               │             │             │             │                  │
     │<──────────────│             │             │             │                  │
     │  { verified, blockHeight, ... }                    │                  │
     │               │             │             │             │                  │
```

## Flow 2: XRP Verification

(Same as BTC — only the attestation type and data source change)

```
┌──────────┐   ┌──────────┐   ┌────────┐   ┌───────┐   ┌──────────┐   ┌────────────────┐
│ Developer│   │ FlareKit │   │FdcHub  │   │ Relay │   │DA Layer  │   │FdcVerification│
│          │   │   SDK    │   │        │   │       │   │          │   │                │
└────┬─────┘   └────┬─────┘   └───┬────┘   └───┬───┘   └────┬─────┘   └───────┬────────┘
     │               │             │             │             │                  │
     │  verify({     │             │             │             │                  │
     │    txHash,    │             │             │             │                  │
     │    currency:  │             │             │             │                  │
     │      "XRP"    │             │             │             │                  │
     │  })            │             │             │             │                  │
     │──────────────>│             │             │             │                  │
     │               │             │             │             │                  │
     │               │  [Same flow as BTC from here]                        │
     │               │             │             │             │                  │
     │<──────────────│             │             │             │                  │
```

## Flow 3: Balance Attestation (XRP)

```
┌──────────┐   ┌──────────┐   ┌────────┐   ┌───────┐   ┌──────────┐   ┌────────────────┐
│ Developer│   │ FlareKit │   │FdcHub  │   │ Relay │   │DA Layer  │   │FdcVerification│
│          │   │   SDK    │   │        │   │       │   │          │   │                │
└────┬─────┘   └────┬─────┘   └───┬────┘   └───┬───┘   └────┬─────┘   └───────┬────────┘
     │               │             │             │             │                  │
     │  verify({     │             │             │             │                  │
     │    address,   │             │             │             │                  │
     │    currency:  │             │             │             │                  │
     │      "XRP",   │             │             │             │                  │
     │    type:       │             │             │             │                  │
     │      "balance" │             │             │             │                  │
     │  })            │             │             │             │                  │
     │──────────────>│             │             │             │                  │
     │               │             │             │             │                  │
     │               │  [Same core flow — different attestation type]        │
     │               │             │             │             │                  │
     │<──────────────│             │             │             │                  │
     │  {            │             │             │             │                  │
     │    verified,  │             │             │             │                  │
     │    balance,   │             │             │             │                  │
     │    ...        │             │             │             │                  │
     │  }            │             │             │             │                  │
```

## Flow 4: Error Handling

```
┌──────────┐   ┌──────────┐   ┌────────┐
│ Developer│   │ FlareKit │   │FdcHub  │
│          │   │   SDK    │   │        │
└────┬─────┘   └────┬─────┘   └───┬────┘
     │               │             │
     │  verify()     │             │
     │──────────────>│             │
     │               │             │
     │               │ requestAttestation() (fee too low)
     │               │────────────────>│
     │               │             │
     │               │<────────────│
     │               │  revert: FeeTooLow
     │               │             │
     │<──────────────│             │
     │  throws        │             │
     │  FeeTooLowError│             │
     │               │             │
```

## Key Observations

1. **All attestation types follow the same core flow**: request → pay fee → wait → fetch → verify
2. **The only difference between BTC, XRP, and balance attestations is the attestation type parameter**
3. **FlareKit can provide a unified API** that handles the type-specific encoding internally
4. **The SDK's value is in abstracting the repetitive parts**: fee quoting, gas estimation, polling, proof retrieval, proof submission
