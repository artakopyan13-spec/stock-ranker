import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getStockData } from "@/lib/data";
import type { StockData } from "@/lib/data/types";
import { Analysis, type ModelOutput, type Usage, type Verification } from "@/lib/analysis/schema";
import { assembleAnalysis, deriveDataSections, type DataSections } from "@/lib/analysis/assemble";
import { failureSummary, verifyAssembled, verifyModelOutput } from "@/lib/analysis/verify";
import { analyzeStreaming, PROMPT_VERSION, type AnalyzeResult } from "@/lib/ai/analyze";
import { logUsage } from "@/lib/ai/client";
import { gateFreshAnalysis, type DenyReason } from "@/lib/quota/gate";
import { searchNewsViaWeb } from "@/lib/ai/news-search";
import { searchLatestEarnings } from "@/lib/ai/earnings-search";
import type { TokenUsage } from "@/lib/ai/pricing";
import { detectChanges, recordChanges } from "@/lib/changes/detect";

export type AnalysisSource = "ondemand" | "cron" | "seed";

export type AnalysisEvent =
  | { type: "status"; message: string }
  | { type: "data"; sections: DataSections }
  | { type: "section"; key: keyof ModelOutput; value: unknown }
  | { type: "done"; analysis: Analysis; id: string }
  | { type: "notice"; reason: DenyReason; message: string }
  | { type: "error"; message: string };

export interface StoredAnalysis {
  id: string;
  analysis: Analysis;
  createdAt: Date;
  version: number;
  verified: boolean;
}

export class FreshAnalysisDeniedError extends Error {
  constructor(public readonly reason: DenyReason, message: string) {
    super(message);
    this.name = "FreshAnalysisDeniedError";
  }
}

/** Records that a ticker was viewed/searched (drives the Top Rated leaderboard ordering). */
async function bumpSearchCount(symbol: string): Promise<void> {
  await db().ticker.updateMany({ where: { symbol }, data: { searchCount: { increment: 1 } } });
}

export class DemoModeError extends Error {
  constructor(symbol: string) {
    super(`${symbol} is not part of the demo set. Demo mode serves pre-analyzed tickers only.`);
    this.name = "DemoModeError";
  }
}

export class VerificationFailedError extends Error {
  constructor(public readonly verification: Verification) {
    super(`Analysis failed verification:\n${failureSummary(verification)}`);
    this.name = "VerificationFailedError";
  }
}

function parseStored(row: { id: string; payload: string; createdAt: Date; version: number; verified: boolean }): StoredAnalysis {
  return { id: row.id, analysis: Analysis.parse(JSON.parse(row.payload)), createdAt: row.createdAt, version: row.version, verified: row.verified };
}

export async function getLatestAnalysis(symbol: string, opts: { verifiedOnly?: boolean } = {}): Promise<StoredAnalysis | null> {
  const row = await db().analysis.findFirst({
    where: { symbol: symbol.toUpperCase(), ...(opts.verifiedOnly === false ? {} : { verified: true }) },
    orderBy: { version: "desc" },
  });
  return row ? parseStored(row) : null;
}

export async function getAnalysisHistory(symbol: string, limit = 30): Promise<StoredAnalysis[]> {
  const rows = await db().analysis.findMany({ where: { symbol: symbol.toUpperCase(), verified: true }, orderBy: { version: "desc" }, take: limit });
  return rows.map(parseStored);
}

export function isFresh(stored: StoredAnalysis, now = new Date()): boolean {
  return now.getTime() - stored.createdAt.getTime() < env().ANALYSIS_TTL_HOURS * 3_600_000;
}

/** Fetches data and runs the web-search fallback when the provider returned no news. */
export async function loadDataForAnalysis(symbol: string, opts: { force?: boolean } = {}): Promise<StockData> {
  const { data } = await getStockData(symbol, { force: opts.force });
  let out = data;
  if (out.news.length === 0 && env().NEWS_WEB_SEARCH_FALLBACK && env().ANTHROPIC_API_KEY) {
    try {
      const items = await searchNewsViaWeb(out.symbol, out.companyName);
      if (items.length) out = { ...out, news: items, newsSource: "web_search" };
    } catch (err) {
      console.warn(`[news-search] fallback failed for ${symbol}:`, err instanceof Error ? err.message : err);
    }
  }
  // Pull the latest reported quarter + recent developments via web search so the analysis
  // reflects earnings published after the model's training cutoff.
  if (env().EARNINGS_WEB_SEARCH && env().ANTHROPIC_API_KEY) {
    try {
      const er = await searchLatestEarnings(out.symbol, out.companyName);
      if (er) out = { ...out, webContext: er.summary, webContextAsOf: er.asOf };
    } catch (err) {
      console.warn(`[earnings-search] failed for ${symbol}:`, err instanceof Error ? err.message : err);
    }
  }
  return out;
}

/**
 * Turns a model result into a verified, stored analysis. Shared by the on-demand path,
 * the batch collector, and the seed script. Throws VerificationFailedError when the
 * output does not pass Step 6 — nothing unverified is ever rendered or alerted on.
 */
