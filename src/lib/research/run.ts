import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { anthropic, logUsage, usageFromMessage } from "@/lib/ai/client";
import { gateFreshAnalysis, type DenyReason } from "@/lib/quota/gate";
import { effectiveLimits } from "@/lib/quota/settings";
import { spendToday } from "@/lib/quota/spend";
import { FreshAnalysisDeniedError } from "@/lib/analysis/service";
import { ResearchOutput } from "@/lib/research/schema";
import { CANDIDATE_ROWS, isCurrent, metaOf, pickBest, type ReportMeta } from "@/lib/reports/freshness";
import { classifyAiError } from "@/lib/ai/errors";

const TTL_MS = 7 * 24 * 3_600_000; // industry research is stable for a week
export const RESEARCH_PROMPT_VERSION = 1;
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);

export interface ResearchResult {
  data: ResearchOutput;
  cached: boolean;
  meta: ReportMeta;
  notice?: { reason: DenyReason | "refresh_failed" | "already_verified"; message: string };
}

/** Best cached row: a current web-verified one first (see lib/reports/freshness). */
async function best(industry: string) {
  const rows = await db().industryResearch.findMany({ where: { industry }, orderBy: { createdAt: "desc" }, take: CANDIDATE_ROWS });
  return pickBest(rows, RESEARCH_PROMPT_VERSION, TTL_MS);
}

const served = (row: { payload: string; createdAt: Date; mode: string; promptVersion: number }) => ({
  data: ResearchOutput.parse(JSON.parse(row.payload)),
  meta: metaOf(row, RESEARCH_PROMPT_VERSION, TTL_MS),
});

