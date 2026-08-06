/**
 * FlareKit SDK — Core types matching Flare's Solidity interfaces.
 */

// ─── Attestation Types ────────────────────────────────────────────

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
  status: 0 | 1 | 2; // 0=success, 1=failed by sender, 2=failed by receiver
}

export interface XRPPaymentRequestBody {
  transactionId: `0x${string}`;
  proofOwner: `0x${string}`;
}

export interface XRPPaymentResponseBody {
  blockNumber: bigint;
  blockTimestamp: bigint;
  sourceAddress: string;
  sourceAddressHash: `0x${string}`;
  receivingAddressHash: `0x${string}`;
  intendedReceivingAddressHash: `0x${string}`;
  spentAmount: bigint;
  intendedSpentAmount: bigint;
  receivedAmount: bigint;
  intendedReceivedAmount: bigint;
  hasMemoData: boolean;
  firstMemoData: `0x${string}`;
  hasDestinationTag: boolean;
  destinationTag: bigint;
  status: 0 | 1 | 2;
}

// ─── Generic Response ─────────────────────────────────────────────

export interface AttestationResponse<TRequestBody, TResponseBody> {
  attestationType: `0x${string}`;
  sourceId: `0x${string}`;
  votingRound: bigint;
  lowestUsedTimestamp: bigint;
  requestBody: TRequestBody;
  responseBody: TResponseBody;
}

export type AddressValidityResponse = AttestationResponse<
  AddressValidityRequestBody,
  AddressValidityResponseBody
>;

export type PaymentResponse = AttestationResponse<
  PaymentRequestBody,
  PaymentResponseBody
>;

export type XRPPaymentResponse = AttestationResponse<
  XRPPaymentRequestBody,
  XRPPaymentResponseBody
>;

// ─── Proof ────────────────────────────────────────────────────────

export interface AttestationProof<TResponse> {
  merkleProof: `0x${string}`[];
  data: TResponse;
}

export type AddressValidityProof = AttestationProof<AddressValidityResponse>;
export type PaymentProof = AttestationProof<PaymentResponse>;
export type XRPPaymentProof = AttestationProof<XRPPaymentResponse>;

// ─── Verification Result ──────────────────────────────────────────

export interface VerificationResult<TResponse> {
  verified: boolean;
  response: TResponse;
  proof: AttestationProof<TResponse>;
  txHash: `0x${string}`;
  blockNumber: bigint;
  votingRound: bigint;
}

export type AddressValidityResult = VerificationResult<AddressValidityResponse>;
export type PaymentResult = VerificationResult<PaymentResponse>;
export type XRPPaymentResult = VerificationResult<XRPPaymentResponse>;
