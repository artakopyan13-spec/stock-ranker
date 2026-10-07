import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { runAssistantJsonLoose, type StructuredResult } from "@/lib/ai/assistant";
import { logUsage } from "@/lib/ai/client";
import { classifyAiError } from "@/lib/ai/errors";
import { runPool } from "@/lib/async";
import { Analysis } from "@/lib/analysis/schema";
import { getCompanyData } from "@/lib/data/company-source";
import { getStockData } from "@/lib/data";
import { loadUniverse } from "@/lib/universe";
import { enrich, getPortfolioRow } from "@/lib/portfolio/store";
import { positionNumbers } from "@/lib/portfolio/kpis";
import { parseActivityCsv } from "@/lib/portfolio/activity";
import { PositionsJudgment, PortfolioJudgment, type ReviewJudgment, type AllTime, type PortfolioReviewV2, type ReviewCard } from "@/lib/portfolio/review-schema";

/** Shared rules for both halves of the review. */
const BASE = `You are a portfolio reviewer. You produce the JUDGMENT for a portfolio dashboard; a program supplies every hard number, so never invent figures — reason from the FACTS given.
Follow these rules (from the portfolio-review method):
- FCF FIRST. Every position leads with free cash flow and a ✅/⚠️/❌ verdict. Negative or collapsing FCF is headline risk and an automatic "no new money". For banks/insurers/commodities, say FCF isn't meaningful and judge on P/E, P/B, ROE.
- HONESTY OVER HYPE. Lead with the uncomfortable truth. Name the bear case as loudly as the bull, flag cyclicals on peak earnings, never soften a concentration problem. Being down on a good business isn't a reason to sell; being up on a stretched one isn't a reason to add.
- MECHANICAL. Prefer rules with numbers (size caps, FCF gate, price levels, dates) over vibes.
- FRAMEWORK, NOT ADVICE. Ratings, 12-month ranges, allocations and sell/trim calls are your estimates. Never promise outcomes; never give personalized advice — frame as observations and rules.
If positionSizesProvided is false, the user gave tickers (maybe shares) but not dollar sizes — do NOT invent weights. If averageCostsProvided is false, there's no cost basis — skip gain figures and tax notes.
Tone: decisive, brief, specific. Keep every text field to 1-2 tight sentences — the dashboard is compact and brevity keeps it fast. No hedging paragraphs.`;

/** Per-position half: generated in parallel batches so a big portfolio still fits the function cap. */
export const POSITIONS_SYSTEM = `${BASE}

Produce ONLY these per-position sections, with EXACTLY one entry per position in FACTS.positions (match t / position to the ticker exactly):
- zones: strongBuyBelow/buyBelow/trimAbove/sellAbove/stopBelow derived from forward EPS × a multiple that fits the growth (15-20x for ~10-15% growers, 25-30x ~25%, 30-35x 40%+; lower for debt/thin FCF/cyclicality), cross-checked with the 52-week range. Put the method with real numbers in basis. No earnings → no buy zone, give only a stop/trim.
- actions: SELL/TRIM/HOLD/ACCUMULATE/NO ADDS with size and why; add a tax note when relevant (short vs long term, harvestable losses, wash-sale traps — observations, not tax advice). Use null for tax when not relevant.
- cards: the per-holding judgment (tag, tone, rate 1-10, one-liner, fcfHeadline + fcfExplanation, best, bull, bear, trip (up/down tripwire), cat (next catalyst), why (one-line verdict), and forecast fBear/fBase/fBull PRICES built from forward EPS × a stated multiple, cross-checked with the 52-week range).
- perStock: one {t, call, tone, line} per position — a short plain-English call and one line a beginner understands.
Every listed field is REQUIRED on every entry; use "" or null rather than omitting a key.`;

export const POSITIONS_SHAPE = JSON.stringify({
  zones: [{ t: "NVDA", strongBuyBelow: 150, buyBelow: 175, trimAbove: 230, sellAbove: null, stopBelow: null, basis: "fwd EPS 5.2 × 30-34x" }],
  actions: [{ action: "HOLD", tone: "gold", position: "NVDA", size: "hold full", why: "reason", tax: "long-term after 2026-04-01" }],
  cards: [{ t: "NVDA", tag: "HOLD", tone: "gold", rate: 7, one: "AI GPUs", fcfHeadline: "$127B TTM · 42% margin", fcfExplanation: "cash machine", best: "AI training", bull: "…", bear: "…", trip: "up: …; down: …", cat: "earnings Nov", why: "one-line verdict", fBear: 150, fBase: 220, fBull: 300 }],
  perStock: [{ t: "NVDA", call: "Hold", tone: "gold", line: "Best business you own, priced for a lot." }],
});

