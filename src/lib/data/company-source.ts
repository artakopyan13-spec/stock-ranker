import YahooFinance from "yahoo-finance2";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SymbolNotFoundError } from "@/lib/data/types";
import {
  type CompanyData,
  type CompanyRaw,
  type PricePoint,
  type PriceRange,
  RANGE_CONFIG,
  normalizeCompany,
  normalizePrices,
} from "@/lib/data/company";

type Rec = Record<string, unknown>;
const noValidate = { validateResult: false as const };

function yf(): InstanceType<typeof YahooFinance> {
  return new YahooFinance({ suppressNotices: ["yahooSurvey"], validation: { logErrors: false } });
}

function fromFixtures(): boolean {
  return env().DATA_PROVIDER === "fixture" || env().DEMO_MODE;
}

async function cacheGet(symbol: string, provider: string, maxAgeMs: number): Promise<unknown | null> {
  const row = await db().rawSnapshot.findFirst({ where: { symbol, provider }, orderBy: { fetchedAt: "desc" } });
  if (!row) return null;
  if (Date.now() - row.fetchedAt.getTime() > maxAgeMs) return null;
  try {
    return JSON.parse(row.payload);
  } catch {
    return null;
  }
}

async function cacheSet(symbol: string, provider: string, payload: unknown): Promise<void> {
  await db().ticker.upsert({ where: { symbol }, create: { symbol, name: symbol, shareToken: `${symbol.toLowerCase()}-${Math.random().toString(16).slice(2, 14)}` }, update: {} });
  await db().rawSnapshot.create({ data: { symbol, provider, payload: JSON.stringify(payload) } });
}

async function fetchCompanyRaw(symbol: string): Promise<CompanyRaw> {
  const y = yf();
  const since = new Date();
  since.setFullYear(since.getFullYear() - 11);
  const p1 = since.toISOString().slice(0, 10);
  const qSince = new Date();
  qSince.setFullYear(qSince.getFullYear() - 3);
  const [annual, quarterly, chart, summary] = await Promise.all([
    y.fundamentalsTimeSeries(symbol, { period1: p1, type: "annual", module: "all" }, noValidate).then((r) => r as Rec[]).catch(() => []),
    y.fundamentalsTimeSeries(symbol, { period1: qSince.toISOString().slice(0, 10), type: "quarterly", module: "all" }, noValidate).then((r) => r as Rec[]).catch(() => []),
    y.chart(symbol, { period1: "2019-01-01", interval: "1mo" }, noValidate).then((r) => ({ quotes: ((r as { quotes?: Rec[] }).quotes ?? []) as Rec[] })).catch(() => ({ quotes: [] })),
    y.quoteSummary(symbol, { modules: ["summaryProfile", "defaultKeyStatistics", "insiderTransactions", "institutionOwnership", "majorHoldersBreakdown", "price", "financialData"] }, noValidate).then((r) => r as Rec).catch(() => ({}) as Rec),
  ]);
  if (!annual.length && !quarterly.length && !Object.keys(summary).length) throw new SymbolNotFoundError(symbol);
  return { capturedAt: new Date().toISOString(), annual, quarterly, chart5y: chart, summary };
}

function loadCompanyFixture(symbol: string): CompanyRaw {
  try {
    return JSON.parse(readFileSync(resolve(process.cwd(), `tests/fixtures/company_${symbol.toUpperCase()}.json`), "utf8")) as CompanyRaw;
  } catch {
    throw new SymbolNotFoundError(symbol);
  }
}

/** Financials + overview + valuation history. Cached 24h in RawSnapshot (provider "company"). */
export async function getCompanyData(symbol: string): Promise<CompanyData> {
  const sym = symbol.toUpperCase();
  if (fromFixtures()) return normalizeCompany(sym, loadCompanyFixture(sym));
  const cached = (await cacheGet(sym, "company", 24 * 3_600_000)) as CompanyRaw | null;
  const raw = cached ?? (await fetchCompanyRaw(sym));
  if (!cached) await cacheSet(sym, "company", raw);
  return normalizeCompany(sym, raw);
}

/** Price history for the interactive price chart. Cached ~1h per range. */
export async function getPriceHistory(symbol: string, range: PriceRange): Promise<PricePoint[]> {
  const sym = symbol.toUpperCase();
  if (fromFixtures()) {
    const raw = loadCompanyFixture(sym);
    return normalizePrices(raw.chart5y.quotes);
  }
  const provider = `prices:${range}`;
  const cached = (await cacheGet(sym, provider, 60 * 60_000)) as { quotes: Rec[] } | null;
  if (cached) return normalizePrices(cached.quotes);
  const cfg = RANGE_CONFIG[range];
  const since = new Date(Date.now() - cfg.years * 365.25 * 86_400_000);
  const y = yf();
  const chart = await y.chart(sym, { period1: since.toISOString().slice(0, 10), interval: cfg.interval }, noValidate).then((r) => ({ quotes: ((r as { quotes?: Rec[] }).quotes ?? []) as Rec[] })).catch(() => ({ quotes: [] }));
  await cacheSet(sym, provider, chart);
  return normalizePrices(chart.quotes);
}
