/**
 * Kelvin API — an example merchant built on FlarePay.
 *
 * The point of this page is the timing: buying credits waits for a real FDC
 * round (~160s, shown honestly), and every call afterwards returns instantly
 * because settlement already happened. Nothing here reaches into FlarePay's
 * internals — it uses the same public API any integrator would.
 */

const API = import.meta.env.VITE_PAY_API ?? "/pay-api";
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

interface Pack {
  id: string;
  label: string;
  usdCents: number;
  credits: number;
}

let apiKey = localStorage.getItem("kelvin.key") ?? "";
let packs: Pack[] = [];
let poller: number | undefined;

const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;

// ─── packs ──────────────────────────────────────────────────────────
void (async () => {
  try {
    const res = await fetch(`${API}/api/kelvin/packs`);
    packs = ((await res.json()) as { packs: Pack[] }).packs;
    renderPacks();
  } catch {
    $("#packs").textContent = "pricing unavailable";
  }
})();

function renderPacks() {
  $("#packs").innerHTML = packs
    .map(
      (p) => `
      <button class="pack" data-pack="${p.id}" ${apiKey ? "" : "disabled"}>
        <span class="pack-label">${p.label}</span>
        <span class="pack-credits">${p.credits.toLocaleString()} calls</span>
        <span class="pack-price">${money(p.usdCents)}</span>
      </button>`
    )
    .join("");

  for (const button of document.querySelectorAll<HTMLButtonElement>(".pack")) {
    button.addEventListener("click", () => void topUp(button.dataset.pack!));
  }
}

// ─── account ────────────────────────────────────────────────────────
$("#createKey").addEventListener("click", async () => {
  const res = await fetch(`${API}/api/kelvin/account`, { method: "POST" });
  const data = (await res.json()) as { key: string };
  apiKey = data.key;
  localStorage.setItem("kelvin.key", apiKey);
  showKey();
  renderPacks();
  void refresh();
});

function showKey() {
  $("#keyOut").textContent = apiKey ? `${apiKey} — stored locally` : "no key yet";
  $("#createKey").textContent = apiKey ? "New key" : "Create an API key";
}

// ─── top up: this is where the one FDC round is spent ───────────────
async function topUp(packId: string) {
  const pack = packs.find((p) => p.id === packId)!;
  $("#topupNote").textContent = `opening a ${money(pack.usdCents)} charge…`;

  const res = await fetch(`${API}/api/kelvin/topup`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: apiKey, pack: packId }),
  });
  if (!res.ok) {
    const err = (await res.json()) as { error?: string };
    $("#topupNote").textContent = err.error ?? "top-up failed";
    return;
  }

  const { charge } = (await res.json()) as { charge: { id: string; xrpAmount: string } };
  $("#topupNote").innerHTML =
    `charge <b>${charge.id}</b> · ${charge.xrpAmount} XRP — ` +
    `<a href="/pay.html?charge=${charge.id}" target="_blank" rel="noopener">pay it →</a>` +
    ` <span class="hint">credits land when the FDC round finalizes</span>`;
  void refresh();
}

// ─── balance ────────────────────────────────────────────────────────
async function refresh() {
  if (!apiKey) return;
  try {
    const res = await fetch(`${API}/api/kelvin/balance?key=${encodeURIComponent(apiKey)}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      credits: number;
      calls: number;
      pending: { chargeId: string; credits: number; state: string }[];
    };

    $("#creditValue").textContent = data.credits.toLocaleString();
    const waiting = data.pending.filter((p) => p.state !== "paid");
    $("#creditSub").textContent = waiting.length
      ? `${waiting[0].credits} credits pending — charge ${waiting[0].chargeId} is ${waiting[0].state.replace(/_/g, " ")}`
      : data.credits > 0
        ? `${data.calls} call${data.calls === 1 ? "" : "s"} made`
        : "buy a pack to begin";

    $<HTMLButtonElement>("#callBtn").disabled = data.credits < 1;
  } catch {
    /* leave the last known values on screen */
  }
}

// ─── the product itself — instant, no proof in this path ────────────
$("#callBtn").addEventListener("click", async () => {
  const started = performance.now();
  const res = await fetch(`${API}/api/kelvin/call`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key: apiKey }),
  });
  const data = (await res.json()) as { forecast?: string; remaining?: number; error?: string };
  const ms = Math.round(performance.now() - started);

  $("#callOut").textContent = res.ok
    ? `200 OK  (${ms}ms)\n\n${data.forecast}\n\ncredits remaining: ${data.remaining}`
    : `402 Payment Required\n\n${data.error}`;
  void refresh();
});

showKey();
void refresh();
poller = window.setInterval(refresh, 3000);
window.addEventListener("beforeunload", () => clearInterval(poller));
