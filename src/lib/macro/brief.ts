import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { anthropic, logUsage, usageFromMessage } from "@/lib/ai/client";
import { gateFreshAnalysis, type DenyReason } from "@/lib/quota/gate";
import { effectiveLimits } from "@/lib/quota/settings";
import { spendToday } from "@/lib/quota/spend";
import { MacroBriefOutput } from "@/lib/macro/schema";
import { CANDIDATE_ROWS, metaOf, pickBest, type ReportMeta } from "@/lib/reports/freshness";

/** A briefing older than this is labelled stale in the UI (the worker refreshes every 3h). */
export const MACRO_STALE_MS = 6 * 3_600_000;
export const MACRO_PROMPT_VERSION = 1;

export interface MacroBriefResult {
  data: MacroBriefOutput | null;
  cached: boolean;
  meta?: ReportMeta;
  notice?: { reason: DenyReason; message: string };
}

/** Best briefing: a recent web-verified one beats a newer knowledge-only seed (see lib/reports/freshness). */
async function best() {
  const rows = await db().macroBrief.findMany({ where: { kind: "brief" }, orderBy: { createdAt: "desc" }, take: CANDIDATE_ROWS });
  return pickBest(rows, MACRO_PROMPT_VERSION, MACRO_STALE_MS);
}

/** The briefing to show + how/when it was built. Null when none exists or it won't parse. */
export async function getMacroBriefWithMeta(): Promise<{ data: MacroBriefOutput; meta: ReportMeta } | null> {
  const row = await best();
  if (!row) return null;
  try {
    return { data: MacroBriefOutput.parse(JSON.parse(row.payload)), meta: metaOf(row, MACRO_PROMPT_VERSION, MACRO_STALE_MS) };
  } catch {
    return null;
  }
}

/** The AI call + store. No gating — callers (user path / cron) decide policy. Returns null on refusal. */
async function generateBrief(userId: string | null, web = false): Promise<MacroBriefOutput | null> {
  const e = env();
  const today = new Date().toISOString().slice(0, 10);
  const prompt = web
    ? `Today is ${today}. Build a market macro briefing by searching the web. Two parts:

1) UPCOMING CALENDAR — the high-impact scheduled US macro events in roughly the next 2 weeks: FOMC meetings/rate decisions, CPI and PCE inflation releases, the monthly jobs report (nonfarm payrolls), GDP, and any Fed chair testimony. For each: the exact date (YYYY-MM-DD), the event name, importance ("high" or "medium"), and one line on why it matters or what's expected.

2) MARKET-MOVING HEADLINES — the most market-moving statements and news from roughly the last 3 days from major figures: the US President, the Fed chair, and mega-cap CEOs, plus any tariff/policy/geopolitical items that moved markets. Examples of what qualifies: a president praising or attacking a specific company, tariff announcements, rate-path hints, a major CEO's guidance. For each: the date, who said/did it, a short factual headline, the likely market impact in one line, any specific tickers affected, and the source.

Also give a 2-3 sentence summary of the current macro backdrop (rates, inflation trend, risk appetite).

Hard rules: only REAL, sourced, dated items — never invent a quote, a number, or an event. If you can't confirm something, leave it out. Be factual and balanced; this is research, not advice, and contains no buy/sell calls.`
    : `Today is ${today}. Build a market macro briefing from your own knowledge (do NOT browse the web).

1) UPCOMING CALENDAR — list the regularly-SCHEDULED high-impact US macro events you are confident fall in roughly the next 2 weeks after today: FOMC decisions, CPI/PCE inflation releases, the monthly jobs report, GDP. For each: your best date (YYYY-MM-DD), the event name, importance ("high"/"medium"), and one line on why it matters. If you are not confident of exact dates, return fewer items rather than guessing.

2) MARKET-MOVING HEADLINES — you cannot know the last few days' news without the web, so return an EMPTY headlines list here.

Also give a 2-3 sentence summary of the general macro backdrop in plain terms, clearly as background (not breaking news).

Hard rules: NEVER invent a quote, a specific number, or a dated event. Prefer leaving items out over guessing. This is research, not advice — no buy/sell calls. (Live headlines are refreshed separately.)`;

  const resp = await anthropic().messages.parse({
    model: e.NEWS_SEARCH_MODEL,
    max_tokens: 6000,
    output_config: { effort: "low", format: zodOutputFormat(MacroBriefOutput) },
    ...(web ? { tools: [{ type: "web_search_20260209" as const, name: "web_search", max_uses: 5 }] } : {}),
    messages: [{ role: "user", content: prompt }],
  }, web ? {} : { timeout: 48_000, maxRetries: 0 }); // on-demand runs inside a 60s function

  const searches = resp.content.filter((b): b is Anthropic.ServerToolUseBlock => b.type === "server_tool_use").length;
  await logUsage("macro", e.NEWS_SEARCH_MODEL, usageFromMessage(resp.usage), { userId, webSearches: searches });

  if (resp.stop_reason === "refusal" || !resp.parsed_output) return null;
  const data = resp.parsed_output;
  await db().macroBrief.create({ data: { kind: "brief", payload: JSON.stringify(data), model: e.NEWS_SEARCH_MODEL, usdCost: 0, mode: web ? "web" : "knowledge", promptVersion: MACRO_PROMPT_VERSION } });
  return data;
}

/**
 * User-facing macro briefing: cached for a few hours; a fresh pull is a gated paid action that
 * degrades to the cached copy. Calendar + last-few-days market-movers, sourced and dated.
 */
export async function getOrCreateMacroBrief(opts: { userId?: string | null; ip?: string; force?: boolean } = {}): Promise<MacroBriefResult> {
  const e = env();
  // On Vercel we can't run the live web briefing inside the 60s cap, so once a brief exists we always
  // serve it — the live, source-dated version is refreshed out-of-band by the scheduled worker. We
  // only ever generate here to SEED an empty cache (knowledge-only: scheduled events, no live news).
  const existing = await getMacroBriefWithMeta();
  if (existing) return { ...existing, cached: true };

  if (!e.ANTHROPIC_API_KEY && !e.DEMO_MODE) return { data: null, cached: false };

  const gate = await gateFreshAnalysis({ userId: opts.userId ?? null, ip: opts.ip ?? "0.0.0.0" });
  if (!gate.allow) return { data: null, cached: false, notice: { reason: gate.reason, message: gate.message } };

  const data = await generateBrief(opts.userId ?? null, false);
  return data ? { data, cached: false } : { data: null, cached: false };
}

/**
 * System refresh for the scheduled cron: no per-user quota, but still respects the global kill
 * switch and daily spend ceiling so an automated job can never blow the budget.
 */
export async function refreshMacroBriefSystem(web = false): Promise<{ refreshed: boolean; reason?: string }> {
  const e = env();
  if (!e.ANTHROPIC_API_KEY || e.DEMO_MODE) return { refreshed: false, reason: "no_key" };
  const limits = await effectiveLimits();
  if (limits.killSwitchManual) return { refreshed: false, reason: "kill_switch" };
  if ((await spendToday()) >= limits.spendCeilingUsd) return { refreshed: false, reason: "spend_ceiling" };
  const data = await generateBrief(null, web);
  return { refreshed: Boolean(data) };
}
