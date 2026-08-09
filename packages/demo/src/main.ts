/**
 * FlarePay landing + demo storefront.
 *
 * Payment collection lives on its own page (/pay.html?charge=N) — this page
 * only opens a charge and hands the customer off, exactly as a real store
 * would redirect to hosted checkout.
 */

const API = import.meta.env.VITE_PAY_API ?? "/pay-api";

// ─── 3D hero: lazy-loaded so three.js never blocks the page, and
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

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;
const buyBtn = $<HTMLButtonElement>("#buyBtn");

// Older checkout links (/?charge=N) still work — send them to the real page.
const legacyCharge = new URLSearchParams(location.search).get("charge");
if (legacyCharge) location.replace(`/pay.html?charge=${legacyCharge}`);

// ─── server check ───────────────────────────────────────────────────
void (async () => {
  try {
    const res = await fetch(`${API}/api/health`);
    if (!res.ok) throw new Error("server down");
    $("#priceHint").innerHTML = `payable in XRP <em>at the live FTSOv2 rate</em>`;
  } catch {
    $("#storeHint").textContent = "Payment server offline — start it with `pnpm --filter @flarekit/pay-server start`.";
    buyBtn.disabled = true;
  }
})();

// ─── buy → open a charge → hand off to hosted checkout ──────────────
buyBtn.addEventListener("click", async () => {
  buyBtn.disabled = true;
  buyBtn.textContent = "Opening checkout…";
  try {
    const res = await fetch(`${API}/api/charges`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usdCents: 200, metadata: "XRP Market Intelligence — August 2026" }),
    });
    const charge = (await res.json()) as { id?: string; error?: string };
    if (!res.ok || !charge.id) throw new Error(charge.error ?? `server returned ${res.status}`);
    location.href = `/pay.html?charge=${charge.id}`;
  } catch (err) {
    $("#storeHint").textContent = `Could not open checkout: ${String(err)}`;
    buyBtn.disabled = false;
    buyBtn.textContent = "Buy with XRP";
  }
});
