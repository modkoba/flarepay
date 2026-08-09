/**
 * FlarePay merchant dashboard — live view over the admin API.
 *
 * Auth: Bearer API key (printed by the server on boot), kept in localStorage.
 * Everything auto-refreshes every 3s; the chart is a single-series magnitude
 * bar chart (settled USD per charge, chronological) with a hover tooltip and
 * a selective direct label on the latest bar. The table below is the
 * accessible/table view of the same data.
 */

import { supabase, accessToken } from "./supabase.js";

const API = import.meta.env.VITE_PAY_API ?? "/pay-api";
const PLATFORM = supabase !== null;
const EXPLORER = "https://coston2.flarescan.com";
const XRPL_EXPLORER = "https://testnet.xrpl.org";

interface Charge {
  id: string;
  state: string;
  usdCents: number;
  xrpAmount: string;
  metadata: string;
  destinationTag: number;
  votingRound?: number;
  xrplTxHash?: string;
  settleTx?: string;
  settledAt?: number;
  createdAt: number;
  error?: string;
}

interface Overview {
  stats: {
    settledUsdCents: number;
    settledDrops: string;
    paid: number;
    pending: number;
    failed: number;
    total: number;
    avgSettleSeconds: number | null;
  };
  charges: Charge[];
  events: { at: number; type: string; chargeId?: string; detail?: string }[];
  webhook: { url: string } | null;
  merchant: string;
  escrow: string;
}

const $ = <T extends HTMLElement>(sel: string) => document.querySelector(sel) as T;

let apiKey = localStorage.getItem("flarepay.apiKey") ?? "";
let webhookLoaded = false;
let meLoaded = false;

// ─── auth ───────────────────────────────────────────────────────────
// Platform mode: Supabase session (redirect to /auth.html when absent).
// Local mode: the legacy API-key gate.
$("#keySave").addEventListener("click", async () => {
  apiKey = ($("#keyInput") as HTMLInputElement).value.trim();
  const ok = await refresh();
  if (ok) localStorage.setItem("flarepay.apiKey", apiKey);
  else $("#gateError").textContent = "That key was rejected — check the server logs for the current one.";
});

$("#signOut").addEventListener("click", async () => {
  await supabase?.auth.signOut();
  location.href = "/auth.html";
});

async function bearer(): Promise<string> {
  if (PLATFORM) {
    const token = await accessToken();
    if (!token) {
      location.href = "/auth.html";
      throw new Error("no session");
    }
    return token;
  }
  return apiKey;
}

