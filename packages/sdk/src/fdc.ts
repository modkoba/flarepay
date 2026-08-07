/**
 * FlareKit SDK — FDC attestation client.
 *
 * Faithful port of the flow proven live on Coston2 (phase0-research):
 *   1. verifier prepareRequest  → canonical request bytes incl. MIC
 *   2. FdcRequestFeeConfigurations.getRequestFee(requestBytes)
 *   3. FdcHub.requestAttestation(requestBytes) payable
 *   4. voting round = (blockTimestamp - firstVotingRoundStartTs) / epochDuration
 *   5. poll Relay.isFinalized(protocolId, round)
 *   6. DA layer proof-by-request-round-raw { votingRoundId, requestBytes }
 *   7. decode response_hex, staticCall FdcVerification.verify<Type>(proof)
 */

import { AbiCoder, Contract, ParamType, Result, toUtf8String } from "ethers";
import {
  FDC_FEE_CONFIG_ABI,
  FDC_HUB_ABI,
  FDC_VERIFICATION_ABI,
  FLARE_SYSTEMS_MANAGER_ABI,
  RELAY_ABI,
  RESPONSE_TUPLES,
} from "./abis.js";
import { normalizeTxId } from "./encoding.js";
import { NetworkError, ProofInvalidError, RoundTimeoutError, VerifierRejectedError } from "./errors.js";
import { ProgressListener, ProgressReporter } from "./progress.js";
import type { KitInternals } from "./kit.js";
import type {
  AddressValidityRequestBody,
  AddressValidityResponseBody,
  AddressValidityResult,
  AttestationProof,
  AttestationTypeName,
  Capability,
  Chain,
  EvmChain,
  EvmTransactionRequestBody,
  EvmTransactionResponseBody,
  EvmTransactionResult,
  FeeEstimate,
  PaymentRequestBody,
  PaymentResponseBody,
  PaymentResult,
  ResumeHandle,
  VerificationResult,
} from "./types.js";

export interface VerifyOptions {
  onProgress?: ProgressListener;
  /** Relay poll interval (default 10s — rounds are ~90s, finer polling is waste). */
  pollIntervalMs?: number;
  /** Max wait for round finalization (default 300s). */
  roundTimeoutMs?: number;
  /** Max attempts against the DA layer at 5s intervals (default 12). */
  proofMaxAttempts?: number;
}

export interface VerifyAddressParams {
  chain?: Chain;
  address: string;
}

export interface VerifyPaymentParams {
  chain?: Chain;
  txId: string;
  /** UTXO indices — only meaningful for BTC/DOGE; ignored (0) for XRP. */
  inUtxo?: number | string;
  utxo?: number | string;
}

export interface VerifyEvmTransactionParams {
  chain?: EvmChain;
  txHash: string;
  /** Confirmations the verifier must see on the source chain (default 1). */
  requiredConfirmations?: number;
  provideInput?: boolean;
  listEvents?: boolean;
  logIndices?: number[];
}

export type EstimateParams =
  | ({ type: "AddressValidity" } & VerifyAddressParams)
  | ({ type: "Payment" } & VerifyPaymentParams)
  | ({ type: "EVMTransaction" } & VerifyEvmTransactionParams);

const VERIFY_FN: Record<AttestationTypeName, string> = {
  AddressValidity: "verifyAddressValidity",
  Payment: "verifyPayment",
  EVMTransaction: "verifyEVMTransaction",
};

export class FdcClient {
  private roundParams?: { firstRoundStartTs: bigint; epochSeconds: bigint };
  private protocolId?: bigint;

  constructor(private readonly kit: KitInternals) {}

  // ─── Public API ─────────────────────────────────────────────────

  async verifyAddress(
    params: VerifyAddressParams,
    options: VerifyOptions = {}
  ): Promise<AddressValidityResult> {
    const chain = params.chain ?? "XRP";
    return this.run<AddressValidityRequestBody, AddressValidityResponseBody>(
      "AddressValidity",
      chain,
      { addressStr: params.address },
      options
    );
  }

  async verifyPayment(
    params: VerifyPaymentParams,
    options: VerifyOptions = {}
  ): Promise<PaymentResult> {
    const chain = params.chain ?? "XRP";
    return this.run<PaymentRequestBody, PaymentResponseBody>(
      "Payment",
      chain,
      {
        transactionId: normalizeTxId(params.txId),
        inUtxo: String(params.inUtxo ?? 0),
        utxo: String(params.utxo ?? 0),
      },
      options
    );
  }

