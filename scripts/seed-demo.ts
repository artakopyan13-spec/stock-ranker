/**
 * One-time: analyze the 5 demo tickers with live data + Claude, verify, and write
 * data/demo/<TICKER>.json (analysis + share token). Costs ~5 analyses. Then commit data/demo.
 *
 *   npm run seed:demo            # all five
 *   npm run seed:demo -- NVDA    # one
 */
import "dotenv/config";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../src/lib/db";
import { DEMO_TICKERS } from "../src/lib/demo";
import { getOrCreateAnalysis } from "../src/lib/analysis/service";

async function main(): Promise<void> {
  const only = process.argv.slice(2).map((s) => s.toUpperCase());
  const tickers = only.length ? only : [...DEMO_TICKERS];
  mkdirSync(resolve(process.cwd(), "data/demo"), { recursive: true });
  const prisma = db();
  for (const symbol of tickers) {
    console.log(`→ ${symbol}`);
    const stored = await getOrCreateAnalysis(symbol, { force: true, onEvent: (e) => e.type === "status" && console.log(`  ${e.message}`) });
    const ticker = await prisma.ticker.update({ where: { symbol }, data: { isDemo: true } });
    const analysis = { ...stored.analysis, meta: { ...stored.analysis.meta, demo: true } };
    writeFileSync(resolve(process.cwd(), `data/demo/${symbol}.json`), JSON.stringify({ shareToken: ticker.shareToken, analysis }, null, 2));
    console.log(`  ${stored.analysis.rating.score}/10 ${stored.analysis.rating.action} · $${stored.analysis.meta.usage.usd.toFixed(3)} · saved data/demo/${symbol}.json`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db().$disconnect());
