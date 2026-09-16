import { daysBetween, type SourcedNumber, type StockData } from "@/lib/data/types";
import {
  Analysis,
  DISCLAIMER,
  SCHEMA_VERSION,
  bandForScore,
  type FcfVerdict,
  type ModelOutput,
  type Trend,
  type Usage,
  type Verification,
} from "@/lib/analysis/schema";

export interface AssembleMeta {
  promptVersion: string;
  model: string;
  usage: Usage;
  analyzedAt: Date;
  demo: boolean;
  previousTripwireDescription: string | null;
}

/** Everything that can be computed from data alone — rendered instantly while the model runs. */
export type DataSections = Pick<Analysis, "price" | "growth" | "balanceSheet"> & {
  valuation: Omit<Analysis["valuation"], "primaryMultiple" | "peakOnPeakCyclical">;
  fcf: Omit<Analysis["fcf"], "verdictReason">;
  meta: Pick<Analysis["meta"], "ticker" | "companyName" | "exchange" | "currency" | "sector" | "industry" | "dataAsOf" | "dataProvider" | "staleData">;
};

const STALE_DAYS = 7;

function pctChange(now: number | null, before: number | null): number | null {
  if (now === null || before === null || before === 0) return null;
  return ((now - before) / Math.abs(before)) * 100;
}

function trendOf(values: Array<number | null>): Trend {
  const clean = values.filter((v): v is number => v !== null);
  if (clean.length < 2) return "unknown";
  if (clean.length >= 8) {
    const recent = clean.slice(-4).reduce((a, b) => a + b, 0);
    const prior = clean.slice(-8, -4).reduce((a, b) => a + b, 0);
    const d = pctChange(recent, prior);
    if (d === null) return "unknown";
    return d > 5 ? "improving" : d < -5 ? "deteriorating" : "stable";
  }
  if (clean.length >= 5) {
    const d = pctChange(clean[clean.length - 1], clean[clean.length - 5]);
    if (d === null) return "unknown";
    return d > 5 ? "improving" : d < -5 ? "deteriorating" : "stable";
  }
  const d = pctChange(clean[clean.length - 1], clean[clean.length - 2]);
  if (d === null) return "unknown";
  return d > 5 ? "improving" : d < -5 ? "deteriorating" : "stable";
}

function fcfVerdictOf(ttm: number | null, marginPct: number | null, trend: Trend): FcfVerdict {
  if (ttm === null) return "unverified";
  if (ttm < 0) return "negative";
  if ((marginPct !== null && marginPct < 5) || trend === "deteriorating") return "thin";
  return "healthy";
}

function isStale(s: SourcedNumber, today: string): boolean {
  return s.value !== null && daysBetween(s.asOf, today) > STALE_DAYS;
}

