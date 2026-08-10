/**
 * FlarePay core: charges, XRPL watching, FDC settlement — durable edition.
 *
 * The server never holds funds. It only (a) opens charges on the escrow,
 * (b) watches the merchant's XRPL address for a matching destination tag, and
 * (c) relays an FDC proof so the charge settles on Flare. Anyone can do (c) —
 * the proof carries the authority, not the relayer.
 *
 * Product guarantees on top of the demo loop:
 *  - every state change persists (restart-safe),
 *  - a crash mid-attestation resumes via kit.fdc.resume() — the fee already
 *    paid is not paid again,
 *  - merchants get HMAC-signed webhooks on settlement.
 */

import { Contract, JsonRpcProvider, Wallet, keccak256, toUtf8Bytes } from "ethers";
import { FlareKit, type ProgressEvent, type ResumeHandle } from "@flarekit/sdk";
import { Client } from "xrpl";
import type { AttestationHandle, StoredEvent, WebhookConfig, WebhookDelivery } from "./store.js";

/**
 * What the engine needs from storage — satisfied by both the Supabase Db
 * (platform mode) and the legacy JSON Store adapter (keyless local mode).
 * Loads are async (network); writes are fire-and-forget with internal logging.
 */
export interface Persistence {
  saveCharge(accountId: string, charge: ChargeView): void;
  saveProof(chargeId: string, proof: unknown): void;
  loadProof(chargeId: string): Promise<unknown>;
  saveAttestation(chargeId: string, patch: AttestationHandle): void;
  loadAttestation(chargeId: string): Promise<AttestationHandle | undefined>;
  addEvent(accountId: string | null, type: string, chargeId?: string, detail?: string): void;
  getWebhook(accountId: string): Promise<WebhookConfig | null>;
  sign(secret: string, body: string): string;
  addWebhookDelivery(accountId: string, delivery: WebhookDelivery): void;
}

export type ChargeState =
  | "awaiting_payment"
  | "payment_seen"
  | "attesting"
  | "settling"
  | "paid"
  | "failed"
  | "expired";

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
  createdAt: number;
  createdTx: string;
  xrplTxHash?: string;
  payerAddress?: string;
  votingRound?: number;
  settleTx?: string;
  settledAt?: number;
  error?: string;
  steps: { step: string; at: number; etaSeconds?: number; detail?: string }[];
}

export interface FlarePayConfig {
  rpcUrl: string;
  privateKey: string;
  escrowAddress: string;
  escrowAbi: readonly unknown[];
  merchantXrplAddress: string;
  xrplWss: string;
  explorerUrl: string;
}

export interface AssetOption {
  code: string;
  name: string;
  network: string;
  /** How a payment is matched to its charge on this chain. */
  routing: "destination-tag" | "unique-address";
  feed: string;
  available: boolean;
  /** Why it isn't available — shown verbatim in the UI. */
  reason?: string;
}

export interface Stats {
  settledUsdCents: number;
  settledDrops: string;
  paid: number;
  pending: number;
  failed: number;
  total: number;
  avgSettleSeconds: number | null;
  lastRound: number | null;
}

export class FlarePay {
  private readonly provider: JsonRpcProvider;
  private readonly wallet: Wallet;
  private readonly escrow: Contract;
  private readonly kit: FlareKit;
  private readonly charges = new Map<string, ChargeView>();
  private readonly owners = new Map<string, string>(); // charge id -> account id

  constructor(
    private readonly config: FlarePayConfig,
    private readonly store: Persistence
  ) {
    this.provider = new JsonRpcProvider(config.rpcUrl);
    this.wallet = new Wallet(config.privateKey, this.provider);
    this.escrow = new Contract(config.escrowAddress, config.escrowAbi as never, this.wallet);
    this.kit = new FlareKit({ network: "coston2", privateKey: config.privateKey });
  }

  /** Hydrate the in-memory cache (platform mode passes owners per charge). */
  hydrate(charges: Iterable<ChargeView & { accountId: string }>): void {
    for (const charge of charges) {
      this.charges.set(charge.id, charge);
      this.owners.set(charge.id, charge.accountId);
    }
  }

  ownerOf(chargeId: string): string {
    return this.owners.get(chargeId) ?? "local";
  }

  // ─── queries ──────────────────────────────────────────────────────
  list(accountId?: string): ChargeView[] {
    return [...this.charges.values()]
      .filter((c) => !accountId || this.owners.get(c.id) === accountId)
      .sort((a, b) => Number(b.id) - Number(a.id));
  }

