/**
 * FlarePay landing page.
 *
 * Three things here are live rather than marketing copy: the pricing
 * calculator quotes the real FTSOv2 rate, the coin grid renders from the
 * server's capability probes, and the counters show genuinely settled
 * payments. All degrade quietly if the API is unreachable.
 *
 * The agent terminal replays a real x402 handshake — the round and tx hash
 * in it are from an actual settlement, not invented.
 */

const API = import.meta.env.VITE_PAY_API ?? "/pay-api";
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Older checkout links (/?charge=N) still work — send them to the real page.
const legacyCharge = new URLSearchParams(location.search).get("charge");
if (legacyCharge) location.replace(`/pay.html?charge=${legacyCharge}`);

// ─── 3D hero: lazy-loaded so three.js never blocks the page ─────────
void (async () => {
  try {
    const { mountHero, startLiveSync } = await import("./hero.js");
    const handles = mountHero($<HTMLCanvasElement>("#heroCanvas"), $("#liveStatus"));
    startLiveSync(handles, $("#liveStatus"), $("#liveRate"));
  } catch (err) {
    console.warn("hero disabled:", err);
    $("#liveStatus").textContent = "";
  }
})();

// ─── scroll reveals ─────────────────────────────────────────────────
if (!reduced) {
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add("in");
        observer.unobserve(entry.target); // one-shot: motion shouldn't nag
      }
    },
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
  );
  for (const el of document.querySelectorAll(".reveal")) observer.observe(el);
} else {
  for (const el of document.querySelectorAll(".reveal")) el.classList.add("in");
}

// ─── counters: animate once, when seen ──────────────────────────────
function countUp(el: HTMLElement, to: number, decimals: number, suffix: string) {
  if (reduced) {
    el.textContent = to.toFixed(decimals) + suffix;
    return;
  }
  const start = performance.now();
  const duration = 900;
  const tick = (now: number) => {
    const p = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = (to * eased).toFixed(decimals) + suffix;
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function watchCounter(el: HTMLElement, value: number) {
  const decimals = Number(el.dataset.decimals ?? 0);
  const suffix = el.dataset.suffix ?? "";
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries[0].isIntersecting) return;
      countUp(el, value, decimals, suffix);
      observer.disconnect();
    },
    { threshold: 0.6 }
  );
  observer.observe(el);
}

// ─── the x402 handshake, replayed ───────────────────────────────────
// Round and tx hash below are from the live settlement in commit a511c28.
const SCRIPT: { text: string; cls?: string; pause?: number }[] = [
  { text: "$ curl https://flarepay.app/api/report", cls: "t-cmd" },
  { text: "", pause: 120 },
  { text: "HTTP/1.1 402 Payment Required", cls: "t-402" },
  { text: '{ "scheme": "xrpl-payment",', cls: "t-dim" },
  { text: '  "usd": 25.00, "xrp": "24.01",', cls: "t-dim" },
  { text: '  "payTo": "rELmQ3…Hok4GrW", "tag": 1042 }', cls: "t-dim", pause: 420 },
  { text: "", pause: 120 },
  { text: "$ agent pays 24.01 XRP  tag 1042", cls: "t-cmd" },
  { text: "  no EVM wallet · no gas · native XRP", cls: "t-dim" },
  { text: "  tesSUCCESS  A9094B09…97E6D0CFE", cls: "t-ok", pause: 420 },
  { text: "", pause: 120 },
  { text: "… Flare Data Connector proving payment", cls: "t-dim" },
  { text: "  round 1,421,448 finalized", cls: "t-dim", pause: 420 },
  { text: "", pause: 120 },
  { text: '$ curl -H "X-Payment: 1042" …/api/report', cls: "t-cmd" },
  { text: "HTTP/1.1 200 OK", cls: "t-ok" },
  { text: '"XRP Market Intelligence — August 2026"', cls: "t-dim" },
];

let playing = false;

async function playTerminal() {
  const body = $("#termBody");
  if (playing || !body) return;
  playing = true;
  body.textContent = "";

  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  for (const line of SCRIPT) {
    const el = document.createElement("div");
    if (line.cls) el.className = line.cls;
    body.appendChild(el);

    if (reduced) {
      el.textContent = line.text;
      continue;
    }
    for (const char of line.text) {
      el.textContent += char;
      await sleep(9);
    }
    await sleep(line.pause ?? 160);
  }

  body.appendChild(Object.assign(document.createElement("span"), { className: "t-caret" }));
  playing = false;
}