/** Derives every code-owned section from StockData. Pure. */
export function deriveDataSections(data: StockData, now: Date = new Date()): DataSections {
  const today = now.toISOString().slice(0, 10);
  const q = data.quote;
  const f = data.fundamentals;
  const quarters = data.quarters;
  const latest = quarters[quarters.length - 1];

  const price = q.price.value;
  const lo = q.week52Low.value;
  const hi = q.week52High.value;
  const positionIn52wRangePct =
    price !== null && lo !== null && hi !== null && hi > lo ? ((price - lo) / (hi - lo)) * 100 : null;

  const sharesNow = latest?.sharesOutstanding ?? null;
  const sharesYearAgo = quarters.length >= 5 ? quarters[quarters.length - 5].sharesOutstanding : null;
  const sharesChangeYoYPct = pctChange(sharesNow, sharesYearAgo);
  const dilutionFlag = sharesChangeYoYPct !== null && sharesChangeYoYPct > 2;

  const revenueHistory = quarters.map((row, i) => ({
    period: row.period,
    revenue: row.revenue,
    yoyPct: i >= 4 ? pctChange(row.revenue, quarters[i - 4].revenue) : null,
  }));
  const marginHistory = quarters.map((row) => ({
    period: row.period,
    grossPct: row.revenue && row.grossProfit !== null ? (row.grossProfit / row.revenue) * 100 : null,
    operatingPct: row.revenue && row.operatingIncome !== null ? (row.operatingIncome / row.revenue) * 100 : null,
  }));
  const marginDirection = trendOf(marginHistory.map((m) => m.operatingPct));

  const fcfHistory = quarters.map((row) => ({
    period: row.period,
    fcf: row.fcf,
    marginPct: row.revenue && row.fcf !== null ? (row.fcf / row.revenue) * 100 : null,
  }));
  const fcfTrend = trendOf(fcfHistory.map((h) => h.fcf));
  const fcfMargin =
    f.fcfTTM.value !== null && f.revenueTTM.value ? (f.fcfTTM.value / f.revenueTTM.value) * 100 : null;
  const verdict = fcfVerdictOf(f.fcfTTM.value, fcfMargin, fcfTrend);

  const cash = f.cash.value;
  const debt = f.totalDebt.value;
  const netCash = cash !== null && debt !== null ? cash - debt : null;

  const staleData =
    isStale(q.price, today) || data.news.some((n) => daysBetween(n.date, today) > STALE_DAYS);

  return {
    meta: {
      ticker: data.symbol,
      companyName: data.companyName,
      exchange: data.exchange,
      currency: data.currency,
      sector: data.sector,
      industry: data.industry,
      dataAsOf: data.fetchedAt,
      dataProvider: data.provider,
      staleData,
    },
    price: {
      current: q.price,
      dayChangePct: q.dayChangePct,
      week52Low: q.week52Low,
      week52High: q.week52High,
      positionIn52wRangePct,
      marketCap: q.marketCap,
      sharesOutstanding: q.sharesOutstanding,
      dilution: {
        flag: dilutionFlag,
        sharesChangeYoYPct,
        note:
          sharesChangeYoYPct === null
            ? "Share count history unverified."
            : dilutionFlag
              ? `Share count up ${sharesChangeYoYPct.toFixed(1)}% year over year.`
              : `Share count ${sharesChangeYoYPct >= 0 ? "up" : "down"} ${Math.abs(sharesChangeYoYPct).toFixed(1)}% year over year.`,
      },
    },
    valuation: {
      trailingPE: data.valuation.trailingPE,
      forwardPE: data.valuation.forwardPE,
      evToEbitda: data.valuation.evToEbitda,
      priceToSales: data.valuation.priceToSales,
      priceToFcf: data.valuation.priceToFcf,
      priceToBook: data.valuation.priceToBook,
    },
    growth: {
      revenueTTM: f.revenueTTM,
      revenueGrowthYoYLatestQ: f.revenueGrowthYoYPct,
      revenueHistory,
      grossMarginPct: f.grossMarginPct,
      operatingMarginPct: f.operatingMarginPct,
      marginHistory,
      marginDirection,
    },
    fcf: {
      ttm: f.fcfTTM,
      latestQuarter: {
        value: latest?.fcf ?? null,
        source: latest?.source ?? f.fcfTTM.source,
        url: f.fcfTTM.url,
        asOf: latest?.period ?? f.fcfTTM.asOf,
      },
      marginPct: { value: fcfMargin, source: `Derived: TTM FCF ÷ TTM revenue (${f.fcfTTM.source})`, url: f.fcfTTM.url, asOf: f.fcfTTM.asOf },
      history: fcfHistory,
      trend: fcfTrend,
      verdict,
      headlineRisk: verdict === "negative" || fcfTrend === "deteriorating",
    },
    balanceSheet: {
      cash: f.cash,
      totalDebt: f.totalDebt,
      netCash,
      posture: netCash === null ? "unknown" : netCash >= 0 ? "net_cash" : "net_debt",
      selfFundsCapex: f.fcfTTM.value === null ? null : f.fcfTTM.value > 0,
      buybacksTTM: f.buybacksTTM,
      netShareIssuanceTTM: f.netShareIssuanceTTM,
      capitalActions: null,
    },
  };
}

