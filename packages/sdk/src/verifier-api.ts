/**
 * FlareKit SDK — FDC verifier REST client.
 *
 * The verifier's prepareRequest endpoint returns the canonical ABI-encoded
 * attestation request INCLUDING the message integrity code (MIC). This is the
 * only correct way to build a request — a locally-encoded request with a wrong
 * MIC is never confirmed by the attestation providers.
 */

import { pad32Utf8 } from "./encoding.js";
import { NetworkConfig } from "./networks.js";
import { NetworkError, VerifierRejectedError, VerifierUnavailableError } from "./errors.js";

export class VerifierApi {
  constructor(private readonly network: NetworkConfig) {}

  /**
   * @param path e.g. "xrp/AddressValidity" or "btc/Payment"
   * @param attestationType e.g. "AddressValidity"
   * @param sourceId e.g. "testXRP" (already prefixed for the network)
   */
  async prepareRequest(
    path: string,
    attestationType: string,
    sourceId: string,
    requestBody: Record<string, unknown>
  ): Promise<`0x${string}`> {
    const url = `${this.network.verifierUrl}/verifier/${path}/prepareRequest`;
    let res: Response;
    try {
      res = await fetch(url, {
        method: "POST",
        headers: {
          "X-API-KEY": this.network.verifierApiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          attestationType: pad32Utf8(attestationType),
          sourceId: pad32Utf8(sourceId),
          requestBody,
        }),
      });
    } catch (err) {
      throw new NetworkError(`verifier unreachable at ${url}`, err as Error);
    }

    const text = await res.text();

    if (res.status >= 500 || res.status === 404) {
      // 404 with an envoy "fault filter abort" body = verifier route down
      // (observed for btc on Coston2, Aug 2026).
      throw new VerifierUnavailableError(text.slice(0, 200) || res.statusText, res.status);
    }
    if (!res.ok) {
      throw new VerifierRejectedError(text.slice(0, 300) || res.statusText, res.status);
    }

    let data: { status?: string; abiEncodedRequest?: string };
    try {
      data = JSON.parse(text);
    } catch {
      throw new VerifierUnavailableError(`non-JSON response: ${text.slice(0, 120)}`, res.status);
    }

    if (data.status && data.status !== "VALID") {
      throw new VerifierRejectedError(
        `verifier status ${data.status} (the tx/address could not be attested as requested)`,
        res.status,
        data.status
      );
    }
    if (!data.abiEncodedRequest) {
      throw new VerifierRejectedError("verifier returned no abiEncodedRequest", res.status);
    }
    return data.abiEncodedRequest as `0x${string}`;
  }
}
