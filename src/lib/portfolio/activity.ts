import { isValidSymbol } from "@/lib/data";
import type { Holding } from "@/lib/portfolio/schema";

/** Minimal RFC-4180 CSV parser (handles quoted fields with embedded newlines and commas). */
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

function amount(raw: string): number {
  const neg = /^\(.*\)$/.test(raw.trim());
  const n = Number(raw.replace(/[()$,\s]/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}
function qty(raw: string): number {
  const n = Number(raw.replace(/[,\sS]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

const DEPOSIT_CODES = new Set(["ACH", "RTP", "DCF", "ITRF", "WIRE", "CDEP"]);
const INCOME_CODES = new Set(["CDIV", "INT", "SLIP"]);
const FEE_CODES = new Set(["GOLD"]);
/** Position-changing rows — never treated as a fee even when the description contains "fee" (e.g. "Coffee Holding"). */
const TRADE_CODES = new Set(["BUY", "SELL", "REC", "SPL"]);

interface Lot {
  shares: number;
  cost: number; // total cost of this lot
}

export interface ActivityResult {
  netDeposits: number;
  realized: number;
  income: number;
  fees: number;
  closed: Array<{ t: string; pl: number }>;
  holdings: Holding[]; // current positions derived by FIFO
  endDate: string | null;
  rowCount: number;
  /** Things we couldn't account for (sells with no matching buys, unreadable splits). Optional:
   *  activity stored before this field existed won't have it. */
  warnings?: string[];
}

/** "9/15/2026", "09/15/26" or "2026-09-15" → epoch ms (UTC), or null. */
function parseDate(raw: string): number | null {
  const s = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);
  if (m) return Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/.exec(s);
  if (m) {
    const y = Number(m[3]) < 100 ? 2000 + Number(m[3]) : Number(m[3]);
    return Date.UTC(y, Number(m[1]) - 1, Number(m[2]));
  }
  return null;
}

const EMPTY: ActivityResult = { netDeposits: 0, realized: 0, income: 0, fees: 0, closed: [], holdings: [], endDate: null, rowCount: 0, warnings: [] };

/**
 * Parses a Robinhood-style activity export into all-time figures and current holdings.
 * Columns: Activity Date, Process Date, Settle Date, Instrument, Description, Trans Code, Quantity, Price, Amount.
 */
export function parseActivityCsv(text: string): ActivityResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { ...EMPTY };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.findIndex((h) => h.includes(name));
  const iDate = idx("activity date") >= 0 ? idx("activity date") : 0;
  const iInstr = idx("instrument");
  const iCode = idx("trans code") >= 0 ? idx("trans code") : idx("code");
  const iQty = idx("quantity");
  const iAmt = idx("amount");
  const iDesc = idx("description");
  if (iCode < 0 || iAmt < 0) return { ...EMPTY };

  let netDeposits = 0;
  let income = 0;
  let fees = 0;
  const lots = new Map<string, Lot[]>();
  const realizedBy = new Map<string, number>();
  const warnings: string[] = [];
  let count = 0;

  // FIFO needs oldest-first. Exports come in either order, so sort by the parsed date (string
  // compare of "M/D/YYYY" is wrong). Same-day rows keep their chronological order: if the file is
  // newest-first, flip it before the stable sort.
  const dated = rows
    .slice(1)
    .filter((r) => (r[iDate] ?? "").trim() && (r[iCode] ?? "").trim())
    .map((r) => ({ r, ts: parseDate(r[iDate] ?? "") }))
    .filter((x): x is { r: string[]; ts: number } => x.ts !== null);
  if (dated.length > 1 && dated[0].ts > dated[dated.length - 1].ts) dated.reverse();
  const ordered = [...dated].sort((a, b) => a.ts - b.ts);
  const last = ordered[ordered.length - 1];
  const endDate = last ? (last.r[iDate] ?? "").trim() : null;

  for (const { r } of ordered) {
    const code = (r[iCode] ?? "").trim().toUpperCase();
    const amt = amount(r[iAmt] ?? "");
    const desc = iDesc >= 0 ? (r[iDesc] ?? "").toLowerCase() : "";
    count++;
    if (DEPOSIT_CODES.has(code)) {
      netDeposits += amt;
      continue;
    }
    if (INCOME_CODES.has(code)) {
      income += amt;
      continue;
    }
    if (FEE_CODES.has(code) || (!TRADE_CODES.has(code) && /\bfees?\b/.test(desc))) {
      fees += Math.abs(amt);
      continue;
    }
    const t = iInstr >= 0 ? (r[iInstr] ?? "").trim().toUpperCase() : "";
    if (!t || !isValidSymbol(t)) continue;
    const shares = iQty >= 0 ? qty(r[iQty] ?? "") : 0;
    const arr = lots.get(t) ?? [];
    if (code === "REC") {
      arr.push({ shares, cost: 0 });
      lots.set(t, arr);
      continue;
    }
    if (code === "SPL") {
      // Robinhood books a split as the CHANGE in share count (+90 on a 10-for-1 of 10 shares;
      // negative for a reverse split). Rescale the open lots; total cost basis is unchanged.
      const held = arr.reduce((s, l) => s + l.shares, 0);
      const delta = iQty >= 0 ? amount((r[iQty] ?? "").replace(/S/g, "")) : 0; // signed; "(90)" = -90
      const after = held + delta;
      if (held > 1e-9 && after > 1e-9 && delta !== 0) {
        const ratio = after / held;
        for (const lot of arr) lot.shares *= ratio;
      } else {
        warnings.push(`${t}: couldn't apply a stock split on ${(r[iDate] ?? "").trim()} — check its share count.`);
      }
      continue;
    }
    if (code === "BUY") {
      arr.push({ shares, cost: Math.abs(amt) });
      lots.set(t, arr);
    } else if (code === "SELL") {
      // Match FIFO lots and realize P/L against proceeds (amt is positive).
      let toSell = shares;
      let costOut = 0;
      while (toSell > 1e-9 && arr.length) {
        const lot = arr[0];
        const take = Math.min(lot.shares, toSell);
        const lotUnit = lot.shares > 0 ? lot.cost / lot.shares : 0;
        costOut += take * lotUnit;
        lot.shares -= take;
        lot.cost -= take * lotUnit;
        toSell -= take;
        if (lot.shares <= 1e-9) arr.shift();
      }
      lots.set(t, arr);
      const proceeds = Math.abs(amt);
      // Shares sold that were bought before the export starts have no known cost: booking their
      // proceeds as pure gain would overstate realized P/L, so only the matched part counts.
      const matchedFrac = shares > 0 ? (shares - Math.max(0, toSell)) / shares : 1;
      if (toSell > 1e-6) warnings.push(`${t}: sold ${+toSell.toFixed(4)} share(s) on ${(r[iDate] ?? "").trim()} with no matching buy in this export — their gain/loss isn't counted.`);
      if (matchedFrac > 0) realizedBy.set(t, (realizedBy.get(t) ?? 0) + (proceeds * matchedFrac - costOut));
    }
  }

  const holdings: Holding[] = [];
  for (const [t, arr] of lots) {
    const shares = arr.reduce((s, l) => s + l.shares, 0);
    const cost = arr.reduce((s, l) => s + l.cost, 0);
    if (shares > 1e-6) holdings.push({ symbol: t, shares: Math.round(shares * 1e6) / 1e6, avgCost: shares > 0 ? Math.round((cost / shares) * 100) / 100 : null, valueUsd: null });
  }

  const closed = [...realizedBy.entries()]
    .filter(([t]) => !holdings.some((h) => h.symbol === t))
    .map(([t, pl]) => ({ t, pl: Math.round(pl * 100) / 100 }))
    .sort((a, b) => a.pl - b.pl);

  const realized = [...realizedBy.values()].reduce((s, v) => s + v, 0);

  return {
    netDeposits: Math.round(netDeposits * 100) / 100,
    realized: Math.round(realized * 100) / 100,
    income: Math.round(income * 100) / 100,
    fees: Math.round(fees * 100) / 100,
    closed,
    holdings: holdings.sort((a, b) => (b.shares ?? 0) - (a.shares ?? 0)),
    endDate,
    rowCount: count,
    warnings,
  };
}
