import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { Analysis, DISCLAIMER, FCF_EMOJI } from "@/lib/analysis/schema";
import { getRankings } from "@/lib/rankings";
import { shareUrlFor } from "@/lib/share";

/**
 * The digest payload is the reusable contract: your briefing tool can pull it from
 * GET /api/digest/:watchlist?format=json and render it however it likes.
 */
export interface DigestPayload {
  date: string;
  watchlist: { slug: string; name: string };
  generatedAt: string;
  ranked: Array<{
    rank: number;
    symbol: string;
    companyName: string;
    rating: number | null;
    action: string | null;
    fcfVerdict: string | null;
    fcfMarginPct: number | null;
    revenueGrowthPct: number | null;
    primaryMultiple: string | null;
    primaryMultipleValue: number | null;
    price: number | null;
    currency: string;
    analyzedAt: string | null;
    url: string;
  }>;
  movers: Array<{ symbol: string; from: number; to: number; reason: string }>;
  newRisks: Array<{ symbol: string; risk: string }>;
  catalystsThisWeek: Array<{ symbol: string; date: string; event: string }>;
  unanalyzed: string[];
  staleTickers: string[];
  disclaimer: string;
}

function ratingReason(payload: string): string {
  try {
    return Analysis.parse(JSON.parse(payload)).rating.justification;
  } catch {
    return "";
  }
}

export async function buildDigest(slug: string, now: Date = new Date()): Promise<DigestPayload | null> {
  const rankings = await getRankings(slug);
  if (!rankings) return null;
  const base = env().APP_URL;
  const today = now.toISOString().slice(0, 10);
  const weekOut = new Date(now.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const prisma = db();

  const ranked = rankings.rows.map((r, i) => ({
    rank: i + 1,
    symbol: r.symbol,
    companyName: r.companyName,
    rating: r.rating,
    action: r.action,
    fcfVerdict: r.fcfVerdict,
    fcfMarginPct: r.fcfMarginPct,
    revenueGrowthPct: r.revenueGrowthPct,
    primaryMultiple: r.primaryMultiple,
    primaryMultipleValue: r.primaryMultipleValue,
    price: r.price,
    currency: r.currency,
    analyzedAt: r.analyzedAt,
    url: r.shareToken ? shareUrlFor(base, r.shareToken) : `${base}/t/${r.symbol}`,
  }));

  const movers: DigestPayload["movers"] = [];
  const newRisks: DigestPayload["newRisks"] = [];
  const catalystsThisWeek: DigestPayload["catalystsThisWeek"] = [];
  const weekAgo = new Date(now.getTime() - 7 * 86_400_000);

  for (const r of rankings.rows) {
    if (!r.analysisId) continue;
    const recent = await prisma.analysis.findMany({ where: { symbol: r.symbol, verified: true, createdAt: { gte: weekAgo } }, orderBy: { version: "asc" } });
    const before = await prisma.analysis.findFirst({ where: { symbol: r.symbol, verified: true, createdAt: { lt: weekAgo } }, orderBy: { version: "desc" } });
    const baseline = before ?? recent[0];
    const latest = recent[recent.length - 1];
    if (latest && baseline && latest.id !== baseline.id && latest.rating !== baseline.rating) {
      movers.push({ symbol: r.symbol, from: baseline.rating, to: latest.rating, reason: ratingReason(latest.payload) });
    }
    if (latest) {
      const a = Analysis.parse(JSON.parse(latest.payload));
      const prev = baseline && baseline.id !== latest.id ? Analysis.parse(JSON.parse(baseline.payload)) : null;
      if (a.fcf.verdict === "negative" && prev?.fcf.verdict !== "negative") newRisks.push({ symbol: r.symbol, risk: `FCF negative: ${a.fcf.verdictReason}` });
      else if (a.fcf.headlineRisk && !prev?.fcf.headlineRisk) newRisks.push({ symbol: r.symbol, risk: `FCF deteriorating: ${a.fcf.verdictReason}` });
      if (a.previousTripwire?.triggered) newRisks.push({ symbol: r.symbol, risk: `Tripwire triggered: ${a.previousTripwire.reason}` });
      for (const n of a.news.filter((x) => x.thesisImpact === "negative" && x.date >= new Date(now.getTime() - 2 * 86_400_000).toISOString().slice(0, 10))) {
        newRisks.push({ symbol: r.symbol, risk: `${n.headline} (${n.source}, ${n.date})` });
      }
      for (const c of a.catalysts) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(c.date) && c.date >= today && c.date <= weekOut) catalystsThisWeek.push({ symbol: r.symbol, date: c.date, event: c.event });
      }
    }
  }
  movers.sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
  catalystsThisWeek.sort((a, b) => a.date.localeCompare(b.date));

  return {
    date: today,
    watchlist: { slug: rankings.watchlist.slug, name: rankings.watchlist.name },
    generatedAt: now.toISOString(),
    ranked,
    movers,
    newRisks,
    catalystsThisWeek,
    unanalyzed: rankings.rows.filter((r) => !r.analysisId).map((r) => r.symbol),
    staleTickers: rankings.rows.filter((r) => r.stale).map((r) => r.symbol),
    disclaimer: DISCLAIMER,
  };
}

