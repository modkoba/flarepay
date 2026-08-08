/**
 * FlarePay store — durable state on disk (JSON, atomic writes).
 *
 * A payment server that forgets its charges on restart is a demo. This store
 * persists charges (including attestation handles and proofs, so recovery can
 * resume mid-flight verifications without paying for a new attestation),
 * merchant config, the API key, and an activity feed.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { randomUUID, createHmac } from "node:crypto";

export interface AttestationHandle {
  abiEncodedRequest?: string;
  votingRoundId?: number;
  requestTxHash?: string;
  feePaidWei?: string;
}

export interface StoredEvent {
  at: number;
  type: string;
  chargeId?: string;
  detail?: string;
}

export interface WebhookConfig {
  url: string;
  secret: string;
}

export interface WebhookDelivery {
  at: number;
  event: string;
  chargeId: string;
  status: number | "error";
  attempt: number;
}

interface StoreData {
  apiKey: string;
  createdAt: string;
  webhook?: WebhookConfig;
  charges: Record<string, unknown>;
  /** Serialized proofs per charge id (bigints as strings). */
  proofs: Record<string, unknown>;
  /** Attestation handles per charge id — enables resume() after a crash. */
  attestations: Record<string, AttestationHandle>;
  events: StoredEvent[];
  webhookDeliveries: WebhookDelivery[];
}

const MAX_EVENTS = 200;

export class Store {
  private data: StoreData;
  private saveTimer?: NodeJS.Timeout;

  constructor(private readonly file: string) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file)) {
      this.data = JSON.parse(fs.readFileSync(file, "utf-8")) as StoreData;
      this.data.proofs ??= {};
      this.data.attestations ??= {};
      this.data.events ??= [];
      this.data.webhookDeliveries ??= [];
    } else {
      this.data = {
        apiKey: `fpk_${randomUUID().replaceAll("-", "")}`,
        createdAt: new Date().toISOString(),
        charges: {},
        proofs: {},
        attestations: {},
        events: [],
        webhookDeliveries: [],
      };
      this.persistNow();
    }
  }

  get apiKey(): string {
    return this.data.apiKey;
  }

  get webhook(): WebhookConfig | undefined {
    return this.data.webhook;
  }

  setWebhookUrl(url: string): WebhookConfig {
    this.data.webhook = url
      ? { url, secret: this.data.webhook?.secret ?? `whsec_${randomUUID().replaceAll("-", "")}` }
      : undefined!;
    this.persist();
    return this.data.webhook;
  }

  sign(body: string): string {
    if (!this.data.webhook) return "";
    return createHmac("sha256", this.data.webhook.secret).update(body).digest("hex");
  }

  // ─── charges / proofs / attestation handles ───────────────────────
  loadCharges<T>(): Record<string, T> {
    return this.data.charges as Record<string, T>;
  }

  saveCharge(id: string, charge: unknown): void {
    this.data.charges[id] = JSON.parse(bigintSafe(charge));
    this.persist();
  }

  saveProof(id: string, proof: unknown): void {
    this.data.proofs[id] = JSON.parse(bigintSafe(proof));
    this.persist();
  }

  loadProof(id: string): unknown {
    return this.data.proofs[id];
  }

  saveAttestation(id: string, patch: AttestationHandle): void {
    this.data.attestations[id] = { ...this.data.attestations[id], ...patch };
    this.persist();
  }

  loadAttestation(id: string): AttestationHandle | undefined {
    return this.data.attestations[id];
  }

  // ─── activity feed / webhook log ──────────────────────────────────
  addEvent(type: string, chargeId?: string, detail?: string): void {
    this.data.events.push({ at: Date.now(), type, chargeId, detail });
    if (this.data.events.length > MAX_EVENTS) this.data.events.splice(0, this.data.events.length - MAX_EVENTS);
    this.persist();
  }

  get events(): StoredEvent[] {
    return this.data.events;
  }

  addWebhookDelivery(delivery: WebhookDelivery): void {
    this.data.webhookDeliveries.push(delivery);
    if (this.data.webhookDeliveries.length > 50) this.data.webhookDeliveries.splice(0, 10);
    this.persist();
  }

  get webhookDeliveries(): WebhookDelivery[] {
    return this.data.webhookDeliveries;
  }

  // ─── persistence (atomic, debounced) ──────────────────────────────
  private persist(): void {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistNow(), 250);
  }

  persistNow(): void {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }
}

function bigintSafe(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

/**
 * Adapter: presents the single-tenant JSON Store through the multi-tenant
 * Persistence interface, so the server runs identically without Supabase keys
 * ("local mode") — every charge just belongs to the implicit "local" account.
 */
export class LocalPersistence {
  constructor(readonly store: Store) {}

  saveCharge(_accountId: string, charge: { id: string }): void {
    this.store.saveCharge(charge.id, charge);
  }
  saveProof(chargeId: string, proof: unknown): void {
    this.store.saveProof(chargeId, proof);
  }
  async loadProof(chargeId: string): Promise<unknown> {
    return this.store.loadProof(chargeId);
  }
  saveAttestation(chargeId: string, patch: AttestationHandle): void {
    this.store.saveAttestation(chargeId, patch);
  }
  async loadAttestation(chargeId: string): Promise<AttestationHandle | undefined> {
    return this.store.loadAttestation(chargeId);
  }
  addEvent(_accountId: string | null, type: string, chargeId?: string, detail?: string): void {
    this.store.addEvent(type, chargeId, detail);
  }
  async getWebhook(_accountId: string): Promise<WebhookConfig | null> {
    return this.store.webhook ?? null;
  }
  sign(_secret: string, body: string): string {
    return this.store.sign(body);
  }
  addWebhookDelivery(_accountId: string, delivery: WebhookDelivery): void {
    this.store.addWebhookDelivery(delivery);
  }
}
