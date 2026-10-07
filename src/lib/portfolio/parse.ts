import { isValidSymbol } from "@/lib/data";
import type { Holding } from "@/lib/portfolio/schema";

const STOPWORDS = new Set(["SHARES", "SHARE", "QTY", "QUANTITY", "SYMBOL", "TICKER", "COST", "PRICE", "AVG", "VALUE", "TOTAL", "CASH", "USD", "X", "AT"]);
const num = (s: string): number => Number(s.replace(/[,$]/g, ""));

/** Parse one line into a holding, or null. Handles "AAPL 10", "NVDA 5 @ 400", "$5,000 MSFT", "AAPL,10,150". */
export function parseLine(raw: string): Holding | null {
  const line = raw.trim();
  if (!line || /^[#/]/.test(line)) return null;

  // Symbol = a plausible ticker token (a leading "$" cashtag is fine) that isn't a header word.
  // Prefer an ALL-CAPS token so "Apple AAPL 10" picks AAPL, not "APPLE".
  const tokens = line.split(/[\s,;|]+/).filter(Boolean).map((t) => t.replace(/^\$/, ""));
  const candidates = tokens.filter((t) => /^[A-Za-z][A-Za-z.\-]{0,6}$/.test(t) && !STOPWORDS.has(t.toUpperCase()) && isValidSymbol(t.toUpperCase()));
  const symTok = candidates.find((t) => t === t.toUpperCase()) ?? candidates[0];
  if (!symTok) return null;
  const symbol = symTok.toUpperCase();

  // avgCost: number after "@" (optionally $-prefixed).
  const atMatch = line.match(/@\s*\$?([\d,]+(?:\.\d+)?)/);
  const avgCost = atMatch ? num(atMatch[1]) : null;

  // A "$5,000" style amount marks a dollar-value position.
  const dollarMatch = line.match(/\$\s*([\d,]+(?:\.\d+)?)/);
  const dollarAmt = dollarMatch && (!atMatch || !line.slice(0, dollarMatch.index).includes("@")) ? num(dollarMatch[1]) : null;

  // Remaining bare numbers (exclude the symbol, the @cost, and any $-amount).
  // The lookbehind rejects a run that starts mid-number (after a digit, comma or dot) or after $/@,
  // so "$15,000" is never mis-read as "5,000".
  const withoutAt = atMatch ? line.replace(atMatch[0], " ") : line;
  const bareNums = [...withoutAt.matchAll(/(?<![\w@$.,])(\d[\d,]*(?:\.\d+)?)/g)].map((m) => num(m[1])).filter((n) => Number.isFinite(n));

  // If the only number is a $ amount, treat it as value; otherwise the first bare number is shares.
  if (dollarAmt !== null && bareNums.length <= 1 && (bareNums.length === 0 || bareNums[0] === dollarAmt)) {
    return { symbol, shares: null, avgCost, valueUsd: dollarAmt };
  }
  const shares = bareNums.length ? bareNums[0] : null;
  const cost = avgCost ?? (bareNums.length >= 2 ? bareNums[1] : null);
  if (shares === null && dollarAmt === null) return { symbol, shares: null, avgCost: cost, valueUsd: null };
  return { symbol, shares, avgCost: cost, valueUsd: shares === null ? dollarAmt : null };
}

/** Parse pasted text (one holding per line, or comma-separated on a single line), counting the
 *  non-blank, non-comment lines that couldn't be read so the UI can say "skipped N". */
export function parseHoldingsWithStats(text: string): { holdings: Holding[]; skipped: number } {
  const lines = text.includes("\n") ? text.split(/\r?\n/) : text.split(/,(?=\s*\$?[A-Za-z])/);
  const bySymbol = new Map<string, Holding>();
  let skipped = 0;
  for (const line of lines) {
    const h = parseLine(line);
    if (h) {
      if (!bySymbol.has(h.symbol)) bySymbol.set(h.symbol, h);
    } else if (line.trim() && !/^[#/]/.test(line.trim())) skipped++;
  }
  return { holdings: [...bySymbol.values()].slice(0, 60), skipped };
}

export function parseHoldings(text: string): Holding[] {
  return parseHoldingsWithStats(text).holdings;
}
