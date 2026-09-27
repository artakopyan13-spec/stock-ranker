import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { anthropic, logUsage, usageFromMessage } from "@/lib/ai/client";
import { gateFreshAnalysis, type DenyReason } from "@/lib/quota/gate";
import { effectiveLimits } from "@/lib/quota/settings";
import { spendToday } from "@/lib/quota/spend";
import { MacroBriefOutput } from "@/lib/macro/schema";

const TTL_MS = 4 * 3_600_000; // refresh the calendar + news every few hours

export interface MacroBriefResult {
  data: MacroBriefOutput | null;
  cached: boolean;
  notice?: { reason: DenyReason; message: string };
}

async function latest() {
  return db().macroBrief.findFirst({ where: { kind: "brief" }, orderBy: { createdAt: "desc" } });
}

/** The AI call + store. No gating — callers (user path / cron) decide policy. Returns null on refusal. */
async function generateBrief(userId: string | null): Promise<MacroBriefOutput | null> {
  const e = env();
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Today is ${today}. Build a market macro briefing by searching the web. Two parts:

1) UPCOMING CALENDAR — the high-impact scheduled US macro events in roughly the next 2 weeks: FOMC meetings/rate decisions, CPI and PCE inflation releases, the monthly jobs report (nonfarm payrolls), GDP, and any Fed chair testimony. For each: the exact date (YYYY-MM-DD), the event name, importance ("high" or "medium"), and one line on why it matters or what's expected.

2) MARKET-MOVING HEADLINES — the most market-moving statements and news from roughly the last 3 days from major figures: the US President, the Fed chair, and mega-cap CEOs, plus any tariff/policy/geopolitical items that moved markets. Examples of what qualifies: a president praising or attacking a specific company, tariff announcements, rate-path hints, a major CEO's guidance. For each: the date, who said/did it, a short factual headline, the likely market impact in one line, any specific tickers affected, and the source.

Also give a 2-3 sentence summary of the current macro backdrop (rates, inflation trend, risk appetite).

Hard rules: only REAL, sourced, dated items — never invent a quote, a number, or an event. If you can't confirm something, leave it out. Be factual and balanced; this is research, not advice, and contains no buy/sell calls.`;

  const resp = await anthropic().messages.parse({
    model: e.NEWS_SEARCH_MODEL,
    max_tokens: 6000,
    output_config: { effort: "low", format: zodOutputFormat(MacroBriefOutput) },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
    messages: [{ role: "user", content: prompt }],
  });

  const searches = resp.content.filter((b): b is Anthropic.ServerToolUseBlock => b.type === "server_tool_use").length;
  await logUsage("macro", e.NEWS_SEARCH_MODEL, usageFromMessage(resp.usage), { userId, webSearches: searches });

  if (resp.stop_reason === "refusal" || !resp.parsed_output) return null;
  const data = resp.parsed_output;
  await db().macroBrief.create({ data: { kind: "brief", payload: JSON.stringify(data), model: e.NEWS_SEARCH_MODEL, usdCost: 0 } });
  return data;
}

/**
 * User-facing macro briefing: cached for a few hours; a fresh pull is a gated paid action that
 * degrades to the cached copy. Calendar + last-few-days market-movers, sourced and dated.
 */
export async function getOrCreateMacroBrief(opts: { userId?: string | null; ip?: string; force?: boolean } = {}): Promise<MacroBriefResult> {
  const e = env();
  const existing = await latest();
  const fresh = existing ? Date.now() - existing.createdAt.getTime() < TTL_MS : false;
  if (existing && fresh && !opts.force) return { data: JSON.parse(existing.payload), cached: true };

  if (!e.ANTHROPIC_API_KEY && !e.DEMO_MODE) {
    return existing ? { data: JSON.parse(existing.payload), cached: true } : { data: null, cached: false };
  }

  const gate = await gateFreshAnalysis({ userId: opts.userId ?? null, ip: opts.ip ?? "0.0.0.0" });
  if (!gate.allow) {
    if (existing) return { data: JSON.parse(existing.payload), cached: true, notice: { reason: gate.reason, message: gate.message } };
    return { data: null, cached: false, notice: { reason: gate.reason, message: gate.message } };
  }

  const data = await generateBrief(opts.userId ?? null);
  if (!data) return existing ? { data: JSON.parse(existing.payload), cached: true } : { data: null, cached: false };
  return { data, cached: false };
}

/**
 * System refresh for the scheduled cron: no per-user quota, but still respects the global kill
 * switch and daily spend ceiling so an automated job can never blow the budget.
 */
export async function refreshMacroBriefSystem(): Promise<{ refreshed: boolean; reason?: string }> {
  const e = env();
  if (!e.ANTHROPIC_API_KEY || e.DEMO_MODE) return { refreshed: false, reason: "no_key" };
  const limits = await effectiveLimits();
  if (limits.killSwitchManual) return { refreshed: false, reason: "kill_switch" };
  if ((await spendToday()) >= limits.spendCeilingUsd) return { refreshed: false, reason: "spend_ceiling" };
  const data = await generateBrief(null);
  return { refreshed: Boolean(data) };
}
