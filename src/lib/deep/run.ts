import Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { anthropic, logUsage, usageFromMessage } from "@/lib/ai/client";
import { gateFreshAnalysis, type DenyReason } from "@/lib/quota/gate";
import { effectiveLimits } from "@/lib/quota/settings";
import { spendToday } from "@/lib/quota/spend";
import { allWatchedSymbols } from "@/lib/watchlists";
import { FreshAnalysisDeniedError } from "@/lib/analysis/service";
import { DeepAnalysisOutput } from "@/lib/deep/schema";

const TTL_MS = 7 * 24 * 3_600_000; // deep analysis is stable for about a week

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
  notice?: { reason: DenyReason; message: string };
}

async function latest(symbol: string) {
  return db().deepAnalysis.findFirst({ where: { symbol }, orderBy: { createdAt: "desc" } });
}

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

Hard rules: ${web ? "Use real, web-sourced figures and cite them." : "This runs from your training knowledge, which may be months out of date — prefer durable structural analysis (moat, bottlenecks, risks) over precise recent figures."} NEVER fabricate a figure to look current — if you can't confirm one, use "—". Clearly distinguish reported facts from estimates and your own judgement. Plain English; explain jargon briefly. This is research, NOT financial advice — no "buy/sell" instruction and no single price target stated as fact (ranges, labelled as estimates, only).

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
  });

  const searches = resp.content.filter((b): b is Anthropic.ServerToolUseBlock => b.type === "server_tool_use").length;
  await logUsage("deep", e.NEWS_SEARCH_MODEL, usageFromMessage(resp.usage), { symbol, userId, webSearches: searches });

  if (resp.stop_reason === "refusal") return null;
  const text = resp.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  const parsed = DeepAnalysisOutput.safeParse(extractJson(text));
  if (!parsed.success || parsed.data.bottlenecks.length === 0) {
    console.error(`[deep] parse failed (stop=${resp.stop_reason}, len=${text.length}):`, parsed.success ? "empty bottlenecks" : parsed.error.message.slice(0, 400));
    return null;
  }
  const data = parsed.data;
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

/** Watched symbols whose EXISTING deep analysis has gone stale, oldest first (keep-warm only —
 *  never generates brand-new reports, so the scheduler can't balloon cost). */
export async function staleWatchedDeepSymbols(limit = 4): Promise<string[]> {
  const watched = (await allWatchedSymbols()).map((s) => s.toUpperCase());
  if (watched.length === 0) return [];
  const cutoff = Date.now() - TTL_MS;
  const rows = await db().deepAnalysis.findMany({ where: { symbol: { in: watched } }, orderBy: { createdAt: "desc" }, select: { symbol: true, createdAt: true } });
  const latestBySym = new Map<string, Date>();
  for (const r of rows) if (!latestBySym.has(r.symbol)) latestBySym.set(r.symbol, r.createdAt);
  return [...latestBySym.entries()]
    .filter(([, d]) => d.getTime() < cutoff)
    .sort((a, b) => a[1].getTime() - b[1].getTime())
    .slice(0, limit)
    .map(([s]) => s);
}

/** System refresh for the scheduler — no per-user quota, but respects kill switch + spend ceiling. */
export async function refreshDeepSystem(symbol: string, web = false): Promise<{ refreshed: boolean; reason?: string }> {
  const e = env();
  if (!e.ANTHROPIC_API_KEY || e.DEMO_MODE) return { refreshed: false, reason: "no_key" };
  const limits = await effectiveLimits();
  if (limits.killSwitchManual) return { refreshed: false, reason: "kill_switch" };
  if ((await spendToday()) >= limits.spendCeilingUsd) return { refreshed: false, reason: "spend_ceiling" };
  const data = await generate(symbol.toUpperCase(), null, web);
  return { refreshed: Boolean(data) };
}