  get(id: string): ChargeView | undefined {
    return this.charges.get(id);
  }

  stats(accountId?: string): Stats {
    const all = this.list(accountId);
    const paid = all.filter((c) => c.state === "paid");
    const settleTimes = paid
      .filter((c) => c.settledAt && c.xrplTxHash)
      .map((c) => {
        const seen = c.steps.find((s) => s.step === "payment_seen")?.at ?? c.createdAt;
        return (c.settledAt! - seen) / 1000;
      })
      .filter((s) => s > 0 && s < 3600);
    return {
      settledUsdCents: paid.reduce((sum, c) => sum + c.usdCents, 0),
      settledDrops: paid.reduce((sum, c) => sum + BigInt(c.drops), 0n).toString(),
      paid: paid.length,
      pending: all.filter((c) => ["awaiting_payment", "payment_seen", "attesting", "settling"].includes(c.state)).length,
      failed: all.filter((c) => c.state === "failed").length,
      total: all.length,
      avgSettleSeconds: settleTimes.length
        ? Math.round(settleTimes.reduce((a, b) => a + b, 0) / settleTimes.length)
        : null,
      lastRound: paid.reduce<number | null>((max, c) => Math.max(max ?? 0, c.votingRound ?? 0) || max, null),
    };
  }

  private assetCache?: { assets: AssetOption[]; fetchedAt: number };

  /**
   * The payment menu, built from two independent facts:
   *  1. can Flare's verifier attest this chain right now (live probe), and
   *  2. can our escrow actually settle that proof shape.
   *
   * Both must hold. XRPL settles by destination tag (settleXrp); UTXO chains
   * need address-matched settlement (settleUtxo) which escrow v2 adds — so
   * DOGE/BTC are listed with an honest reason rather than hidden or faked.
   */
  async assets(): Promise<AssetOption[]> {
    if (this.assetCache && Date.now() - this.assetCache.fetchedAt < 60_000) {
      return this.assetCache.assets;
    }

    let capabilities: { type: string; chain: string; status: string; detail?: string }[] = [];
    try {
      capabilities = await this.kit.fdc.capabilities();
    } catch {
      /* verifier unreachable — fall through to "unknown" below */
    }

    const routeFor = (chain: string, type: string) =>
      capabilities.find((c) => c.chain === chain && c.type === type);

    const assets: AssetOption[] = [
      {
        code: "XRP",
        name: "XRP",
        network: "XRP Ledger (testnet)",
        routing: "destination-tag",
        feed: "XRP/USD",
        available: routeFor("XRP", "XRPPayment")?.status === "available",
        reason:
          routeFor("XRP", "XRPPayment")?.status === "available"
            ? undefined
            : "Flare's XRP verifier is not responding right now",
      },
      {
        code: "DOGE",
        name: "Dogecoin",
        network: "Dogecoin (testnet)",
        routing: "unique-address",
        feed: "DOGE/USD",
        available: false,
        reason:
          routeFor("DOGE", "Payment")?.status === "available"
            ? "verifier ready — awaiting escrow v2 (address-matched settlement)"
            : "Flare's DOGE verifier is not responding right now",
      },
      {
        code: "BTC",
        name: "Bitcoin",
        network: "Bitcoin (testnet)",
        routing: "unique-address",
        feed: "BTC/USD",
        available: false,
        reason:
          routeFor("BTC", "Payment")?.status === "available"
            ? "verifier ready — awaiting escrow v2 (address-matched settlement)"
            : "Flare's BTC verifier is down upstream — enables automatically when it returns",
      },
    ];

    this.assetCache = { assets, fetchedAt: Date.now() };
    return assets;
  }

  private rateCache?: { price: number; timestamp: number; fetchedAt: number };

  /** Live XRP/USD from FTSOv2, cached for 20s (feeds update every ~1.8s anyway). */
  async rate(): Promise<{ symbol: string; price: number; timestamp: number }> {
    if (!this.rateCache || Date.now() - this.rateCache.fetchedAt > 20_000) {
      const feed = await this.kit.ftso.read("XRP/USD");
      this.rateCache = { price: feed.price, timestamp: feed.timestamp, fetchedAt: Date.now() };
    }
    return { symbol: "XRP/USD", price: this.rateCache.price, timestamp: this.rateCache.timestamp };
  }

  // ─── lifecycle ────────────────────────────────────────────────────

