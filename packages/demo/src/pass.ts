/**
 * Proof of Access — the demo that justifies the architecture.
 *
 * Every claim on this page is checked against Coston2 from the browser, using
 * a public RPC rather than our own API. If our server lied, the vault reads
 * here would contradict it.
 */

import { BrowserProvider, Contract, JsonRpcProvider, Wallet, isAddress } from "ethers";

const API = import.meta.env.VITE_PAY_API ?? "/pay-api";
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

const VAULT_ABI = ["function canRead(address) view returns (bool)", "function premiumValue() returns (uint256)"];
const PASS_ABI = ["function expiresAt(address) view returns (uint64)"];

interface Config {
  pass: string;
  vault: string;
  escrow: string;
  rpcUrl: string;
  explorer: string;
}

let config: Config;
let provider: JsonRpcProvider;
let vault: Contract;
let passContract: Contract;
let address = localStorage.getItem("flarepay.passAddress") ?? "";
let chargeId = "";
let watching: number | undefined;

// ─── boot ───────────────────────────────────────────────────────────
void (async () => {
  config = (await (await fetch(`${API}/api/pass/config`)).json()) as Config;
  provider = new JsonRpcProvider(config.rpcUrl);
  vault = new Contract(config.vault, VAULT_ABI, provider);
  passContract = new Contract(config.pass, PASS_ABI, provider);

  $("#vaultAddr").textContent = config.vault;
  $("#contractLinks").innerHTML =
    `<a href="${config.explorer}/address/${config.vault}" target="_blank" rel="noopener">vault ↗</a>`;
  $<HTMLAnchorElement>("#verifyLink").href = `${config.explorer}/address/${config.vault}#readContract`;

  if (address) {
    ($("#addrInput") as HTMLInputElement).value = address;
    onAddressChanged();
  }
})();

// ─── address ────────────────────────────────────────────────────────
$("#genAddr").addEventListener("click", () => {
  // Address only — you never sign anything, so the key is irrelevant here.
  ($("#addrInput") as HTMLInputElement).value = Wallet.createRandom().address;
  onAddressChanged();
});

$("#addrInput").addEventListener("input", onAddressChanged);

function onAddressChanged() {
  const value = ($("#addrInput") as HTMLInputElement).value.trim();
  const valid = isAddress(value);
  address = valid ? value : "";
  if (valid) localStorage.setItem("flarepay.passAddress", address);
  $<HTMLButtonElement>("#buyBtn").disabled = !valid;
  if (valid) void refreshVault();
}

// ─── the unrelated contract, read straight from chain ───────────────
async function refreshVault() {
  if (!address) return;
  try {
    const canRead = (await vault.canRead(address)) as boolean;
    const expiry = Number(await passContract.expiresAt(address));

    $("#vaultState").textContent = canRead ? "access granted" : "no access";
    $("#vaultPanel").classList.toggle("unlocked", canRead);
    $<HTMLButtonElement>("#readBtn").disabled = !canRead;
    $("#vaultOut").textContent = canRead
      ? `canRead(you) → true\n\naccess until ${new Date(expiry * 1000).toLocaleString()}`
      : `canRead(you) → false\n\npremiumValue() would revert: NoAccess`;
    if (canRead) markStep("claim", true);
    return canRead;
  } catch (err) {
    $("#vaultOut").textContent = `chain read failed: ${(err as Error).message.slice(0, 90)}`;
    return false;
  }
}

// ─── buy ────────────────────────────────────────────────────────────
$("#buyBtn").addEventListener("click", async () => {
  $<HTMLButtonElement>("#buyBtn").disabled = true;
  $("#buyNote").textContent = "opening a charge…";

  const res = await fetch(`${API}/api/pass/charge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flareAddress: address, usdCents: 100 }),
  });
  if (!res.ok) {
    $("#buyNote").textContent = ((await res.json()) as { error?: string }).error ?? "could not open a charge";
    $<HTMLButtonElement>("#buyBtn").disabled = false;
    return;
  }

  const { charge } = (await res.json()) as { charge: { id: string; xrpAmount: string; destinationTag: number } };
  chargeId = charge.id;
  markStep("charge", true);
  $("#buyNote").innerHTML =
    `charge <b>${charge.id}</b> · ${charge.xrpAmount} XRP · tag ${charge.destinationTag} — ` +
    `<a href="/pay.html?charge=${charge.id}" target="_blank" rel="noopener">pay it →</a>`;
  watching = window.setInterval(pollCharge, 3000);
});

// ─── watch the charge, then claim ───────────────────────────────────
async function pollCharge() {
  if (!chargeId) return;
  const charge = (await (await fetch(`${API}/api/charges/${chargeId}`)).json()) as {
    state: string;
    votingRound?: number;
  };

  if (charge.state === "payment_seen" || charge.state === "attesting" || charge.state === "settling") {
    markStep("paid", true);
    $("#buyNote").innerHTML = `charge <b>${chargeId}</b> — ${charge.state.replace(/_/g, " ")}…`;
  }
  if (charge.state !== "paid") return;

  clearInterval(watching);
  markStep("paid", true);
  markStep("proof", true);
  $("#buyNote").innerHTML = `settled in round <b>${charge.votingRound?.toLocaleString()}</b> — claiming…`;

  const res = await fetch(`${API}/api/pass/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chargeId, flareAddress: address }),
  });
  const data = (await res.json()) as { claimTx?: string; error?: string };
  if (!res.ok) {
    $("#buyNote").textContent = data.error ?? "claim failed";
    return;
  }
  $("#buyNote").innerHTML =
    `claimed — <a href="${config.explorer}/tx/${data.claimTx}" target="_blank" rel="noopener">${data.claimTx?.slice(0, 14)}… ↗</a>`;
  await refreshVault();
}

function markStep(step: string, done: boolean) {
  document.querySelector(`[data-step="${step}"]`)?.classList.toggle("done", done);
}

// ─── the gated call itself ──────────────────────────────────────────
$("#readBtn").addEventListener("click", async () => {
  $("#vaultOut").textContent = "calling premiumValue()…";
  try {
    // staticCall: no wallet, no gas — proves the gate opens, changes nothing.
    const value = await vault.premiumValue.staticCall({ from: address });
    $("#vaultOut").textContent = `premiumValue() → ${value.toString()}\n\ncalled as ${address.slice(0, 10)}…\nthe same contract that reverted before payment`;
  } catch (err) {
    $("#vaultOut").textContent = `reverted: ${(err as Error).message.slice(0, 120)}`;
  }
});

// Keep the vault honest even if a claim lands from elsewhere.
window.setInterval(() => void refreshVault(), 8000);
export type { BrowserProvider };
