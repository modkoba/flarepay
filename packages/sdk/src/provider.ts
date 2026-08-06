import { ethers, JsonRpcProvider, Wallet } from "ethers";
import { COSTON2, NetworkConfig } from "./networks.js";

export interface ProviderOptions {
  network?: NetworkConfig;
  rpcUrl?: string;
  privateKey?: string;
}

export class Provider {
  readonly network: NetworkConfig;
  readonly rpc: JsonRpcProvider;
  readonly wallet?: Wallet;

  constructor(options: ProviderOptions = {}) {
    this.network = options.network || COSTON2;
    this.rpc = new JsonRpcProvider(options.rpcUrl || this.network.rpcUrl);

    if (options.privateKey) {
      this.wallet = new Wallet(options.privateKey, this.rpc);
    }
  }

  async getBalance(address: string): Promise<bigint> {
    return this.rpc.getBalance(address);
  }

  async getBlockNumber(): Promise<number> {
    return this.rpc.getBlockNumber();
  }

  async getBlock(blockNumber: number) {
    return this.rpc.getBlock(blockNumber);
  }

  async getFeeData() {
    return this.rpc.getFeeData();
  }

  async sendTransaction(tx: ethers.TransactionRequest): Promise<ethers.TransactionResponse> {
    if (!this.wallet) throw new Error("Provider not configured with a wallet");
    return this.wallet.sendTransaction(tx);
  }

  async waitForTransaction(txHash: string, confirmations = 1): Promise<ethers.TransactionReceipt> {
    const receipt = await this.rpc.waitForTransaction(txHash, undefined, confirmations);
    if (!receipt) throw new Error(`Transaction ${txHash} not found`);
    return receipt;
  }

  async estimateGas(tx: ethers.TransactionRequest): Promise<bigint> {
    return this.rpc.estimateGas(tx);
  }

  async call(tx: ethers.TransactionRequest): Promise<string> {
    return this.rpc.call(tx);
  }
}
