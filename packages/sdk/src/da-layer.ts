/**
 * FlareKit SDK — Data Availability Layer client for fetching attestation proofs.
 */

import { ethers } from "ethers";
import type { AddressValidityProof, PaymentProof, XRPPaymentProof } from "./types.js";

export interface DALayerRequest {
  protocol: number;
  round: number;
  dataRequestIndex: number;
  voterAddress?: string;
}

export class DALayerClient {
  constructor(private readonly baseUrl: string) {}

  async pollForProof(
    request: DALayerRequest,
    maxAttempts = 30,
    intervalMs = 3000
  ): Promise<{
    proof: `0x${string}`[];
    rawData: string;
  }> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(`${this.baseUrl}/api/v1/fdc/proof-by-request-round-raw`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });

        if (res.ok) {
          const data = await res.json() as {
            proof: string[];
            rawData: string;
          };
          return {
            proof: data.proof.map(p => p as `0x${string}`),
            rawData: data.rawData,
          };
        }

        if (res.status === 400 || res.status === 404) {
          await new Promise(r => setTimeout(r, intervalMs));
          continue;
        }

        throw new Error(`DA Layer error: ${res.status} ${res.statusText}`);
      } catch (err) {
        if (i === maxAttempts - 1) throw err;
        await new Promise(r => setTimeout(r, intervalMs));
      }
    }
    throw new Error(`DA Layer timeout after ${maxAttempts} attempts`);
  }
}
