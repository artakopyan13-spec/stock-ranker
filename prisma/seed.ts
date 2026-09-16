/**
 * Loads pre-analyzed demo tickers from data/demo/*.json into the database.
 * Files are produced once by `npm run seed:demo` (needs ANTHROPIC_API_KEY, ~5 model calls)
 * and committed, so a DEMO_MODE deployment serves them with zero keys and zero per-visitor cost.
 */
import "dotenv/config";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "../src/lib/db";
import { Analysis } from "../src/lib/analysis/schema";
import { DEMO_TICKERS } from "../src/lib/demo";

async function main(): Promise<void> {
  const prisma = db();
  const dir = resolve(process.cwd(), "data/demo");
  if (!existsSync(dir)) {
    console.log("data/demo not found — run `npm run seed:demo` with an ANTHROPIC_API_KEY first.");
    return;
  }
  const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
  let loaded = 0;
  for (const file of files) {
    const doc = JSON.parse(readFileSync(resolve(dir, file), "utf8")) as { analysis: unknown; shareToken: string };
    const analysis = Analysis.parse(doc.analysis);
    const symbol = analysis.meta.ticker;
    await prisma.ticker.upsert({
      where: { symbol },
      create: { symbol, name: analysis.meta.companyName, exchange: analysis.meta.exchange, currency: analysis.meta.currency, sector: analysis.meta.sector, industry: analysis.meta.industry, shareToken: doc.shareToken, isDemo: true },
      update: { name: analysis.meta.companyName, isDemo: true, shareToken: doc.shareToken },
    });
    const exists = await prisma.analysis.findFirst({ where: { symbol, source: "seed", promptVersion: analysis.meta.promptVersion } });
    if (exists) continue;
    const last = await prisma.analysis.findFirst({ where: { symbol }, orderBy: { version: "desc" } });
    await prisma.analysis.create({
      data: {
        symbol,
        version: (last?.version ?? 0) + 1,
        promptVersion: analysis.meta.promptVersion,
        model: analysis.meta.model,
        source: "seed",
        payload: JSON.stringify(analysis),
        rating: analysis.rating.score,
        action: analysis.rating.action,
        fcfVerdict: analysis.fcf.verdict,
        fcfMarginPct: analysis.fcf.marginPct.value,
        revenueGrowthPct: analysis.growth.revenueGrowthYoYLatestQ.value,
        forwardPE: analysis.valuation.forwardPE.value,
        priceAtAnalysis: analysis.price.current.value,
        verified: analysis.meta.verification.passed,
        usdCost: 0,
        dataAsOf: new Date(analysis.meta.dataAsOf),
      },
    });
    loaded++;
  }
  const demo = await prisma.watchlist.findUnique({ where: { slug: "demo" } });
  if (!demo && files.length) {
    await prisma.watchlist.create({
      data: { slug: "demo", name: "Demo watchlist", items: { create: DEMO_TICKERS.filter((s) => files.some((f) => f.startsWith(s))).map((symbol, position) => ({ symbol, position })) } },
    });
  }
  console.log(`seed: ${loaded} new demo analyses loaded (${files.length} files).`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db().$disconnect());