  async verifyEvmTransaction(
    params: VerifyEvmTransactionParams,
    options: VerifyOptions = {}
  ): Promise<EvmTransactionResult> {
    return this.run<EvmTransactionRequestBody, EvmTransactionResponseBody>(
      "EVMTransaction",
      params.chain ?? "ETH",
      evmRequestJson(params),
      options
    );
  }

  /**
   * Probe which (attestation type, chain) pairs the network's verifiers serve
   * right now. Costs nothing (no transactions). "available" means the route
   * answered — even a rejection of the dummy probe proves the verifier is up.
   */
  async capabilities(): Promise<Capability[]> {
    const dummyTx = ("0x" + "11".repeat(32)) as `0x${string}`;
    const probes: { type: AttestationTypeName; chain: Chain | EvmChain; body: Record<string, unknown> }[] = [
      ...(["XRP", "BTC", "DOGE"] as Chain[]).flatMap((chain) => [
        { type: "AddressValidity" as const, chain, body: { addressStr: "flarekit-probe" } },
        { type: "Payment" as const, chain, body: { transactionId: dummyTx, inUtxo: "0", utxo: "0" } },
      ]),
      {
        type: "EVMTransaction" as const,
        chain: "ETH" as const,
        body: { transactionHash: dummyTx, requiredConfirmations: "1", provideInput: true, listEvents: true, logIndices: [] },
      },
    ];

    return Promise.all(
      probes.map(async ({ type, chain, body }): Promise<Capability> => {
        try {
          await this.prepare(type, chain, body);
          return { type, chain, status: "available" };
        } catch (err) {
          if (err instanceof VerifierRejectedError) {
            return { type, chain, status: "available", detail: err.verifierStatus ?? "route up (probe rejected)" };
          }
          return { type, chain, status: "unavailable", detail: (err as Error).message.slice(0, 140) };
        }
      })
    );
  }

  /** Quote the attestation fee and a realistic end-to-end ETA without submitting. */
  async estimate(params: EstimateParams): Promise<FeeEstimate> {
    const chain = params.chain ?? (params.type === "EVMTransaction" ? "ETH" : "XRP");
    const requestBody =
      params.type === "AddressValidity"
        ? { addressStr: params.address }
        : params.type === "EVMTransaction"
          ? evmRequestJson(params)
          : {
              transactionId: normalizeTxId(params.txId),
              inUtxo: String(params.inUtxo ?? 0),
              utxo: String(params.utxo ?? 0),
            };

    const abiEncodedRequest = await this.prepare(params.type, chain, requestBody);
    const feeWei = await this.getFee(abiEncodedRequest);
    const { epochSeconds } = await this.getRoundParams();
    // Submit lands mid-epoch on average; finalization observed ~1-2 epochs later,
    // plus DA-layer lag. Measured ~108s end-to-end on Coston2 with 90s epochs.
    const etaSeconds = Number(epochSeconds) * 2 + 30;
    return { feeWei, etaSeconds, abiEncodedRequest };
  }

  /** Continue a verification whose request tx is already on-chain (serverless-safe). */
  async resume<TReq = unknown, TRes = unknown>(
    handle: ResumeHandle,
    options: VerifyOptions = {}
  ): Promise<VerificationResult<TReq, TRes>> {
    const progress = new ProgressReporter(options.onProgress);
    return this.completeFromRound<TReq, TRes>(handle, options, progress);
  }

  /** Re-verify a cached proof on-chain (read-only; proofs are valid forever). */
  async verifyProof(proof: AttestationProof<unknown, unknown>): Promise<boolean> {
    const type = decodeTypeName(proof.data.attestationType);
    const verification = await this.kit.resolver.contract("FdcVerification", FDC_VERIFICATION_ABI);
    return verification[VERIFY_FN[type]].staticCall({
      merkleProof: proof.merkleProof,
      data: proof.data,
    });
  }

  // ─── Pipeline ───────────────────────────────────────────────────

