/**
 * FlarePay landing page.
 *
 * Two things here are live rather than marketing copy: the coin grid comes
 * from the server's capability probes, and the trust bar counts real settled
 * payments. Both degrade quietly if the API is unreachable.
 */

const API = import.meta.env.VITE_PAY_API ?? "/pay-api";
const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

// Older checkout links (/?charge=N) still work — send them to the real page.
const legacyCharge = new URLSearchParams(location.search).get("charge");
if (legacyCharge) location.replace(`/pay.html?charge=${legacyCharge}`);

// ─── 3D hero: lazy-loaded so three.js never blocks the page, and
// fails soft (no WebGL → static background + copy) ──────────────────
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

// ─── live trust bar ─────────────────────────────────────────────────
void (async () => {
  try {
    const res = await fetch(`${API}/api/public-stats`);
    const stats = (await res.json()) as { settledCount: number; settledXrp: string };
    $("#statSettled").textContent = String(stats.settledCount);
    $("#statXrp").textContent = (Number(stats.settledXrp) / 1000).toFixed(2);
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
    grid.innerHTML = `<p class="section-foot">Coin availability unavailable right now.</p>`;
  }
})();
