/**
 * FlareKit SDK — public result types.
 */

export type Chain = "XRP" | "BTC" | "DOGE";

export type AttestationTypeName = "AddressValidity" | "Payment";

/** Fully decoded attestation data as consumed by FdcVerification on-chain. */
export interface AttestationData<TRequestBody, TResponseBody> {
  attestationType: `0x${string}`;
  sourceId: `0x${string}`;
  votingRound: bigint;
  lowestUsedTimestamp: bigint;
  requestBody: TRequestBody;
  responseBody: TResponseBody;
}

/**
 * A serializable, reusable proof. Once obtained it verifies forever against
 * that round's Merkle root — cache it and call kit.fdc.verifyProof() any time.
 */
export interface AttestationProof<TRequestBody, TResponseBody> {
  merkleProof: `0x${string}`[];
  data: AttestationData<TRequestBody, TResponseBody>;
}

export interface AddressValidityRequestBody {
  addressStr: string;
}

export interface AddressValidityResponseBody {
  isValid: boolean;
  standardAddress: string;
  standardAddressHash: `0x${string}`;
}

export interface PaymentRequestBody {
  transactionId: `0x${string}`;
  inUtxo: bigint;
  utxo: bigint;
}

export interface PaymentResponseBody {
  blockNumber: bigint;
  blockTimestamp: bigint;
  sourceAddressHash: `0x${string}`;
  sourceAddressesRoot: `0x${string}`;
  receivingAddressHash: `0x${string}`;
  intendedReceivingAddressHash: `0x${string}`;
  spentAmount: bigint;
  intendedSpentAmount: bigint;
  receivedAmount: bigint;
  intendedReceivedAmount: bigint;
  standardPaymentReference: `0x${string}`;
  oneToOne: boolean;
  /** 0 = success, 1 = sender failure, 2 = receiver failure */
  status: bigint;
}

export interface VerificationResult<TRequestBody, TResponseBody> {
  /** Result of the on-chain FdcVerification staticCall — never inferred from a receipt. */
  verified: boolean;
  response: TResponseBody;
  proof: AttestationProof<TRequestBody, TResponseBody>;
  votingRoundId: number;
  /** Hash of the fee-paying request tx on Flare. */
  requestTxHash: `0x${string}`;
  feePaidWei: bigint;
  /** Per-step wall-clock ms, for benchmarks and UIs. */
  timings: Record<string, number>;
}

export type AddressValidityResult = VerificationResult<AddressValidityRequestBody, AddressValidityResponseBody>;
export type PaymentResult = VerificationResult<PaymentRequestBody, PaymentResponseBody>;

export interface FeeEstimate {
  feeWei: bigint;
  /** Rough end-to-end wall clock, dominated by voting-round finalization. */
  etaSeconds: number;
  /** The prepared request (contains the MIC); reusable with submit/resume. */
  abiEncodedRequest: `0x${string}`;
}

/** Handle for resuming a verification after the request tx is on-chain. */
export interface ResumeHandle {
  type: AttestationTypeName;
  abiEncodedRequest: `0x${string}`;
  votingRoundId: number;
  requestTxHash: `0x${string}`;
  feePaidWei: bigint;
}

export interface FeedReading {
  symbol: string;
  feedId: `0x${string}`;
  /** Raw integer value; price = value / 10^decimals. */
  value: bigint;
  decimals: number;
  /** Convenience float. Do not use for on-chain math. */
  price: number;
  timestamp: number;
}

export interface RandomReading {
  value: bigint;
  isSecure: boolean;
  timestamp: number;
}
