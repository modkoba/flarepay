/**
 * FlarePay landing page.
 *
 * Three things here are live rather than marketing copy: the pricing
 * calculator quotes the real FTSOv2 rate, the coin grid renders from the
 * server's capability probes, and the counters show genuinely settled
 * payments. All degrade quietly if the API is unreachable.
 *
 * Motion follows the research: reveals are subtle and one-shot, never
 * calling attention to themselves, and are disabled under
 * prefers-reduced-motion.
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

// ─── live pricing calculator (the Wise pattern: try before you sign up)
let rate = 0;

function renderCalc() {
  const usd = Math.max(0, Number(($("#calcUsd") as HTMLInputElement).value) || 0);
  const xrp = rate > 0 ? usd / rate : 0;
  const xrpText = xrp ? xrp.toFixed(xrp < 100 ? 4 : 2) : "—";

  $("#calcXrp").textContent = xrpText;
  $("#calcRate").textContent = rate ? `$${rate.toFixed(4)} / XRP · FTSOv2` : "—";
  $("#calcCard").textContent = `−$${(usd * 0.029 + 0.3).toFixed(2)} at 2.9% + 30¢`;

  // the mock checkout mirrors the input, so the product is the illustration
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
  let seed = 1420734;
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

// ─── code tabs ──────────────────────────────────────────────────────
for (const tab of document.querySelectorAll<HTMLButtonElement>(".code-tab")) {
  tab.addEventListener("click", () => {
    for (const other of document.querySelectorAll(".code-tab")) other.classList.remove("is-active");
    tab.classList.add("is-active");
    for (const panel of document.querySelectorAll<HTMLElement>(".code-body")) {
      panel.classList.toggle("hidden", panel.dataset.panel !== tab.dataset.tab);
    }
  });
}
