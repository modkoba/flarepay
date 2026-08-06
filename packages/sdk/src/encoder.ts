/**
 * FlareKit SDK — ABI encoding helpers for attestation requests and proofs.
 */

import { ethers } from "ethers";
import type {
  AddressValidityRequestBody,
  AddressValidityResponseBody,
  PaymentRequestBody,
  PaymentResponseBody,
  XRPPaymentRequestBody,
  XRPPaymentResponseBody,
  AddressValidityResponse,
  PaymentResponse,
  XRPPaymentResponse,
  AddressValidityProof,
  PaymentProof,
  XRPPaymentProof,
} from "./types.js";

const coder = ethers.AbiCoder.defaultAbiCoder();

export function encodeAttestationType(type: string): `0x${string}` {
  return ("0x" + Buffer.from(ethers.toUtf8Bytes(type)).toString("hex").padEnd(64, "0")) as `0x${string}`;
}

// ─── Request Encoding (for FdcHub.requestAttestation) ─────────────

export function encodeAddressValidityRequest(
  attestationType: `0x${string}`,
  sourceId: `0x${string}`,
  messageIntegrityCode: `0x${string}`,
  requestBody: AddressValidityRequestBody
): `0x${string}` {
  return coder.encode(
    ["(bytes32,bytes32,bytes32,(string))"],
    [[attestationType, sourceId, messageIntegrityCode, [requestBody.addressStr]]]
  ) as `0x${string}`;
}

export function encodePaymentRequest(
  attestationType: `0x${string}`,
  sourceId: `0x${string}`,
  messageIntegrityCode: `0x${string}`,
  requestBody: PaymentRequestBody
): `0x${string}` {
  return coder.encode(
    ["(bytes32,bytes32,bytes32,(bytes32,uint256,uint256))"],
    [[attestationType, sourceId, messageIntegrityCode, [requestBody.transactionId, requestBody.inUtxo, requestBody.utxo]]]
  ) as `0x${string}`;
}

export function encodeXRPPaymentRequest(
  attestationType: `0x${string}`,
  sourceId: `0x${string}`,
  messageIntegrityCode: `0x${string}`,
  requestBody: XRPPaymentRequestBody
): `0x${string}` {
  return coder.encode(
    ["(bytes32,bytes32,bytes32,(bytes32,address))"],
    [[attestationType, sourceId, messageIntegrityCode, [requestBody.transactionId, requestBody.proofOwner]]]
  ) as `0x${string}`;
}

// ─── Proof Encoding (for FdcVerification.verifyXxx) ──────────────

export function encodeAddressValidityProof(proof: AddressValidityProof): `0x${string}` {
  return coder.encode(
    [
      "(bytes32[],bytes32,bytes32,uint64,uint64,(string),(bool,string,bytes32))",
    ],
    [
      [
        proof.merkleProof as any,
        proof.data.attestationType,
        proof.data.sourceId,
        proof.data.votingRound,
        proof.data.lowestUsedTimestamp,
        [proof.data.requestBody.addressStr],
        [
          proof.data.responseBody.isValid,
          proof.data.responseBody.standardAddress,
          proof.data.responseBody.standardAddressHash as any,
        ],
      ],
    ]
  ) as `0x${string}`;
}

export function encodePaymentProof(proof: PaymentProof): `0x${string}` {
  return coder.encode(
    [
      "(bytes32[],bytes32,bytes32,uint64,uint64,(bytes32,uint256,uint256),(uint64,uint64,bytes32,bytes32,bytes32,bytes32,int256,int256,int256,int256,bytes32,bool,uint8))",
    ],
    [
      [
        proof.merkleProof as any,
        proof.data.attestationType,
        proof.data.sourceId,
        proof.data.votingRound,
        proof.data.lowestUsedTimestamp,
        [
          proof.data.requestBody.transactionId,
          proof.data.requestBody.inUtxo,
          proof.data.requestBody.utxo,
        ],
        [
          proof.data.responseBody.blockNumber,
          proof.data.responseBody.blockTimestamp,
          proof.data.responseBody.sourceAddressHash as any,
          proof.data.responseBody.sourceAddressesRoot as any,
          proof.data.responseBody.receivingAddressHash as any,
          proof.data.responseBody.intendedReceivingAddressHash as any,
          proof.data.responseBody.spentAmount,
          proof.data.responseBody.intendedSpentAmount,
          proof.data.responseBody.receivedAmount,
          proof.data.responseBody.intendedReceivedAmount,
          proof.data.responseBody.standardPaymentReference as any,
          proof.data.responseBody.oneToOne,
          proof.data.responseBody.status,
        ],
      ],
    ]
  ) as `0x${string}`;
}