/** The AI call + store for one industry. No gating — callers decide policy. Returns null on refusal. */
async function generateResearch(industry: string, industryInput: string, userId: string | null, web = false): Promise<ResearchOutput | null> {
  const e = env();
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Today is ${today}. A user wants to research the "${industryInput}" industry/theme so they can build a watchlist of companies to analyze themselves.

${web ? "Search the web for the current state of this industry and the notable PUBLICLY TRADED companies in it." : "Using your own knowledge, cover the current state of this industry and the notable PUBLICLY TRADED companies in it."} Use real, correct stock tickers only.

WRITE FOR A COMPLETE BEGINNER. The reader has NO finance and NO medical/technical background. This is the most important rule:
- Use plain, everyday English. No jargon, no acronyms, no industry slang.
- If a technical term is truly unavoidable, immediately explain it in plain words in the same sentence. Example: instead of "GLP-1/incretin therapies", write "weight-loss and diabetes drugs (like Ozempic and Mounjaro)". Instead of "biosimilar competition", write "cheaper copycat versions of their drug". Instead of "oncology and immunology portfolio", write "cancer and immune-system medicines".
- Explain what the company actually MAKES or SELLS and HOW IT MAKES MONEY, like you're explaining it to a friend who knows nothing about the topic.

Return:
- overview: 2-3 sentences on where the industry stands right now (is demand growing or shrinking, what's helping it, what's hurting it) — in plain words.
- themes: 3 to 5 key drivers, each written as a short plain-English phrase a beginner understands.
- companies: 6 to 10 notable public companies spanning the value chain (big leaders, smaller challengers, and suppliers/"picks-and-shovels" where relevant). For each:
  * ticker: the correct stock ticker.
  * name: the company name.
  * role: a SHORT 2-to-4-word label only (e.g. "Market leader", "Small challenger", "Key supplier", "Steady giant"). Not a sentence.
  * whatTheyDo: ONE plain sentence — what they make or sell and how they earn money, in words anyone understands.
  * bullCase: one plain sentence — why it could do well.
  * keyRisk: one plain sentence — the main thing that could go wrong.

Hard rules:
- Only real, currently-listed public companies with correct tickers. If unsure of a ticker, omit that company.
- This is NEUTRAL research to help someone decide what to review — NOT investment advice. Do not tell anyone to buy or sell, do not give price targets, do not rank a "best pick". Every company must include a genuine risk.
- ${web ? "Prefer recent, reputable sources." : "This runs from training knowledge; omit any company whose ticker you are not confident is current and correct."}`;

  // web=false (on-demand on Vercel): knowledge-only, fits the Hobby 60s cap. web=true (off-Vercel
  // worker): web-verified current state. The agentic search loop is far too slow for a 60s function.
  const resp = await anthropic().messages.parse({
    model: e.NEWS_SEARCH_MODEL,
    max_tokens: 6000,
    output_config: { effort: "low", format: zodOutputFormat(ResearchOutput) },
    ...(web ? { tools: [{ type: "web_search_20260209" as const, name: "web_search", max_uses: 4 }] } : {}),
    messages: [{ role: "user", content: prompt }],
  }, web ? {} : { timeout: 48_000, maxRetries: 0 }); // on-demand runs inside a 60s function

  const searches = resp.content.filter((b): b is Anthropic.ServerToolUseBlock => b.type === "server_tool_use").length;
  await logUsage("research", e.NEWS_SEARCH_MODEL, usageFromMessage(resp.usage), { userId, webSearches: searches });

  if (resp.stop_reason === "refusal" || !resp.parsed_output || resp.parsed_output.companies.length === 0) return null;
  const data = { ...resp.parsed_output, companies: resp.parsed_output.companies.map((c) => ({ ...c, ticker: c.ticker.toUpperCase() })) };
  await db().industryResearch.create({ data: { industry, payload: JSON.stringify(data), model: e.NEWS_SEARCH_MODEL, usdCost: 0, mode: web ? "web" : "knowledge", promptVersion: RESEARCH_PROMPT_VERSION } });
  return data;
}

/**
 * User-facing industry research: cached a week; a fresh run is a gated paid action that degrades
 * to the cached copy. Returns publicly-traded companies to REVIEW (never a buy/sell call).
 */
export async function getOrCreateResearch(industryInput: string, opts: { userId?: string | null; ip?: string; force?: boolean } = {}): Promise<ResearchResult> {
  const industry = norm(industryInput);
  if (!industry) throw new FreshAnalysisDeniedError("no_key", "Type an industry or theme to research.");
  const e = env();

  const existing = await best(industry);
  const current = existing ? isCurrent(existing, RESEARCH_PROMPT_VERSION, TTL_MS) : false;
  if (existing && current && !opts.force) return { ...served(existing), cached: true };
  // Never let an on-demand (knowledge-only) regenerate replace a current web-verified result.
  if (existing && current && existing.mode === "web") {
    return { ...served(existing), cached: true, notice: { reason: "already_verified", message: "This research was verified against live sources recently, so it wasn't regenerated." } };
  }

  if (!e.ANTHROPIC_API_KEY && !e.DEMO_MODE) {
    if (existing) return { ...served(existing), cached: true };
    throw new FreshAnalysisDeniedError("no_key", "Research is temporarily unavailable.");
  }

  const gate = await gateFreshAnalysis({ userId: opts.userId ?? null, ip: opts.ip ?? "0.0.0.0" });
  if (!gate.allow) {
    if (existing) return { ...served(existing), cached: true, notice: { reason: gate.reason, message: gate.message } };
    throw new FreshAnalysisDeniedError(gate.reason, gate.message);
  }

  let data: ResearchOutput | null = null;
  let failure: string | null = null;
  try {
    data = await generateResearch(industry, industryInput, opts.userId ?? null);
  } catch (err) {
    failure = classifyAiError(err)?.message ?? "The research run failed.";
    console.error(`[research] generate failed for "${industry}":`, err instanceof Error ? err.message : err);
  }
  if (!data) {
    if (existing) {
      const built = existing.createdAt.toISOString().slice(0, 10);
      return { ...served(existing), cached: true, notice: { reason: "refresh_failed", message: `${failure ?? "The new run didn't complete."} Showing the version from ${built}.` } };
    }
    throw new FreshAnalysisDeniedError("no_key", failure ?? "Couldn't build research for that. Try a broader or clearer industry name.");
  }
  const row = await best(industry);
  return { data, cached: false, meta: row ? metaOf(row, RESEARCH_PROMPT_VERSION, TTL_MS) : { mode: "knowledge", builtAt: new Date().toISOString(), outdated: false, expired: false } };
}

/** System refresh for the scheduled cron — no per-user quota, but respects kill switch + spend ceiling. */
export async function refreshResearchSystem(industryInput: string, web = false): Promise<{ refreshed: boolean; reason?: string }> {
  const e = env();
  if (!e.ANTHROPIC_API_KEY || e.DEMO_MODE) return { refreshed: false, reason: "no_key" };
  const limits = await effectiveLimits();
  if (limits.killSwitchManual) return { refreshed: false, reason: "kill_switch" };
  if ((await spendToday()) >= limits.spendCeilingUsd) return { refreshed: false, reason: "spend_ceiling" };
  const data = await generateResearch(norm(industryInput), industryInput, null, web);
  return { refreshed: Boolean(data) };
}

/** The industries kept warm by the scheduler so the Research tab is instant + current. */
export const POPULAR_INDUSTRIES = [
  "Artificial intelligence",
  "Semiconductors",
  "Nuclear energy",
  "Cybersecurity",
  "Weight-loss drugs (GLP-1)",
  "Defense",
  "Quantum computing",
  "Space",
];
