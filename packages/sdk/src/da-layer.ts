/**
 * FlareKit SDK — Data Availability layer client.
 *
 * Serves the Merkle proof + encoded response for a finalized round. Request
 * shape { votingRoundId, requestBytes } and the need for retries (first call
 * often 400s ~15s before data lands) were both verified live on Coston2.
 */

import { NetworkConfig } from "./networks.js";
import { NetworkError, ProofUnavailableError } from "./errors.js";

export interface RawProofResponse {
  attestation_type: string;
  proof: `0x${string}`[];
  response_hex: `0x${string}`;
}

export interface DaLayerOptions {
  maxAttempts?: number;
  intervalMs?: number;
  onAttempt?: (attempt: number) => void;
}

export class DaLayerApi {
  constructor(private readonly network: NetworkConfig) {}

  async getProof(
    votingRoundId: number,
    requestBytes: `0x${string}`,
    options: DaLayerOptions = {}
  ): Promise<RawProofResponse> {
    const maxAttempts = options.maxAttempts ?? 12;
    const intervalMs = options.intervalMs ?? 5000;
    const url = `${this.network.daLayerUrl}/api/v1/fdc/proof-by-request-round-raw`;
    let lastDetail = "";

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      options.onAttempt?.(attempt);
      let res: Response;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            "X-API-KEY": this.network.verifierApiKey,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ votingRoundId, requestBytes }),
        });
      } catch (err) {
        if (attempt === maxAttempts) throw new NetworkError(`DA layer unreachable at ${url}`, err as Error);
        await sleep(intervalMs);
        continue;
      }

      if (res.ok) {
        const data = (await res.json()) as Partial<RawProofResponse>;
        if (data.response_hex && Array.isArray(data.proof)) {
          return data as RawProofResponse;
        }
        lastDetail = "response missing proof/response_hex";
      } else {
        lastDetail = `HTTP ${res.status}`;
        if (res.status !== 400 && res.status !== 404) {
          const text = await res.text();
          throw new NetworkError(`DA layer error ${res.status}: ${text.slice(0, 200)}`);
        }
      }

      if (attempt < maxAttempts) await sleep(intervalMs);
    }

    throw new ProofUnavailableError(votingRoundId, maxAttempts, lastDetail);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
