/**
 * FlareKit SDK — on-chain contract resolution via FlareContractRegistry.
 */

import { Contract, Provider, ZeroAddress } from "ethers";
import { REGISTRY_ABI } from "./abis.js";
import { CONTRACT_REGISTRY_ADDRESS, NetworkConfig } from "./networks.js";
import { ConfigError, NetworkError } from "./errors.js";

export class ContractResolver {
  private readonly cache = new Map<string, string>();
  private readonly registry: Contract;

  constructor(
    private readonly provider: Provider,
    private readonly network: NetworkConfig
  ) {
    this.registry = new Contract(CONTRACT_REGISTRY_ADDRESS, REGISTRY_ABI, provider);
  }

  async resolve(name: string): Promise<string> {
    const cached = this.cache.get(name);
    if (cached) return cached;

    let address: string | undefined;
    try {
      const fromRegistry: string = await this.registry.getContractAddressByName(name);
      if (fromRegistry && fromRegistry !== ZeroAddress) address = fromRegistry;
    } catch (err) {
      if (!this.network.fallbackContracts[name]) {
        throw new NetworkError(`registry lookup for "${name}" failed`, err as Error);
      }
    }

    address ||= this.network.fallbackContracts[name];
    if (!address) {
      throw new ConfigError(
        `Contract "${name}" not found in the ${this.network.name} registry`,
        "The registry is the source of truth for Flare contract addresses; check the name " +
          "against https://dev.flare.network or update the network's fallbackContracts."
      );
    }

    this.cache.set(name, address);
    return address;
  }

  async contract(name: string, abi: string[]): Promise<Contract> {
    return new Contract(await this.resolve(name), abi, this.provider);
  }
}
