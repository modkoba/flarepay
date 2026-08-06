/**
 * FlareKit SDK — Error hierarchy for attestation failures.
 */

export class FlareKitError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(message: string, code: string, retryable = false) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.retryable = retryable;
  }
}

export class VerifierError extends FlareKitError {
  readonly statusCode?: number;

  constructor(message: string, statusCode?: number) {
    super(message, "VERIFIER_ERROR", statusCode === 404 || statusCode === 429);
    this.statusCode = statusCode;
  }
}

export class ContractError extends FlareKitError {
  readonly txHash?: string;
  readonly reason?: string;

  constructor(message: string, txHash?: string, reason?: string) {
    super(message, "CONTRACT_ERROR", false);
    this.txHash = txHash;
    this.reason = reason;
  }
}

export class RoundError extends FlareKitError {
  readonly round: bigint;
  readonly maxAttempts: number;

  constructor(round: bigint, maxAttempts: number) {
    super(`Attestation round ${round} not finalized after ${maxAttempts} polls`, "ROUND_NOT_FINALIZED", true);
    this.round = round;
    this.maxAttempts = maxAttempts;
  }
}

export class ProofError extends FlareKitError {
  constructor(message: string) {
    super(message, "PROOF_ERROR", false);
  }
}

export class DALayerError extends FlareKitError {
  readonly retryAfterMs?: number;

  constructor(message: string, retryAfterMs?: number) {
    super(message, "DA_LAYER_ERROR", true);
    this.retryAfterMs = retryAfterMs;
  }
}

export class NetworkError extends FlareKitError {
  readonly cause?: Error;

  constructor(message: string, cause?: Error) {
    super(message, "NETWORK_ERROR", true);
    this.cause = cause;
  }
}
