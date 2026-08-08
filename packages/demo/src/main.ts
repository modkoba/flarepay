/**
 * FlarePay checkout — buy a digital good with native XRP, settled on Flare.
 *
 * The browser talks only to the FlarePay server; all chain work (FTSO pricing,
 * FDC attestation, escrow settlement) happens there via @flarekit/sdk.
 */

const API = import.meta.env.VITE_PAY_API ?? "/pay-api";

// ─── 3D hero: lazy-loaded so three.js never blocks the checkout, and
// fails soft (no WebGL → static background + copy) ──────────────────
void (async () => {
  try {
    const { mountHero, startLiveSync } = await import("./hero.js");
    const handles = mountHero(
      document.querySelector("#heroCanvas") as HTMLCanvasElement,
      document.querySelector("#liveStatus") as HTMLElement
    );
    startLiveSync(
      handles,
      document.querySelector("#liveStatus") as HTMLElement,
      document.querySelector("#liveRate") as HTMLElement
    );
  } catch (err) {
    console.warn("hero disabled:", err);
    (document.querySelector("#liveStatus") as HTMLElement).textContent = "";
  }
})();

interface ChargeView {
  id: string;
  state: "awaiting_payment" | "payment_seen" | "attesting" | "settling" | "paid" | "failed";
  usdCents: number;
  xrpAmount: string;
  drops: string;
  rate: string;
  destinationTag: number;
  merchantAddress: string;
  metadata: string;
  createdTx: string;
  xrplTxHash?: string;
  votingRound?: number;
  settleTx?: string;
  error?: string;
  steps: { step: string; at: number; etaSeconds?: number; detail?: string }[];
}

const EXPLORER = "https://coston2.flarescan.com";
const XRPL_EXPLORER = "https://testnet.xrpl.org";

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const buyBtn = $<HTMLButtonElement>("#buyBtn");
const demoPayBtn = $<HTMLButtonElement>("#demoPayBtn");
const storeCard = $("#storeCard");
const checkoutCard = $("#checkoutCard");
const receiptCard = $("#receiptCard");
const clock = $("#clock");
const roundNote = $("#roundNote");

let charge: ChargeView | null = null;
let clockTimer: number | undefined;
let pollTimer: number | undefined;

// ─── Boot: server check, and restore a shared receipt if linked ─────
(async () => {
  try {
    const res = await fetch(`${API}/api/health`);
    if (!res.ok) throw new Error("server down");
    $("#priceHint").innerHTML = `payable in XRP <em>at the live FTSOv2 rate</em>`;
  } catch {
    $("#storeHint").textContent = "FlarePay server is offline — start it with `pnpm --filter @flarekit/pay-server start`.";
    buyBtn.disabled = true;
    return;
  }

  // Receipts are permanent facts on-chain, so ?charge=N restores one —
  // shareable, refresh-proof, and independent of this browser's session.
  const linked = new URLSearchParams(location.search).get("charge");
  if (!linked) return;
  const res = await fetch(`${API}/api/charges/${linked}`);
  if (!res.ok) return;
  charge = (await res.json()) as ChargeView;
  renderCheckout(charge);
  renderProgress(charge);
  if (charge.state === "paid") renderReceipt(charge);
  else {
    startClock();
    startPolling();
  }
})();

