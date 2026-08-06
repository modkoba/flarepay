/**
 * FlareKit SDK — Main entry point.
 *
 * Usage:
 *   import { kit } from "@flarekit/sdk";
 *   const result = await kit.payment.verify({ provider: {...}, txid: "..." });
 */

import { Provider } from "./provider.js";
import { FdcHub } from "./contracts/fdc-hub.js";
import { FdcVerification } from "./contracts/fdc-verification.js";
import { Relay } from "./contracts/relay.js";
import { FdcVerifierApi } from "./fdc-verifier.js";
import { DALayerClient } from "./da-layer.js";
import { COSTON2, NetworkConfig } from "./networks.js";
import { encodeAttestationType } from "./encoder.js";
import type { ProviderOptions } from "./provider.js";
import type { AddressValidityRequestBody, PaymentRequestBody, XRPPaymentRequestBody } from "./types.js";

// ─── Option Types ─────────────────────────────────────────────────

export interface BaseAttestationOptions {
  provider: ProviderOptions;
  network?: NetworkConfig;
  pollIntervalMs?: number;
  confirmations?: number;
}

export interface PaymentVerifyOptions extends BaseAttestationOptions {
  txid: string;
  inUtxo: number | bigint;
  utxo: number | bigint;
  sourceId?: string;
  messageIntegrityCode?: string;
  attestationType?: string;
  waitForFinalized?: boolean;
}

export interface ValidityCheckOptions extends BaseAttestationOptions {
  address: string;
  sourceId?: string;
  messageIntegrityCode?: string;
  attestationType?: string;
  waitForFinalized?: boolean;
}

export interface QuoteAttestationOptions extends BaseAttestationOptions {
  requestBody: AddressValidityRequestBody | PaymentRequestBody | XRPPaymentRequestBody;
  attestationType: string;
  sourceId?: string;
  messageIntegrityCode?: string;
}

// ─── Kit Namespace ────────────────────────────────────────────────

export interface KitNamespace {
  readonly payment: PaymentKit;
  readonly validity: ValidityKit;
  readonly quoteFee: QuoteFeeKit;
}

export interface PaymentKit {
  verify(options: PaymentVerifyOptions): Promise<import("./types.js").PaymentResult>;
}

export interface ValidityKit {
  check(options: ValidityCheckOptions): Promise<import("./types.js").AddressValidityResult>;
}

export interface QuoteFeeKit {
  attestation(options: QuoteAttestationOptions): Promise<{
    fee: bigint;
    attestationType: `0x${string}`;
    sourceId: `0x${string}`;
    messageIntegrityCode: `0x${string}`;
    votingRound: bigint;
  }>;
}

function resolveNetwork(options: BaseAttestationOptions): NetworkConfig {
  return options.network || COSTON2;
}

function createProvider(options: ProviderOptions, network: NetworkConfig): Provider {
  return new Provider({
    network,
    rpcUrl: options.rpcUrl || network.rpcUrl,
    privateKey: options.privateKey,
  });
}