  /** Open a charge priced in USD; FTSO pins the XRP amount on-chain. */
  async createCharge(
    usdCents: number,
    metadata: string,
    owner: { accountId: string; merchantXrplAddress?: string } = { accountId: "local" }
  ): Promise<ChargeView> {
    const merchantAddress = owner.merchantXrplAddress ?? this.config.merchantXrplAddress;
    const merchantHash = keccak256(toUtf8Bytes(merchantAddress));
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
      merchantAddress,
      paymentUri: `${merchantAddress}?amount=${Number(drops) / 1e6}&dt=${destinationTag}`,
      metadata,
      expiresAt: Number(event.args.expiresAt),
      createdAt: Date.now(),
      createdTx: receipt.hash,
      steps: [{ step: "charge_created", at: Date.now() }],
    };
    this.charges.set(charge.id, charge);
    this.owners.set(charge.id, owner.accountId);
    this.store.saveCharge(owner.accountId, charge);
    this.store.addEvent(owner.accountId, "charge.created", charge.id, `$${(usdCents / 100).toFixed(2)} · tag ${destinationTag}`);
    return charge;
  }

  /**
   * Drive a charge to a terminal state: watch XRPL → attest → settle.
   * Restart-safe: picks up from whatever was persisted (payment hash,
   * attestation handle, or a finished proof).
   */
  async awaitAndSettle(chargeId: string, timeoutMs = 45 * 60_000): Promise<ChargeView> {
    const charge = this.charges.get(chargeId);
    if (!charge) throw new Error(`unknown charge ${chargeId}`);

    try {
      if (!charge.xrplTxHash) {
        const xrplTxHash = await this.watchForPayment(charge, timeoutMs);
        charge.xrplTxHash = xrplTxHash;
        this.transition(charge, "payment_seen", xrplTxHash);
      }

      let proof = await this.store.loadProof(chargeId);
      if (!proof) {
        proof = await this.attestOrResume(charge);
        this.store.saveProof(chargeId, proof);
      } else {
        this.step(charge, "proof-reused");
      }

      this.transition(charge, "settling");
      const settleTx = await this.send("settle", [BigInt(chargeId), proof]);
      const settleReceipt = await settleTx.wait();
      charge.settleTx = settleReceipt.hash;
      charge.settledAt = Date.now();
      const settled = this.parseEvent(settleReceipt.logs, "ChargeSettled");
      if (settled) charge.payerAddress = settled.args.payerAddress;
      this.transition(charge, "paid", settleReceipt.hash);
      void this.deliverWebhook("charge.paid", charge);
    } catch (err) {
      charge.error = (err as Error).message;
      this.transition(charge, "failed", charge.error.slice(0, 140));
      void this.deliverWebhook("charge.failed", charge);
    }
    return charge;
  }

  /** Re-arm every non-terminal charge after a restart. */
  recover(): number {
    let recovered = 0;
    for (const charge of this.charges.values()) {
      if (["paid", "failed", "expired"].includes(charge.state)) continue;
      if (charge.expiresAt * 1000 < Date.now() && !charge.xrplTxHash) {
        charge.state = "expired";
        this.store.saveCharge(this.ownerOf(charge.id), charge);
        continue;
      }
      this.step(charge, "recovered_after_restart");
      void this.awaitAndSettle(charge.id);
      recovered++;
    }
    if (recovered > 0) this.store.addEvent(null, "server.recovered", undefined, `${recovered} charge(s) re-armed`);
    return recovered;
  }

  // ─── internals ────────────────────────────────────────────────────

  /** Attest the payment — resuming a crashed run instead of re-paying when possible. */
  private async attestOrResume(charge: ChargeView) {
    const saved = await this.store.loadAttestation(charge.id);
    if (saved?.abiEncodedRequest && saved.votingRoundId) {
      this.step(charge, "resuming_attestation", { detail: `round ${saved.votingRoundId}` });
      this.transition(charge, "attesting");
      const handle: ResumeHandle = {
        type: "XRPPayment",
        abiEncodedRequest: saved.abiEncodedRequest as `0x${string}`,
        votingRoundId: saved.votingRoundId,
        requestTxHash: (saved.requestTxHash ?? "0x") as `0x${string}`,
        feePaidWei: BigInt(saved.feePaidWei ?? "0"),
      };
      const result = await this.kit.fdc.resume(handle, {
        onProgress: (event) => this.onAttestationProgress(charge, event),
      });
      if (!result.verified) throw new Error("FDC verification returned false");
      charge.votingRound = handle.votingRoundId;
      return result.proof;
    }

    this.transition(charge, "attesting");
    const verification = await this.kit.fdc.verifyXrpPayment(
      { txId: charge.xrplTxHash!, proofOwner: this.config.escrowAddress },
      { onProgress: (event) => this.onAttestationProgress(charge, event) }
    );
    if (!verification.verified) throw new Error("FDC verification returned false");
    charge.votingRound = verification.votingRoundId;
    this.store.saveCharge(this.ownerOf(charge.id), charge);
    return verification.proof;
  }

  /**
   * Poll the XRPL for a validated payment to this charge's merchant with this tag.
   *
   * Watch the address the payer was actually told to pay — charge.merchantAddress —
   * not the platform wallet. Every account has its own payout address, and the
   * escrow settles against keccak256(charge.merchantAddress), so watching anything
   * else silently strands real merchants' payments.
   */
  private async watchForPayment(charge: ChargeView, timeoutMs: number): Promise<string> {
    const merchantAddress = charge.merchantAddress;
    if (!merchantAddress) throw new Error(`charge ${charge.id} has no merchant address`);

    const client = new Client(this.config.xrplWss);
    await client.connect();
    const startedAt = Date.now();
    try {
      while (Date.now() - startedAt < timeoutMs) {
        const response = await client.request({
          command: "account_tx",
          account: merchantAddress,
          ledger_index_min: -1,
          ledger_index_max: -1,
          limit: 30,
        });

        for (const entry of response.result.transactions) {
          const tx = (entry as { tx_json?: Record<string, unknown> }).tx_json ?? (entry as { tx?: Record<string, unknown> }).tx;
          if (!tx || tx.TransactionType !== "Payment") continue;
          if (Number(tx.DestinationTag) !== charge.destinationTag) continue;
          if (tx.Destination !== merchantAddress) continue;
          const hash = (entry as { hash?: string }).hash ?? (tx.hash as string | undefined);
          if (hash && entry.validated !== false) return hash;
        }
        if (charge.expiresAt * 1000 < Date.now()) throw new Error("charge expired before payment");
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
    // Persist the pieces of a resume handle as they appear, so a crash between
    // fee payment and proof retrieval never pays the attestation fee twice.
    const detail = (event.detail ?? {}) as Record<string, unknown>;
    if (event.step === "prepared" && detail.abiEncodedRequest) {
      this.store.saveAttestation(charge.id, { abiEncodedRequest: String(detail.abiEncodedRequest) });
    }
    if (event.step === "submitting" && detail.feeWei) {
      this.store.saveAttestation(charge.id, { feePaidWei: String(detail.feeWei) });
    }
    if (event.step === "submitted") {
      this.store.saveAttestation(charge.id, {
        votingRoundId: Number(detail.votingRoundId),
        requestTxHash: String(detail.txHash ?? "0x"),
      });
    }
  }

  private transition(charge: ChargeView, state: ChargeState, detail?: string) {
    charge.state = state;
    this.step(charge, state, detail ? { detail } : {});
    this.store.addEvent(this.ownerOf(charge.id), `charge.${state}`, charge.id, detail);
  }

  private step(charge: ChargeView, step: string, extra: { etaSeconds?: number; detail?: string } = {}) {
    charge.steps.push({ step, at: Date.now(), ...extra });
    this.store.saveCharge(this.ownerOf(charge.id), charge);
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

  // ─── webhooks ─────────────────────────────────────────────────────
  async deliverWebhook(event: string, charge: ChargeView): Promise<void> {
    const accountId = this.ownerOf(charge.id);
    const webhook = await this.store.getWebhook(accountId);
    if (!webhook) return;
    const body = JSON.stringify({ event, at: new Date().toISOString(), charge });
    const signature = this.store.sign(webhook.secret, body);

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const res = await fetch(webhook.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-FlarePay-Signature": `sha256=${signature}`,
            "X-FlarePay-Event": event,
          },
          body,
          signal: AbortSignal.timeout(8000),
        });
        this.store.addWebhookDelivery(accountId, { at: Date.now(), event, chargeId: charge.id, status: res.status, attempt });
        if (res.ok) return;
      } catch {
        this.store.addWebhookDelivery(accountId, { at: Date.now(), event, chargeId: charge.id, status: "error", attempt });
      }
      await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
    }
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
