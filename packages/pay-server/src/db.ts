/**
 * FlarePay data layer — Supabase Postgres via the service-role client.
 *
 * The server is the only writer (service_role bypasses RLS), and every method
 * that touches tenant data takes or returns an accountId; route handlers scope
 * everything through it. Charges are also cached in memory because the
 * settlement engine reads them on every progress tick.
 */

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { createHash, randomUUID, createHmac, timingSafeEqual } from "node:crypto";
import type { ChargeView } from "./flarepay.js";
import type { AttestationHandle, StoredEvent, WebhookConfig, WebhookDelivery } from "./store.js";

export interface Account {
  id: string;
  email: string;
}

export interface ApiKeyRow {
  keyHash: string;
  accountId: string;
  label: string;
  revokedAt: string | null;
}

export class Db {
  readonly supabase: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.supabase = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // ─── auth ─────────────────────────────────────────────────────────
  /**
   * Resolve a Supabase access token (from the dashboard) to an account.
   * getClaims() is the current recommendation (JWKS-verified, cached for
   * asymmetric signing keys); getUser() remains as fallback for projects on
   * symmetric keys or older supabase-js behavior.
   */
  async accountFromToken(accessToken: string): Promise<Account | null> {
    try {
      const { data, error } = await this.supabase.auth.getClaims(accessToken);
      if (!error && data?.claims?.sub) {
        return { id: data.claims.sub, email: (data.claims.email as string) ?? "" };
      }
    } catch {
      /* fall through to getUser */
    }
    const { data, error } = await this.supabase.auth.getUser(accessToken);
    if (error || !data.user) return null;
    return { id: data.user.id, email: data.user.email ?? "" };
  }

  /** Resolve a programmatic fpk_ API key to an account. */
  async accountFromApiKey(apiKey: string): Promise<Account | null> {
    if (!apiKey.startsWith("fpk_")) return null;
    const hash = sha256(apiKey);
    const { data } = await this.supabase
      .from("api_keys")
      .select("account_id, revoked_at, profiles(email)")
      .eq("key_hash", hash)
      .maybeSingle();
    if (!data || data.revoked_at) return null;
    void this.supabase.from("api_keys").update({ last_used_at: new Date().toISOString() }).eq("key_hash", hash);
    const email = (data.profiles as unknown as { email: string } | null)?.email ?? "";
    return { id: data.account_id, email };
  }

  async createApiKey(accountId: string, label = "default"): Promise<string> {
    const key = `fpk_${randomUUID().replaceAll("-", "")}`;
    await this.supabase.from("api_keys").insert({ key_hash: sha256(key), account_id: accountId, label });
    return key; // shown once
  }

  async listApiKeys(accountId: string): Promise<{ label: string; createdAt: string; lastUsedAt: string | null }[]> {
    const { data } = await this.supabase
      .from("api_keys")
      .select("label, created_at, last_used_at")
      .eq("account_id", accountId)
      .is("revoked_at", null)
      .order("created_at");
    return (data ?? []).map((k) => ({ label: k.label, createdAt: k.created_at, lastUsedAt: k.last_used_at }));
  }

  async revokeApiKeys(accountId: string): Promise<void> {
    await this.supabase
      .from("api_keys")
      .update({ revoked_at: new Date().toISOString() })
      .eq("account_id", accountId)
      .is("revoked_at", null);
  }

  // ─── payout config ────────────────────────────────────────────────
  async setPayout(accountId: string, asset: string, value: string, validated: boolean): Promise<void> {
    await this.supabase.from("payout_configs").upsert({
      account_id: accountId,
      asset,
      value,
      validated_at: validated ? new Date().toISOString() : null,
    });
  }

  async getPayout(accountId: string, asset: string): Promise<{ value: string; validatedAt: string | null } | null> {
    const { data } = await this.supabase
      .from("payout_configs")
      .select("value, validated_at")
      .eq("account_id", accountId)
      .eq("asset", asset)
      .maybeSingle();
    return data ? { value: data.value, validatedAt: data.validated_at } : null;
  }

  // ─── charges (engine-facing, mirrors the old Store interface) ─────
  async loadAllCharges(): Promise<Map<string, ChargeView & { accountId: string }>> {
    const { data, error } = await this.supabase.from("charges").select("*");
    if (error) throw new Error(`charges load failed: ${error.message}`);
    const map = new Map<string, ChargeView & { accountId: string }>();
    for (const row of data ?? []) map.set(row.id, rowToCharge(row));
    return map;
  }

  saveCharge(accountId: string, charge: ChargeView): void {
    void this.supabase
      .from("charges")
      .upsert(chargeToRow(accountId, charge))
      .then(({ error }) => error && console.error("saveCharge:", error.message));
  }

  saveProof(chargeId: string, proof: unknown): void {
    void this.supabase
      .from("proofs")
      .upsert({ charge_id: chargeId, proof: JSON.parse(bigintSafe(proof)) })
      .then(({ error }) => error && console.error("saveProof:", error.message));
  }

  async loadProof(chargeId: string): Promise<unknown> {
    const { data } = await this.supabase.from("proofs").select("proof").eq("charge_id", chargeId).maybeSingle();
    return data?.proof;
  }

  saveAttestation(chargeId: string, patch: AttestationHandle): void {
    void this.supabase
      .from("attestations")
      .upsert({
        charge_id: chargeId,
        ...(patch.abiEncodedRequest && { abi_encoded_request: patch.abiEncodedRequest }),
        ...(patch.votingRoundId && { voting_round_id: patch.votingRoundId }),
        ...(patch.requestTxHash && { request_tx_hash: patch.requestTxHash }),
        ...(patch.feePaidWei && { fee_paid_wei: patch.feePaidWei }),
      })
      .then(({ error }) => error && console.error("saveAttestation:", error.message));
  }

