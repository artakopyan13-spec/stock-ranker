import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { anthropic, logUsage, usageFromMessage } from "@/lib/ai/client";
import { gateFreshAnalysis, type DenyReason } from "@/lib/quota/gate";
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

/**
 * The AI half of the Macro tab: the upcoming high-impact calendar (FOMC/CPI/jobs) and the last
 * few days of market-moving statements from major figures — sourced and dated, never invented.
 * Cached for a few hours; a fresh pull is a gated paid action that degrades to the cached copy.
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
  const logged = await logUsage("macro", e.NEWS_SEARCH_MODEL, usageFromMessage(resp.usage), { userId: opts.userId ?? null, webSearches: searches });

  if (resp.stop_reason === "refusal" || !resp.parsed_output) {
    return existing ? { data: JSON.parse(existing.payload), cached: true } : { data: null, cached: false };
  }
  const data = resp.parsed_output;
  await db().macroBrief.create({ data: { kind: "brief", payload: JSON.stringify(data), model: e.NEWS_SEARCH_MODEL, usdCost: logged.usd } });
  return { data, cached: false };
}
