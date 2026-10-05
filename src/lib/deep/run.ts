import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { anthropic, logUsage, usageFromMessage } from "@/lib/ai/client";
import { gateFreshAnalysis, type DenyReason } from "@/lib/quota/gate";
import { FreshAnalysisDeniedError } from "@/lib/analysis/service";
import { DeepAnalysisOutput } from "@/lib/deep/schema";

const TTL_MS = 7 * 24 * 3_600_000; // deep analysis is stable for about a week

export interface DeepResult {
  data: DeepAnalysisOutput;
  cached: boolean;
  notice?: { reason: DenyReason; message: string };
}

async function latest(symbol: string) {
  return db().deepAnalysis.findFirst({ where: { symbol }, orderBy: { createdAt: "desc" } });
}

async function generate(symbol: string, userId: string | null): Promise<DeepAnalysisOutput | null> {
  const e = env();
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Today is ${today}. Produce a DEEP INVESTMENT ANALYSIS of the stock ${symbol}. Research it on the web first — prioritize SEC filings, the company's investor-relations materials, earnings releases and call transcripts, then reputable financial press. Score everything /10.

Deliver, in structured form:
1. MOAT (score /10): sustainable competitive advantages — technology/IP, switching costs, network effects, scale, brand, cost advantages, customer contracts, regulatory edge, infrastructure, barriers to entry. State strength (weak/moderate/strong/exceptional) and whether it is strengthening, stable, or weakening. List the concrete advantages.
2. BOTTLENECKS: the top 3–5 constraints slowing faster growth, RANKED most→least important, each with a severity /10 — consider capacity, supply chain, power, chips/components, capital, regulation/permitting, infrastructure, labor, customer concentration, competition, tech limits.
3. SOLUTIONS: for EACH bottleneck, what management is actually doing — announced factories, capacity expansion, M&A, partnerships, contracts, infrastructure, R&D, financing — with estimated completion dates / capacity added when available (else "—").
4. GROWTH (score /10): revenue, EPS, free cash flow, margins, backlog/ARR where relevant, market growth, management guidance — with YoY and forward expectations.
5. VALUATION (attractiveness /10): market cap, forward P/E, PEG, P/S, EV/EBITDA, FCF yield where appropriate; compare to the company's own history AND its closest peers; explicitly call out "great company vs great stock at THIS price".
6. CATALYSTS: 3–5 biggest events that could push the stock higher over the next 6–24 months (earnings, product launches, capacity coming online, contracts, regulatory decisions, industry shifts), each with a rough window.
7. RISKS / BEAR CASE: what could realistically cause a 20%+ drop — misses, guidance cuts, multiple compression, competition, falling prices/margins, customer loss, regulation, dilution/debt, macro.
8. BULL / BASE / BEAR (12–24 months): for each, what must happen operationally and an estimated price RANGE. Label every projection an ESTIMATE.
9. EARNINGS WATCHLIST: the next report date (or "—") and the 5 most important KPIs to watch — each with the previous result, the market/management expectation (or "—"), and the thresholds that would read bullish / neutral / bearish. Weight forward GUIDANCE over simple EPS beats.
10. SCORECARD (/10 each): moat, growth, financialStrength, management, valuation, catalysts, risk (higher = safer), and an overall investment-attractiveness score. Plus a thesis: why own it, why avoid it, what would change the thesis, and what price would become attractive.

Also return a short headline read and a list of the key sources you used (title, url, date).

Hard rules: NEVER fabricate a financial figure — if you can't confirm one, use "—" and say so. Clearly distinguish reported facts from analyst estimates, management guidance, and your own AI estimates. Plain English; explain jargon briefly. This is research, NOT financial advice — no "buy/sell" instruction and no single price target stated as fact (ranges, labelled as estimates, only).`;

  const resp = await anthropic().messages.parse({
    model: e.NEWS_SEARCH_MODEL,
    max_tokens: 12000,
    output_config: { effort: "medium", format: zodOutputFormat(DeepAnalysisOutput) },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 7 }],
    messages: [{ role: "user", content: prompt }],
  });

  const searches = resp.content.filter((b): b is Anthropic.ServerToolUseBlock => b.type === "server_tool_use").length;
  await logUsage("deep", e.NEWS_SEARCH_MODEL, usageFromMessage(resp.usage), { symbol, userId, webSearches: searches });

  if (resp.stop_reason === "refusal" || !resp.parsed_output || resp.parsed_output.bottlenecks.length === 0) return null;
  const data = resp.parsed_output;
  await db().deepAnalysis.create({ data: { symbol, payload: JSON.stringify(data), model: e.NEWS_SEARCH_MODEL, usdCost: 0 } });
  return data;
}

/** Cached, gated deep analysis for a ticker. Cached a week; a fresh run is a gated paid action. */
export async function getOrCreateDeep(symbolInput: string, opts: { userId?: string | null; ip?: string; force?: boolean } = {}): Promise<DeepResult> {
  const symbol = symbolInput.toUpperCase();
  const e = env();

  const existing = await latest(symbol);
  const fresh = existing ? Date.now() - existing.createdAt.getTime() < TTL_MS : false;
  if (existing && fresh && !opts.force) return { data: JSON.parse(existing.payload), cached: true };

  if (!e.ANTHROPIC_API_KEY && !e.DEMO_MODE) {
    if (existing) return { data: JSON.parse(existing.payload), cached: true };
    throw new FreshAnalysisDeniedError("no_key", "Deep analysis is temporarily unavailable.");
  }

  const gate = await gateFreshAnalysis({ userId: opts.userId ?? null, ip: opts.ip ?? "0.0.0.0" });
  if (!gate.allow) {
    if (existing) return { data: JSON.parse(existing.payload), cached: true, notice: { reason: gate.reason, message: gate.message } };
    throw new FreshAnalysisDeniedError(gate.reason, gate.message);
  }

  const data = await generate(symbol, opts.userId ?? null);
  if (!data) {
    if (existing) return { data: JSON.parse(existing.payload), cached: true };
    throw new FreshAnalysisDeniedError("no_key", "Couldn't build a deep analysis for that ticker yet.");
  }
  return { data, cached: false };
}

export async function getCachedDeep(symbolInput: string): Promise<DeepAnalysisOutput | null> {
  const row = await latest(symbolInput.toUpperCase());
  return row ? (JSON.parse(row.payload) as DeepAnalysisOutput) : null;
}
