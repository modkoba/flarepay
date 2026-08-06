/**
 * FlareKit SDK — FdcHub contract wrapper for attestation requests.
 */

import { ethers } from "ethers";
import { Provider } from "../provider.js";
import { encodeAddressValidityRequest, encodePaymentRequest, encodeXRPPaymentRequest, encodeAttestationType } from "../encoder.js";
import type { AddressValidityRequestBody, PaymentRequestBody, XRPPaymentRequestBody } from "../types.js";

export interface AttestationOptions {
  attestationType?: string;
  sourceId?: string;
  messageIntegrityCode?: string;
}

export interface AttestationResult {
  txHash: `0x${string}`;
  attestationType: `0x${string}`;
  sourceId: `0x${string}`;
  messageIntegrityCode: `0x${string}`;
  votingRound: bigint;
  fee: bigint;
}

export interface QuoteFeeResult {
  fee: bigint;
  votingRound: bigint;
  lowestUsedTimestamp: bigint;
}

export class FdcHub {
  private readonly address: `0x${string}`;
  private readonly feeSelector = "0x9bf66d76";

  constructor(
    private readonly provider: Provider,
    contractAddress: `0x${string}`
  ) {
    this.address = contractAddress;
  }

  async quoteFee(
    attestationType: `0x${string}`,
    sourceId: `0x${string}`,
    messageIntegrityCode: `0x${string}`,
    encodedRequest: `0x${string}`
  ): Promise<QuoteFeeResult> {
    const calldata = this.feeSelector + encodedRequest.slice(2);
    const hex = await this.provider.call({
      to: this.address,
      data: calldata,
    });

    const coder = ethers.AbiCoder.defaultAbiCoder();
    const [fee, votingRound, lowestUsedTimestamp] = coder.decode(
      ["uint256", "uint64", "uint64"],
      ethers.getBytes(hex)
    );

    return {
      fee: fee as bigint,
      votingRound: votingRound as bigint,
      lowestUsedTimestamp: lowestUsedTimestamp as bigint,
    };
  }

  async requestAddressValidityAttestation(
    requestBody: AddressValidityRequestBody,
    options: AttestationOptions = {}
  ): Promise<AttestationResult> {
    const attestationType = encodeAttestationType(options.attestationType || "XRPAddressValidity");
    const sourceId = (options.sourceId as `0x${string}`) || ethers.ZeroHash;
    const messageIntegrityCode = (options.messageIntegrityCode as `0x${string}`) || ethers.ZeroHash;
    const encoded = encodeAddressValidityRequest(attestationType, sourceId, messageIntegrityCode, requestBody);
    return this._requestAttestation(attestationType, sourceId, messageIntegrityCode, encoded);
  }

  async requestPaymentAttestation(
    requestBody: PaymentRequestBody,
    options: AttestationOptions = {}
  ): Promise<AttestationResult> {
    const attestationType = encodeAttestationType(options.attestationType || "XRP_PAYMENT");
    const sourceId = (options.sourceId as `0x${string}`) || ethers.ZeroHash;
    const messageIntegrityCode = (options.messageIntegrityCode as `0x${string}`) || ethers.ZeroHash;
    const encoded = encodePaymentRequest(attestationType, sourceId, messageIntegrityCode, requestBody);
    return this._requestAttestation(attestationType, sourceId, messageIntegrityCode, encoded);
  }

  async requestXRPPaymentAttestation(
    requestBody: XRPPaymentRequestBody,
    options: AttestationOptions = {}
  ): Promise<AttestationResult> {
    const attestationType = encodeAttestationType(options.attestationType || "XRPPayment");
    const sourceId = (options.sourceId as `0x${string}`) || ethers.ZeroHash;
    const messageIntegrityCode = (options.messageIntegrityCode as `0x${string}`) || ethers.ZeroHash;
    const encoded = encodeXRPPaymentRequest(attestationType, sourceId, messageIntegrityCode, requestBody);
    return this._requestAttestation(attestationType, sourceId, messageIntegrityCode, encoded);
  }

  private async _requestAttestation(
    attestationType: `0x${string}`,
    sourceId: `0x${string}`,
    messageIntegrityCode: `0x${string}`,
    encoded: `0x${string}`
  ): Promise<AttestationResult> {
    const feeResult = await this.quoteFee(attestationType, sourceId, messageIntegrityCode, encoded);

    const tx = await this.provider.sendTransaction({
      to: this.address,
      data: "0x8d1536d1" + encoded.slice(2),
      value: feeResult.fee,
    });

    const receipt = await this.provider.waitForTransaction(tx.hash);

    return {
      txHash: receipt.hash as `0x${string}`,
      attestationType,
      sourceId,
      messageIntegrityCode,
      votingRound: feeResult.votingRound,
      fee: feeResult.fee,
    };
  }
}