function collectSources(data: StockData): Analysis["sources"] {
  const map = new Map<string, Analysis["sources"][number]>();
  const add = (s: SourcedNumber, usedFor: string) => {
    if (s.value === null) return;
    const key = `${s.source}|${s.asOf}`;
    const existing = map.get(key);
    if (existing) {
      if (!existing.usedFor.includes(usedFor)) existing.usedFor.push(usedFor);
      return;
    }
    map.set(key, { id: `s${map.size + 1}`, name: s.source, url: s.url, asOf: s.asOf, usedFor: [usedFor] });
  };
  for (const [k, v] of Object.entries(data.quote)) add(v, k);
  for (const [k, v] of Object.entries(data.valuation)) add(v, k);
  for (const [k, v] of Object.entries(data.fundamentals)) add(v, k);
  if (data.quarters.length) {
    const q = data.quarters[data.quarters.length - 1];
    map.set(`${q.source}|${q.period}`, {
      id: `s${map.size + 1}`,
      name: q.source,
      url: null,
      asOf: q.period,
      usedFor: ["quarterly history"],
    });
  }
  for (const n of data.news) {
    map.set(`${n.source}|${n.date}|${n.url}`, {
      id: `s${map.size + 1}`,
      name: n.source,
      url: n.url,
      asOf: n.date,
      usedFor: ["news"],
    });
  }
  return [...map.values()];
}

/** Merges the model's judgment into the data-derived sections. Numbers never come from `model`. */
export function assembleAnalysis(
  data: StockData,
  model: ModelOutput,
  meta: AssembleMeta,
  verification: Verification,
): Analysis {
  const d = deriveDataSections(data, meta.analyzedAt);
  const price = data.quote.price.value;
  const target = (returnPct: number): number | null =>
    price === null ? null : Math.round(price * (1 + returnPct / 100) * 100) / 100;
  const modelNews = new Map(model.news.map((n) => [n.id, n]));

  const analysis: Analysis = {
    meta: {
      schemaVersion: SCHEMA_VERSION,
      promptVersion: meta.promptVersion,
      ...d.meta,
      analyzedAt: meta.analyzedAt.toISOString(),
      model: meta.model,
      usage: meta.usage,
      verification,
      demo: meta.demo,
    },
    price: d.price,
    valuation: {
      ...d.valuation,
      primaryMultiple: model.valuation.primaryMultiple,
      peakOnPeakCyclical: model.valuation.peakOnPeakCyclical,
    },
    growth: d.growth,
    fcf: { ...d.fcf, verdictReason: model.fcfVerdictReason },
    balanceSheet: { ...d.balanceSheet, capitalActions: model.capitalActions },
    news: data.news.map((n) => {
      const m = modelNews.get(n.id);
      return {
        ...n,
        category: m?.category ?? "other",
        thesisImpact: m?.thesisImpact ?? "neutral",
        summary: m?.summary ?? n.summary,
      };
    }),
    newsSource: data.newsSource,
    newsScanNote: model.newsScanNote,
    business: model.business,
    thesis: model.thesis,
    catalysts: model.catalysts,
    rating: {
      score: Math.round(model.rating.score),
      band: bandForScore(Math.round(model.rating.score)),
      action: model.rating.action,
      justification: model.rating.justification,
      confidence: model.rating.confidence,
      isEstimate: true,
    },
    forecast12m: {
      bear: { ...model.forecast12m.bear, priceTarget: target(model.forecast12m.bear.returnPct) },
      base: { ...model.forecast12m.base, priceTarget: target(model.forecast12m.base.returnPct) },
      bull: { ...model.forecast12m.bull, priceTarget: target(model.forecast12m.bull.returnPct) },
      horizonMonths: 12,
      isEstimate: true,
    },
    tripwire: model.tripwire,
    previousTripwire:
      meta.previousTripwireDescription && model.previousTripwire
        ? { description: meta.previousTripwireDescription, ...model.previousTripwire }
        : null,
    dataConcerns: model.dataConcerns,
    sources: collectSources(data),
    disclaimer: DISCLAIMER,
  };
  return Analysis.parse(analysis);
}
