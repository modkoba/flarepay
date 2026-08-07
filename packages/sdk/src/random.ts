/**
 * FlareKit SDK — protocol-level secure random.
 */

import { RANDOM_NUMBER_V2_ABI } from "./abis.js";
import type { KitInternals } from "./kit.js";
import type { RandomReading } from "./types.js";

export class RandomClient {
  constructor(private readonly kit: KitInternals) {}

  /** Latest protocol random number. `isSecure` false means benign-conditions only. */
  async get(): Promise<RandomReading> {
    const random = await this.kit.resolver.contract("RandomNumberV2", RANDOM_NUMBER_V2_ABI);
    const [value, isSecure, timestamp] = await random.getRandomNumber();
    return { value, isSecure, timestamp: Number(timestamp) };
  }
}
