/**
 * An example merchant built ON FlarePay — deliberately not part of it.
 *
 * "Kelvin API" sells prepaid call credits. It is the honest answer to the one
 * real weakness of proof-settled payments: the ~160s FDC round happens ONCE,
 * at top-up, and every subsequent call draws down instantly against a balance
 * that was proven on-chain. Batching is what makes a 20 FLR attestation
 * rational — you amortise it over a whole credit pack rather than paying it
 * per request.
 *
 * Everything here is what a real integrator would write: create a charge, wait
 * for it to settle, grant the goods. It touches no FlarePay internals.
 */

import { randomBytes } from "node:crypto";
import type { FlarePay } from "./flarepay.js";

export interface CreditPack {
  id: string;
  label: string;
  usdCents: number;
  credits: number;
}

/** Priced so the on-chain settlement cost is a rounding error, not the product. */
export const CREDIT_PACKS: CreditPack[] = [
  { id: "starter", label: "Starter", usdCents: 200, credits: 100 },
  { id: "builder", label: "Builder", usdCents: 1000, credits: 750 },
  { id: "scale", label: "Scale", usdCents: 5000, credits: 5000 },
];

interface Account {
  key: string;
  credits: number;
  /** chargeId → credits awaiting settlement, so we never grant twice. */
  pending: Map<string, number>;
  granted: Set<string>;
  calls: number;
}

const accounts = new Map<string, Account>();

export function createAccount(): Account {
  const key = `kv_${randomBytes(12).toString("hex")}`;
  const account: Account = { key, credits: 0, pending: new Map(), granted: new Set(), calls: 0 };
  accounts.set(key, account);
  return account;
}

export function getAccount(key: string): Account | undefined {
  return accounts.get(key);
}

/**
 * Reconcile against FlarePay: any pending charge that has settled grants its
 * credits exactly once. Polling keeps the example dependency-free; a real
 * integrator would use the signed webhook instead, and both are shown.
 */
export function reconcile(account: Account, flarePay: FlarePay): void {
  for (const [chargeId, credits] of account.pending) {
    if (account.granted.has(chargeId)) continue;
    const charge = flarePay.get(chargeId);
    if (charge?.state !== "paid") continue;
    account.credits += credits;
    account.granted.add(chargeId);
    account.pending.delete(chargeId);
  }
}

export function recordPending(account: Account, chargeId: string, credits: number): void {
  account.pending.set(chargeId, credits);
}

/** The actual product: one call, one credit. Instant — no proof in this path. */
export function consume(account: Account): { ok: boolean; answer?: string; remaining: number } {
  if (account.credits < 1) return { ok: false, remaining: 0 };
  account.credits -= 1;
  account.calls += 1;
  return { ok: true, answer: forecast(account.calls), remaining: account.credits };
}

/** Deterministic sample payload so the demo reads the same on every replay. */
function forecast(seq: number): string {
  const cities = ["Reykjavík", "Lisbon", "Osaka", "Valparaíso", "Tromsø", "Hobart"];
  const city = cities[seq % cities.length];
  const temp = (6 + ((seq * 7) % 19)).toFixed(1);
  return `${city}: ${temp}°C, wind ${4 + (seq % 11)} m/s, pressure ${1004 + (seq % 17)} hPa`;
}
