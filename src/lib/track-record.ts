import { db } from "@/lib/db";
import { getQuotes } from "@/lib/data/quotes";

export interface CallRow {
  symbol: string;
  date: string; // YYYY-MM-DD the call was made
  rating: number;
  action: string; // BUY | HOLD | SELL
  confidence: string;
  entryPrice: number;
  currentPrice: number;
  returnPct: number; // price change since the call, to today
  days: number;
}

export interface Bucket {
  label: string;
  n: number;
  avgReturnPct: number | null;
  winRatePct: number | null; // share with return in the "right" direction for the group
}

export interface TrackRecord {
  generatedAt: string;
  totalCalls: number;
  scoredCalls: number; // calls we could price (entry + current known)
  tickers: number;
  firstCall: string | null;
  avgHoldingDays: number | null;
  avgReturnPct: number | null;
  byAction: Bucket[]; // BUY / HOLD / SELL
  byConfidence: Bucket[]; // low / medium / high
  byRating: Bucket[]; // 8-10 / 6-7 / 1-5
  spreadPct: number | null; // avg return of high-rated (>=7) minus low-rated (<5) — the real signal
  scatter: Array<{ rating: number; returnPct: number; symbol: string; action: string }>;
  rows: CallRow[];
}

const dir = (action: string): 1 | -1 | 0 => (action === "BUY" ? 1 : action === "SELL" ? -1 : 0);

function bucket(label: string, rows: CallRow[], winFn: (r: CallRow) => boolean | null): Bucket {
  const n = rows.length;
  if (!n) return { label, n: 0, avgReturnPct: null, winRatePct: null };
  const avg = rows.reduce((s, r) => s + r.returnPct, 0) / n;
  const decided = rows.map(winFn).filter((v): v is boolean => v !== null);
  const winRate = decided.length ? (decided.filter(Boolean).length / decided.length) * 100 : null;
  return { label, n, avgReturnPct: avg, winRatePct: winRate };
}

// Directional win: BUY wants up, SELL wants down; HOLD is undecidable (null).
const directionalWin = (r: CallRow): boolean | null => {
  const d = dir(r.action);
  if (d === 0) return null;
  return d === 1 ? r.returnPct > 0 : r.returnPct < 0;
};

/**
 * Grades every past verified rating against where the stock trades today. This is the app's
 * honesty layer: no cost, no model call — just stored calls (priceAtAnalysis) vs live quotes.
 * Returns differ in horizon (each call has its own age), which the UI states plainly.
 */
export async function computeTrackRecord(): Promise<TrackRecord> {
  const analyses = await db().analysis.findMany({
    where: { verified: true, priceAtAnalysis: { not: null } },
    orderBy: { createdAt: "asc" },
    select: { symbol: true, rating: true, action: true, priceAtAnalysis: true, createdAt: true, payload: true },
  });

  const symbols = [...new Set(analyses.map((a) => a.symbol))];
  const quotes = symbols.length ? await getQuotes(symbols) : [];
  const priceBySymbol = new Map(quotes.map((q) => [q.symbol, q.price]));

  const now = Date.now();
  const rows: CallRow[] = [];
  for (const a of analyses) {
    const entry = a.priceAtAnalysis;
    const current = priceBySymbol.get(a.symbol) ?? null;
    if (entry === null || entry <= 0 || current === null || current <= 0) continue;
    let confidence = "medium";
    try {
      confidence = (JSON.parse(a.payload) as { rating?: { confidence?: string } }).rating?.confidence ?? "medium";
    } catch {
      /* keep default */
    }
    rows.push({
      symbol: a.symbol,
      date: a.createdAt.toISOString().slice(0, 10),
      rating: a.rating,
      action: a.action,
      confidence,
      entryPrice: entry,
      currentPrice: current,
      returnPct: ((current - entry) / entry) * 100,
      days: Math.max(0, Math.round((now - a.createdAt.getTime()) / 86_400_000)),
    });
  }

  const scored = rows.length;
  const avgReturn = scored ? rows.reduce((s, r) => s + r.returnPct, 0) / scored : null;
  const avgDays = scored ? rows.reduce((s, r) => s + r.days, 0) / scored : null;

  const byAction = ["BUY", "HOLD", "SELL"].map((act) => bucket(act, rows.filter((r) => r.action === act), directionalWin));
  const byConfidence = ["high", "medium", "low"].map((c) => bucket(c, rows.filter((r) => r.confidence === c), directionalWin));
  const byRating = [
    bucket("Strong (8-10)", rows.filter((r) => r.rating >= 8), (r) => r.returnPct > 0),
    bucket("Neutral (6-7)", rows.filter((r) => r.rating >= 6 && r.rating < 8), (r) => r.returnPct > 0),
    bucket("Weak (1-5)", rows.filter((r) => r.rating < 6), (r) => r.returnPct < 0),
  ];

  const high = rows.filter((r) => r.rating >= 7);
  const low = rows.filter((r) => r.rating < 5);
  const spread = high.length && low.length ? high.reduce((s, r) => s + r.returnPct, 0) / high.length - low.reduce((s, r) => s + r.returnPct, 0) / low.length : null;

  return {
    generatedAt: new Date().toISOString(),
    totalCalls: analyses.length,
    scoredCalls: scored,
    tickers: symbols.length,
    firstCall: rows.length ? rows.reduce((min, r) => (r.date < min ? r.date : min), rows[0].date) : null,
    avgHoldingDays: avgDays,
    avgReturnPct: avgReturn,
    byAction,
    byConfidence,
    byRating,
    spreadPct: spread,
    scatter: rows.map((r) => ({ rating: r.rating, returnPct: r.returnPct, symbol: r.symbol, action: r.action })),
    rows: [...rows].sort((a, b) => b.date.localeCompare(a.date)),
  };
}
