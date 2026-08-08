/**
 * FlarePay core: charges, XRPL watching, FDC settlement.
 *
 * The server never holds funds. It only (a) opens charges on the escrow,
 * (b) watches the merchant's XRPL address for a matching destination tag, and
 * (c) relays an FDC proof so the charge settles on Flare. Anyone can do (c) —
 * the proof carries the authority, not the relayer.
 */

import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";
import { FlareKit, type ProgressEvent } from "@flarekit/sdk";
import { Client } from "xrpl";

export type ChargeState =
  | "awaiting_payment"
  | "payment_seen"
  | "attesting"
  | "settling"
  | "paid"
  | "failed";

export interface ChargeView {
  id: string;
  state: ChargeState;
  usdCents: number;
  xrpAmount: string;
  drops: string;
  rate: string;
  destinationTag: number;
  merchantAddress: string;
  paymentUri: string;
  metadata: string;
  expiresAt: number;
  createdTx: string;
  /** Populated as the flow advances. */
  xrplTxHash?: string;
  votingRound?: number;
  settleTx?: string;
  error?: string;
  /** Human-readable step log for the checkout UI. */
  steps: { step: string; at: number; etaSeconds?: number; detail?: string }[];
}

export interface FlarePayConfig {
  rpcUrl: string;
  privateKey: string;
  escrowAddress: string;
  /**
   * ABI from the compiled artifact — never hand-written. A hand-typed
   * human-readable ABI cost us a live settlement failure ("cannot use object
   * value with unnamed components"): one stray paren turned the proof struct
   * into a tuple-wrapping-a-tuple.
   */
  escrowAbi: readonly unknown[];
  merchantXrplAddress: string;
  xrplWss: string;
  explorerUrl: string;
}

export class FlarePay {
  private readonly provider: JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly escrow: Contract;
  private readonly kit: FlareKit;
  private readonly charges = new Map<string, ChargeView>();
  /** Verified proofs, kept so a failed settlement can retry without re-attesting. */
  private readonly proofs = new Map<string, unknown>();

