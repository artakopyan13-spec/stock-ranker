import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { anthropic, logUsage, usageFromMessage } from "@/lib/ai/client";
import { gateFreshAnalysis, type DenyReason } from "@/lib/quota/gate";
import { effectiveLimits } from "@/lib/quota/settings";
import { spendToday, SYSTEM_SPEND_SHARE } from "@/lib/quota/spend";
import { allWatchedSymbols } from "@/lib/watchlists";
import { FreshAnalysisDeniedError } from "@/lib/analysis/service";
import { DeepAnalysisOutput } from "@/lib/deep/schema";
import { CANDIDATE_ROWS, isCurrent, metaOf, pickBest, type ReportMeta } from "@/lib/reports/freshness";
import { classifyAiError } from "@/lib/ai/errors";

const TTL_MS = 7 * 24 * 3_600_000; // deep analysis is stable for about a week
/** Bump when the prompt/schema changes materially; older rows then read as outdated. v2 = filled ~approximate figures (v1 left them blank). */
export const DEEP_PROMPT_VERSION = 2;

/** Pull a JSON object out of a model's final text (strips fences / surrounding prose). */
function extractJson(text: string): unknown {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

export interface DeepResult {
  data: DeepAnalysisOutput;
  cached: boolean;
  meta: ReportMeta;
  notice?: { reason: DenyReason | "refresh_failed" | "already_verified"; message: string };
}

/** Best cached row for a symbol: a current web-verified one first (see lib/reports/freshness). */
async function best(symbol: string) {
  const rows = await db().deepAnalysis.findMany({ where: { symbol }, orderBy: { createdAt: "desc" }, take: CANDIDATE_ROWS });
  return pickBest(rows, DEEP_PROMPT_VERSION, TTL_MS);
}

const served = (row: { payload: string; createdAt: Date; mode: string; promptVersion: number }) => ({
  data: DeepAnalysisOutput.parse(JSON.parse(row.payload)),
  meta: metaOf(row, DEEP_PROMPT_VERSION, TTL_MS),
});

async function generate(symbol: string, userId: string | null, web = false): Promise<DeepAnalysisOutput | null> {
  const e = env();
  const today = new Date().toISOString().slice(0, 10);
  const sourcing = web
    ? `Research it on the web first — prioritize SEC filings (10-K/10-Q), the company's investor-relations materials, earnings releases and call transcripts, then reputable financial press. Use real, current figures and cite the sources you used.`
    : `Use your own knowledge (do NOT browse the web).`;
  const prompt = `Today is ${today}. Produce a DEEP INVESTMENT ANALYSIS of the stock ${symbol}. ${sourcing} Score everything /10.

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

Also return a short headline read and up to 3 reference points a reader could verify against (e.g. the latest 10-K/10-Q, the investor-relations page) — title, a real url if you are confident of it (else "—"), and the period (title, url, date).

Hard rules: ${web
    ? `Use real, web-sourced figures and cite them. If you can't confirm one, use "—".`
    : `This runs from your training knowledge, which may be months out of date. Still FILL the numeric columns (growth metric values, valuation multiples/market cap, KPI "previous" figures, scores) with your best APPROXIMATE figure — prefix it with "~" (e.g. "~$17B", "~24x", "~44%") — rather than leaving them blank. Only use "—" when you genuinely have no basis for an estimate. Treat these as approximate, possibly-stale estimates, never as exact current facts.`} Clearly distinguish reported facts from estimates and your own judgement. Plain English; explain jargon briefly. This is research, NOT financial advice — no "buy/sell" instruction and no single price target stated as fact (ranges, labelled as estimates, only).

Keep it tight so the JSON fits: every string ≤ ~35 words. Array limits — bottlenecks 3-5, catalysts 3-5, risks 3-5, growth.metrics ≤6, valuation.multiples ≤6, valuation.peers ≤4, earningsWatchlist.kpis exactly 5, moat.advantages ≤5, sources ≤6.

When you have finished researching, return ONLY one minified JSON object — no prose, no markdown fences — with EXACTLY this shape. Fill EVERY field; scores are numbers 0-10; use "—" for any unknown string:
{"asOf":"${today}","company":"","headline":"","moat":{"score":0,"strength":"weak|moderate|strong|exceptional","direction":"strengthening|stable|weakening","advantages":[""],"summary":""},"bottlenecks":[{"rank":1,"title":"","severity":0,"detail":"","solution":{"summary":"","detail":"","timeline":""}}],"growth":{"score":0,"summary":"","metrics":[{"label":"","value":"","yoy":"","forward":""}]},"valuation":{"score":0,"summary":"","multiples":[{"label":"","value":"","vsHistory":"","vsPeers":""}],"peers":[{"ticker":"","note":""}],"greatCompanyVsStock":""},"catalysts":[{"title":"","window":"","detail":""}],"risks":[{"title":"","detail":""}],"scenarios":{"bull":{"operational":"","priceRange":"","note":""},"base":{"operational":"","priceRange":"","note":""},"bear":{"operational":"","priceRange":"","note":""}},"earningsWatchlist":{"nextDate":"","kpis":[{"name":"","previous":"","expectation":"","bullish":"","neutral":"","bearish":""}]},"scorecard":{"moat":0,"growth":0,"financialStrength":0,"management":0,"valuation":0,"catalysts":0,"risk":0,"overall":0},"thesis":{"whyOwn":"","whyAvoid":"","whatChanges":"","attractivePrice":""},"sources":[{"title":"","url":"","date":""}]}`;

  // web=false (on-demand on Vercel): NO web search — the agentic search loop runs 2-5 min and
  // ignores max_uses, which the Hobby 60s function cap can't survive. Knowledge-only finishes ~20-30s.
  // web=true (off-Vercel worker, no time cap): full web-verified research.
  // Lenient JSON (no strict output grammar) so this large schema doesn't blow the grammar-size limit.
  const resp = await anthropic().messages.create({
    model: e.NEWS_SEARCH_MODEL,
    max_tokens: web ? 20000 : 9000,
    output_config: { effort: "low" },
    ...(web ? { tools: [{ type: "web_search_20260209" as const, name: "web_search", max_uses: 6 }] } : {}),
    messages: [{ role: "user", content: prompt }],
  }, web ? {} : { timeout: 48_000, maxRetries: 0 }); // on-demand runs inside a 60s function

  // Billed searches come from the usage counter; server_tool_use blocks can include non-search tool steps.
  const searches = resp.usage.server_tool_use?.web_search_requests ?? resp.content.filter((b): b is Anthropic.ServerToolUseBlock => b.type === "server_tool_use").length;
  await logUsage("deep", e.NEWS_SEARCH_MODEL, usageFromMessage(resp.usage), { symbol, userId, webSearches: searches });

  if (resp.stop_reason === "refusal") return null;
  const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  const parsed = DeepAnalysisOutput.safeParse(extractJson(text));
  if (!parsed.success || parsed.data.bottlenecks.length === 0) {
    console.error(`[deep] parse failed (stop=${resp.stop_reason}, len=${text.length}):`, parsed.success ? "empty bottlenecks" : parsed.error.message.slice(0, 400));
    return null;
  }
  const data = parsed.data;
  await db().deepAnalysis.create({ data: { symbol, payload: JSON.stringify(data), model: e.NEWS_SEARCH_MODEL, usdCost: 0, mode: web ? "web" : "knowledge", promptVersion: DEEP_PROMPT_VERSION } });
  return data;
}

/** Cached, gated deep analysis for a ticker. Cached a week; a fresh run is a gated paid action. */
export async function getOrCreateDeep(symbolInput: string, opts: { userId?: string | null; ip?: string; force?: boolean } = {}): Promise<DeepResult> {
  const symbol = symbolInput.toUpperCase();
  const e = env();

  const existing = await best(symbol);
  const current = existing ? isCurrent(existing, DEEP_PROMPT_VERSION, TTL_MS) : false;
  if (existing && current && !opts.force) return { ...served(existing), cached: true };
  // Never let an on-demand (knowledge-only) rebuild replace a current web-verified report.
  if (existing && current && existing.mode === "web") {
    return { ...served(existing), cached: true, notice: { reason: "already_verified", message: "This report was verified against live sources recently, so it wasn't rebuilt." } };
  }

  if (!e.ANTHROPIC_API_KEY && !e.DEMO_MODE) {
    if (existing) return { ...served(existing), cached: true };
    throw new FreshAnalysisDeniedError("no_key", "Deep analysis is temporarily unavailable.");
  }

  const gate = await gateFreshAnalysis({ userId: opts.userId ?? null, ip: opts.ip ?? "0.0.0.0" });
  if (!gate.allow) {
    if (existing) return { ...served(existing), cached: true, notice: { reason: gate.reason, message: gate.message } };
    throw new FreshAnalysisDeniedError(gate.reason, gate.message);
  }

  let data: DeepAnalysisOutput | null = null;
  let failure: string | null = null;
  try {
    data = await generate(symbol, opts.userId ?? null);
  } catch (err) {
    failure = classifyAiError(err)?.message ?? "The rebuild failed.";
    console.error(`[deep] generate failed for ${symbol}:`, err instanceof Error ? err.message : err);
  }
  if (!data) {
    // Degrade to the report we already have — with a notice, so it doesn't look like nothing happened.
    if (existing) {
      const built = existing.createdAt.toISOString().slice(0, 10);
      return { ...served(existing), cached: true, notice: { reason: "refresh_failed", message: `${failure ?? "The rebuild didn't complete."} Showing the version from ${built}.` } };
    }
    if (failure) throw new FreshAnalysisDeniedError("no_key", failure);
    throw new FreshAnalysisDeniedError("no_key", "Couldn't build a deep analysis for that ticker yet.");
  }
  const row = await best(symbol);
  return { data, cached: false, meta: row ? metaOf(row, DEEP_PROMPT_VERSION, TTL_MS) : { mode: "knowledge", builtAt: new Date().toISOString(), outdated: false, expired: false } };
}

/** Best cached report + how it was sourced, for free (no generation). Null when none exists or it won't parse. */
export async function getCachedDeepWithMeta(symbolInput: string): Promise<{ data: DeepAnalysisOutput; meta: ReportMeta } | null> {
  const row = await best(symbolInput.toUpperCase());
  if (!row) return null;
  try {
    return served(row);
  } catch {
    return null; // a row from an incompatible older schema — treat as missing rather than 500
  }
}

export async function getCachedDeep(symbolInput: string): Promise<DeepAnalysisOutput | null> {
  return (await getCachedDeepWithMeta(symbolInput))?.data ?? null;
}

/** Watched symbols that have a deep analysis but no CURRENT web-verified one (knowledge-only,
 *  outdated prompt, or expired), oldest first. Keep-warm only — never generates brand-new reports,
 *  so the scheduler can't balloon cost. */
export async function staleWatchedDeepSymbols(limit = 4): Promise<string[]> {
  const watched = (await allWatchedSymbols()).map((s) => s.toUpperCase());
  if (watched.length === 0) return [];
  const rows = await db().deepAnalysis.findMany({
    where: { symbol: { in: watched } },
    orderBy: { createdAt: "desc" },
    select: { symbol: true, createdAt: true, mode: true, promptVersion: true },
  });
  const newest = new Map<string, Date>();
  const hasCurrentWeb = new Set<string>();
  for (const r of rows) {
    if (!newest.has(r.symbol)) newest.set(r.symbol, r.createdAt);
    if (r.mode === "web" && isCurrent({ ...r, payload: "" }, DEEP_PROMPT_VERSION, TTL_MS)) hasCurrentWeb.add(r.symbol);
  }
  return [...newest.entries()]
    .filter(([sym]) => !hasCurrentWeb.has(sym))
    .sort((a, b) => a[1].getTime() - b[1].getTime())
    .slice(0, limit)
    .map(([sym]) => sym);
}

/** System refresh for the scheduler — no per-user quota, but respects kill switch + spend ceiling. */
export async function refreshDeepSystem(symbol: string, web = false): Promise<{ refreshed: boolean; reason?: string }> {
  const e = env();
  if (!e.ANTHROPIC_API_KEY || e.DEMO_MODE) return { refreshed: false, reason: "no_key" };
  const limits = await effectiveLimits();
  if (limits.killSwitchManual) return { refreshed: false, reason: "kill_switch" };
  if ((await spendToday()) >= limits.spendCeilingUsd * SYSTEM_SPEND_SHARE) return { refreshed: false, reason: "spend_ceiling" };
  const data = await generate(symbol.toUpperCase(), null, web);
  return { refreshed: Boolean(data) };
}
