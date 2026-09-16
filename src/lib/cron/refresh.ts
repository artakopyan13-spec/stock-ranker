import type Anthropic from "@anthropic-ai/sdk";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { anthropic, logUsage } from "@/lib/ai/client";
import { analyzeOnce, buildRequestParams } from "@/lib/ai/analyze";
import { getLatestAnalysis, loadDataForAnalysis, persistAnalysis, VerificationFailedError } from "@/lib/analysis/service";
import type { StockData } from "@/lib/data/types";
import { decideRefresh } from "@/lib/cron/smart-refresh";
import { allWatchedSymbols } from "@/lib/watchlists";
import { effectiveLimits } from "@/lib/quota/settings";
import { spendToday } from "@/lib/quota/spend";
import { pruneRateLimits } from "@/lib/quota/ratelimit";

export type RefreshMode = "batch" | "sync";

export interface RefreshPlan {
  runKey: string;
  toAnalyze: Array<{ symbol: string; data: StockData; previousTripwire: string | null; reason: string }>;
  skipped: Array<{ symbol: string; reason: string }>;
  errors: Array<{ symbol: string; error: string }>;
}

export interface RefreshOutcome {
  runKey: string;
  status: "submitted" | "already_submitted" | "synced" | "nothing_to_do" | "skipped";
  mode: RefreshMode;
  submitted: string[];
  skipped: string[];
  errors: Array<{ symbol: string; error: string }>;
  batchId?: string;
  synced?: { ok: string[]; failed: Array<{ symbol: string; error: string }> };
}