async function admin(pathname: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${await bearer()}`, ...init.headers },
  });
}

async function loadMe(): Promise<void> {
  if (meLoaded) return;
  const res = await admin("/api/me");
  if (!res.ok) return;
  const me = (await res.json()) as {
    account: { email: string };
    payout: { value: string; validatedAt: string | null } | null;
    keys: { label: string; createdAt: string; lastUsedAt: string | null }[];
    mode: string;
  };
  meLoaded = true;
  $("#accountChip").textContent = me.account.email;
  $("#accountChip").classList.remove("hidden");
  if (me.mode === "platform") {
    $("#signOut").classList.remove("hidden");
    $("#payoutCard").classList.remove("hidden");
    $("#keysCard").classList.remove("hidden");
    if (me.payout) {
      ($("#payoutAddr") as HTMLInputElement).value = me.payout.value;
      $("#payoutInfo").textContent = me.payout.validatedAt
        ? `✓ validated by the Flare verifier`
        : "validated by Flare's FDC verifier before saving";
    }
    renderKeys(me.keys);
  }
}

function renderKeys(keys: { label: string; createdAt: string; lastUsedAt: string | null }[]) {
  $("#keyList").innerHTML = keys.length
    ? keys
        .map(
          (k) => `<li><span class="feed-type">fpk_…</span><span class="feed-detail">${k.label}</span>
                  <span class="feed-time">${k.lastUsedAt ? "used" : "unused"}</span></li>`
        )
        .join("")
    : `<li><span class="feed-detail">no keys yet — generate one for the API / x402</span></li>`;
}

/**
 * Connection status lives in the existing live-dot next to "Charges" — green
 * when polling succeeds, dim when it doesn't. No banner: the dashboard keeps
 * showing the last known data, which is more useful than an interruption.
 */
function setConnected(connected: boolean, reason = ""): void {
  const dot = $("#liveDot");
  dot.classList.toggle("stale", !connected);
  dot.title = connected ? "live — auto-refreshing" : `reconnecting… ${reason}`;
}

// ─── refresh loop ───────────────────────────────────────────────────
async function refresh(): Promise<boolean> {
  if (!PLATFORM && !apiKey) return false;
  let overview: Overview;
  try {
    const res = await admin("/api/admin/overview");
    if (res.status === 401) {
      // Expired/invalid session — not a server problem. Clear it and bounce
      // to sign-in.
      if (PLATFORM) {
        await supabase!.auth.signOut();
        location.href = "/auth.html";
      }
      return false;
    }
    if (!res.ok) {
      setConnected(false, `HTTP ${res.status}`);
      return true;
    }
    overview = (await res.json()) as Overview;
    setConnected(true);
  } catch (err) {
    // bearer() redirects and throws when there's no session at all; that's an
    // auth path, not an outage.
    if ((err as Error).message === "no session") return false;
    setConnected(false, (err as Error).message);
    return true; // keep polling quietly; last-known data stays on screen
  }

  $("#gate").classList.add("hidden");
  $("#dashMain").classList.remove("hidden");
  void loadMe();
  ($("#escrowLink") as HTMLAnchorElement).href = `${EXPLORER}/address/${overview.escrow}`;

  renderStats(overview);
  renderChart(overview.charges);
  renderTable(overview.charges);
  renderFeed(overview.events);
  if (!webhookLoaded) {
    ($("#webhookUrl") as HTMLInputElement).value = overview.webhook?.url ?? "";
    webhookLoaded = true;
  }
  return true;
}

function renderStats({ stats }: Overview) {
  $("#statRevenue").textContent = `$${(stats.settledUsdCents / 100).toFixed(2)}`;
  $("#statRevenueXrp").textContent = `${(Number(stats.settledDrops) / 1e6).toFixed(6)} XRP received on XRPL`;
  $("#statPaid").textContent = String(stats.paid);
  $("#statPending").textContent = String(stats.pending);
  $("#statFailed").textContent = String(stats.failed);
  $("#statAvg").textContent = stats.avgSettleSeconds ? `${Math.floor(stats.avgSettleSeconds / 60)}m ${stats.avgSettleSeconds % 60}s` : "—";
}

// ─── chart: settled USD per charge (single hue, thin bars) ──────────
function renderChart(charges: Charge[]) {
  const paid = charges.filter((c) => c.state === "paid").sort((a, b) => (a.settledAt ?? 0) - (b.settledAt ?? 0));
  const host = $("#chart");
  if (paid.length === 0) {
    host.innerHTML = "";
    $("#chartEmpty").textContent = "settled charges will chart here";
    return;
  }
  $("#chartEmpty").textContent = "";

  const W = 640;
  const H = 180;
  const pad = { top: 18, right: 8, bottom: 24, left: 8 };
  const plotW = W - pad.left - pad.right;
  const plotH = H - pad.top - pad.bottom;
  const max = Math.max(...paid.map((c) => c.usdCents)) / 100;
  const slot = plotW / paid.length;
  const barW = Math.min(42, Math.max(10, slot - 2)); // 2px surface gap between bars

  const bars = paid
    .map((c, i) => {
      const value = c.usdCents / 100;
      const h = Math.max(3, (value / max) * plotH);
      const x = pad.left + i * slot + (slot - barW) / 2;
      const y = pad.top + plotH - h;
      const latest = i === paid.length - 1;
      return `
        <g data-tip="#${c.id} · $${value.toFixed(2)} · ${escapeHtml(c.metadata).slice(0, 32)}">
          <rect x="${x}" y="${y}" width="${barW}" height="${h}" rx="4" fill="var(--accent)"
                shape-rendering="geometricPrecision"/>
          <rect x="${x}" y="${y + Math.min(4, h)}" width="${barW}" height="${Math.max(0, h - Math.min(4, h))}" fill="var(--accent)"/>
          ${latest ? `<text x="${x + barW / 2}" y="${y - 6}" text-anchor="middle" class="bar-label">$${value.toFixed(2)}</text>` : ""}
          <text x="${x + barW / 2}" y="${H - 8}" text-anchor="middle" class="axis-label">#${c.id}</text>
          <rect x="${pad.left + i * slot}" y="${pad.top}" width="${slot}" height="${plotH}" fill="transparent" class="hit"/>
        </g>`;
    })
    .join("");

  host.innerHTML = `
    <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Settled charges in USD, one bar per charge; the table below lists the same data">
      <style>
        .bar-label { fill: var(--text); font: 600 11px ${getComputedStyle(document.body).getPropertyValue("--mono")}; }
        .axis-label { fill: var(--muted); font: 10px ${getComputedStyle(document.body).getPropertyValue("--mono")}; }
      </style>
      <line x1="${pad.left}" y1="${pad.top + plotH}" x2="${W - pad.right}" y2="${pad.top + plotH}"
            stroke="var(--line)" stroke-width="1"/>
      ${bars}
    </svg>`;

  // hover tooltip (per-mark)
  let tip = document.querySelector(".chart-tip") as HTMLElement | null;
  host.querySelectorAll<SVGGElement>("g[data-tip]").forEach((g) => {
    g.addEventListener("pointerenter", () => {
      tip ??= document.body.appendChild(Object.assign(document.createElement("div"), { className: "chart-tip" }));
      tip.textContent = g.dataset.tip!;
      tip.style.display = "block";
    });
    g.addEventListener("pointermove", (e) => {
      if (tip) {
        tip.style.left = `${e.clientX}px`;
        tip.style.top = `${e.clientY}px`;
      }
    });
    g.addEventListener("pointerleave", () => tip && (tip.style.display = "none"));
  });
}

// ─── table ──────────────────────────────────────────────────────────
const STATE_LABEL: Record<string, string> = {
  awaiting_payment: "awaiting payment",
  payment_seen: "payment seen",
  attesting: "proving on Flare",
  settling: "settling",
  paid: "paid",
  failed: "failed",
  expired: "expired",
};

function renderTable(charges: Charge[]) {
  $("#chargeRows").innerHTML = charges
    .map((c) => {
      const links = [
        `<a href="/pay.html?charge=${c.id}" target="_blank" rel="noopener" title="hosted checkout / receipt">checkout</a>`,
        c.xrplTxHash ? `<a href="${XRPL_EXPLORER}/transactions/${c.xrplTxHash}" target="_blank" rel="noopener">xrpl</a>` : "",
        c.settleTx ? `<a href="${EXPLORER}/tx/${c.settleTx}" target="_blank" rel="noopener">flare</a>` : "",
      ]
        .filter(Boolean)
        .join(" · ");
      return `<tr>
        <td class="mono">${c.id}</td>
        <td title="${escapeHtml(c.metadata)}${c.error ? ` — ${escapeHtml(c.error)}` : ""}">${escapeHtml(c.metadata).slice(0, 34)}</td>
        <td class="mono">$${(c.usdCents / 100).toFixed(2)} · ${c.xrpAmount} XRP</td>
        <td><span class="state-badge state-${c.state}">${STATE_LABEL[c.state] ?? c.state}</span></td>
        <td class="mono">${c.votingRound ?? "—"}</td>
        <td class="mono">${links}</td>
      </tr>`;
    })
    .join("");
}

function renderFeed(events: Overview["events"]) {
  $("#feed").innerHTML = events
    .map(
      (e) => `<li>
        <span class="feed-type">${e.type}${e.chargeId ? ` #${e.chargeId}` : ""}</span>
        <span class="feed-detail">${escapeHtml(e.detail ?? "")}</span>
        <span class="feed-time">${timeAgo(e.at)}</span>
      </li>`
    )
    .join("");
}

// ─── actions ────────────────────────────────────────────────────────
$("#createBtn").addEventListener("click", async () => {
  const usd = Number(($("#newUsd") as HTMLInputElement).value);
  const metadata = ($("#newDesc") as HTMLInputElement).value || "Charge";
  if (!usd || usd <= 0) return;
  const btn = $("#createBtn") as HTMLButtonElement;
  btn.disabled = true;
  btn.textContent = "Opening on Flare…";
  try {
    const res = await admin("/api/admin/charges", { method: "POST", body: JSON.stringify({ usd, metadata }) });
    const charge = (await res.json()) as Charge & { error?: string };
    if (!res.ok) throw new Error(charge.error ?? `HTTP ${res.status}`);
    $("#createdBox").classList.remove("hidden");
    ($("#createdLink") as HTMLInputElement).value = `${location.origin}/pay.html?charge=${charge.id}`;
    void refresh();
  } catch (err) {
    alert(`Charge failed: ${String(err)}`);
  } finally {
    btn.disabled = false;
    btn.textContent = "Create charge";
  }
});

$("#copyLink").addEventListener("click", () => {
  navigator.clipboard.writeText(($("#createdLink") as HTMLInputElement).value);
  $("#copyLink").textContent = "Copied ✓";
  setTimeout(() => ($("#copyLink").textContent = "Copy"), 1500);
});

$("#webhookSave").addEventListener("click", async () => {
  const url = ($("#webhookUrl") as HTMLInputElement).value.trim();
  const res = await admin("/api/admin/webhook", { method: "PUT", body: JSON.stringify({ url }) });
  const data = (await res.json()) as { webhook: { secret: string } | null };
  $("#webhookInfo").textContent = data.webhook
    ? `signed with ${data.webhook.secret.slice(0, 12)}… · X-FlarePay-Signature`
    : "webhook removed";
});

$("#webhookTest").addEventListener("click", async () => {
  const res = await admin("/api/admin/webhook-test", { method: "POST" });
  const data = (await res.json()) as { delivered?: boolean; log?: { status: number | string }[]; error?: string };
  $("#webhookInfo").textContent = data.delivered
    ? `test sent — last status: ${data.log?.[0]?.status ?? "?"}`
    : (data.error ?? "test failed");
});

$("#payoutSave").addEventListener("click", async () => {
  const address = ($("#payoutAddr") as HTMLInputElement).value.trim();
  $("#payoutInfo").textContent = "asking the Flare verifier…";
  const res = await admin("/api/me/payout", { method: "PUT", body: JSON.stringify({ address }) });
  const data = (await res.json()) as { error?: string };
  $("#payoutInfo").textContent = res.ok ? "✓ validated by the Flare verifier" : `✗ ${data.error}`;
});

$("#keyCreate").addEventListener("click", async () => {
  const res = await admin("/api/me/apikey", { method: "POST" });
  const data = (await res.json()) as { apiKey?: string; error?: string };
  $("#keyOnce").textContent = data.apiKey ? `${data.apiKey} — shown once, copy now` : (data.error ?? "failed");
  meLoaded = false;
  void loadMe();
});

$("#keyRevoke").addEventListener("click", async () => {
  await admin("/api/me/apikey", { method: "DELETE" });
  $("#keyOnce").textContent = "all keys revoked";
  meLoaded = false;
  void loadMe();
});

// ─── utils ──────────────────────────────────────────────────────────
function timeAgo(at: number): string {
  const s = Math.round((Date.now() - at) / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h`;
}

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);
}

// boot
void (async () => {
  if (PLATFORM) {
    const token = await accessToken();
    if (!token) {
      location.href = "/auth.html";
      return;
    }
    // Show the dashboard shell immediately. A signed-in merchant should never
    // face a blank page just because the first poll hasn't landed (or failed).
    $("#gate").classList.add("hidden");
    $("#dashMain").classList.remove("hidden");
    await refresh();
  } else if (apiKey) {
    await refresh();
  }
  setInterval(() => void refresh(), 3000);
})();
