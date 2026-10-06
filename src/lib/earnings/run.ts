import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { anthropic, logUsage, usageFromMessage } from "@/lib/ai/client";
import { gateFreshAnalysis, type DenyReason } from "@/lib/quota/gate";
import { FreshAnalysisDeniedError } from "@/lib/analysis/service";
import { EarningsReportOutput } from "@/lib/earnings/schema";

const TTL_MS = 7 * 24 * 3_600_000; // an earnings report is stable until the next report

export interface EarningsResult {
  data: EarningsReportOutput;
  cached: boolean;
  notice?: { reason: DenyReason; message: string };
}

async function latest(symbol: string) {
  return db().earningsReport.findFirst({ where: { symbol }, orderBy: { createdAt: "desc" } });
}

async function generate(symbol: string, userId: string | null): Promise<EarningsReportOutput | null> {
  const e = env();
  const today = new Date().toISOString().slice(0, 10);
  const prompt = `Today is ${today}. Build an EARNINGS REPORT for the stock ${symbol} for its MOST RECENT reported quarter, using your own knowledge (do NOT browse the web).

Return a structured report:
- company, the quarter label (e.g. "Q2 FY2026"), the report date (YYYY-MM-DD), and timing ("After market close" / "Before open" / "").
- headlineVerdict: overall "beat", "mixed", or "miss" vs. Wall Street expectations.
- priceReactionPct: how the stock moved right after the report (%), or null if unknown.
- metrics: 4-5 KPI tiles comparing REPORTED vs. analyst CONSENSUS — Revenue, EPS, Gross margin, EBITDA (if available), and forward Guidance (next-quarter or full-year revenue). For each: the reported value (formatted, e.g. "$26.0B", "$0.61", "78.4%"), the consensus ("—" if none), the % surprise (deltaPct, positive = above), and a verdict ("beat"/"miss"/"inline" for results, "above"/"below"/"inline" for guidance, "na" if unknown).
- revenueTrend: the last ~5 quarters of revenue in MILLIONS USD, each with a short period label (e.g. "Q1 FY25").
- highlights: 3-5 key things that drove the quarter, each a short title + one plain sentence.
- bottleneck: the SINGLE biggest constraint or risk limiting the company right now (title + one plain sentence) — the thing most likely to cap results.
- scenarios: a BULL case and a BEAR case framed around FUTURE earnings. For each, a concrete "trigger" (what the next results would need to show — real, specific thresholds) and the likely "outcome" for the stock direction, in plain words.
- nextReportDate: the estimated date of the next earnings report (YYYY-MM-DD), or "".

Hard rules:
- This runs from your training knowledge, which may be months out of date. NEVER invent a number to look current. If you can't recall a figure confidently, use "—" (strings) or null (numbers) and verdict "na". It is better to mark a figure unknown than to guess.
- Write in plain English a beginner can follow; explain any jargon briefly.
- This is research, not advice: no price targets, no "buy/sell" calls. The scenarios describe what the numbers would need to do, not what the reader should do.`;

  // NO web search: the agentic search loop runs minutes and ignores max_uses, which the Vercel
  // Hobby 60s function cap can't survive. A knowledge-only call finishes in well under 30s.
  const resp = await anthropic().messages.parse({
    model: e.NEWS_SEARCH_MODEL,
    max_tokens: 6000,
    output_config: { effort: "low", format: zodOutputFormat(EarningsReportOutput) },
    messages: [{ role: "user", content: prompt }],
  });

  await logUsage("earnings", e.NEWS_SEARCH_MODEL, usageFromMessage(resp.usage), { symbol, userId, webSearches: 0 });

  if (resp.stop_reason === "refusal" || !resp.parsed_output || resp.parsed_output.metrics.length === 0) return null;
  const data = resp.parsed_output;
  await db().earningsReport.create({ data: { symbol, payload: JSON.stringify(data), model: e.NEWS_SEARCH_MODEL, usdCost: 0 } });
  return data;
}

/** Cached, gated earnings report for a ticker. Cached a week; a fresh pull is a gated paid action. */
export async function getOrCreateEarnings(symbolInput: string, opts: { userId?: string | null; ip?: string; force?: boolean } = {}): Promise<EarningsResult> {
  const symbol = symbolInput.toUpperCase();
  const e = env();

  const existing = await latest(symbol);
  const fresh = existing ? Date.now() - existing.createdAt.getTime() < TTL_MS : false;
  if (existing && fresh && !opts.force) return { data: JSON.parse(existing.payload), cached: true };

  if (!e.ANTHROPIC_API_KEY && !e.DEMO_MODE) {
    if (existing) return { data: JSON.parse(existing.payload), cached: true };
    throw new FreshAnalysisDeniedError("no_key", "Earnings reports are temporarily unavailable.");
  }

  const gate = await gateFreshAnalysis({ userId: opts.userId ?? null, ip: opts.ip ?? "0.0.0.0" });
  if (!gate.allow) {
    if (existing) return { data: JSON.parse(existing.payload), cached: true, notice: { reason: gate.reason, message: gate.message } };
    throw new FreshAnalysisDeniedError(gate.reason, gate.message);
  }

  const data = await generate(symbol, opts.userId ?? null);
  if (!data) {
    if (existing) return { data: JSON.parse(existing.payload), cached: true };
    throw new FreshAnalysisDeniedError("no_key", "Couldn't build an earnings report for that ticker yet.");
  }
  return { data, cached: false };
}

export async function getCachedEarnings(symbolInput: string): Promise<EarningsReportOutput | null> {
  const row = await latest(symbolInput.toUpperCase());
  return row ? (JSON.parse(row.payload) as EarningsReportOutput) : null;
}
