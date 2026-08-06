/**
 * FlareKit SDK — FdcVerification contract wrapper for on-chain proof verification.
 */

import { ethers } from "ethers";
import { Provider } from "../provider.js";
import { SELECTORS, buildVerifyCalldata, encodeAddressValidityProof, encodePaymentProof, encodeXRPPaymentProof } from "../encoder.js";
import type { AddressValidityProof, PaymentProof, XRPPaymentProof, AddressValidityResponse, PaymentResponse, XRPPaymentResponse } from "../types.js";

export interface VerificationOptions {
  waitForConfirmation?: boolean;
  confirmations?: number;
}

export interface OnChainVerificationResult<TResponse> {
  verified: boolean;
  txHash: `0x${string}`;
  blockNumber: bigint;
  response: TResponse;
}

export class FdcVerification {
  constructor(
    private readonly provider: Provider,
    private readonly address: `0x${string}`
  ) {}

  async verifyAddressValidity(
    proof: AddressValidityProof,
    options: VerificationOptions = {}
  ): Promise<OnChainVerificationResult<AddressValidityResponse>> {
    const proofEncoded = encodeAddressValidityProof(proof);
    const calldata = buildVerifyCalldata(SELECTORS.verifyAddressValidity, proofEncoded);

    const tx = await this.provider.sendTransaction({
      to: this.address,
      data: calldata,
    });

    const receipt = await this.provider.waitForTransaction(tx.hash, options.confirmations || 1);

    return {
      verified: receipt.status === 1,
      txHash: receipt.hash as `0x${string}`,
      blockNumber: BigInt(receipt.blockNumber),
      response: proof.data,
    };
  }

  async verifyPayment(
    proof: PaymentProof,
    options: VerificationOptions = {}
  ): Promise<OnChainVerificationResult<PaymentResponse>> {
    const proofEncoded = encodePaymentProof(proof);
    const calldata = buildVerifyCalldata(SELECTORS.verifyPayment, proofEncoded);

    const tx = await this.provider.sendTransaction({
      to: this.address,
      data: calldata,
    });

    const receipt = await this.provider.waitForTransaction(tx.hash, options.confirmations || 1);

    return {
      verified: receipt.status === 1,
      txHash: receipt.hash as `0x${string}`,
      blockNumber: BigInt(receipt.blockNumber),
      response: proof.data,
    };
  }

  async verifyXRPPayment(
    proof: XRPPaymentProof,
    options: VerificationOptions = {}
  ): Promise<OnChainVerificationResult<XRPPaymentResponse>> {
    const proofEncoded = encodeXRPPaymentProof(proof);
    const calldata = buildVerifyCalldata(SELECTORS.verifyXRPPayment, proofEncoded);

    const tx = await this.provider.sendTransaction({
      to: this.address,
      data: calldata,
    });

    const receipt = await this.provider.waitForTransaction(tx.hash, options.confirmations || 1);

    return {
      verified: receipt.status === 1,
      txHash: receipt.hash as `0x${string}`,
      blockNumber: BigInt(receipt.blockNumber),
      response: proof.data,
    };
  }
}
