import type { Analysis } from "@/lib/analysis/schema";
import type { CompanyData } from "@/lib/data/company";
import { getLatestAnalysis, isFresh } from "@/lib/analysis/service";
import { getCompanyData } from "@/lib/data/company-source";

/** A compact, numbers-with-provenance view of an analysis for the model to answer strictly from. */
function analysisFacts(a: Analysis): Record<string, unknown> {
  const s = (n: { value: number | null; asOf: string }) => ({ v: n.value, asOf: n.asOf });
  return {
    ticker: a.meta.ticker,
    company: a.meta.companyName,
    sector: a.meta.sector,
    industry: a.meta.industry,
    currency: a.meta.currency,
    analyzedAt: a.meta.analyzedAt.slice(0, 10),
    dataAsOf: a.meta.dataAsOf.slice(0, 10),
    rating: { score: a.rating.score, action: a.rating.action, confidence: a.rating.confidence, why: a.rating.justification },
    price: { current: s(a.price.current), week52Low: s(a.price.week52Low), week52High: s(a.price.week52High), marketCap: s(a.price.marketCap), dilutionFlag: a.price.dilution.flag },
    valuation: { trailingPE: s(a.valuation.trailingPE), forwardPE: s(a.valuation.forwardPE), priceToFcf: s(a.valuation.priceToFcf), evToEbitda: s(a.valuation.evToEbitda), primary: a.valuation.primaryMultiple, peakOnPeak: a.valuation.peakOnPeakCyclical.flag },
    fcf: { ttm: s(a.fcf.ttm), marginPct: s(a.fcf.marginPct), trend: a.fcf.trend, verdict: a.fcf.verdict, why: a.fcf.verdictReason },
    growth: { revenueTTM: s(a.growth.revenueTTM), revenueGrowthYoYPct: s(a.growth.revenueGrowthYoYLatestQ), grossMarginPct: s(a.growth.grossMarginPct), operatingMarginPct: s(a.growth.operatingMarginPct), marginDirection: a.growth.marginDirection },
    balanceSheet: { cash: s(a.balanceSheet.cash), totalDebt: s(a.balanceSheet.totalDebt), netCash: a.balanceSheet.netCash, posture: a.balanceSheet.posture },
    business: a.business,
    thesis: a.thesis,
    catalysts: a.catalysts,
    forecast12m: { bear: a.forecast12m.bear, base: a.forecast12m.base, bull: a.forecast12m.bull },
    tripwire: a.tripwire,
    dataConcerns: a.dataConcerns,
    news: a.news.slice(0, 8).map((n) => ({ date: n.date, headline: n.headline, impact: n.thesisImpact, summary: n.summary })),
  };
}

/** Recent annual financials as compact rows the model can cite. */
function companyFacts(c: CompanyData): Record<string, unknown> {
  return {
    description: c.overview.description?.slice(0, 900) ?? null,
    sector: c.overview.sector,
    industry: c.overview.industry,
    employees: c.overview.employees,
    annual: c.annual.slice(-5).map((r) => ({ fy: r.period.slice(0, 4), revenue: r.revenue, netIncome: r.netIncome, fcf: r.fcf, grossProfit: r.grossProfit, operatingIncome: r.operatingIncome })),
    keyStats: c.overview.keyStats,
  };
}

export interface TickerFacts {
  symbol: string;
  companyName: string;
  hasAnalysis: boolean;
  analyzedAt: string | null;
  facts: Record<string, unknown>;
}

/** Loads the compact, provenance-tagged facts for a ticker from cached analysis + company data. */
export async function tickerFacts(symbol: string): Promise<TickerFacts> {
  const sym = symbol.toUpperCase();
  const [stored, company] = await Promise.all([
    getLatestAnalysis(sym).catch(() => null),
    getCompanyData(sym).catch(() => null),
  ]);
  const facts: Record<string, unknown> = {};
  let companyName = sym;
  if (stored) {
    facts.analysis = analysisFacts(stored.analysis);
    facts.analysisFresh = isFresh(stored);
    companyName = stored.analysis.meta.companyName;
  }
  if (company) facts.company = companyFacts(company);
  return { symbol: sym, companyName, hasAnalysis: Boolean(stored), analyzedAt: stored ? stored.analysis.meta.analyzedAt : null, facts };
}

export interface TickerContext {
  symbol: string;
  companyName: string;
  hasAnalysis: boolean;
  system: string;
}

const COPILOT_RULES = `You are the "Ask this stock" copilot for a source-verified stock research app.
Rules:
- Answer ONLY from the FACTS block below plus general, timeless financial-literacy explanations. Never invent or estimate a specific figure that is not in FACTS.
- If the user asks for a number or fact that is not in FACTS, say you don't have that figure and point them to the tab that would show it (Financials, News, Overview) — do not guess.
- Every figure in FACTS carries an "asOf" date; mention the date when a number could be stale.
- Be concise (a few sentences, or short bullets). Use the currency shown. Round sensibly.
- The rating, forecast and thesis are the model's judgment, not fact. Never tell the user to buy or sell, and never give personalized investment advice — explain the reasoning and the risks instead, and remind them this is research, not financial advice, when they ask what to do.`;

/** Builds the grounded system prompt for the per-ticker copilot from cached analysis + company data. */
export async function tickerContext(symbol: string): Promise<TickerContext> {
  const tf = await tickerFacts(symbol);
  const system = `${COPILOT_RULES}\n\nFACTS for ${tf.symbol}${tf.hasAnalysis ? ` (${tf.companyName})` : ""}:\n${JSON.stringify(tf.facts, null, 1)}`;
  return { symbol: tf.symbol, companyName: tf.companyName, hasAnalysis: tf.hasAnalysis, system };
}

// ---------- portfolio grounding ----------

export interface HeldFacts {
  symbol: string;
  weightPct: number;
  valueUsd: number | null;
  rating: number | null;
  action: string | null;
  fcfVerdict: string | null;
  sector: string | null;
  thesisBear: string | null;
}

/** Builds the grounded system prompt for the portfolio chat from the enriched holdings + review. */
export function portfolioSystem(args: {
  holdings: HeldFacts[];
  cashUsd: number;
  totalValueUsd: number | null;
  notes: string | null;
  review: unknown;
}): string {
  const facts = {
    totalValue: args.totalValueUsd,
    cashUsd: args.cashUsd,
    holdings: args.holdings,
    userNotes: args.notes,
    priorReview: args.review,
  };
  return `You are the portfolio copilot for a source-verified stock research app. The user shared the portfolio in FACTS.
Rules:
- Ground every claim in FACTS: the holdings, their weights, their per-stock AI ratings/verdicts, and the prior review. Do not invent numbers.
- Be honest and specific — name concentration, correlated bets, weak free-cash-flow names, and gaps. This is the point of the tool.
- Where a holding has no AI rating in FACTS, say it hasn't been analyzed yet and suggest analyzing it.
- Never tell the user to buy or sell a specific security and never give personalized investment advice; explain trade-offs, risks and what to watch, and remind them this is research, not financial advice.
- Keep answers concise and skimmable. Amounts are in USD.

FACTS:
${JSON.stringify(facts, null, 1)}`;
}
