/**
 * FlarePay hosted checkout — the page a customer is sent to.
 *
 * Driven entirely by ?charge=N, so the link is shareable, refresh-proof, and
 * independent of any session: the charge lives on-chain, and this page just
 * watches it settle. No merchant data is exposed here beyond the invoice.
 */

const API = import.meta.env.VITE_PAY_API ?? "/pay-api";
const EXPLORER = "https://coston2.flarescan.com";
const XRPL_EXPLORER = "https://testnet.xrpl.org";

interface ChargeView {
  id: string;
  state: "awaiting_payment" | "payment_seen" | "attesting" | "settling" | "paid" | "failed" | "expired";
  usdCents: number;
  xrpAmount: string;
  drops: string;
  rate: string;
  destinationTag: number;
  merchantAddress: string;
  metadata: string;
  expiresAt: number;
  createdTx: string;
  xrplTxHash?: string;
  votingRound?: number;
  settleTx?: string;
  error?: string;
  steps: { step: string; at: number; etaSeconds?: number; detail?: string }[];
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const short = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-8)}`;

let charge: ChargeView | null = null;
let clockTimer: number | undefined;
let pollTimer: number | undefined;

// ─── boot ───────────────────────────────────────────────────────────
void (async () => {
  const id = new URLSearchParams(location.search).get("charge");
  if (!id) return fail("No invoice in this link.", "A checkout link looks like /pay.html?charge=123");

  try {
    const res = await fetch(`${API}/api/charges/${id}`);
    if (res.status === 404) return fail("Invoice not found.", `Charge ${id} does not exist on this server.`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    charge = (await res.json()) as ChargeView;
  } catch {
    return fail("Checkout unavailable.", "The payment server isn't reachable right now.");
  }

  $("#loadingCard").classList.add("hidden");
  $("#payCard").classList.remove("hidden");
  renderInvoice(charge);
  void setupWallets(charge);
  renderProgress(charge);
  if (charge.state === "paid") renderReceipt(charge);
  else {
    startClock();
    startPolling();
  }
})();

function fail(title: string, detail: string) {
  const el = $("#loadingText");
  el.classList.add("error");
  el.innerHTML = `<b>${title}</b><br /><span style="color:var(--muted)">${detail}</span>`;
}

// ─── invoice ────────────────────────────────────────────────────────
function renderInvoice(c: ChargeView) {
  $("#payUsd").textContent = `$${(c.usdCents / 100).toFixed(2)}`;
  $("#payAmount").textContent = c.xrpAmount;
  $("#payDesc").textContent = c.metadata;
  $("#payRate").textContent = `1 XRP = $${c.rate} · rate locked by FTSOv2`;
  $("#payTo").textContent = c.merchantAddress;
  $("#payTag").textContent = String(c.destinationTag);
  $("#payDrops").textContent = `${c.xrpAmount} XRP`;

  const uri = `${c.merchantAddress}?amount=${c.xrpAmount}&dt=${c.destinationTag}`;
  $<HTMLImageElement>("#qrImage").src =
    `https://api.qrserver.com/v1/create-qr-code/?size=190x190&margin=6&data=${encodeURIComponent(uri)}`;

  document.title = `Pay $${(c.usdCents / 100).toFixed(2)} — FlarePay`;
}

// copy buttons
for (const button of document.querySelectorAll<HTMLButtonElement>(".copy")) {
  button.addEventListener("click", () => {
    const text = $(`#${button.dataset.copy}`).textContent ?? "";
    void navigator.clipboard.writeText(text.trim());
    const original = button.textContent;
    button.textContent = "Copied";
    setTimeout(() => (button.textContent = original), 1200);
  });
}

/**
 * Wallet payment options.
 *
 * XRPL browser extensions (GemWallet, Crossmark) can sign the payment in one
 * click, with the destination tag filled in — the field payers most often get
 * wrong when copying by hand. Xaman gets a deep link for mobile. The QR and
 * manual fields above always remain, so a missing extension is never a
 * dead end.
 */
