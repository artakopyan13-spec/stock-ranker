import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { runAssistantJsonLoose } from "@/lib/ai/assistant";
import { logUsage } from "@/lib/ai/client";
import { Analysis } from "@/lib/analysis/schema";
import { getCompanyData } from "@/lib/data/company-source";
import { loadUniverse } from "@/lib/universe";
import { enrich, getPortfolioRow } from "@/lib/portfolio/store";
import { positionNumbers } from "@/lib/portfolio/kpis";
import { parseActivityCsv } from "@/lib/portfolio/activity";
import { ReviewJudgment, type AllTime, type PortfolioReviewV2, type ReviewCard } from "@/lib/portfolio/review-schema";

const SYSTEM = `You are a portfolio reviewer. You produce the JUDGMENT for a portfolio dashboard; a program supplies every hard number, so never invent figures — reason from the FACTS given.
Follow these rules (from the portfolio-review method):
- FCF FIRST. Every position leads with free cash flow and a ✅/⚠️/❌ verdict. Negative or collapsing FCF is headline risk and an automatic "no new money". For banks/insurers/commodities, say FCF isn't meaningful and judge on P/E, P/B, ROE.
- HONESTY OVER HYPE. Lead with the uncomfortable truth. Say who actually made the money, name the bear case as loudly as the bull, flag cyclicals on peak earnings, never soften a concentration problem. Being down on a good business isn't a reason to sell; being up on a stretched one isn't a reason to add.
- MECHANICAL. Prefer rules with numbers (size caps, FCF gate, price levels, dates) over vibes.
- FRAMEWORK, NOT ADVICE. Ratings, 12-month ranges, allocations and sell/trim calls are your estimates. Never promise outcomes; never give personalized advice — frame as observations and rules.
Sections you must produce (see the schema):
- headline (one-line uncomfortable truth), thesis (2-3 sentences), score 1-10 (construction quality), honestRead (who made money, what's underwater, the concentration fact with numbers).
- themes: 1-2 scoreboard tiles for the dominant factor(s) with % of portfolio.
- macro: exactly 3 boxes (what macro hit hardest · what the market did · wait or buy).
- events: every holding's next earnings/ex-dividend from FACTS (mark vendor estimates est:true), plus known market-wide high-impact releases only if a date is given in FACTS; each with impact and one line to watch. Never invent a date.
- zones: ONE per holding — strongBuyBelow/buyBelow/trimAbove/sellAbove/stopBelow derived from forward EPS × a multiple that fits the growth (15-20x for ~10-15% growers, 25-30x ~25%, 30-35x 40%+; lower for debt/thin FCF/cyclicality), cross-checked with the 52-week range and analyst target. Put the method with real numbers in basis. No earnings → say no buy zone and give only a stop/trim.
- actions: SELL/TRIM/HOLD/ACCUMULATE/NO ADDS per holding with size and why; add a tax note when relevant (short vs long term, harvestable losses, wash-sale traps — observations, not tax advice).
- ideas: 1-3 gap sectors the portfolio lacks. Pick names ONLY from the CANDIDATES list provided; rank picks by fit (FCF quality, valuation, low correlation with holdings); list peer leaders from candidates. Say best-performing isn't best-buy.
- guardrails: numbered rules adapted to the account (size cap ~16%, FCF gate, valuation gate, earnings blackout, theme caps, reserve discipline).
- cards: one JUDGMENT object per holding (tag, tone, rate 1-10, one-liner, fcfHeadline + fcfExplanation, best, bull, bear, trip (up/down tripwire), cat (next catalyst), why (one-line verdict), and forecast fBear/fBase/fBull PRICES built from forward EPS × a stated multiple, cross-checked with the 52-week range).
- plan: only when newCash > 0 — allocations AND tranches that EACH sum to newCash, a why with resulting weights, and noAdds with a one-line reason each.
- review: the plain-English HONEST REVIEW a beginner reads first. grade (a letter, no grade inflation), gradeNote, summary (3-4 plain sentences, say "spare cash" not "FCF", "how expensive it is" not "multiple"), good (3-5 things they're doing right), bad (3-5 things that worry you), suggestions (imperative, may use <b>), perStock (one {t, call, tone, line} per holding — a short plain call and one line). Consistent with plan, zones and actions.
- nextSteps: 4-6 dated, imperative html lines for "What to do, in order" — consistent with the plan, zones and actions (e.g. "<b>Now → Sep 30:</b> buy $600 of X").
- sources (plain text with as-of dates from FACTS), unverified (one line listing anything not in FACTS).
Tone: decisive, brief, specific. No hedging paragraphs.`;