// ─── Buy ────────────────────────────────────────────────────────────
buyBtn.addEventListener("click", async () => {
  buyBtn.disabled = true;
  buyBtn.textContent = "Opening charge on Flare…";
  try {
    const res = await fetch(`${API}/api/charges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usdCents: 200, metadata: "XRP Market Intelligence — August 2026" }),
    });
    const body = (await res.json()) as ChargeView & { error?: string };
    if (!res.ok || !body.id) throw new Error(body.error ?? `server returned ${res.status}`);
    charge = body;
    history.replaceState(null, "", `?charge=${charge.id}`); // shareable receipt link
    renderCheckout(charge);
    startClock();
    startPolling();
  } catch (err) {
    $("#storeHint").textContent = `Could not open a charge: ${String(err)}`;
    buyBtn.disabled = false;
    buyBtn.textContent = "Buy with XRP";
  }
});

demoPayBtn.addEventListener("click", async () => {
  if (!charge) return;
  demoPayBtn.disabled = true;
  demoPayBtn.textContent = "Sending XRP from the demo wallet…";
  try {
    await fetch(`${API}/api/charges/${charge.id}/demo-pay`, { method: "POST" });
    demoPayBtn.textContent = "Payment sent on XRPL ✓";
  } catch (err) {
    demoPayBtn.textContent = `Payment failed: ${String(err)}`;
    demoPayBtn.disabled = false;
  }
});

// ─── Rendering ──────────────────────────────────────────────────────
function renderCheckout(c: ChargeView) {
  storeCard.classList.add("hidden");
  checkoutCard.classList.remove("hidden");

  $("#payAmount").textContent = c.xrpAmount;
  $("#payTo").textContent = c.merchantAddress;
  $("#payTag").textContent = String(c.destinationTag);
  $("#payDrops").textContent = `${c.xrpAmount} XRP (${c.drops} drops)`;
  $("#payRate").textContent = `$${c.rate} / XRP · FTSOv2`;
  $("#payCharge").innerHTML = `#${c.id} · <a href="${EXPLORER}/tx/${c.createdTx}" target="_blank" rel="noopener">on Flare ↗</a>`;

  const uri = `${c.merchantAddress}?amount=${c.xrpAmount}&dt=${c.destinationTag}`;
  $<HTMLImageElement>("#qrImage").src =
    `https://api.qrserver.com/v1/create-qr-code/?size=190x190&margin=6&data=${encodeURIComponent(uri)}`;
}

const STEP_UI: Record<string, "paid_xrpl" | "attest" | "settle"> = {
  charge_created: "paid_xrpl",
  payment_seen: "paid_xrpl",
  preparing: "attest",
  "waiting-index": "attest",
  prepared: "attest",
  submitting: "attest",
  submitted: "attest",
  "waiting-round": "attest",
  "round-finalized": "attest",
  "fetching-proof": "attest",
  "proof-received": "attest",
  verifying: "attest",
  done: "attest",
  settling: "settle",
  paid: "settle",
};

function renderProgress(c: ChargeView) {
  const done = new Set<string>();
  if (c.xrplTxHash) done.add("paid_xrpl");
  if (c.steps.some((s) => s.step === "done")) done.add("attest");
  if (c.state === "paid") done.add("settle");

  const last = c.steps[c.steps.length - 1];
  const active = last ? STEP_UI[last.step] : undefined;

  for (const li of document.querySelectorAll<HTMLElement>(".steps li")) {
    const key = li.dataset.step!;
    li.className = done.has(key) ? "done" : key === active ? "active" : "";
    const label = li.querySelector("em")!;
    if (key === "paid_xrpl" && c.xrplTxHash) {
      label.innerHTML = `<a href="${XRPL_EXPLORER}/transactions/${c.xrplTxHash}" target="_blank" rel="noopener">XRPL ↗</a>`;
    } else if (key === "attest" && c.votingRound) {
      label.textContent = `round ${c.votingRound}`;
    } else if (key === "settle" && c.settleTx) {
      label.innerHTML = `<a href="${EXPLORER}/tx/${c.settleTx}" target="_blank" rel="noopener">Flare ↗</a>`;
    }
  }

  const waiting = [...c.steps].reverse().find((s) => s.step === "waiting-round" || s.step === "waiting-index");
  if (waiting && c.state !== "paid" && active === "attest") {
    roundNote.classList.remove("hidden");
    roundNote.textContent =
      waiting.step === "waiting-index"
        ? `Waiting for the FDC verifier to index the XRPL payment… (~${waiting.etaSeconds ?? "?"}s budget)`
        : `FDC voting round finalizing — real protocol time, not a spinner. ETA ~${waiting.etaSeconds ?? "?"}s.`;
  } else {
    roundNote.classList.add("hidden");
  }
}

function renderReceipt(c: ChargeView) {
  stopTimers();
  receiptCard.classList.remove("hidden");
  $("#unlocked").innerHTML = `
    <div class="unlocked-title">📊 ${c.metadata}</div>
    <p>Unlocked. Settled cross-chain: a native XRP payment, proven on Flare.</p>`;

  const rows: [string, string][] = [
    ["Paid", `$${(c.usdCents / 100).toFixed(2)} = ${c.xrpAmount} XRP @ $${c.rate}`],
    ["Destination tag", String(c.destinationTag)],
    ["Voting round", String(c.votingRound ?? "—")],
  ];
  const facts = $("#receiptFacts");
  facts.innerHTML = "";
  for (const [k, v] of rows) facts.insertAdjacentHTML("beforeend", `<dt>${k}</dt><dd>${v}</dd>`);
  if (c.xrplTxHash) {
    facts.insertAdjacentHTML(
      "beforeend",
      `<dt>XRPL payment</dt><dd><a href="${XRPL_EXPLORER}/transactions/${c.xrplTxHash}" target="_blank" rel="noopener">${short(c.xrplTxHash)} ↗</a></dd>`
    );
  }
  if (c.settleTx) {
    facts.insertAdjacentHTML(
      "beforeend",
      `<dt>Flare settlement</dt><dd><a href="${EXPLORER}/tx/${c.settleTx}" target="_blank" rel="noopener">${short(c.settleTx)} ↗</a></dd>`
    );
  }
  receiptCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

// ─── Polling & timers ───────────────────────────────────────────────
function startPolling() {
  pollTimer = window.setInterval(async () => {
    if (!charge) return;
    try {
      const res = await fetch(`${API}/api/charges/${charge.id}`);
      charge = (await res.json()) as ChargeView;
      renderProgress(charge);
      if (charge.state === "paid") renderReceipt(charge);
      if (charge.state === "failed") {
        stopTimers();
        roundNote.classList.remove("hidden");
        roundNote.textContent = `Settlement failed: ${charge.error ?? "unknown error"}`;
      }
    } catch {
      /* transient — keep polling */
    }
  }, 2500);
}

function startClock() {
  const startedAt = Date.now();
  clockTimer = window.setInterval(() => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 250);
}

function stopTimers() {
  clearInterval(clockTimer);
  clearInterval(pollTimer);
}

const short = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-8)}`;
