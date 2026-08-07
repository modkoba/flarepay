/**
 * @flarekit/sdk — the TypeScript toolkit for Flare's enshrined protocols.
 *
 *   import { FlareKit } from "@flarekit/sdk";
 *   const kit = new FlareKit({ network: "coston2", privateKey });
 *   const result = await kit.fdc.verifyPayment({ chain: "XRP", txId });
 */

export { FlareKit } from "./kit.js";
export type { FlareKitOptions } from "./kit.js";

export { FdcClient } from "./fdc.js";
export type {
  EstimateParams,
  VerifyAddressParams,
  VerifyEvmTransactionParams,
  VerifyOptions,
  VerifyPaymentParams,
} from "./fdc.js";
export { FtsoClient } from "./ftso.js";
export { RandomClient } from "./random.js";

export type {
  AddressValidityRequestBody,
  AddressValidityResponseBody,
  AddressValidityResult,
  AttestationData,
  AttestationProof,
  AttestationTypeName,
  Capability,
  Chain,
  EvmChain,
  EvmTransactionEvent,
  EvmTransactionRequestBody,
  EvmTransactionResponseBody,
  EvmTransactionResult,
  FeedReading,
  FeeEstimate,
  PaymentRequestBody,
  PaymentResponseBody,
  PaymentResult,
  RandomReading,
  ResumeHandle,
  VerificationResult,
} from "./types.js";

export type { ProgressEvent, ProgressListener, ProgressStep } from "./progress.js";

export {
  ConfigError,
  FlareKitError,
  InsufficientFeeError,
  NetworkError,
  ProofInvalidError,
  ProofUnavailableError,
  RoundTimeoutError,
  VerifierRejectedError,
  VerifierUnavailableError,
  WalletRequiredError,
} from "./errors.js";

export { COSTON2, FLARE, SONGBIRD, getNetwork } from "./networks.js";
export type { NetworkConfig, NetworkName } from "./networks.js";

export { feedId, normalizeTxId, pad32Utf8 } from "./encoding.js";