export async function persistAnalysis(args: {
  data: StockData;
  result: AnalyzeResult;
  source: AnalysisSource;
  usage: Usage;
  previousTripwire: string | null;
  demo?: boolean;
  runKey?: string | null;
}): Promise<StoredAnalysis> {
  const { data, result } = args;
  const verification = verifyModelOutput(data, result.output);
  const analysis = assembleAnalysis(
    data,
    result.output,
    {
      promptVersion: PROMPT_VERSION,
      model: result.model,
      usage: args.usage,
      analyzedAt: new Date(),
      demo: args.demo ?? false,
      previousTripwireDescription: args.previousTripwire,
    },
    verification,
  );
  const full = { passed: false, checks: [...verification.checks, ...verifyAssembled(analysis)] };
  full.passed = full.checks.every((c) => c.ok);
  analysis.meta.verification = full;

  const prisma = db();
  const last = await prisma.analysis.findFirst({ where: { symbol: data.symbol }, orderBy: { version: "desc" }, select: { version: true } });
  const row = await prisma.analysis.create({
    data: {
      symbol: data.symbol,
      version: (last?.version ?? 0) + 1,
      promptVersion: PROMPT_VERSION,
      model: result.model,
      source: args.source,
      payload: JSON.stringify(analysis),
      rating: analysis.rating.score,
      action: analysis.rating.action,
      fcfVerdict: analysis.fcf.verdict,
      fcfMarginPct: analysis.fcf.marginPct.value,
      revenueGrowthPct: analysis.growth.revenueGrowthYoYLatestQ.value,
      forwardPE: analysis.valuation.forwardPE.value,
      priceAtAnalysis: analysis.price.current.value,
      verified: full.passed,
      usdCost: args.usage.usd,
      dataAsOf: new Date(data.fetchedAt),
    },
  });
  if (!full.passed) throw new VerificationFailedError(full);

  const stored = parseStored(row);
  // Change detection against the previous verified analysis → "what changed" rows (never duplicated).
  const previous = await prisma.analysis.findFirst({ where: { symbol: data.symbol, verified: true, id: { not: row.id } }, orderBy: { version: "desc" } });
  const changes = detectChanges(previous ? Analysis.parse(JSON.parse(previous.payload)) : null, analysis);
  await recordChanges(stored.id, analysis, changes, args.runKey ?? null);
  return stored;
}

/**
 * On-demand path: cached analysis if fresh, otherwise fetch → stream model → verify → store.
 * Emits progress events for the SSE route. One automatic retry on verification failure.
 */
export async function getOrCreateAnalysis(
  symbol: string,
  opts: { force?: boolean; onEvent?: (e: AnalysisEvent) => void; userId?: string | null; ip?: string; source?: AnalysisSource; system?: boolean } = {},
): Promise<StoredAnalysis> {
  const sym = symbol.toUpperCase();
  const e = env();
  const emit = opts.onEvent ?? (() => undefined);

  const existing = await getLatestAnalysis(sym);
  await bumpSearchCount(sym);
  if (e.DEMO_MODE) {
    if (existing) {
      emit({ type: "done", analysis: existing.analysis, id: existing.id });
      return existing;
    }
    throw new DemoModeError(sym);
  }
  if (existing && !opts.force && isFresh(existing)) {
    // Shared cache: any user gets this for free, no quota spent.
    emit({ type: "done", analysis: existing.analysis, id: existing.id });
    return existing;
  }

  // A fresh (paid) analysis is wanted — this is the only place the bill can grow.
  // `system` callers (seed script) bypass the per-user gate; the route path never sets it.
  const gate = opts.system ? ({ allow: true } as const) : await gateFreshAnalysis({ userId: opts.userId ?? null, ip: opts.ip ?? "0.0.0.0" });
  if (!gate.allow) {
    if (existing) {
      // Degrade gracefully: show the last cached analysis with a notice, never an error.
      emit({ type: "notice", reason: gate.reason, message: gate.message });
      emit({ type: "done", analysis: existing.analysis, id: existing.id });
      return existing;
    }
    throw new FreshAnalysisDeniedError(gate.reason, gate.message);
  }

  emit({ type: "status", message: "Fetching live market data…" });
  const data = await loadDataForAnalysis(sym, { force: opts.force });
  emit({ type: "data", sections: deriveDataSections(data) });
  emit({ type: "status", message: data.news.length ? `Analyzing with ${e.ANALYSIS_MODEL}…` : "No 7-day news found. Analyzing…" });

  const previousTripwire = existing?.analysis.tripwire.description ?? null;
  let feedback: string | null = null;
  let lastError: VerificationFailedError | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await analyzeStreaming(data, {
      previousTripwire,
      retryFeedback: feedback,
      onSection: attempt === 0 ? (key, value) => emit({ type: "section", key, value }) : undefined,
    });
    const usage: Usage = await logUsage("analysis", result.model, result.usage as TokenUsage, { symbol: sym, userId: opts.userId ?? null });
    try {
      const stored = await persistAnalysis({ data, result, source: opts.source ?? "ondemand", usage, previousTripwire });
      emit({ type: "done", analysis: stored.analysis, id: stored.id });
      return stored;
    } catch (err) {
      if (!(err instanceof VerificationFailedError)) throw err;
      lastError = err;
      feedback = failureSummary(err.verification);
      emit({ type: "status", message: "Verification failed — retrying once with feedback…" });
    }
  }
  throw lastError ?? new Error("Analysis failed");
}