/** Portfolio-level half: runs concurrently with the per-position batches. */
export const PORTFOLIO_SYSTEM = `${BASE}

Produce ONLY these portfolio-level sections (NO per-position cards/zones/actions — another pass handles those):
- headline (one-line uncomfortable truth), thesis (2-3 sentences), score 1-10 (construction quality), honestRead (who made money, what's underwater, the concentration fact with numbers).
- themes: 1-2 scoreboard tiles for the dominant factor(s) with % of portfolio.
- macro: exactly 3 boxes (what macro hit hardest · what the market did · wait or buy).
- events: every holding's next earnings/ex-dividend from FACTS (mark vendor estimates est:true). Never invent a date.
- ideas: 1-3 gap sectors the portfolio lacks. Pick names ONLY from the ideaCandidates list provided; rank picks by fit. Say best-performing isn't best-buy.
- guardrails: numbered rules adapted to the account (size cap ~16%, FCF gate, valuation gate, earnings blackout, theme caps, reserve discipline).
- plan: only when newCashUsd > 0 — allocations AND tranches that EACH sum to newCashUsd, a why with resulting weights, and noAdds with a one-line reason each. Otherwise null.
- review: the plain-English HONEST REVIEW a beginner reads first — grade (a letter, no grade inflation), gradeNote, summary (3-4 plain sentences, say "spare cash" not "FCF", "how expensive it is" not "multiple"), good (3-5 things they're doing right), bad (3-5 things that worry you), suggestions (imperative, may use <b>). Do NOT include perStock.
- beatQQQ: the realistic, portfolio-SPECIFIC plan to OUTPERFORM QQQ (the Nasdaq-100: mega-cap tech heavy — AAPL, MSFT, NVDA, AMZN, GOOGL, META, AVGO, TSLA dominate it). Be brutally honest: if the portfolio is already mostly those same mega-cap tech names, it IS basically QQQ with more risk and will struggle to beat it — say so. verdict (one plain line). overlap (how much of this book duplicates QQQ's core). gap (where it's most likely to LAG). edges (genuine, specific advantages over QQQ). moves (3-5 CONCRETE moves tied to a ticker/weight/trigger from FACTS, each with the edge it creates). risk (the main way this plan ends up BEHIND QQQ). Ground every claim in the holdings' real FCF/valuation/forecasts and the benchmarkQQQ facts.
- nextSteps: 4-6 dated, imperative html lines for "What to do, in order" (e.g. "<b>Now → Sep 30:</b> buy $600 of X").
- sources (plain text with as-of dates from FACTS), unverified (one line listing anything not in FACTS).
Every listed field is REQUIRED; use "", [] or null rather than omitting a key.`;

export const PORTFOLIO_SHAPE = JSON.stringify({
  headline: "one line",
  thesis: "2-3 sentences",
  score: 6,
  honestRead: "who made the money, what's underwater, the concentration fact",
  review: { grade: "C+", gradeNote: "overall", summary: "3-4 plain sentences, no jargon", good: ["what you're doing right"], bad: ["what worries me"], suggestions: ["<b>Add to X first.</b> reason"] },
  beatQQQ: {
    verdict: "Hard but possible — you own QQQ's winners plus two edges it under-weights.",
    overlap: "~70% of the book is QQQ's own top names, so most of it just tracks the index.",
    gap: "No cash reserve and 0% ex-tech means you lag QQQ in any tech drawdown.",
    edges: ["Overweight AVGO's 44% FCF margin vs its small QQQ weight"],
    moves: [{ step: "Trim NVDA to the 16% cap, move proceeds to AVGO in its buy zone", edge: "same AI exposure, cheaper cash flow, less single-name risk than QQQ's NVDA weight" }],
    risk: "If mega-cap tech keeps leading, trimming winners makes you trail QQQ.",
  },
  nextSteps: ["<b>Now → Sep 30:</b> buy $600 of X"],
  themes: [{ label: "AI capex", pct: 100, sub: "all of it", tone: "red" }],
  macro: [{ h: "What hit hardest", p: "one line" }],
  events: [{ date: "2026-11-03", type: "earnings", impact: "high", tickers: ["AMD"], title: "AMD Q3", watch: "data-center growth", est: true }],
  ideas: [{ sector: "Financials", gap: "0% financials", picks: [{ t: "V", name: "Visa", why: "reason", numbers: "fwd P/E 26x, FCF margin 52%", risk: "regulation" }], leaders: [{ t: "V", name: "Visa", perf1y: "+18%", fwdPe: "26x", fcf: "$18B", note: "toll road" }] }],
  guardrails: ["<b>Size cap:</b> no position above 16%."],
  plan: { allocations: [{ name: "AVGO", amt: 600, why: "cheapest cash machine" }], tranches: [{ name: "Tranche 1", amt: 600, window: "now-Sep 30", buy: "AVGO", logic: "in buy zone" }], noAdds: ["NBIS — burns cash"], why: "leans against the AI concentration" },
  sources: ["Yahoo Finance, as of 2026-09-18"],
  unverified: "anything not in FACTS",
});

