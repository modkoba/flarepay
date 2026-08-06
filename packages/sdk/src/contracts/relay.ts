/**
 * FlareKit SDK — Relay contract wrapper for voting round finalization polling.
 */

import { ethers } from "ethers";
import { Provider } from "../provider.js";

export interface RelayOptions {
  pollIntervalMs?: number;
  maxAttempts?: number;
}

export class Relay {
  private readonly address: `0x${string}`;
  private readonly interface_: ethers.Interface;

  constructor(
    private readonly provider: Provider,
    contractAddress: `0x${string}`,
    private readonly options: RelayOptions = {}
  ) {
    this.address = contractAddress;
    this.interface_ = new ethers.Interface([
      "function isFinalized(uint256 protocolId, uint256 attestationRound) external view returns (bool)",
    ]);
  }

  async isFinalized(protocolId: number, votingRound: bigint): Promise<boolean> {
    const coder = ethers.AbiCoder.defaultAbiCoder();
    const calldata = coder.encode(["uint256", "uint256"], [BigInt(protocolId), votingRound]);
    const selector = "0x51c23118";

    const hex = await this.provider.call({
      to: this.address,
      data: selector + calldata.slice(2),
    });

    const result = coder.decode(["bool"], ethers.getBytes(hex));
    return result[0] as boolean;
  }

  async waitForFinalized(
    protocolId: number,
    votingRound: bigint,
    options: RelayOptions = {}
  ): Promise<{ finalized: boolean; roundsWaited: number }> {
    const pollInterval = options.pollIntervalMs || this.options.pollIntervalMs || 5000;
    const maxAttempts = options.maxAttempts || this.options.maxAttempts || 120;
    let roundsWaited = 0;

    for (let i = 0; i < maxAttempts; i++) {
      roundsWaited = i;
      const finalized = await this.isFinalized(protocolId, votingRound);
      if (finalized) {
        return { finalized: true, roundsWaited };
      }
      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    return { finalized: false, roundsWaited };
  }
}