async function setupWallets(c: ChargeView) {
  const note = $("#walletNote");
  const found: string[] = [];

  // Xaman deep link works without any extension (mobile).
  const xaman = $<HTMLAnchorElement>("#xamanLink");
  xaman.href = `https://xumm.app/detect/request:${c.merchantAddress}?amount=${c.xrpAmount}&dt=${c.destinationTag}`;

  // GemWallet — extension API is injected asynchronously, so this is awaited.
  try {
    const gem = await import("@gemwallet/api");
    const installed = await gem.isInstalled();
    if (installed.result.isInstalled) {
      found.push("GemWallet");
      const btn = $<HTMLButtonElement>("#gemPayBtn");
      btn.classList.remove("hidden");
      btn.addEventListener("click", async () => {
        btn.disabled = true;
        btn.textContent = "Confirm in GemWallet…";
        try {
          const res = await gem.sendPayment({
            amount: c.xrpAmount,
            destination: c.merchantAddress,
            destinationTag: c.destinationTag,
          });
          btn.textContent = res.result?.hash ? "Payment sent ✓" : "Rejected in wallet";
          if (!res.result?.hash) btn.disabled = false;
        } catch (err) {
          btn.textContent = `Wallet error: ${String(err)}`;
          btn.disabled = false;
        }
      });
    }
  } catch {
    /* extension absent or API unavailable — QR fallback stands */
  }

  // Crossmark injects a global; no bundled dependency needed.
  const crossmark = (window as { crossmark?: { signAndSubmit(tx: unknown): Promise<unknown> } }).crossmark;
  if (crossmark) {
    found.push("Crossmark");
    const btn = $<HTMLButtonElement>("#crossmarkPayBtn");
    btn.classList.remove("hidden");
    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.textContent = "Confirm in Crossmark…";
      try {
        await crossmark.signAndSubmit({
          TransactionType: "Payment",
          Destination: c.merchantAddress,
          Amount: c.drops,
          DestinationTag: c.destinationTag,
        });
        btn.textContent = "Payment sent ✓";
      } catch (err) {
        btn.textContent = `Wallet error: ${String(err)}`;
        btn.disabled = false;
      }
    });
  }

  note.textContent = found.length
    ? `${found.join(" and ")} detected — the destination tag is filled in for you.`
    : "No wallet extension detected. Scan the QR, use Xaman, or pay manually with the fields above.";
}

// ─── demo payment (testnet convenience for judges/reviewers) ────────
$("#demoPayBtn").addEventListener("click", async () => {
  if (!charge) return;
  const btn = $<HTMLButtonElement>("#demoPayBtn");
  btn.disabled = true;
  btn.textContent = "Sending XRP from the demo wallet…";
  try {
    const res = await fetch(`${API}/api/charges/${charge.id}/demo-pay`, { method: "POST" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    btn.textContent = "Payment sent on XRPL ✓";
  } catch (err) {
    btn.textContent = `Payment failed: ${String(err)}`;
    btn.disabled = false;
  }
});

// ─── progress ───────────────────────────────────────────────────────
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
  resuming_attestation: "attest",
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
  const note = $("#roundNote");
  if (waiting && c.state !== "paid" && active === "attest") {
    note.classList.remove("hidden");
    note.textContent =
      waiting.step === "waiting-index"
        ? `Waiting for Flare's verifier to see the XRPL payment…`
        : `FDC voting round finalizing — real protocol time, not a spinner. ETA ~${waiting.etaSeconds ?? "?"}s.`;
  } else {
    note.classList.add("hidden");
  }

  if (c.state === "awaiting_payment") {
    const left = Math.max(0, c.expiresAt * 1000 - Date.now());
    $("#expiry").textContent = left > 0 ? `expires in ${Math.floor(left / 60000)} min` : "expired";
  } else {
    $("#expiry").textContent = `invoice #${c.id}`;
  }
}

// ─── receipt ────────────────────────────────────────────────────────
function renderReceipt(c: ChargeView) {
  stopTimers();
  $("#payCard").classList.add("hidden");
  $("#receiptCard").classList.remove("hidden");
  document.title = `Paid — FlarePay`;

  $("#receiptSub").textContent = `${c.metadata} · $${(c.usdCents / 100).toFixed(2)}`;

  const facts = $("#receiptFacts");
  facts.innerHTML = "";
  const rows: [string, string][] = [
    ["Paid", `${c.xrpAmount} XRP @ $${c.rate}`],
    ["Destination tag", String(c.destinationTag)],
    ["Voting round", String(c.votingRound ?? "—")],
  ];
  for (const [k, v] of rows) facts.insertAdjacentHTML("beforeend", `<dt>${k}</dt><dd><code>${v}</code></dd>`);
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
}

// ─── polling & timers ───────────────────────────────────────────────
function startPolling() {
  pollTimer = window.setInterval(async () => {
    if (!charge) return;
    try {
      const res = await fetch(`${API}/api/charges/${charge.id}`);
      if (!res.ok) return;
      charge = (await res.json()) as ChargeView;
      renderProgress(charge);
      if (charge.state === "paid") renderReceipt(charge);
      if (charge.state === "failed") {
        stopTimers();
        const note = $("#roundNote");
        note.classList.remove("hidden");
        note.textContent = `Settlement failed: ${charge.error ?? "unknown error"}`;
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
    $("#clock").textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 250);
}

function stopTimers() {
  clearInterval(clockTimer);
  clearInterval(pollTimer);
}
