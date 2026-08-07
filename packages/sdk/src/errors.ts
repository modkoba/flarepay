/**
 * FlareKit SDK — typed error hierarchy.
 *
 * Every error carries: what happened (`message`), a stable `code`,
 * whether retrying can help (`retryable`), and how to fix it (`fix`).
 */

export class FlareKitError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly fix: string;

  constructor(message: string, code: string, retryable: boolean, fix: string) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.retryable = retryable;
    this.fix = fix;
  }
}

/** The verifier rejected the attestation request (bad tx id, unindexed tx, invalid params). */
export class VerifierRejectedError extends FlareKitError {
  readonly httpStatus?: number;
  readonly verifierStatus?: string;

  constructor(detail: string, httpStatus?: number, verifierStatus?: string) {
    super(
      `Verifier rejected the attestation request: ${detail}`,
      "VERIFIER_REJECTED",
      false,
      "Check that the transaction/address exists on the source chain, is recent enough to be " +
        "indexed by the verifier, and that the id is a valid 64-char hex hash for payments."
    );
    this.httpStatus = httpStatus;
    this.verifierStatus = verifierStatus;
  }
}

/** The verifier service itself is unreachable or erroring (5xx / route down). */
export class VerifierUnavailableError extends FlareKitError {
  readonly httpStatus?: number;

  constructor(detail: string, httpStatus?: number) {
    super(
      `Verifier service unavailable: ${detail}`,
      "VERIFIER_UNAVAILABLE",
      true,
      "The public verifier for this chain may be down (e.g. the Coston2 BTC verifier has had " +
        "outages). Retry later or run `flarekit doctor` / check https://dev.flare.network."
    );
    this.httpStatus = httpStatus;
  }
}

/** Attestation fee could not be paid (tx value below required fee). */
export class InsufficientFeeError extends FlareKitError {
  readonly requiredWei: bigint;
  readonly providedWei: bigint;

  constructor(requiredWei: bigint, providedWei: bigint) {
    super(
      `Attestation fee too low: required ${requiredWei} wei, provided ${providedWei} wei`,
      "INSUFFICIENT_FEE",
      false,
      "Use kit.fdc.estimate() to quote the fee, or omit the fee override to pay the quoted amount."
    );
    this.requiredWei = requiredWei;
    this.providedWei = providedWei;
  }
}

/** The voting round did not finalize within the timeout. */
export class RoundTimeoutError extends FlareKitError {
  readonly votingRoundId: number;
  readonly waitedMs: number;

  constructor(votingRoundId: number, waitedMs: number) {
    super(
      `Voting round ${votingRoundId} not finalized after ${Math.round(waitedMs / 1000)}s`,
      "ROUND_TIMEOUT",
      true,
      "Rounds normally finalize in ~90-180s. Resume with kit.fdc.resume() using the handle from " +
        "this error's cause, or increase roundTimeoutMs."
    );
    this.votingRoundId = votingRoundId;
    this.waitedMs = waitedMs;
  }
}

/** The DA layer never served a proof for a finalized round. */
export class ProofUnavailableError extends FlareKitError {
  readonly votingRoundId: number;
  readonly attempts: number;

  constructor(votingRoundId: number, attempts: number, detail?: string) {
    super(
      `No proof available for round ${votingRoundId} after ${attempts} attempts` +
        (detail ? `: ${detail}` : ""),
      "PROOF_UNAVAILABLE",
      true,
      "The DA layer can lag finalization by ~15-30s (observed on Coston2). Retry, or check that " +
        "the attestation request was confirmed by verifiers (a request the verifiers cannot " +
        "confirm never gets a proof)."
    );
    this.votingRoundId = votingRoundId;
    this.attempts = attempts;
  }
}

/** A proof was fetched but the on-chain verification returned false. */
export class ProofInvalidError extends FlareKitError {
  constructor(detail: string) {
    super(
      `On-chain verification rejected the proof: ${detail}`,
      "PROOF_INVALID",
      false,
      "The proof does not match the current Merkle root for its round. If the proof was cached, " +
        "re-fetch it; if freshly fetched, this indicates a protocol-level mismatch worth reporting."
    );
  }
}

/** A wallet is required for this operation but none was configured. */
export class WalletRequiredError extends FlareKitError {
  constructor(operation: string) {
    super(
      `${operation} requires a wallet, but the kit was created without one`,
      "WALLET_REQUIRED",
      false,
      'Pass one of { privateKey }, { signer } (ethers Signer), or { eip1193 } (window.ethereum) ' +
        "when constructing FlareKit. Read-only calls (ftso.read, random.get, estimate, " +
        "verifyProof) work without a wallet."
    );
  }
}

/** RPC / HTTP transport failure. */
export class NetworkError extends FlareKitError {
  constructor(detail: string, override readonly cause?: Error) {
    super(`Network error: ${detail}`, "NETWORK_ERROR", true, "Check connectivity and RPC URL; retry.");
  }
}

/** Kit misconfiguration (unknown network, unresolvable contract, bad params). */
export class ConfigError extends FlareKitError {
  constructor(detail: string, fix: string) {
    super(`Configuration error: ${detail}`, "CONFIG_ERROR", false, fix);
  }
}