const SHAPE = JSON.stringify({
  headline: "one line",
  thesis: "2-3 sentences",
  score: 6,
  honestRead: "who made the money, what's underwater, the concentration fact",
  review: {
    grade: "C+",
    gradeNote: "overall",
    summary: "3-4 plain sentences, no jargon",
    good: ["what you're doing right"],
    bad: ["what worries me"],
    suggestions: ["<b>Add to X first.</b> reason"],
    perStock: [{ t: "AVGO", call: "Add", tone: "green", line: "Best business you own, on sale." }],
  },
  nextSteps: ["<b>Now → Sep 30:</b> buy $600 of X"],
  themes: [{ label: "AI capex", pct: 100, sub: "all of it", tone: "red" }],
  macro: [{ h: "What hit hardest", p: "one line" }],
  events: [{ date: "2026-11-03", type: "earnings", impact: "high", tickers: ["AMD"], title: "AMD Q3", watch: "data-center growth", est: true }],
  zones: [{ t: "NVDA", strongBuyBelow: 150, buyBelow: 175, trimAbove: 230, sellAbove: null, stopBelow: null, basis: "fwd EPS 5.2 × 30-34x" }],
  actions: [{ action: "HOLD", tone: "gold", position: "NVDA", size: "hold full", why: "reason", tax: "long-term after 2026-04-01" }],
  ideas: [{ sector: "Financials", gap: "0% financials", picks: [{ t: "V", name: "Visa", why: "reason", numbers: "fwd P/E 26x, FCF margin 52%", risk: "regulation" }], leaders: [{ t: "V", name: "Visa", perf1y: "+18%", fwdPe: "26x", fcf: "$18B", note: "toll road" }] }],
  guardrails: ["<b>Size cap:</b> no position above 16%."],
  cards: [{ t: "NVDA", tag: "HOLD", tone: "gold", rate: 7, one: "AI GPUs", fcfHeadline: "$127B TTM · 42% margin", fcfExplanation: "cash machine", best: "AI training", bull: "…", bear: "…", trip: "up: …; down: …", cat: "earnings Nov", why: "one-line verdict", fBear: 150, fBase: 220, fBull: 300 }],
  plan: { allocations: [{ name: "AVGO", amt: 600, why: "cheapest cash machine" }], tranches: [{ name: "Tranche 1", amt: 600, window: "now-Sep 30", buy: "AVGO", logic: "in buy zone" }], noAdds: ["NBIS — burns cash"], why: "leans against the AI concentration" },
  sources: ["Yahoo Finance, as of 2026-09-18"],
  unverified: "anything not in FACTS",
});

function summarizePositions(cards: ReviewCard[], enriched: Awaited<ReturnType<typeof enrich>>["holdings"]) {
  return enriched.map((h) => {
    const n = cards.find((c) => c.numbers.symbol === h.symbol)?.numbers;
    return {
      t: h.symbol,
      name: h.name,
      shares: h.shares,
      avgCost: h.avgCost,
      price: h.price,
      valueUsd: h.valueUsd,
      weightPct: h.weightPct === null ? null : Math.round(h.weightPct * 10) / 10,
      gainPct: h.gainPct === null ? null : Math.round(h.gainPct * 10) / 10,
      sector: h.sector,
      rating: h.rating,
      action: h.action,
      fcf: n ? { icon: n.fcfIcon, ttm: n.fcfTtm, marginPct: n.fcfMarginPct } : null,
      kpis: n ? n.kgroups.map((g) => ({ name: g.name, items: g.items.map((i) => [i.label, i.value]) })) : null,
      hasAnalysis: n?.hasAnalysis ?? false,
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
  const [companies, analysisRows] = await Promise.all([
    Promise.all(symbols.map((s) => getCompanyData(s).catch(() => null))),
    db().analysis.findMany({ where: { symbol: { in: symbols }, verified: true }, orderBy: { version: "desc" } }),
  ]);
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
  const cards: ReviewCard[] = holdings.map((h) => ({ numbers: positionNumbers(h.symbol, companyBy.get(h.symbol) ?? null, analysisBy.get(h.symbol) ?? null), j: null }));

  const heldSectors = new Set(holdings.map((h) => h.sector).filter((s): s is string => Boolean(s)));
  const ideas = await ideaCandidates(heldSectors);

  const activity = row.alltime ? (JSON.parse(row.alltime) as ReturnType<typeof parseActivityCsv>) : null;
  const facts = {
    today: new Date().toISOString().slice(0, 10),
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
  };

  const { value, usage, model } = await runAssistantJsonLoose({
    system: `${SYSTEM}\n\nReturn a JSON object with EXACTLY these keys and shapes (example values are illustrative — replace them, keep every key):\n${SHAPE}`,
    user: `FACTS:\n${JSON.stringify(facts, null, 1)}\n\nProduce the review JSON. One card per position (match t exactly), one zone per position, one perStock entry per position.`,
    schema: ReviewJudgment,
    model: env().ANALYSIS_MODEL,
    effort: "low",
    maxTokens: 24000,
  });
  await logUsage("portfolio_review", model, usage, { userId });

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
