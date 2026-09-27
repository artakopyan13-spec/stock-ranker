import YahooFinance from "yahoo-finance2";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"], validation: { logErrors: false } });

export interface Quote {
  label: string;
  symbol: string;
  value: number | null; // yield % for rates, index level for indices
  changePct: number | null; // day change %
}

const TREASURIES: [string, string][] = [
  ["^IRX", "13-week bill"],
  ["^FVX", "5-year"],
  ["^TNX", "10-year"],
  ["^TYX", "30-year"],
];
const INDICES: [string, string][] = [
  ["^GSPC", "S&P 500"],
  ["^IXIC", "Nasdaq"],
  ["^DJI", "Dow Jones"],
  ["^VIX", "VIX (fear)"],
];

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

async function one([symbol, label]: [string, string]): Promise<Quote> {
  try {
    const q = (await yf.quote(symbol)) as unknown as Record<string, unknown>;
    return { label, symbol, value: num(q.regularMarketPrice), changePct: num(q.regularMarketChangePercent) };
  } catch {
    return { label, symbol, value: null, changePct: null };
  }
}

/** Live Treasury yields and the headline indices from Yahoo (free, no key). */
export async function fetchYields(): Promise<{ yields: Quote[]; indices: Quote[] }> {
  const [yields, indices] = await Promise.all([Promise.all(TREASURIES.map(one)), Promise.all(INDICES.map(one))]);
  return { yields, indices };
}
