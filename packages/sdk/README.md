# FlareKit SDK

TypeScript SDK for Flare's FDC (Flare Data Connector) attestation verification on Coston2 testnet.

## Install

```bash
pnpm add @flarekit/sdk
```

## Usage

```ts
import { kit } from "@flarekit/sdk";

const result = await kit.validity.check({
  provider: {
    privateKey: process.env.PRIVATE_KEY,
  },
  address: "rN7n47y6fG6a8g1yHdUXLHpwyzfj9FmZKj",
});

console.log(result.verified); // true
```

### Payment Verification

```ts
const result = await kit.payment.verify({
  provider: { privateKey: process.env.PRIVATE_KEY },
  txid: "0x...",
  inUtxo: 0,
  utxo: 1,
});
```

### Quote Fee

```ts
const quote = await kit.quoteFee.attestation({
  provider: { privateKey: process.env.PRIVATE_KEY },
  requestBody: { addressStr: "rN7n47y6fG6a8g1yHdUXLHpwyzfj9FmZKj" },
  attestationType: "AddressValidity",
});

console.log(quote.fee, "wei");
```