  private async run<TReq, TRes>(
    type: AttestationTypeName,
    chain: Chain | EvmChain,
    requestBody: Record<string, unknown>,
    options: VerifyOptions
  ): Promise<VerificationResult<TReq, TRes>> {
    const progress = new ProgressReporter(options.onProgress);

    // 1. Canonical request bytes (verifier computes the MIC — never encode locally)
    progress.emit("preparing", { type, chain });
    const abiEncodedRequest = await this.prepare(type, chain, requestBody);
    progress.emit("prepared", { abiEncodedRequest });

    // 2-3. Fee quote + fee-paying submission
    const feeWei = await this.getFee(abiEncodedRequest);
    progress.emit("submitting", { feeWei: feeWei.toString() });
    const signer = await this.kit.getSigner("fdc.verify");
    const hub = await this.kit.resolver.contract("FdcHub", FDC_HUB_ABI);
    let receipt;
    try {
      const tx = await (hub.connect(signer) as Contract).requestAttestation(abiEncodedRequest, {
        value: feeWei,
      });
      receipt = await tx.wait();
    } catch (err) {
      throw new NetworkError(
        `requestAttestation transaction failed: ${(err as Error).message.slice(0, 200)}`,
        err as Error
      );
    }

    // 4. Voting round from the submission block timestamp
    const block = await this.kit.provider.getBlock(receipt.blockNumber);
    const votingRoundId = await this.computeRound(BigInt(block!.timestamp));
    const handle: ResumeHandle = {
      type,
      abiEncodedRequest,
      votingRoundId,
      requestTxHash: receipt.hash as `0x${string}`,
      feePaidWei: feeWei,
    };
    progress.emit("submitted", {
      txHash: receipt.hash,
      votingRoundId,
      explorer: `${this.kit.network.explorerUrl}/tx/${receipt.hash}`,
    });

    return this.completeFromRound<TReq, TRes>(handle, options, progress);
  }

  private async completeFromRound<TReq, TRes>(
    handle: ResumeHandle,
    options: VerifyOptions,
    progress: ProgressReporter
  ): Promise<VerificationResult<TReq, TRes>> {
    // 5. Wait for round finalization (the honest ~90-180s part)
    await this.waitForRound(handle.votingRoundId, options, progress);
    progress.emit("round-finalized", { votingRoundId: handle.votingRoundId });

    // 6. Proof from the DA layer
    const raw = await this.kit.daLayer.getProof(handle.votingRoundId, handle.abiEncodedRequest, {
      maxAttempts: options.proofMaxAttempts,
      onAttempt: (attempt) => progress.emit("fetching-proof", { attempt }),
    });
    progress.emit("proof-received", { merkleProofLength: raw.proof.length });

    // 7. Decode + on-chain verification (staticCall — the boolean, not a receipt)
    progress.emit("verifying");
    const data = this.decodeResponse(handle.type, raw.response_hex);
    const proof: AttestationProof<TReq, TRes> = {
      merkleProof: raw.proof,
      data: data as AttestationProof<TReq, TRes>["data"],
    };
    const verification = await this.kit.resolver.contract("FdcVerification", FDC_VERIFICATION_ABI);
    let verified: boolean;
    try {
      verified = await verification[VERIFY_FN[handle.type]].staticCall(proof);
    } catch (err) {
      throw new ProofInvalidError(`verification call reverted: ${(err as Error).message.slice(0, 200)}`);
    }
    progress.emit("done", { verified });

    return {
      verified,
      response: proof.data.responseBody as TRes,
      proof,
      votingRoundId: handle.votingRoundId,
      requestTxHash: handle.requestTxHash,
      feePaidWei: handle.feePaidWei,
      timings: progress.timings,
    };
  }

  // ─── Steps ──────────────────────────────────────────────────────

  private async prepare(
    type: AttestationTypeName,
    chain: Chain | EvmChain,
    requestBody: Record<string, unknown>
  ): Promise<`0x${string}`> {
    const sourceId = `${this.kit.network.sourceIdPrefix}${chain}`;
    const path = `${chain.toLowerCase()}/${type}`;
    return this.kit.verifier.prepareRequest(path, type, sourceId, requestBody);
  }

  private async getFee(abiEncodedRequest: `0x${string}`): Promise<bigint> {
    const feeConfig = await this.kit.resolver.contract(
      "FdcRequestFeeConfigurations",
      FDC_FEE_CONFIG_ABI
    );
    return feeConfig.getRequestFee(abiEncodedRequest);
  }