  constructor(private readonly config: FlarePayConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl);
    this.wallet = new Wallet(config.privateKey, this.provider);
    this.escrow = new Contract(config.escrowAddress, config.escrowAbi as never, this.wallet);
    this.kit = new FlareKit({ network: "coston2", privateKey: config.privateKey });
  }

  list(): ChargeView[] {
    return [...this.charges.values()].sort((a, b) => Number(b.id) - Number(a.id));
  }

  get(id: string): ChargeView | undefined {
    return this.charges.get(id);
  }

  /** Open a charge priced in USD; FTSO pins the XRP amount on-chain. */
  async createCharge(usdCents: number, metadata: string): Promise<ChargeView> {
    const merchantHash = keccak256(toUtf8Bytes(this.config.merchantXrplAddress));
    const tx = await this.send("createCharge", [merchantHash, BigInt(usdCents), 200, 3600, metadata]);
    const receipt = await tx.wait();

    const event = this.parseEvent(receipt.logs, "ChargeCreated");
    if (!event) throw new Error("ChargeCreated event missing");

    const drops: bigint = event.args.quotedDrops;
    const destinationTag = Number(event.args.destinationTag);
    const rate = Number(event.args.rateValue) / 10 ** Number(event.args.rateDecimals);

    const charge: ChargeView = {
      id: event.args.chargeId.toString(),
      state: "awaiting_payment",
      usdCents,
      xrpAmount: (Number(drops) / 1e6).toFixed(6),
      drops: drops.toString(),
      rate: rate.toFixed(6),
      destinationTag,
      merchantAddress: this.config.merchantXrplAddress,
      paymentUri: `${this.config.merchantXrplAddress}?amount=${Number(drops) / 1e6}&dt=${destinationTag}`,
      metadata,
      expiresAt: Number(event.args.expiresAt),
      createdTx: receipt.hash,
      steps: [{ step: "charge_created", at: Date.now() }],
    };
    this.charges.set(charge.id, charge);
    return charge;
  }

  /**
   * Watch the merchant's XRPL address for a payment carrying this charge's tag,
   * then attest and settle. Returns when the charge reaches a terminal state.
   */
  async awaitAndSettle(chargeId: string, timeoutMs = 15 * 60_000): Promise<ChargeView> {
    const charge = this.charges.get(chargeId);
    if (!charge) throw new Error(`unknown charge ${chargeId}`);

    try {
      const xrplTxHash = charge.xrplTxHash ?? (await this.watchForPayment(charge, timeoutMs));
      charge.xrplTxHash = xrplTxHash;
      this.step(charge, "payment_seen", { detail: xrplTxHash });
      charge.state = "payment_seen";

      // Proofs are valid forever, so a retry after a settlement failure reuses
      // the cached one instead of paying for another attestation round.
      let proof = this.proofs.get(chargeId);
      if (!proof) {
        charge.state = "attesting";
        const verification = await this.kit.fdc.verifyXrpPayment(
          { txId: xrplTxHash, proofOwner: this.config.escrowAddress },
          { onProgress: (event) => this.onAttestationProgress(charge, event) }
        );
        if (!verification.verified) throw new Error("FDC verification returned false");
        charge.votingRound = verification.votingRoundId;
        proof = verification.proof;
        this.proofs.set(chargeId, proof);
      } else {
        this.step(charge, "proof-reused");
      }

      charge.state = "settling";
      this.step(charge, "settling");
      const settleTx = await this.send("settle", [BigInt(chargeId), proof]);
      const settleReceipt = await settleTx.wait();
      charge.settleTx = settleReceipt.hash;
      charge.state = "paid";
      this.step(charge, "paid", { detail: settleReceipt.hash });
    } catch (err) {
      charge.state = "failed";
      charge.error = (err as Error).message;
      this.step(charge, "failed", { detail: charge.error });
    }
    return charge;
  }

  /** Poll the XRPL for a validated payment to the merchant with this tag. */
  private async watchForPayment(charge: ChargeView, timeoutMs: number): Promise<string> {
    const client = new Client(this.config.xrplWss);
    await client.connect();
    const startedAt = Date.now();
    try {
      while (Date.now() - startedAt < timeoutMs) {
        const response = await client.request({
          command: "account_tx",
          account: this.config.merchantXrplAddress,
          ledger_index_min: -1,
          ledger_index_max: -1,
          limit: 30,
        });

        for (const entry of response.result.transactions) {
          const tx = (entry as { tx_json?: Record<string, unknown> }).tx_json ?? (entry as { tx?: Record<string, unknown> }).tx;
          if (!tx || tx.TransactionType !== "Payment") continue;
          if (Number(tx.DestinationTag) !== charge.destinationTag) continue;
          if (tx.Destination !== this.config.merchantXrplAddress) continue;
          const hash = (entry as { hash?: string }).hash ?? (tx.hash as string | undefined);
          if (hash && entry.validated !== false) return hash;
        }
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      throw new Error(`no payment with tag ${charge.destinationTag} seen within ${timeoutMs / 1000}s`);
    } finally {
      await client.disconnect();
    }
  }

  private onAttestationProgress(charge: ChargeView, event: ProgressEvent) {
    this.step(charge, event.step, {
      etaSeconds: event.etaSeconds,
      detail: event.detail ? JSON.stringify(event.detail).slice(0, 120) : undefined,
    });
  }

  private step(charge: ChargeView, step: string, extra: { etaSeconds?: number; detail?: string } = {}) {
    charge.steps.push({ step, at: Date.now(), ...extra });
  }

  private parseEvent(logs: readonly { topics: readonly string[]; data: string }[], name: string) {
    for (const log of logs) {
      try {
        const parsed = this.escrow.interface.parseLog(log as { topics: string[]; data: string });
        if (parsed?.name === name) return parsed;
      } catch {
        /* not ours */
      }
    }
    return null;
  }

  /**
   * Serialize on-chain sends. Charges and settlements are concurrent by nature
   * (many shoppers, one server key), and parallel sends from one account race
   * on the nonce and get dropped.
   */
  private txQueue: Promise<unknown> = Promise.resolve();

  /**
   * Send with a gas buffer: FTSOv2's getFeedById is payable/non-view and its
   * cost moves with feed updates, so a raw estimate can under-fund the tx.
   */
  private async send(method: string, args: unknown[]) {
    const run = this.txQueue.then(async () => {
      const estimate = await this.escrow[method].estimateGas(...args);
      const tx = await this.escrow[method](...args, { gasLimit: (estimate * 150n) / 100n });
      await tx.wait(); // hold the queue until mined so the next nonce is clean
      return tx;
    });
    this.txQueue = run.catch(() => undefined);
    return run;
  }
}
