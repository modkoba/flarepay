/**
 * FlareKit SDK — main entry point.
 *
 *   const kit = new FlareKit({ network: "coston2", privateKey: "0x..." });
 *   const result = await kit.fdc.verifyPayment({ chain: "XRP", txId: "..." });
 *   const btc = await kit.ftso.read("BTC/USD");
 */

import { BrowserProvider, Eip1193Provider, JsonRpcProvider, Signer, Wallet } from "ethers";
import { getNetwork, NetworkConfig, NetworkName } from "./networks.js";
import { ContractResolver } from "./registry.js";
import { VerifierApi } from "./verifier-api.js";
import { DaLayerApi } from "./da-layer.js";
import { FdcClient } from "./fdc.js";
import { FtsoClient } from "./ftso.js";
import { RandomClient } from "./random.js";
import { WalletRequiredError } from "./errors.js";

export interface FlareKitOptions {
  /** "coston2" (FDC testnet), "songbird", or "flare". Default "coston2". */
  network?: NetworkName;
  /** Override the preset RPC endpoint. */
  rpcUrl?: string;
  /** Override any preset endpoint/field (e.g. proxy verifierUrl/daLayerUrl in browsers). */
  overrides?: Partial<NetworkConfig>;
  /** Server-side signing: a 0x private key. */
  privateKey?: string;
  /** Bring-your-own ethers Signer. */
  signer?: Signer;
  /** Browser signing: an EIP-1193 provider (window.ethereum). */
  eip1193?: Eip1193Provider;
}

/** Shared plumbing passed to the protocol clients. */
export interface KitInternals {
  network: NetworkConfig;
  provider: JsonRpcProvider;
  resolver: ContractResolver;
  verifier: VerifierApi;
  daLayer: DaLayerApi;
  getSigner(operation: string): Promise<Signer>;
}

export class FlareKit {
  readonly network: NetworkConfig;
  readonly provider: JsonRpcProvider;
  readonly fdc: FdcClient;
  readonly ftso: FtsoClient;
  readonly random: RandomClient;

  private readonly options: FlareKitOptions;
  private signerPromise?: Promise<Signer>;

  constructor(options: FlareKitOptions = {}) {
    this.options = options;
    this.network = getNetwork(options.network ?? "coston2");
    if (options.rpcUrl) this.network = { ...this.network, rpcUrl: options.rpcUrl };
    if (options.overrides) this.network = { ...this.network, ...options.overrides };
    this.provider = new JsonRpcProvider(this.network.rpcUrl);

    const internals: KitInternals = {
      network: this.network,
      provider: this.provider,
      resolver: new ContractResolver(this.provider, this.network),
      verifier: new VerifierApi(this.network),
      daLayer: new DaLayerApi(this.network),
      getSigner: (operation) => this.getSigner(operation),
    };

    this.fdc = new FdcClient(internals);
    this.ftso = new FtsoClient(internals);
    this.random = new RandomClient(internals);
  }

  /** The signer used for fee-paying transactions. Read-only APIs never call this. */
  async getSigner(operation = "this operation"): Promise<Signer> {
    this.signerPromise ??= this.createSigner(operation);
    return this.signerPromise;
  }

  private async createSigner(operation: string): Promise<Signer> {
    const { privateKey, signer, eip1193 } = this.options;
    if (signer) return signer.provider ? signer : (signer.connect(this.provider) as Signer);
    if (privateKey) return new Wallet(privateKey, this.provider);
    if (eip1193) return new BrowserProvider(eip1193).getSigner();
    throw new WalletRequiredError(operation);
  }
}