export function createKit(): KitNamespace {
  return {
    payment: {
      async verify(opts: PaymentVerifyOptions): Promise<import("./types.js").PaymentResult> {
        const network = resolveNetwork(opts);
        const provider = createProvider(opts, network);
        const fdcHub = new FdcHub(provider, network.contracts.fdcHub);
        const fdcVerification = new FdcVerification(provider, network.contracts.fdcVerification);
        const relay = new Relay(provider, network.contracts.relay);
        const verifier = new FdcVerifierApi(network.verifierBaseUrl);
        const daLayer = new DALayerClient(network.daLayerUrl);

        const requestBody: PaymentRequestBody = {
          transactionId: opts.txid as `0x${string}`,
          inUtxo: BigInt(opts.inUtxo),
          utxo: BigInt(opts.utxo),
        };

        const attestation = await fdcHub.requestPaymentAttestation(requestBody, {
          attestationType: opts.attestationType,
          sourceId: opts.sourceId,
          messageIntegrityCode: opts.messageIntegrityCode,
        });

        if (opts.waitForFinalized !== false) {
          await relay.waitForFinalized(200, attestation.votingRound, {
            pollIntervalMs: opts.pollIntervalMs || 5000,
          });
        }

        const response = await verifier.btcPayment({
          protocol: 200,
          attestationRound: Number(attestation.votingRound),
        });

        const proofResult = await daLayer.pollForProof({
          protocol: 200,
          round: Number(attestation.votingRound),
          dataRequestIndex: 0,
        });

        const responseBody: import("./types.js").PaymentResponseBody = {
          blockNumber: BigInt(response.votingRound),
          blockTimestamp: BigInt(response.responseBody.blockTimestamp),
          sourceAddressHash: response.responseBody.sourceAddressHash as `0x${string}`,
          sourceAddressesRoot: response.responseBody.sourceAddressesRoot as `0x${string}`,
          receivingAddressHash: response.responseBody.receivingAddressHash as `0x${string}`,
          intendedReceivingAddressHash: response.responseBody.intendedReceivingAddressHash as `0x${string}`,
          spentAmount: BigInt(response.responseBody.spentAmount),
          intendedSpentAmount: BigInt(response.responseBody.intendedSpentAmount),
          receivedAmount: BigInt(response.responseBody.receivedAmount),
          intendedReceivedAmount: BigInt(response.responseBody.intendedReceivedAmount),
          standardPaymentReference: response.responseBody.standardPaymentReference as `0x${string}`,
          oneToOne: response.responseBody.oneToOne,
          status: response.responseBody.status as 0 | 1 | 2,
        };

        const proof: import("./types.js").PaymentProof = {
          merkleProof: proofResult.proof,
          data: {
            attestationType: attestation.attestationType,
            sourceId: attestation.sourceId,
            votingRound: attestation.votingRound,
            lowestUsedTimestamp: BigInt(response.lowestUsedTimestamp),
            requestBody,
            responseBody,
          },
        };

        const onChain = await fdcVerification.verifyPayment(proof, {
          confirmations: opts.confirmations || 1,
        });

        return {
          verified: onChain.verified,
          response: proof.data,
          proof,
          txHash: onChain.txHash,
          blockNumber: onChain.blockNumber,
          votingRound: attestation.votingRound,
        };
      },
    },

    validity: {
      async check(opts: ValidityCheckOptions): Promise<import("./types.js").AddressValidityResult> {
        const network = resolveNetwork(opts);
        const provider = createProvider(opts, network);
        const fdcHub = new FdcHub(provider, network.contracts.fdcHub);
        const fdcVerification = new FdcVerification(provider, network.contracts.fdcVerification);
        const relay = new Relay(provider, network.contracts.relay);
        const verifier = new FdcVerifierApi(network.verifierBaseUrl);
        const daLayer = new DALayerClient(network.daLayerUrl);

        const requestBody: AddressValidityRequestBody = {
          addressStr: opts.address,
        };

        const attestation = await fdcHub.requestAddressValidityAttestation(requestBody, {
          attestationType: opts.attestationType,
          sourceId: opts.sourceId,
          messageIntegrityCode: opts.messageIntegrityCode,
        });

        if (opts.waitForFinalized !== false) {
          await relay.waitForFinalized(200, attestation.votingRound, {
            pollIntervalMs: opts.pollIntervalMs || 5000,
          });
        }

        const response = await verifier.xrpAddress({
          protocol: 200,
          attestationRound: Number(attestation.votingRound),
        });

        const proofResult = await daLayer.pollForProof({
          protocol: 200,
          round: Number(attestation.votingRound),
          dataRequestIndex: 0,
        });

        const responseBody: import("./types.js").AddressValidityResponseBody = {
          isValid: response.responseBody.isValid,
          standardAddress: response.responseBody.standardAddress,
          standardAddressHash: response.responseBody.standardAddressHash as `0x${string}`,
        };

        const proof: import("./types.js").AddressValidityProof = {
          merkleProof: proofResult.proof,
          data: {
            attestationType: attestation.attestationType,
            sourceId: attestation.sourceId,
            votingRound: attestation.votingRound,
            lowestUsedTimestamp: BigInt(response.lowestUsedTimestamp),
            requestBody,
            responseBody,
          },
        };

        const onChain = await fdcVerification.verifyAddressValidity(proof, {
          confirmations: opts.confirmations || 1,
        });

        return {
          verified: onChain.verified,
          response: proof.data,
          proof,
          txHash: onChain.txHash,
          blockNumber: onChain.blockNumber,
          votingRound: attestation.votingRound,
        };
      },
    },

    quoteFee: {
      async attestation(opts: QuoteAttestationOptions): Promise<{
        fee: bigint;
        attestationType: `0x${string}`;
        sourceId: `0x${string}`;
        messageIntegrityCode: `0x${string}`;
        votingRound: bigint;
      }> {
        const network = resolveNetwork(opts);
        const provider = createProvider(opts, network);
        const fdcHub = new FdcHub(provider, network.contracts.fdcHub);

        const attestationType = encodeAttestationType(opts.attestationType);
        const sourceId = (opts.sourceId as `0x${string}`) || "0x0000000000000000000000000000000000000000000000000000000000000000";
        const messageIntegrityCode = (opts.messageIntegrityCode as `0x${string}`) || "0x0000000000000000000000000000000000000000000000000000000000000000";

        let encoded: `0x${string}`;

        if ("addressStr" in opts.requestBody) {
          encoded = await import("./encoder.js").then(m =>
            m.encodeAddressValidityRequest(
              attestationType,
              sourceId,
              messageIntegrityCode,
              opts.requestBody as AddressValidityRequestBody
            )
          );
        } else if ("transactionId" in opts.requestBody) {
          encoded = await import("./encoder.js").then(m =>
            m.encodePaymentRequest(
              attestationType,
              sourceId,
              messageIntegrityCode,
              opts.requestBody as PaymentRequestBody
            )
          );
        } else {
          encoded = await import("./encoder.js").then(m =>
            m.encodeXRPPaymentRequest(
              attestationType,
              sourceId,
              messageIntegrityCode,
              opts.requestBody as XRPPaymentRequestBody
            )
          );
        }

        const feeResult = await fdcHub.quoteFee(attestationType, sourceId, messageIntegrityCode, encoded);

        return {
          fee: feeResult.fee,
          attestationType,
          sourceId,
          messageIntegrityCode,
          votingRound: feeResult.votingRound,
        };
      },
    },
  };
}

export const kit: KitNamespace = createKit();