export function encodeXRPPaymentProof(proof: XRPPaymentProof): `0x${string}` {
  return coder.encode(
    [
      "(bytes32[],bytes32,bytes32,uint64,uint64,(bytes32,address),(uint64,uint64,string,bytes32,bytes32,bytes32,int256,int256,int256,int256,bool,bytes,bool,uint256,uint8))",
    ],
    [
      [
        proof.merkleProof as any,
        proof.data.attestationType,
        proof.data.sourceId,
        proof.data.votingRound,
        proof.data.lowestUsedTimestamp,
        [
          proof.data.requestBody.transactionId,
          proof.data.requestBody.proofOwner,
        ],
        [
          proof.data.responseBody.blockNumber,
          proof.data.responseBody.blockTimestamp,
          proof.data.responseBody.sourceAddress,
          proof.data.responseBody.sourceAddressHash as any,
          proof.data.responseBody.receivingAddressHash as any,
          proof.data.responseBody.intendedReceivingAddressHash as any,
          proof.data.responseBody.spentAmount,
          proof.data.responseBody.intendedSpentAmount,
          proof.data.responseBody.receivedAmount,
          proof.data.responseBody.intendedReceivedAmount,
          proof.data.responseBody.hasMemoData,
          proof.data.responseBody.firstMemoData as any,
          proof.data.responseBody.hasDestinationTag,
          proof.data.responseBody.destinationTag,
          proof.data.responseBody.status,
        ],
      ],
    ]
  ) as `0x${string}`;
}

// ─── Function Selectors ──────────────────────────────────────────

export const SELECTORS = {
  verifyAddressValidity: ethers.keccak256(ethers.toUtf8Bytes("verifyAddressValidity((bytes32[],bytes32,bytes32,uint64,uint64,(string),(bool,string,bytes32)))")).slice(0, 10) as `0x${string}`,
  verifyPayment: ethers.keccak256(ethers.toUtf8Bytes("verifyPayment((bytes32[],bytes32,bytes32,uint64,uint64,(bytes32,uint256,uint256),(uint64,uint64,bytes32,bytes32,bytes32,bytes32,int256,int256,int256,int256,bytes32,bool,uint8)))")).slice(0, 10) as `0x${string}`,
  verifyXRPPayment: ethers.keccak256(ethers.toUtf8Bytes("verifyXRPPayment((bytes32[],bytes32,bytes32,uint64,uint64,(bytes32,address),(uint64,uint64,string,bytes32,bytes32,bytes32,int256,int256,int256,int256,bool,bytes,bool,uint256,uint8)))")).slice(0, 10) as `0x${string}`,
  getRequestFee: ethers.keccak256(ethers.toUtf8Bytes("getRequestFee(bytes)")).slice(0, 10) as `0x${string}`,
  requestAttestation: ethers.keccak256(ethers.toUtf8Bytes("requestAttestation(bytes)")).slice(0, 10) as `0x${string}`,
  isFinalized: ethers.keccak256(ethers.toUtf8Bytes("isFinalized(uint256,uint256)")).slice(0, 10) as `0x${string}`,
  fdcProtocolId: ethers.keccak256(ethers.toUtf8Bytes("fdcProtocolId()")).slice(0, 10) as `0x${string}`,
  firstVotingRoundStartTs: ethers.keccak256(ethers.toUtf8Bytes("firstVotingRoundStartTs()")).slice(0, 10) as `0x${string}`,
  votingEpochDurationSeconds: ethers.keccak256(ethers.toUtf8Bytes("votingEpochDurationSeconds()")).slice(0, 10) as `0x${string}`,
} as const;

