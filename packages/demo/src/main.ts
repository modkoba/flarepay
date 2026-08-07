/**
 * FlarePay demo — verify XRPL testnet payments on Flare via @flarekit/sdk.
 *
 * Two modes:
 *  - Live: real end-to-end FDC verification on Coston2 (~2-3 min, honest).
 *  - Replay: plays back a recorded live run (clearly labeled, instant-ish).
 */

import { FlareKit, FlareKitError, type PaymentResult, type ProgressEvent } from "@flarekit/sdk";
import replay from "./replay.json";

const DEMO_KEY: string | undefined = import.meta.env.VITE_DEMO_PRIVATE_KEY;

const kit = new FlareKit({
  network: "coston2",
  privateKey: DEMO_KEY,
  // Public verifier/DA endpoints have no CORS headers → proxied (vite.config.ts).
  overrides: { verifierUrl: "/verifier-api", daLayerUrl: "/da-api" },
});

// ─── DOM ────────────────────────────────────────────────────────────
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const txInput = $<HTMLInputElement>("#txInput");
const findBtn = $<HTMLButtonElement>("#findBtn");
const verifyBtn = $<HTMLButtonElement>("#verifyBtn");
const replayBtn = $<HTMLButtonElement>("#replayBtn");
const progressCard = $("#progressCard");
const progressTitle = $("#progressTitle");
const clock = $("#clock");
const roundNote = $("#roundNote");
const resultCard = $("#resultCard");
const verdict = $("#verdict");
const facts = $("#facts");
const proofJson = $("#proofJson");

if (!DEMO_KEY) {
  verifyBtn.disabled = true;
  $("#walletNote").textContent =
    "Live mode needs a funded Coston2 key: set VITE_DEMO_PRIVATE_KEY in packages/demo/.env.local " +
    "(faucet.flare.network). Replay works without one.";
} else {
  $("#walletNote").textContent = "Live mode spends ~0.06 C2FLR per verification (testnet).";
}

// ─── FTSO price strip (read-only, no wallet) ────────────────────────
(async () => {
  try {
    const feeds = await kit.ftso.readMany(["FLR/USD", "XRP/USD", "BTC/USD"]);
    for (const feed of feeds) {
      const chip = document.querySelector(`[data-feed="${feed.symbol}"] b`);
      if (chip) chip.textContent = feed.price.toLocaleString("en-US", { maximumSignificantDigits: 6 });
    }
  } catch {
    /* price strip is decorative — degrade silently */
  }
})();

// ─── Progress rendering ─────────────────────────────────────────────
type UiStep = "prepare" | "submit" | "round" | "proof" | "verify";
const STEP_MAP: Record<string, UiStep> = {
  preparing: "prepare", prepared: "prepare",
  submitting: "submit", submitted: "submit",
  "waiting-round": "round", "round-finalized": "round",
  "fetching-proof": "proof", "proof-received": "proof",
  verifying: "verify", done: "verify",
};
const DONE_EVENTS = new Set(["prepared", "submitted", "round-finalized", "proof-received", "done"]);

let clockTimer: number | undefined;