// ---------- renderers (the reusable template) ----------

const fmtPct = (v: number | null) => (v === null ? "unverified" : `${v.toFixed(1)}%`);
const fmtMul = (v: number | null) => (v === null ? "unverified" : `${v.toFixed(1)}x`);
const fcfIcon = (v: string | null) => (v ? (FCF_EMOJI[v as keyof typeof FCF_EMOJI] ?? "⚠️") : "—");

export function renderDigestText(d: DigestPayload): string {
  const lines: string[] = [];
  lines.push(`Morning digest — ${d.watchlist.name} — ${d.date}`);
  lines.push("");
  lines.push("Ranked (rating · action · FCF · FCF margin · rev growth · multiple):");
  for (const r of d.ranked) {
    if (r.rating === null) {
      lines.push(`${r.rank}. ${r.symbol} — not analyzed yet`);
      continue;
    }
    lines.push(
      `${r.rank}. ${r.symbol} ${r.rating}/10 ${r.action} ${fcfIcon(r.fcfVerdict)} FCF ${fmtPct(r.fcfMarginPct)} · growth ${fmtPct(r.revenueGrowthPct)} · ${r.primaryMultiple ?? "—"} ${fmtMul(r.primaryMultipleValue)}`,
    );
  }
  lines.push("");
  lines.push("Top movers (rating, last 7 days):");
  lines.push(...(d.movers.length ? d.movers.map((m) => `• ${m.symbol} ${m.from} → ${m.to}: ${m.reason}`) : ["• none"]));
  lines.push("");
  lines.push("New risks:");
  lines.push(...(d.newRisks.length ? d.newRisks.map((r) => `• ${r.symbol}: ${r.risk}`) : ["• none flagged"]));
  lines.push("");
  lines.push("Catalysts this week:");
  lines.push(...(d.catalystsThisWeek.length ? d.catalystsThisWeek.map((c) => `• ${c.date} ${c.symbol}: ${c.event}`) : ["• none dated within 7 days"]));
  if (d.staleTickers.length) {
    lines.push("");
    lines.push(`Stale (>7 days): ${d.staleTickers.join(", ")}`);
  }
  if (d.unanalyzed.length) lines.push(`Not analyzed yet: ${d.unanalyzed.join(", ")}`);
  lines.push("");
  lines.push("Links:");
  lines.push(...d.ranked.filter((r) => r.rating !== null).map((r) => `${r.symbol}: ${r.url}`));
  lines.push("");
  lines.push(`Ratings and forecasts are the model's judgment. ${d.disclaimer}`);
  return lines.join("\n");
}

