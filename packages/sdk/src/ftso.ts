/**
 * FlareKit SDK — FTSOv2 price feed client.
 */

import { feedId } from "./encoding.js";
import { FTSO_V2_ABI } from "./abis.js";
import type { KitInternals } from "./kit.js";
import type { FeedReading } from "./types.js";

export class FtsoClient {
  constructor(private readonly kit: KitInternals) {}

  /**
   * Read a block-latency feed by symbol, e.g. "BTC/USD", "FLR/USD", "XRP/USD".
   * Free to read (staticCall); value is an integer scaled by 10^decimals.
   */
  async read(symbol: string): Promise<FeedReading> {
    const id = feedId(symbol);
    const ftso = await this.kit.resolver.contract("FtsoV2", FTSO_V2_ABI);
    const [value, decimals, timestamp] = await ftso.getFeedById.staticCall(id);
    return {
      symbol,
      feedId: id,
      value,
      decimals: Number(decimals),
      price: Number(value) / 10 ** Number(decimals),
      timestamp: Number(timestamp),
    };
  }

  /** Read several feeds in parallel. */
  async readMany(symbols: string[]): Promise<FeedReading[]> {
    return Promise.all(symbols.map((symbol) => this.read(symbol)));
  }
}
