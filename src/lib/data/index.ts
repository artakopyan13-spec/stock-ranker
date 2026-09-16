import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { StockData, type DataAdapter, type SymbolMatch, ProviderError } from "@/lib/data/types";
import { YahooAdapter } from "@/lib/data/adapters/yahoo";
import { FmpAdapter } from "@/lib/data/adapters/fmp";
import { FinnhubAdapter } from "@/lib/data/adapters/finnhub";
import { FixtureAdapter } from "@/lib/data/adapters/fixture";

let adapter: DataAdapter | null = null;

/** The configured provider (DATA_PROVIDER). Falls back to Yahoo when a keyed provider has no key. */
export function getAdapter(): DataAdapter {
  if (adapter) return adapter;
  const e = env();
  switch (e.DATA_PROVIDER) {
    case "fmp":
      if (!e.FMP_API_KEY) throw new ProviderError("fmp", "FMP_API_KEY is not set");
      adapter = new FmpAdapter(e.FMP_API_KEY);
      break;
    case "finnhub":
      if (!e.FINNHUB_API_KEY) throw new ProviderError("finnhub", "FINNHUB_API_KEY is not set");
      adapter = new FinnhubAdapter(e.FINNHUB_API_KEY);
      break;
    case "fixture":
      adapter = new FixtureAdapter();
      break;
    default:
      adapter = new YahooAdapter();
  }
  return adapter;
}

/** Test hook. */
export function setAdapter(a: DataAdapter | null): void {
  adapter = a;
}

export async function searchSymbols(query: string): Promise<SymbolMatch[]> {
  const q = query.trim();
  if (!q) return [];
  return getAdapter().search(q);
}

export interface FetchResult {
  data: StockData;
  cached: boolean;
}

/**
 * Returns normalized data for a symbol, served from the RawSnapshot cache when it is
 * younger than RAW_CACHE_MINUTES. Also upserts the Ticker row.
 */
export async function getStockData(symbol: string, opts: { force?: boolean } = {}): Promise<FetchResult> {
  const sym = symbol.toUpperCase();
  const e = env();
  const prisma = db();
  const ttlMs = e.RAW_CACHE_MINUTES * 60_000;

  if (!opts.force) {
    const snap = await prisma.rawSnapshot.findFirst({
      where: { symbol: sym, fetchedAt: { gte: new Date(Date.now() - ttlMs) } },
      orderBy: { fetchedAt: "desc" },
    });
    if (snap) {
      const parsed = StockData.safeParse(JSON.parse(snap.payload));
      if (parsed.success) return { data: parsed.data, cached: true };
    }
  }

  const data = StockData.parse(await getAdapter().fetch(sym));
  await prisma.ticker.upsert({
    where: { symbol: sym },
    create: {
      symbol: sym,
      name: data.companyName,
      exchange: data.exchange,
      currency: data.currency,
      sector: data.sector,
      industry: data.industry,
      shareToken: makeShareToken(sym),
    },
    update: {
      name: data.companyName,
      exchange: data.exchange,
      currency: data.currency,
      sector: data.sector,
      industry: data.industry,
    },
  });
  await prisma.rawSnapshot.create({
    data: { symbol: sym, provider: data.provider, payload: JSON.stringify(data) },
  });
  // Keep the table small: drop snapshots older than a day.
  await prisma.rawSnapshot.deleteMany({
    where: { symbol: sym, fetchedAt: { lt: new Date(Date.now() - 86_400_000) } },
  });
  return { data, cached: false };
}

export function makeShareToken(symbol: string): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(6)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `${symbol.toLowerCase()}-${rand}`;
}