export function buildVerifyCalldata(selector: `0x${string}`, proofEncoded: `0x${string}`): `0x${string}` {
  return (selector + proofEncoded.slice(2)) as `0x${string}`;
}

// ─── Response Decoding ────────────────────────────────────────────

export function decodeAddressValidityResponse(hex: string): AddressValidityResponse {
  const decoded = coder.decode(
    ["(bytes32,bytes32,uint64,uint64,(string),(bool,string,bytes32))"],
    hex
  );
  const r = decoded[0];
  return {
    attestationType: r[0] as `0x${string}`,
    sourceId: r[1] as `0x${string}`,
    votingRound: r[2] as bigint,
    lowestUsedTimestamp: r[3] as bigint,
    requestBody: { addressStr: r[4][0] as string },
    responseBody: {
      isValid: r[5][0] as boolean,
      standardAddress: r[5][1] as string,
      standardAddressHash: r[5][2] as `0x${string}`,
    },
  };
}

export function decodePaymentResponse(hex: string): PaymentResponse {
  const decoded = coder.decode(
    ["(bytes32,bytes32,uint64,uint64,(bytes32,uint256,uint256),(uint64,uint64,bytes32,bytes32,bytes32,bytes32,int256,int256,int256,int256,bytes32,bool,uint8))"],
    hex
  );
  const r = decoded[0];
  return {
    attestationType: r[0] as `0x${string}`,
    sourceId: r[1] as `0x${string}`,
    votingRound: r[2] as bigint,
    lowestUsedTimestamp: r[3] as bigint,
    requestBody: {
      transactionId: r[4][0] as `0x${string}`,
      inUtxo: r[4][1] as bigint,
      utxo: r[4][2] as bigint,
    },
    responseBody: {
      blockNumber: r[5][0] as bigint,
      blockTimestamp: r[5][1] as bigint,
      sourceAddressHash: r[5][2] as `0x${string}`,
      sourceAddressesRoot: r[5][3] as `0x${string}`,
      receivingAddressHash: r[5][4] as `0x${string}`,
      intendedReceivingAddressHash: r[5][5] as `0x${string}`,
      spentAmount: r[5][6] as bigint,
      intendedSpentAmount: r[5][7] as bigint,
      receivedAmount: r[5][8] as bigint,
      intendedReceivedAmount: r[5][9] as bigint,
      standardPaymentReference: r[5][10] as `0x${string}`,
      oneToOne: r[5][11] as boolean,
      status: r[5][12] as 0 | 1 | 2,
    },
  };
}

export function decodeXRPPaymentResponse(hex: string): XRPPaymentResponse {
  const decoded = coder.decode(
    ["(bytes32,bytes32,uint64,uint64,(bytes32,address),(uint64,uint64,string,bytes32,bytes32,bytes32,int256,int256,int256,int256,bool,bytes,bool,uint256,uint8))"],
    hex
  );
  const r = decoded[0];
  return {
    attestationType: r[0] as `0x${string}`,
    sourceId: r[1] as `0x${string}`,
    votingRound: r[2] as bigint,
    lowestUsedTimestamp: r[3] as bigint,
    requestBody: {
      transactionId: r[4][0] as `0x${string}`,
      proofOwner: r[4][1] as `0x${string}`,
    },
    responseBody: {
      blockNumber: r[5][0] as bigint,
      blockTimestamp: r[5][1] as bigint,
      sourceAddress: r[5][2] as string,
      sourceAddressHash: r[5][3] as `0x${string}`,
      receivingAddressHash: r[5][4] as `0x${string}`,
      intendedReceivingAddressHash: r[5][5] as `0x${string}`,
      spentAmount: r[5][6] as bigint,
      intendedSpentAmount: r[5][7] as bigint,
      receivedAmount: r[5][8] as bigint,
      intendedReceivedAmount: r[5][9] as bigint,
      hasMemoData: r[5][10] as boolean,
      firstMemoData: r[5][11] as `0x${string}`,
      hasDestinationTag: r[5][12] as boolean,
      destinationTag: r[5][13] as bigint,
      status: r[5][14] as 0 | 1 | 2,
    },
  };
}