  private async getRoundParams(): Promise<{ firstRoundStartTs: bigint; epochSeconds: bigint }> {
    if (!this.roundParams) {
      const fsm = await this.kit.resolver.contract("FlareSystemsManager", FLARE_SYSTEMS_MANAGER_ABI);
      const [firstRoundStartTs, epochSeconds] = await Promise.all([
        fsm.firstVotingRoundStartTs(),
        fsm.votingEpochDurationSeconds(),
      ]);
      this.roundParams = { firstRoundStartTs, epochSeconds };
    }
    return this.roundParams;
  }

  private async computeRound(blockTimestamp: bigint): Promise<number> {
    const { firstRoundStartTs, epochSeconds } = await this.getRoundParams();
    return Number((blockTimestamp - firstRoundStartTs) / epochSeconds);
  }

  private async getProtocolId(): Promise<bigint> {
    if (this.protocolId === undefined) {
      const verification = await this.kit.resolver.contract("FdcVerification", FDC_VERIFICATION_ABI);
      this.protocolId = BigInt(await verification.fdcProtocolId());
    }
    return this.protocolId;
  }

  private async waitForRound(
    votingRoundId: number,
    options: VerifyOptions,
    progress: ProgressReporter
  ): Promise<void> {
    const pollIntervalMs = options.pollIntervalMs ?? 10_000;
    const timeoutMs = options.roundTimeoutMs ?? 300_000;
    const relay = await this.kit.resolver.contract("Relay", RELAY_ABI);
    const protocolId = await this.getProtocolId();
    const { firstRoundStartTs, epochSeconds } = await this.getRoundParams();
    // Rounds are attested ~1-2 epochs after they close (observed on Coston2).
    const expectedEndMs = Number(firstRoundStartTs + BigInt(votingRoundId + 2) * epochSeconds) * 1000;

    const startedAt = Date.now();
    let polls = 0;
    while (Date.now() - startedAt < timeoutMs) {
      const finalized: boolean = await relay.isFinalized(protocolId, votingRoundId);
      if (finalized) return;
      polls += 1;
      progress.emit(
        "waiting-round",
        { votingRoundId, polls },
        Math.max(5, Math.round((expectedEndMs - Date.now()) / 1000))
      );
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }
    throw new RoundTimeoutError(votingRoundId, Date.now() - startedAt);
  }

  private decodeResponse(type: AttestationTypeName, responseHex: `0x${string}`) {
    const tuple = RESPONSE_TUPLES[type];
    const decoded = AbiCoder.defaultAbiCoder().decode([tuple], responseHex)[0];
    return resultToPlain(decoded, ParamType.from(tuple));
  }
}

/**
 * Convert a decoded ethers Result into plain objects/arrays, guided by the ABI
 * type. Runtime guessing fails on empty arrays (an empty Result "converts" to
 * {} instead of []), which breaks re-encoding for verification — the ParamType
 * says definitively whether each node is an array or a struct.
 */
export function resultToPlain(value: unknown, type: ParamType): unknown {
  if (type.baseType === "array") {
    return (value as Result).toArray().map((item) => resultToPlain(item, type.arrayChildren!));
  }
  if (type.baseType === "tuple") {
    const result = value as Result;
    const obj: Record<string, unknown> = {};
    type.components!.forEach((component, index) => {
      obj[component.name || String(index)] = resultToPlain(result[index], component);
    });
    return obj;
  }
  return value;
}

function decodeTypeName(attestationType: `0x${string}`): AttestationTypeName {
  const text = toUtf8String(attestationType).replace(/\0+$/, "");
  if (text !== "AddressValidity" && text !== "Payment" && text !== "EVMTransaction") {
    throw new ProofInvalidError(`unsupported attestation type "${text}"`);
  }
  return text;
}

/** Verifier-API JSON body for an EVMTransaction request. */
function evmRequestJson(params: VerifyEvmTransactionParams): Record<string, unknown> {
  return {
    transactionHash: normalizeTxId(params.txHash),
    requiredConfirmations: String(params.requiredConfirmations ?? 1),
    provideInput: params.provideInput ?? true,
    listEvents: params.listEvents ?? true,
    logIndices: (params.logIndices ?? []).map(String),
  };
}
