/**
 * FlareKit SDK — Network configurations.
 */

export interface NetworkConfig {
  name: string;
  chainId: number;
  rpcUrl: string;
  explorerUrl: string;
  faucetUrl: string;
  contracts: ContractAddresses;
  verifierBaseUrl: string;
  daLayerUrl: string;
}

export interface ContractAddresses {
  registry: `0x${string}`;
  fdcHub: `0x${string}`;
  fdcVerification: `0x${string}`;
  relay: `0x${string}`;
  feeConfig: `0x${string}`;
  inflationConfig: `0x${string}`;
}

export const COSTON2: NetworkConfig = {
  name: "coston2",
  chainId: 114,
  rpcUrl: "https://coston2-api.flare.network/ext/C/rpc",
  explorerUrl: "https://coston2.flarescan.com/",
  faucetUrl: "https://faucet.flare.network/",
  verifierBaseUrl: "https://fdc-verifiers-testnet.flare.network",
  daLayerUrl: "https://ctn2-data-availability.flare.network",
  contracts: {
    registry: "0xaD67FE66660Fb8dFE9d6b1b4240d8650e30F6019",
    fdcHub: "0x48aC463d7975828989331F4De43341627b9c5f1D",
    fdcVerification: "0x906507E0B64bcD494Db73bd0459d1C667e14B933",
    relay: "0xa10B672D1c62e5457b17af63d4302add6A99d7dE",
    feeConfig: "0x191a1282Ac700edE65c5B0AaF313BAcC3eA7fC7e",
    inflationConfig: "0x5C670a6950111D6f38B0D7cAdEB58D534fd9D209",
  },
};

export const NETWORKS: Record<string, NetworkConfig> = {
  coston2: COSTON2,
};

export function getNetwork(name: string): NetworkConfig {
  const network = NETWORKS[name.toLowerCase()];
  if (!network) {
    throw new Error(`Unknown network: ${name}. Available: ${Object.keys(NETWORKS).join(", ")}`);
  }
  return network;
}