  async loadAttestation(chargeId: string): Promise<AttestationHandle | undefined> {
    const { data } = await this.supabase.from("attestations").select("*").eq("charge_id", chargeId).maybeSingle();
    if (!data) return undefined;
    return {
      abiEncodedRequest: data.abi_encoded_request ?? undefined,
      votingRoundId: data.voting_round_id ?? undefined,
      requestTxHash: data.request_tx_hash ?? undefined,
      feePaidWei: data.fee_paid_wei ?? undefined,
    };
  }

  // ─── events & webhooks ────────────────────────────────────────────
  addEvent(accountId: string | null, type: string, chargeId?: string, detail?: string): void {
    void this.supabase
      .from("events")
      .insert({ account_id: accountId, type, charge_id: chargeId, detail, at_ms: Date.now() })
      .then(({ error }) => error && console.error("addEvent:", error.message));
  }

  async listEvents(accountId: string, limit = 40): Promise<StoredEvent[]> {
    const { data } = await this.supabase
      .from("events")
      .select("*")
      .eq("account_id", accountId)
      .order("at_ms", { ascending: false })
      .limit(limit);
    return (data ?? []).map((e) => ({ at: Number(e.at_ms), type: e.type, chargeId: e.charge_id ?? undefined, detail: e.detail ?? undefined }));
  }

  async setWebhook(accountId: string, url: string): Promise<WebhookConfig | null> {
    if (!url) {
      await this.supabase.from("webhooks").delete().eq("account_id", accountId);
      return null;
    }
    const existing = await this.getWebhook(accountId);
    const webhook = { url, secret: existing?.secret ?? `whsec_${randomUUID().replaceAll("-", "")}` };
    await this.supabase.from("webhooks").upsert({ account_id: accountId, ...webhook });
    return webhook;
  }

  async getWebhook(accountId: string): Promise<WebhookConfig | null> {
    const { data } = await this.supabase.from("webhooks").select("url, secret").eq("account_id", accountId).maybeSingle();
    return data ?? null;
  }

  sign(secret: string, body: string): string {
    return createHmac("sha256", secret).update(body).digest("hex");
  }

  addWebhookDelivery(accountId: string, delivery: WebhookDelivery): void {
    void this.supabase
      .from("webhook_deliveries")
      .insert({
        account_id: accountId,
        charge_id: delivery.chargeId,
        event: delivery.event,
        status: String(delivery.status),
        attempt: delivery.attempt,
        at_ms: delivery.at,
      })
      .then(({ error }) => error && console.error("addDelivery:", error.message));
  }

  async listWebhookDeliveries(accountId: string, limit = 10): Promise<WebhookDelivery[]> {
    const { data } = await this.supabase
      .from("webhook_deliveries")
      .select("*")
      .eq("account_id", accountId)
      .order("at_ms", { ascending: false })
      .limit(limit);
    return (data ?? []).map((d) => ({
      at: Number(d.at_ms),
      event: d.event,
      chargeId: d.charge_id ?? "",
      status: /^\d+$/.test(d.status) ? Number(d.status) : (d.status as "error"),
      attempt: d.attempt,
    }));
  }
}

// ─── helpers ──────────────────────────────────────────────────────────
export function sha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

function bigintSafe(value: unknown): string {
  return JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

function chargeToRow(accountId: string, c: ChargeView) {
  return {
    id: c.id,
    account_id: accountId,
    asset: "XRP",
    state: c.state,
    usd_cents: c.usdCents,
    xrp_amount: c.xrpAmount,
    drops: c.drops,
    rate: c.rate,
    destination_tag: c.destinationTag,
    merchant_address: c.merchantAddress,
    payment_uri: c.paymentUri,
    metadata: c.metadata,
    expires_at: c.expiresAt,
    created_at_ms: c.createdAt,
    created_tx: c.createdTx,
    xrpl_tx_hash: c.xrplTxHash ?? null,
    payer_address: c.payerAddress ?? null,
    voting_round: c.votingRound ?? null,
    settle_tx: c.settleTx ?? null,
    settled_at_ms: c.settledAt ?? null,
    error: c.error ?? null,
    steps: c.steps,
  };
}

function rowToCharge(row: Record<string, unknown>): ChargeView & { accountId: string } {
  return {
    accountId: String(row.account_id),
    id: String(row.id),
    state: row.state as ChargeView["state"],
    usdCents: Number(row.usd_cents),
    xrpAmount: String(row.xrp_amount),
    drops: String(row.drops),
    rate: String(row.rate),
    destinationTag: Number(row.destination_tag ?? 0),
    merchantAddress: String(row.merchant_address),
    paymentUri: String(row.payment_uri),
    metadata: String(row.metadata),
    expiresAt: Number(row.expires_at),
    createdAt: Number(row.created_at_ms),
    createdTx: String(row.created_tx),
    xrplTxHash: (row.xrpl_tx_hash as string) ?? undefined,
    payerAddress: (row.payer_address as string) ?? undefined,
    votingRound: row.voting_round ? Number(row.voting_round) : undefined,
    settleTx: (row.settle_tx as string) ?? undefined,
    settledAt: row.settled_at_ms ? Number(row.settled_at_ms) : undefined,
    error: (row.error as string) ?? undefined,
    steps: (row.steps as ChargeView["steps"]) ?? [],
  };
}
