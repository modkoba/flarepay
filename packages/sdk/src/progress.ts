/**
 * FlareKit SDK — verification progress events.
 *
 * FDC verification takes real time (~90-180s: the voting round must finalize).
 * The SDK is honest about it: every stage emits an event with elapsed time and,
 * where predictable, an ETA — so UIs can show a truthful progress ticker.
 */

export type ProgressStep =
  | "preparing" // calling the verifier's prepareRequest
  | "waiting-index" // source tx not yet indexed/confirmed by the verifier
  | "prepared" // got abiEncodedRequest (includes the MIC)
  | "submitting" // sending the fee-paying tx to FdcHub
  | "submitted" // tx confirmed; voting round known
  | "waiting-round" // polling Relay.isFinalized
  | "round-finalized"
  | "fetching-proof" // polling the DA layer
  | "proof-received"
  | "verifying" // staticCall to FdcVerification
  | "done";

export interface ProgressEvent {
  step: ProgressStep;
  /** ms since verify() was called */
  elapsedMs: number;
  /** rough seconds remaining, when predictable (round wait) */
  etaSeconds?: number;
  detail?: Record<string, unknown>;
}

export type ProgressListener = (event: ProgressEvent) => void;

export class ProgressReporter {
  private readonly startedAt = Date.now();
  readonly timings: Record<string, number> = {};
  private lastStepAt = Date.now();

  constructor(private readonly listener?: ProgressListener) {}

  emit(step: ProgressStep, detail?: Record<string, unknown>, etaSeconds?: number): void {
    const now = Date.now();
    this.timings[step] = now - this.lastStepAt;
    this.lastStepAt = now;
    this.listener?.({ step, elapsedMs: now - this.startedAt, etaSeconds, detail });
  }

  get elapsedMs(): number {
    return Date.now() - this.startedAt;
  }
}