function resetProgress(title: string) {
  progressCard.classList.remove("hidden");
  resultCard.classList.add("hidden");
  roundNote.classList.add("hidden");
  progressTitle.textContent = title;
  for (const li of document.querySelectorAll<HTMLElement>(".steps li")) {
    li.className = "";
    li.querySelector("em")!.textContent = "";
  }
  const startedAt = Date.now();
  clearInterval(clockTimer);
  clockTimer = window.setInterval(() => {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    clock.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  }, 250);
  progressCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderEvent(event: ProgressEvent) {
  const ui = STEP_MAP[event.step];
  if (!ui) return;
  const li = document.querySelector<HTMLElement>(`li[data-step="${ui}"]`)!;
  const seconds = `${Math.round(event.elapsedMs / 1000)}s`;

  if (DONE_EVENTS.has(event.step)) {
    li.className = "done";
    li.querySelector("em")!.textContent = seconds;
    // mark every earlier step done too (guards missed events)
    let prev = li.previousElementSibling as HTMLElement | null;
    while (prev && prev.className !== "done") { prev.className = "done"; prev = prev.previousElementSibling as HTMLElement | null; }
  } else {
    li.className = "active";
    li.querySelector("em")!.textContent =
      event.step === "waiting-round" && event.etaSeconds ? `~${event.etaSeconds}s left` : seconds;
  }

  if (event.step === "waiting-round") {
    roundNote.classList.remove("hidden");
    roundNote.textContent =
      `Voting round ${(event.detail as { votingRoundId?: number })?.votingRoundId ?? "…"} is finalizing — ` +
      `this is real protocol time, not a spinner. ETA ~${event.etaSeconds ?? "?"}s.`;
  }
  if (event.step === "round-finalized") roundNote.classList.add("hidden");
}

function renderResult(result: PaymentResult, totalSeconds: number, mode: "live" | "replay") {
  clearInterval(clockTimer);
  resultCard.classList.remove("hidden");
  verdict.className = `verdict ${result.verified ? "ok" : "bad"}`;
  verdict.textContent = result.verified
    ? `✓ Payment verified on Flare${mode === "replay" ? " (recorded run)" : ""}`
    : "✗ Verification failed";

  const xrp = Number(BigInt(result.response.receivedAmount)) / 1e6;
  const explorer = `${kit.network.explorerUrl}/tx/${result.requestTxHash}`;
  facts.innerHTML = "";
  const rows: [string, string][] = [
    ["Amount received", `${xrp} XRP`],
    ["Payment status", String(result.response.status) === "0" ? "0 — success" : String(result.response.status)],
    ["XRPL block", `${result.response.blockNumber}`],
    ["Voting round", `${result.votingRoundId}`],
    ["Attestation fee", `${result.feePaidWei} wei`],
    ["Total time", `${totalSeconds.toFixed(1)}s${mode === "replay" ? " (recorded live run)" : ""}`],
  ];
  for (const [k, v] of rows) {
    facts.insertAdjacentHTML("beforeend", `<dt>${k}</dt><dd>${v}</dd>`);
  }
  facts.insertAdjacentHTML(
    "beforeend",
    `<dt>Request tx</dt><dd><a href="${explorer}" target="_blank" rel="noopener">${short(result.requestTxHash)} ↗</a></dd>`
  );
  proofJson.textContent = JSON.stringify(result.proof, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
  resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function renderError(err: unknown) {
  clearInterval(clockTimer);
  resultCard.classList.remove("hidden");
  verdict.className = "verdict bad";
  facts.innerHTML = "";
  proofJson.textContent = "";
  if (err instanceof FlareKitError) {
    verdict.textContent = `✗ ${err.code}`;
    facts.insertAdjacentHTML("beforeend", `<dt>What happened</dt><dd>${err.message}</dd>`);
    facts.insertAdjacentHTML("beforeend", `<dt>How to fix</dt><dd>${err.fix}</dd>`);
    facts.insertAdjacentHTML("beforeend", `<dt>Retryable</dt><dd>${err.retryable}</dd>`);
  } else {
    verdict.textContent = "✗ Unexpected error";
    facts.insertAdjacentHTML("beforeend", `<dt>Detail</dt><dd>${String(err)}</dd>`);
  }
}

const short = (hash: string) => `${hash.slice(0, 10)}…${hash.slice(-8)}`;

// ─── Find a recent native-XRP payment on XRPL testnet ───────────────
async function findRecentPayment(): Promise<string> {
  const rpc = async (method: string, params: object) => {
    const res = await fetch("/xrpl-api/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ method, params: [params] }),
    });
    return res.json();
  };
  const info = await rpc("ledger", { ledger_index: "validated" });
  const tip = Number(info.result.ledger.ledger_index);
  for (let li = tip - 12; li < tip - 4; li++) {
    const ledger = await rpc("ledger", { ledger_index: li, transactions: true, expand: true });
    for (const tx of ledger.result.ledger.transactions ?? []) {
      const t = tx.tx_json ?? tx;
      const delivered = t.DeliverMax ?? t.Amount;
      if (t.TransactionType === "Payment" && typeof delivered === "string" && (tx.hash ?? t.hash)) {
        return tx.hash ?? t.hash;
      }
    }
  }
  throw new Error("No recent native-XRP payment found; paste a hash manually.");
}

// ─── Actions ────────────────────────────────────────────────────────
findBtn.addEventListener("click", async () => {
  findBtn.disabled = true;
  findBtn.textContent = "Searching…";
  try {
    txInput.value = await findRecentPayment();
  } catch (err) {
    txInput.placeholder = String(err);
  } finally {
    findBtn.disabled = false;
    findBtn.textContent = "Find recent";
  }
});

verifyBtn.addEventListener("click", async () => {
  const txId = txInput.value.trim();
  if (!/^(0x)?[0-9a-fA-F]{64}$/.test(txId)) {
    txInput.focus();
    txInput.setCustomValidity("Need a 64-hex-char XRPL tx hash");
    txInput.reportValidity();
    return;
  }
  verifyBtn.disabled = true;
  replayBtn.disabled = true;
  resetProgress("Verifying live on Coston2…");
  const startedAt = Date.now();
  try {
    const result = await kit.fdc.verifyPayment({ chain: "XRP", txId }, { onProgress: renderEvent });
    renderResult(result, (Date.now() - startedAt) / 1000, "live");
  } catch (err) {
    renderError(err);
  } finally {
    verifyBtn.disabled = !DEMO_KEY;
    replayBtn.disabled = false;
  }
});

replayBtn.addEventListener("click", async () => {
  replayBtn.disabled = true;
  verifyBtn.disabled = true;
  resetProgress("Replaying a recorded live run (12× speed)…");
  txInput.value = replay.payment.hash;

  // Reconstruct the event stream from the recorded per-step timings.
  const order = ["preparing", "prepared", "submitting", "submitted", "waiting-round", "round-finalized", "fetching-proof", "proof-received", "verifying", "done"] as const;
  const timings = replay.result.timings as Record<string, number>;
  let elapsed = 0;
  for (const step of order) {
    const recordedMs = timings[step] ?? 0;
    await sleep(Math.min(Math.max(recordedMs / 12, 120), 2500));
    elapsed += recordedMs;
    renderEvent({
      step,
      elapsedMs: elapsed,
      etaSeconds: step === "waiting-round" ? Math.round((timings["round-finalized"] ?? 0) / 1000) : undefined,
      detail: { votingRoundId: replay.result.votingRoundId },
    });
  }
  renderResult(replay.result as unknown as PaymentResult, replay.totalSeconds, "replay");
  replayBtn.disabled = false;
  verifyBtn.disabled = !DEMO_KEY;
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
