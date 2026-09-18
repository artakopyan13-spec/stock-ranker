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
}

/**
 * Parses a Robinhood-style activity export into all-time figures and current holdings.
 * Columns: Activity Date, Process Date, Settle Date, Instrument, Description, Trans Code, Quantity, Price, Amount.
 */
export function parseActivityCsv(text: string): ActivityResult {
  const rows = parseCsv(text);
  if (rows.length < 2) return { netDeposits: 0, realized: 0, income: 0, fees: 0, closed: [], holdings: [], endDate: null, rowCount: 0 };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name: string) => header.findIndex((h) => h.includes(name));
  const iDate = idx("activity date") >= 0 ? idx("activity date") : 0;
  const iInstr = idx("instrument");
  const iCode = idx("trans code") >= 0 ? idx("trans code") : idx("code");
  const iQty = idx("quantity");
  const iAmt = idx("amount");
  if (iCode < 0 || iAmt < 0) return { netDeposits: 0, realized: 0, income: 0, fees: 0, closed: [], holdings: [], endDate: null, rowCount: 0 };

  let netDeposits = 0;
  let income = 0;
  let fees = 0;
  const lots = new Map<string, Lot[]>();
  const realizedBy = new Map<string, number>();
  let endDate: string | null = null;
  let count = 0;

  // Oldest-first for FIFO: exports are usually newest-first.
  const body = rows.slice(1).filter((r) => (r[iDate] ?? "").trim() && (r[iCode] ?? "").trim());
  const ordered = [...body].reverse();

  for (const r of body) {
    const d = (r[iDate] ?? "").trim();
    if (d && (!endDate || d > endDate)) endDate = d;
  }

  for (const r of ordered) {
    const code = (r[iCode] ?? "").trim().toUpperCase();
    const amt = amount(r[iAmt] ?? "");
    const desc = (r[header.findIndex((h) => h.includes("description"))] ?? "").toLowerCase();
    count++;
    if (DEPOSIT_CODES.has(code)) {
      netDeposits += amt;
      continue;
    }
    if (INCOME_CODES.has(code)) {
      income += amt;
      continue;
    }
    if (FEE_CODES.has(code) || desc.includes("fee")) {
      fees += Math.abs(amt);
      continue;
    }
    const t = iInstr >= 0 ? (r[iInstr] ?? "").trim().toUpperCase() : "";
    if (!t || !isValidSymbol(t)) continue;
    const shares = iQty >= 0 ? qty(r[iQty] ?? "") : 0;
    if (code === "REC") {
      const arr = lots.get(t) ?? [];
      arr.push({ shares, cost: 0 });
      lots.set(t, arr);
      continue;
    }
    if (code === "BUY" || code === "SELL") {
      const arr = lots.get(t) ?? [];
      if (code === "BUY") {
        arr.push({ shares, cost: Math.abs(amt) });
        lots.set(t, arr);
      } else {
        // SELL: match FIFO lots, realize P/L against proceeds (amt is positive).
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
        realizedBy.set(t, (realizedBy.get(t) ?? 0) + (proceeds - costOut));
      }
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
  };
}
