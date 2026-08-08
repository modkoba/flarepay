/**
 * FlarePay merchant dashboard — live view over the admin API.
 *
 * Auth: Bearer API key (printed by the server on boot), kept in localStorage.
 * Everything auto-refreshes every 3s; the chart is a single-series magnitude
 * bar chart (settled USD per charge, chronological) with a hover tooltip and
 * a selective direct label on the latest bar. The table below is the
 * accessible/table view of the same data.
 */

const API = import.meta.env.VITE_PAY_API ?? "/pay-api";
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

// ─── auth gate ──────────────────────────────────────────────────────
$("#keySave").addEventListener("click", async () => {
  apiKey = ($("#keyInput") as HTMLInputElement).value.trim();
  const ok = await refresh();
  if (ok) localStorage.setItem("flarepay.apiKey", apiKey);
  else $("#gateError").textContent = "That key was rejected — check the server logs for the current one.";
});

async function admin(pathname: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`${API}${pathname}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, ...init.headers },
  });
}

// ─── refresh loop ───────────────────────────────────────────────────
async function refresh(): Promise<boolean> {
  if (!apiKey) return false;
  let overview: Overview;
  try {
    const res = await admin("/api/admin/overview");
    if (res.status === 401) return false;
    overview = (await res.json()) as Overview;
  } catch {
    return true; // transient — keep the last render
  }

  $("#gate").classList.add("hidden");
  $("#dashMain").classList.remove("hidden");
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
        `<a href="/?charge=${c.id}" target="_blank" rel="noopener" title="hosted checkout / receipt">checkout</a>`,
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
    ($("#createdLink") as HTMLInputElement).value = `${location.origin}/?charge=${charge.id}`;
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
if (apiKey) void refresh();
setInterval(() => void refresh(), 3000);