export function runKeyFor(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** Fetches fresh data for every watched symbol and applies the smart-refresh rule. */
export async function planRefresh(now: Date = new Date()): Promise<RefreshPlan> {
  const e = env();
  const symbols = (await allWatchedSymbols()).slice(0, e.MAX_CRON_TICKERS);
  const plan: RefreshPlan = { runKey: runKeyFor(now), toAnalyze: [], skipped: [], errors: [] };
  for (const symbol of symbols) {
    try {
      const previous = await getLatestAnalysis(symbol);
      const data = await loadDataForAnalysis(symbol, { force: true });
      const decision = decideRefresh(previous ? { analysis: previous.analysis, createdAt: previous.createdAt } : null, data, {
        ttlHours: e.ANALYSIS_TTL_HOURS,
        priceMovePct: e.SMART_REFRESH_PRICE_MOVE_PCT,
        smart: e.SMART_REFRESH,
        now,
      });
      if (decision.refresh) plan.toAnalyze.push({ symbol, data, previousTripwire: previous?.analysis.tripwire.description ?? null, reason: decision.reason });
      else plan.skipped.push({ symbol, reason: decision.reason });
    } catch (err) {
      plan.errors.push({ symbol, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return plan;
}

/**
 * Nightly refresh. Idempotent per calendar day: a second call on the same day returns the
 * existing run instead of submitting again. `batch` mode submits one Message Batch (50% price)
 * that /api/cron/collect picks up; `sync` mode analyzes inline within the time budget.
 */
export async function runRefresh(opts: { mode?: RefreshMode; now?: Date; timeBudgetMs?: number } = {}): Promise<RefreshOutcome> {
  const prisma = db();
  const now = opts.now ?? new Date();
  const mode: RefreshMode = opts.mode ?? "batch";
  const runKey = runKeyFor(now);

  await pruneRateLimits(now);
  const limits = await effectiveLimits();
  if (limits.killSwitchManual || (await spendToday(now)) >= limits.spendCeilingUsd) {
    await prisma.refreshRun.upsert({
      where: { runKey },
      create: { runKey, status: "skipped", mode, tickers: "[]", skipped: "[]", collectedAt: now, error: "spend ceiling / kill switch active" },
      update: { status: "skipped", collectedAt: now, error: "spend ceiling / kill switch active" },
    });
    return { runKey, status: "skipped", mode, submitted: [], skipped: [], errors: [] };
  }

  const existing = await prisma.refreshRun.findUnique({ where: { runKey } });
  if (existing && existing.status !== "failed") {
    return {
      runKey,
      status: "already_submitted",
      mode: existing.mode as RefreshMode,
      submitted: JSON.parse(existing.tickers) as string[],
      skipped: JSON.parse(existing.skipped) as string[],
      errors: [],
      batchId: existing.batchId ?? undefined,
    };
  }

  const plan = await planRefresh(now);
  const skipped = plan.skipped.map((s) => s.symbol);
  if (!plan.toAnalyze.length) {
    await prisma.refreshRun.upsert({
      where: { runKey },
      create: { runKey, status: "skipped", mode, tickers: "[]", skipped: JSON.stringify(skipped), collectedAt: now },
      update: { status: "skipped", tickers: "[]", skipped: JSON.stringify(skipped), collectedAt: now, error: null },
    });
    return { runKey, status: "nothing_to_do", mode, submitted: [], skipped, errors: plan.errors };
  }

  if (mode === "sync") {
    const run = await prisma.refreshRun.upsert({
      where: { runKey },
      create: { runKey, status: "planned", mode, tickers: JSON.stringify(plan.toAnalyze.map((t) => t.symbol)), skipped: JSON.stringify(skipped) },
      update: { status: "planned", mode, tickers: JSON.stringify(plan.toAnalyze.map((t) => t.symbol)), skipped: JSON.stringify(skipped), error: null },
    });
    const budget = opts.timeBudgetMs ?? 240_000;
    const start = Date.now();
    const ok: string[] = [];
    const failed: Array<{ symbol: string; error: string }> = [];
    let usd = 0;
    for (const item of plan.toAnalyze) {
      if (Date.now() - start > budget) {
        failed.push({ symbol: item.symbol, error: "time budget exhausted; will retry next run" });
        continue;
      }
      try {
        const result = await analyzeOnce(item.data, { previousTripwire: item.previousTripwire });
        const usage = await logUsage("analysis", result.model, result.usage, { symbol: item.symbol });
        usd += usage.usd;
        await persistAnalysis({ data: item.data, result, source: "cron", usage, previousTripwire: item.previousTripwire, runKey });
        ok.push(item.symbol);
      } catch (err) {
        failed.push({ symbol: item.symbol, error: err instanceof VerificationFailedError ? "verification failed" : err instanceof Error ? err.message : String(err) });
      }
    }
    await prisma.refreshRun.update({ where: { id: run.id }, data: { status: "collected", collectedAt: new Date(), usdCost: usd, error: failed.length ? JSON.stringify(failed) : null } });
    return { runKey, status: "synced", mode, submitted: plan.toAnalyze.map((t) => t.symbol), skipped, errors: plan.errors, synced: { ok, failed } };
  }

  // batch mode
  const requests: Anthropic.Messages.BatchCreateParams.Request[] = plan.toAnalyze.map((item) => ({
    custom_id: `${runKey}:${item.symbol}`,
    params: buildRequestParams(item.data, { previousTripwire: item.previousTripwire }),
  }));
  const run = await prisma.refreshRun.upsert({
    where: { runKey },
    create: { runKey, status: "planned", mode, tickers: JSON.stringify(plan.toAnalyze.map((t) => t.symbol)), skipped: JSON.stringify(skipped) },
    update: { status: "planned", mode, tickers: JSON.stringify(plan.toAnalyze.map((t) => t.symbol)), skipped: JSON.stringify(skipped), error: null },
  });
  try {
    const batch = await anthropic().messages.batches.create({ requests });
    // The collector needs the exact data each request used; snapshot it on the run.
    await prisma.refreshRun.update({ where: { id: run.id }, data: { status: "submitted", batchId: batch.id } });
    await prisma.cronPayload.createMany({
      data: plan.toAnalyze.map((item) => ({ runKey, symbol: item.symbol, data: JSON.stringify(item.data), previousTripwire: item.previousTripwire })),
    });
    return { runKey, status: "submitted", mode, submitted: plan.toAnalyze.map((t) => t.symbol), skipped, errors: plan.errors, batchId: batch.id };
  } catch (err) {
    await prisma.refreshRun.update({ where: { id: run.id }, data: { status: "failed", error: err instanceof Error ? err.message : String(err) } });
    throw err;
  }
}
