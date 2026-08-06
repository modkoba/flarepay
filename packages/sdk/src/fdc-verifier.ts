/**
 * FlareKit SDK — FDC Verifier API client for fetching attestation responses.
 */

export interface VerifierResponse<TRequestBody, TResponseBody> {
  responseBody: TResponseBody;
  votingRound: number;
  lowestUsedTimestamp: number;
}

export interface XRPVResponse extends VerifierResponse<{ transactionId: string }, {
  blockNumber: number;
  blockTimestamp: number;
  sourceAddress: string;
  sourceAddressHash: string;
  receivingAddressHash: string;
  intendedReceivingAddressHash: string;
  spentAmount: string;
  intendedSpentAmount: string;
  receivedAmount: string;
  intendedReceivedAmount: string;
  hasMemoData: boolean;
  firstMemoData: string;
  hasDestinationTag: boolean;
  destinationTag: number;
  status: number;
}> {}

export interface BTCVResponse extends VerifierResponse<{ transactionId: string }, {
  blockNumber: number;
  blockTimestamp: number;
  sourceAddressHash: string;
  sourceAddressesRoot: string;
  receivingAddressHash: string;
  intendedReceivingAddressHash: string;
  spentAmount: string;
  intendedSpentAmount: string;
  receivedAmount: string;
  intendedReceivedAmount: string;
  standardPaymentReference: string;
  oneToOne: boolean;
  status: number;
}> {}

export interface XRPAddrResponse extends VerifierResponse<{ addressStr: string }, {
  isValid: boolean;
  standardAddress: string;
  standardAddressHash: string;
}> {}

export class FdcVerifierApi {
  constructor(private readonly baseUrl: string) {}

  async pollForResponse<T>(
    endpoint: string,
    request: { protocol: number; attestationRound: number },
    maxAttempts = 60,
    intervalMs = 5000
  ): Promise<T> {
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const res = await fetch(`${this.baseUrl}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });

        if (res.ok) {
          const data = (await res.json()) as { responseBody: unknown };
          if (data.responseBody) {
            return data as T;
          }
        }

        if (res.status === 400) {
          await new Promise(r => setTimeout(r, intervalMs));
          continue;
        }

        if (res.status === 404) {
          await new Promise(r => setTimeout(r, intervalMs));
          continue;
        }

        throw new Error(`Verifier API error: ${res.status} ${res.statusText}`);
      } catch (err) {
        if (i === maxAttempts - 1) throw err;
        await new Promise(r => setTimeout(r, intervalMs));
      }
    }
    throw new Error(`Verifier timeout after ${maxAttempts} attempts`);
  }

  async xrpPayment(request: { protocol: number; attestationRound: number }): Promise<XRPVResponse> {
    return this.pollForResponse<XRPVResponse>("/api/v1/fdc/xrp_payment", request);
  }

  async btcPayment(request: { protocol: number; attestationRound: number }): Promise<BTCVResponse> {
    return this.pollForResponse<BTCVResponse>("/api/v1/fdc/btc_payment", request);
  }

  async xrpAddress(request: { protocol: number; attestationRound: number }): Promise<XRPAddrResponse> {
    return this.pollForResponse<XRPAddrResponse>("/api/v1/fdc/xrp_address_validity", request);
  }
}
