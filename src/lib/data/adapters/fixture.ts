import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { type DataAdapter, type StockData, type SymbolMatch, SymbolNotFoundError } from "@/lib/data/types";
import { normalizeYahoo, type YahooRaw } from "@/lib/data/adapters/yahoo";

/**
 * Serves captured Yahoo responses from tests/fixtures/yahoo_<SYMBOL>.json.
 * Real, sourced data frozen at capture time — used by tests and offline development only.
 * The `fetchedAt`/`asOf` stamps come from the capture, so stale-data flags stay honest.
 */
export class FixtureAdapter implements DataAdapter {
  readonly name = "fixture";
  constructor(private readonly dir = resolve(process.cwd(), "tests/fixtures")) {}

  private load(symbol: string): YahooRaw {
    try {
      return JSON.parse(readFileSync(resolve(this.dir, `yahoo_${symbol.toUpperCase()}.json`), "utf8")) as YahooRaw;
    } catch {
      throw new SymbolNotFoundError(symbol);
    }
  }

  async search(query: string): Promise<SymbolMatch[]> {
    const symbol = query.trim().toUpperCase();
    try {
      const raw = this.load(symbol);
      const q = raw.quote as Record<string, unknown>;
      return [{ symbol, name: String(q.longName ?? symbol), exchange: null, type: "EQUITY" }];
    } catch {
      return [];
    }
  }

  async fetch(symbol: string): Promise<StockData> {
    const raw = this.load(symbol);
    const data = normalizeYahoo(symbol.toUpperCase(), raw, new Date(raw.capturedAt));
    return { ...data, provider: "fixture" };
  }
}
