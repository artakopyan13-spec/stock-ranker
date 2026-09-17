import YahooFinance from "yahoo-finance2";

export interface Quote {
  symbol: string;
  name: string;
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
}

type Rec = Record<string, unknown>;
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Lightweight batch quotes for the heatmap: price, day change %, market cap. One Yahoo call. */
export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  const clean = [...new Set(symbols.map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z0-9.\-^=]{1,12}$/.test(s)))].slice(0, 60);
  if (!clean.length) return [];
  const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"], validation: { logErrors: false } });
  let rows: Rec[] = [];
  try {
    const res = await yf.quote(clean, {}, { validateResult: false });
    rows = (Array.isArray(res) ? res : [res]) as Rec[];
  } catch {
    return clean.map((symbol) => ({ symbol, name: symbol, price: null, changePct: null, marketCap: null }));
  }
  const bySym = new Map(rows.map((r) => [String(r.symbol), r]));
  return clean.map((symbol) => {
    const r = bySym.get(symbol);
    return {
      symbol,
      name: r ? String(r.shortName ?? r.longName ?? symbol) : symbol,
      price: r ? num(r.regularMarketPrice) : null,
      changePct: r ? num(r.regularMarketChangePercent) : null,
      marketCap: r ? num(r.marketCap) : null,
    };
  });
}
