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

const TTL_MS = 7 * 24 * 3_600_000; // industry research is stable for a week
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ").slice(0, 80);

export interface ResearchResult {
  data: ResearchOutput;
  cached: boolean;
  notice?: { reason: DenyReason; message: string };
}

async function latest(industry: string) {
  return db().industryResearch.findFirst({ where: { industry }, orderBy: { createdAt: "desc" } });
}

/** The AI call + store for one industry. No gating — callers decide policy. Returns null on refusal. */
async function generateResearch(industry: string, industryInput: string, userId: string | null): Promise<ResearchOutput | null> {
  const e = env();
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Today is ${today}. A user wants to research the "${industryInput}" industry/theme so they can build a watchlist of companies to analyze themselves.

Search the web for the current state of this industry and the notable PUBLICLY TRADED companies in it. Use real, correct stock tickers only.

Return:
- a 2-3 sentence overview of where the industry stands right now (demand, tailwinds, headwinds)
- 3 to 5 key themes or structural drivers shaping it
- 6 to 10 notable public companies spanning the value chain: leaders, challengers, and picks-and-shovels/suppliers where relevant. For each give: the correct ticker, the company name, one sentence on what they do, its role in the industry, the bull case (why it is worth a closer look), and the single biggest risk.

Hard rules:
- Only real, currently-listed public companies with correct tickers. If unsure of a ticker, omit that company.
- This is NEUTRAL research to help someone decide what to review — NOT investment advice. Do not tell anyone to buy or sell, do not give price targets, do not rank a "best pick". Every company must include a genuine risk.
- Prefer recent, reputable sources.`;

  const resp = await anthropic().messages.parse({
    model: e.NEWS_SEARCH_MODEL,
    max_tokens: 6000,
    output_config: { effort: "low", format: zodOutputFormat(ResearchOutput) },
    tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 4 }],
    messages: [{ role: "user", content: prompt }],
  });

  const searches = resp.content.filter((b): b is Anthropic.ServerToolUseBlock => b.type === "server_tool_use").length;
  await logUsage("research", e.NEWS_SEARCH_MODEL, usageFromMessage(resp.usage), { userId, webSearches: searches });

  if (resp.stop_reason === "refusal" || !resp.parsed_output || resp.parsed_output.companies.length === 0) return null;
  const data = { ...resp.parsed_output, companies: resp.parsed_output.companies.map((c) => ({ ...c, ticker: c.ticker.toUpperCase() })) };
  await db().industryResearch.create({ data: { industry, payload: JSON.stringify(data), model: e.NEWS_SEARCH_MODEL, usdCost: 0 } });
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

  const existing = await latest(industry);
  const fresh = existing ? Date.now() - existing.createdAt.getTime() < TTL_MS : false;
  if (existing && fresh && !opts.force) return { data: JSON.parse(existing.payload), cached: true };

  if (!e.ANTHROPIC_API_KEY && !e.DEMO_MODE) {
    if (existing) return { data: JSON.parse(existing.payload), cached: true };
    throw new FreshAnalysisDeniedError("no_key", "Research is temporarily unavailable.");
  }

  const gate = await gateFreshAnalysis({ userId: opts.userId ?? null, ip: opts.ip ?? "0.0.0.0" });
  if (!gate.allow) {
    if (existing) return { data: JSON.parse(existing.payload), cached: true, notice: { reason: gate.reason, message: gate.message } };
    throw new FreshAnalysisDeniedError(gate.reason, gate.message);
  }

  const data = await generateResearch(industry, industryInput, opts.userId ?? null);
  if (!data) {
    if (existing) return { data: JSON.parse(existing.payload), cached: true };
    throw new FreshAnalysisDeniedError("no_key", "Couldn't build research for that. Try a broader or clearer industry name.");
  }
  return { data, cached: false };
}

/** System refresh for the scheduled cron — no per-user quota, but respects kill switch + spend ceiling. */
export async function refreshResearchSystem(industryInput: string): Promise<{ refreshed: boolean; reason?: string }> {
  const e = env();
  if (!e.ANTHROPIC_API_KEY || e.DEMO_MODE) return { refreshed: false, reason: "no_key" };
  const limits = await effectiveLimits();
  if (limits.killSwitchManual) return { refreshed: false, reason: "kill_switch" };
  if ((await spendToday()) >= limits.spendCeilingUsd) return { refreshed: false, reason: "spend_ceiling" };
  const data = await generateResearch(norm(industryInput), industryInput, null);
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