const term = $("#termBody");
if (term) {
  const observer = new IntersectionObserver(
    (entries) => {
      if (!entries[0].isIntersecting) return;
      void playTerminal();
      observer.disconnect();
    },
    { threshold: 0.4 }
  );
  observer.observe(term);
  $("#replayBtn")?.addEventListener("click", () => void playTerminal());
}

// ─── live pricing calculator ────────────────────────────────────────
let rate = 0;

function renderCalc() {
  const usd = Math.max(0, Number(($("#calcUsd") as HTMLInputElement).value) || 0);
  const xrp = rate > 0 ? usd / rate : 0;
  const xrpText = xrp ? xrp.toFixed(xrp < 100 ? 4 : 2) : "—";

  $("#calcXrp").textContent = xrpText;
  $("#calcRate").textContent = rate ? `$${rate.toFixed(4)} / XRP · FTSOv2` : "—";
  // Below ~$0.35 the fixed 30¢ leg alone exceeds the charge — that's the point.
  const cardFee = usd * 0.029 + 0.3;
  $("#calcCard").textContent =
    cardFee >= usd ? `−$${cardFee.toFixed(2)} — more than the charge` : `−$${cardFee.toFixed(2)} at 2.9% + 30¢`;

  $("#mockUsd").textContent = `$${usd.toFixed(2)}`;
  $("#mockXrp").textContent = xrpText;
}

for (const button of document.querySelectorAll<HTMLButtonElement>(".amount-presets button")) {
  button.addEventListener("click", () => {
    ($("#calcUsd") as HTMLInputElement).value = button.dataset.amount!;
    renderCalc();
  });
}
$("#calcUsd").addEventListener("input", renderCalc);

void (async () => {
  try {
    const res = await fetch(`${API}/api/rate`);
    const data = (await res.json()) as { price: number };
    rate = data.price;
  } catch {
    rate = 0;
  }
  renderCalc();
})();

/** A static but plausible QR block — decoration, not a scannable code. */
(() => {
  const cells: string[] = [];
  let seed = 1421448;
  const rand = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let y = 0; y < 21; y++) {
    for (let x = 0; x < 21; x++) {
      const finder = (x < 7 && y < 7) || (x > 13 && y < 7) || (x < 7 && y > 13);
      const on = finder ? x === 0 || x === 6 || y === 0 || y === 6 || (x > 1 && x < 5 && y > 1 && y < 5) : rand() > 0.55;
      if (on) cells.push(`<rect x="${x}" y="${y}" width="1" height="1"/>`);
    }
  }
  const host = document.querySelector("#mockQr");
  if (host) host.innerHTML = cells.join("");
})();

// ─── live counters ──────────────────────────────────────────────────
void (async () => {
  try {
    const res = await fetch(`${API}/api/public-stats`);
    const stats = (await res.json()) as { settledCount: number; settledXrp: string };
    watchCounter($("#statSettled"), stats.settledCount);
    $("#statSettledLabel").textContent = stats.settledCount === 1 ? "payment settled" : "payments settled";
    watchCounter($("#statXrp"), Number(stats.settledXrp) / 1000);
    watchCounter($("#statFinality"), 160); // measured end-to-end, BENCHMARK.md
  } catch {
    $("#statSettled").textContent = "—";
  }
})();

// ─── coin grid, straight from live capability probes ────────────────
void (async () => {
  const grid = $("#coinGrid");
  try {
    const res = await fetch(`${API}/api/assets`);
    const { assets } = (await res.json()) as {
      assets: { code: string; name: string; network: string; routing: string; available: boolean; reason?: string }[];
    };
    grid.innerHTML = assets
      .map(
        (a) => `
        <article class="coin ${a.available ? "coin-live" : "coin-soon"}">
          <div class="coin-head">
            <span class="coin-code">${a.code}</span>
            <span class="coin-state">${a.available ? "live" : "soon"}</span>
          </div>
          ${a.name !== a.code ? `<span class="coin-name">${a.name}</span>` : ""}
          <span class="coin-net">${a.network}</span>
          <span class="coin-note">${
            a.available
              ? `settles by ${a.routing === "destination-tag" ? "destination tag" : "deposit address"}`
              : (a.reason ?? "")
          }</span>
        </article>`
      )
      .join("");
  } catch {
    grid.innerHTML = "";
  }
})();