/** Positions per parallel batch — keeps each call's output well inside the function time cap. */
const POSITION_BATCH = 5;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Most calls in flight at once — enough that a normal portfolio finishes in a single wave, low
 *  enough not to trip rate limits (backoff on a 429 would push us past the function's time limit). */
const MAX_CONCURRENCY = 6;
/** Whole-generation wall-clock budget. The function itself dies at 60s with NOTHING to show, so we
 *  stop starting new work before then and return whatever finished instead. */
const GENERATION_BUDGET_MS = 46_000;

function summarizePositions(cards: ReviewCard[], enriched: Awaited<ReturnType<typeof enrich>>["holdings"]) {
  return enriched.map((h) => {
    const n = cards.find((c) => c.numbers.symbol === h.symbol)?.numbers;
    return {
      t: h.symbol,
      name: h.name,
      shares: h.shares,
      avgCost: h.avgCost,
      price: n?.price ?? h.price,
      valueUsd: h.valueUsd,
      weightPct: h.weightPct === null ? null : Math.round(h.weightPct * 10) / 10,
      gainPct: h.gainPct === null ? null : Math.round(h.gainPct * 10) / 10,
      sector: n?.sector ?? h.sector,
      rating: h.rating,
      action: h.action,
      nextEarnings: n?.nextEarnings ?? null,
      range52: n?.range52 ?? null,
      fcf: n ? { icon: n.fcfIcon, ttm: n.fcfTtm, marginPct: n.fcfMarginPct } : null,
      kpis: n ? n.kgroups.map((g) => ({ name: g.name, items: g.items.map((i) => [i.label, i.value]) })) : null,
      hasAnalysis: n?.hasAnalysis ?? false,
      liveData: n?.hasLiveData ?? false,
    };
  });
}

/** Gap-sector idea candidates drawn from the app's own analyzed universe (grounded, not from memory). */
async function ideaCandidates(heldSectors: Set<string>) {
  const universe = await loadUniverse();
  const bySector = new Map<string, typeof universe>();
  for (const r of universe) {
    if (!r.sector) continue;
    const arr = bySector.get(r.sector) ?? [];
    arr.push(r);
    bySector.set(r.sector, arr);
  }
  const gaps = [...bySector.entries()].filter(([s]) => !heldSectors.has(s));
  return gaps
    .map(([sector, rows]) => ({
      sector,
      candidates: rows
        .sort((a, b) => b.rating - a.rating)
        .slice(0, 5)
        .map((r) => ({ t: r.symbol, name: r.companyName, rating: r.rating, action: r.action, fcfMarginPct: r.fcfMarginPct, forwardPE: r.forwardPE, revGrowthPct: r.revenueGrowthPct })),
    }))
    .filter((g) => g.candidates.length > 0)
    .slice(0, 6);
}

/** Generates and stores the full skill-style review. Caller must gate for cost first. */
export async function generateReview(userId: string): Promise<PortfolioReviewV2> {
  const row = await getPortfolioRow(userId);
  if (!row) throw new Error("No portfolio to review yet.");
  const { holdings, metrics } = await enrich(row);
  if (holdings.length === 0) throw new Error("Add at least one holding before requesting a review.");

  const symbols = holdings.map((h) => h.symbol);
  // Live data FIRST for every holding (skill hard rule #1) — quote, valuation, FCF, 52-wk range,
  // next earnings — plus company history and any cached AI analysis.
  const [stocks, companies, analysisRows] = await Promise.all([
    Promise.all(symbols.map((s) => getStockData(s).then((r) => r.data).catch(() => null))),
    Promise.all(symbols.map((s) => getCompanyData(s).catch(() => null))),
    db().analysis.findMany({ where: { symbol: { in: symbols }, verified: true }, orderBy: { version: "desc" } }),
  ]);
  const stockBy = new Map(symbols.map((s, i) => [s, stocks[i]]));
  const companyBy = new Map(symbols.map((s, i) => [s, companies[i]]));
  const analysisBy = new Map<string, Analysis>();
  for (const a of analysisRows) {
    if (analysisBy.has(a.symbol)) continue;
    try {
      analysisBy.set(a.symbol, Analysis.parse(JSON.parse(a.payload)));
    } catch {
      /* skip */
    }
  }
  const cards: ReviewCard[] = holdings.map((h) => ({ numbers: positionNumbers(h.symbol, stockBy.get(h.symbol) ?? null, companyBy.get(h.symbol) ?? null, analysisBy.get(h.symbol) ?? null), j: null }));

  const heldSectors = new Set(cards.map((c) => c.numbers.sector).filter((s): s is string => Boolean(s)));
  const ideas = await ideaCandidates(heldSectors);

  // Ground the "beat QQQ" plan in a real QQQ snapshot (benchmark anchor), best-effort.
  const qqq = await getStockData("QQQ").then((r) => r.data).catch(() => null);
  const benchmarkQQQ = qqq
    ? { symbol: "QQQ", name: "Invesco QQQ (Nasdaq-100)", price: qqq.quote.price.value, week52Low: qqq.quote.week52Low.value, week52High: qqq.quote.week52High.value, asOf: qqq.fetchedAt, note: "Mega-cap tech heavy: AAPL/MSFT/NVDA/AMZN/GOOGL/META/AVGO/TSLA dominate the weight." }
    : { symbol: "QQQ", name: "Invesco QQQ (Nasdaq-100)", note: "Mega-cap tech heavy: AAPL/MSFT/NVDA/AMZN/GOOGL/META/AVGO/TSLA dominate the weight." };

  const activity = row.alltime ? (JSON.parse(row.alltime) as ReturnType<typeof parseActivityCsv>) : null;
  const sizesProvided = holdings.some((h) => h.valueUsd !== null && h.valueUsd > 0);
  const costsProvided = holdings.some((h) => h.avgCost !== null);
  const facts = {
    today: new Date().toISOString().slice(0, 10),
    positionSizesProvided: sizesProvided, // if false, the user gave tickers only — judge quality, don't fabricate weights
    averageCostsProvided: costsProvided, // if false, no cost basis — skip gains and tax notes
    totalValueUsd: metrics.totalValueUsd,
    cashUsd: row.cashUsd,
    newCashUsd: row.newCashUsd,
    metrics,
    userNotes: row.notes,
    positions: summarizePositions(cards, holdings),
    analysisNotes: holdings.map((h) => {
      const a = analysisBy.get(h.symbol);
      return a ? { t: h.symbol, bull: a.thesis.bull, bear: a.thesis.bear, catalysts: a.catalysts.slice(0, 3), forecast: a.forecast12m, nextTripwire: a.tripwire.description } : null;
    }).filter(Boolean),
    activity: activity ? { netDeposits: activity.netDeposits, realized: activity.realized, income: activity.income, fees: activity.fees, closed: activity.closed, endDate: activity.endDate } : null,
    ideaCandidates: ideas,
    benchmarkQQQ,
  };

  // One combined call runs ~70s and the Vercel Hobby function cap is 60s, so the review is split
  // into independent halves — portfolio-level sections, and per-position sections batched a few
  // holdings at a time — all issued CONCURRENTLY. Wall-clock is the slowest single call (~35-40s)
  // rather than their sum, and adding holdings adds parallel calls instead of extending one.
  const allPositions = facts.positions;
  const batches = chunk(allPositions, POSITION_BATCH);
  const model = env().ANALYSIS_MODEL;

  // Each call is time-boxed well inside the function budget and retried at most once: the shared
  // client otherwise allows 10 minutes, so one stalled or 429-backing-off call would silently burn
  // the whole budget and the function would be killed with nothing to show. Concurrency is capped
  // so a large portfolio doesn't fan out wide enough to trip rate limits.
  const callOpts = { model, effort: "low" as const, maxTokens: 9000, timeoutMs: 42_000, maxRetries: 1 };
  const tasks: Array<() => Promise<{ kind: "portfolio" | "positions"; res: StructuredResult<PortfolioJudgment | PositionsJudgment> }>> = [
    async () => ({
      kind: "portfolio" as const,
      res: await runAssistantJsonLoose({
        system: `${PORTFOLIO_SYSTEM}\n\nReturn a JSON object with EXACTLY these keys and shapes (example values are illustrative — replace them, keep every key):\n${PORTFOLIO_SHAPE}`,
        user: `FACTS:\n${JSON.stringify(facts, null, 1)}\n\nProduce the portfolio-level review JSON. Fill beatQQQ with a concrete, honest plan to outperform QQQ grounded in benchmarkQQQ and the holdings' real numbers.`,
        schema: PortfolioJudgment,
        ...callOpts,
      }),
    }),
    ...batches.map((batch) => async () => ({
      kind: "positions" as const,
      res: await runAssistantJsonLoose({
        system: `${POSITIONS_SYSTEM}\n\nReturn a JSON object with EXACTLY these keys and shapes (example values are illustrative — replace them, keep every key):\n${POSITIONS_SHAPE}`,
        user: `FACTS:\n${JSON.stringify({ ...facts, positions: batch }, null, 1)}\n\nProduce the per-position JSON for EXACTLY these ${batch.length} position(s): ${batch.map((x) => x.t).join(", ")}. One zone, one action, one card and one perStock entry for each.`,
        schema: PositionsJudgment,
        ...callOpts,
      }),
    })),
  ];

  // allSettled, not all: one failed batch must degrade that slice of the dashboard, never discard
  // the whole (expensive) review.
  const settled = await runPool(tasks, MAX_CONCURRENCY, Date.now() + GENERATION_BUDGET_MS);
  const ok = settled.flatMap((r) => (r.status === "fulfilled" ? [r.value] : []));
  const failures = settled.flatMap((r) => (r.status === "rejected" ? [String(r.reason).slice(0, 200)] : []));
  if (failures.length) console.error(`[review] ${failures.length}/${tasks.length} generation call(s) failed:`, failures.join(" | "));
  if (ok.length === 0) {
    // Surface the real cause (e.g. an empty credit balance) instead of a generic "busy".
    const first = settled.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    throw new Error(classifyAiError(first?.reason)?.message ?? "The review couldn't be generated right now. Try again in a moment.");
  }

  const portfolioRes = ok.find((r) => r.kind === "portfolio")?.res as StructuredResult<PortfolioJudgment> | undefined;
  const positionResults = ok.filter((r) => r.kind === "positions").map((r) => r.res as StructuredResult<PositionsJudgment>);

  const usage = ok.reduce(
    (acc, { res: r }) => ({
      inputTokens: acc.inputTokens + r.usage.inputTokens,
      cacheReadTokens: acc.cacheReadTokens + r.usage.cacheReadTokens,
      cacheWriteTokens: acc.cacheWriteTokens + r.usage.cacheWriteTokens,
      outputTokens: acc.outputTokens + r.usage.outputTokens,
    }),
    { inputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, outputTokens: 0 },
  );
  await logUsage("portfolio_review", ok[0].res.model, usage, { userId });

  const pos = {
    cards: positionResults.flatMap((r) => r.value.cards),
    zones: positionResults.flatMap((r) => r.value.zones),
    actions: positionResults.flatMap((r) => r.value.actions),
    perStock: positionResults.flatMap((r) => r.value.perStock),
  };
  const p: PortfolioJudgment = portfolioRes?.value ?? PortfolioJudgment.parse({});
  const value: ReviewJudgment = {
    ...p,
    review: { ...p.review, perStock: pos.perStock },
    zones: pos.zones,
    actions: pos.actions,
    cards: pos.cards,
  };

  // Merge judgment into the code-computed cards by ticker.
  for (const card of cards) {
    card.j = value.cards.find((c) => c.t.toUpperCase() === card.numbers.symbol) ?? null;
  }

  const alltime: AllTime | null = activity
    ? {
        netDeposits: activity.netDeposits,
        realized: activity.realized,
        income: activity.income,
        fees: activity.fees,
        accountValue: metrics.totalValueUsd,
        closed: activity.closed.map((c) => ({ t: c.t, pl: c.pl, note: null })),
        insights: [],
        footnote: activity.endDate ? `From an activity export ending ${activity.endDate}. Deposits after that date aren't counted. Observations, not tax advice — confirm against your 1099-B.` : "From an uploaded activity export. Observations, not tax advice.",
      }
    : null;

  const review: PortfolioReviewV2 = {
    version: 2,
    headline: value.headline,
    thesis: value.thesis,
    score: value.score,
    honestRead: value.honestRead,
    review: value.review,
    beatQQQ: value.beatQQQ,
    nextSteps: value.nextSteps,
    themes: value.themes,
    macro: value.macro,
    events: value.events,
    zones: value.zones,
    actions: value.actions,
    ideas: value.ideas,
    guardrails: value.guardrails,
    cards,
    plan: row.newCashUsd > 0 ? value.plan : null,
    alltime,
    sources: value.sources,
    unverified: value.unverified,
    generatedAt: new Date().toISOString(),
    model,
  };
  await db().portfolio.update({ where: { id: row.id }, data: { review: JSON.stringify(review), reviewAt: new Date() } });
  return review;
}
