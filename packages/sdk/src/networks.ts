/**
 * FlareKit SDK — network presets.
 *
 * Contract addresses are resolved at runtime from the on-chain
 * FlareContractRegistry (same address on every Flare network). The
 * `fallbackContracts` below are only used if a registry lookup fails;
 * the Coston2 set was verified on-chain during Phase 0 research.
 */

import { ConfigError } from "./errors.js";

/** FlareContractRegistry — identical address on Flare, Songbird, Coston, Coston2. */
export const CONTRACT_REGISTRY_ADDRESS = "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019";

export type NetworkName = "coston2" | "songbird" | "flare";

export interface NetworkConfig {
  name: NetworkName;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  /** FDC verifier REST base (prepareRequest lives here). */
  verifierUrl: string;
  /** Public X-API-KEY for the verifier (all-zeros works on testnet). */
  verifierApiKey: string;
  /** Data Availability layer REST base (proofs live here). */
  daLayerUrl: string;
  /** Source-id prefix: "test" on test networks ("testXRP"), "" on mainnet ("XRP"). */
  sourceIdPrefix: string;
  fallbackContracts: Partial<Record<string, string>>;
}

export const COSTON2: NetworkConfig = {
  name: "coston2",
  chainId: 114,
  rpcUrl: "https://coston2-api.flare.network/ext/C/rpc",
  explorerUrl: "https://coston2.flarescan.com",
  verifierUrl: "https://fdc-verifiers-testnet.flare.network",
  verifierApiKey: "00000000-0000-0000-0000-000000000000",
  daLayerUrl: "https://ctn2-data-availability.flare.network",
  sourceIdPrefix: "test",
  fallbackContracts: {
    FdcHub: "0x48aC463d7975828989331F4De43341627b9c5f1D",
    FdcVerification: "0x906507E0B64bcD494Db73bd0459d1C667e14B933",
    Relay: "0xa10B672D1c62e5457b17af63d4302add6A99d7dE",
    FdcRequestFeeConfigurations: "0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e",
  },
};

export const FLARE: NetworkConfig = {
  name: "flare",
  chainId: 14,
  rpcUrl: "https://flare-api.flare.network/ext/C/rpc",
  explorerUrl: "https://flarescan.com",
  verifierUrl: "https://fdc-verifiers-mainnet.flare.network",
  verifierApiKey: "00000000-0000-0000-0000-000000000000",
  daLayerUrl: "https://flr-data-availability.flare.network",
  sourceIdPrefix: "",
  fallbackContracts: {},
};

export const SONGBIRD: NetworkConfig = {
  name: "songbird",
  chainId: 19,
  rpcUrl: "https://songbird-api.flare.network/ext/C/rpc",
  explorerUrl: "https://songbird.flarescan.com",
  verifierUrl: "https://fdc-verifiers-songbird.flare.network",
  verifierApiKey: "00000000-0000-0000-0000-000000000000",
  daLayerUrl: "https://sgb-data-availability.flare.network",
  sourceIdPrefix: "",
  fallbackContracts: {},
};

const NETWORKS: Record<NetworkName, NetworkConfig> = {
  coston2: COSTON2,
  songbird: SONGBIRD,
  flare: FLARE,
};

export function getNetwork(name: string): NetworkConfig {
  const network = NETWORKS[name.toLowerCase() as NetworkName];
  if (!network) {
    throw new ConfigError(
      `Unknown network "${name}"`,
      `Use one of: ${Object.keys(NETWORKS).join(", ")}. Coston2 is the FDC-enabled testnet.`
    );
  }
  return network;
}