export function renderDigestMarkdown(d: DigestPayload): string {
  const rows = d.ranked.map((r) =>
    r.rating === null
      ? `| ${r.rank} | ${r.symbol} | — | — | — | — | — | — |`
      : `| ${r.rank} | [${r.symbol}](${r.url}) | ${r.rating}/10 | ${r.action} | ${fcfIcon(r.fcfVerdict)} | ${fmtPct(r.fcfMarginPct)} | ${fmtPct(r.revenueGrowthPct)} | ${r.primaryMultiple} ${fmtMul(r.primaryMultipleValue)} |`,
  );
  return [
    `# Morning digest — ${d.watchlist.name} — ${d.date}`,
    "",
    "| # | Ticker | Rating | Action | FCF | FCF margin | Rev growth | Multiple |",
    "|---|---|---|---|---|---|---|---|",
    ...rows,
    "",
    "## Top movers (rating, last 7 days)",
    ...(d.movers.length ? d.movers.map((m) => `- **${m.symbol}** ${m.from} → ${m.to}: ${m.reason}`) : ["- none"]),
    "",
    "## New risks",
    ...(d.newRisks.length ? d.newRisks.map((r) => `- **${r.symbol}**: ${r.risk}`) : ["- none flagged"]),
    "",
    "## Catalysts this week",
    ...(d.catalystsThisWeek.length ? d.catalystsThisWeek.map((c) => `- ${c.date} **${c.symbol}**: ${c.event}`) : ["- none dated within 7 days"]),
    "",
    d.staleTickers.length ? `Stale (>7 days): ${d.staleTickers.join(", ")}` : "",
    d.unanalyzed.length ? `Not analyzed yet: ${d.unanalyzed.join(", ")}` : "",
    "",
    `_Ratings and forecasts are the model's judgment. ${d.disclaimer}_`,
  ]
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n");
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export function renderDigestHtml(d: DigestPayload): string {
  const row = (r: DigestPayload["ranked"][number]) =>
    r.rating === null
      ? `<tr><td>${r.rank}</td><td>${r.symbol}</td><td colspan="6" style="color:#8b949e">not analyzed yet</td></tr>`
      : `<tr><td>${r.rank}</td><td><a href="${r.url}" style="color:#8E86D8">${r.symbol}</a></td><td style="color:#C9A35C;font-weight:600">${r.rating}/10</td><td>${r.action}</td><td>${fcfIcon(r.fcfVerdict)}</td><td>${fmtPct(r.fcfMarginPct)}</td><td>${fmtPct(r.revenueGrowthPct)}</td><td>${r.primaryMultiple} ${fmtMul(r.primaryMultipleValue)}</td></tr>`;
  const list = (items: string[], empty: string) => (items.length ? `<ul>${items.map((i) => `<li>${i}</li>`).join("")}</ul>` : `<p style="color:#8b949e">${empty}</p>`);
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#0E1116;color:#e6edf3;padding:24px;max-width:720px">
<h2 style="margin:0 0 4px">Morning digest — ${esc(d.watchlist.name)}</h2>
<div style="color:#8b949e;margin-bottom:16px">${d.date} · research notebook, not financial advice</div>
<table style="border-collapse:collapse;width:100%;font-size:14px" cellpadding="6">
<thead><tr style="color:#8b949e;text-align:left"><th>#</th><th>Ticker</th><th>Rating</th><th>Action</th><th>FCF</th><th>FCF margin</th><th>Rev growth</th><th>Multiple</th></tr></thead>
<tbody>${d.ranked.map(row).join("")}</tbody></table>
<h3 style="color:#C9A35C">Top movers (rating, last 7 days)</h3>${list(d.movers.map((m) => `<b>${m.symbol}</b> ${m.from} → ${m.to}: ${esc(m.reason)}`), "none")}
<h3 style="color:#B07A6E">New risks</h3>${list(d.newRisks.map((r) => `<b>${r.symbol}</b>: ${esc(r.risk)}`), "none flagged")}
<h3 style="color:#8E86D8">Catalysts this week</h3>${list(d.catalystsThisWeek.map((c) => `${c.date} <b>${c.symbol}</b>: ${esc(c.event)}`), "none dated within 7 days")}
${d.staleTickers.length ? `<p style="color:#C9A35C">Stale (&gt;7 days): ${d.staleTickers.join(", ")}</p>` : ""}
${d.unanalyzed.length ? `<p style="color:#8b949e">Not analyzed yet: ${d.unanalyzed.join(", ")}</p>` : ""}
<p style="color:#8b949e;font-size:12px;margin-top:24px">Ratings and forecasts are the model's judgment. ${esc(d.disclaimer)}</p>
</div>`;
}
