import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getLatestAnalysis, isFresh } from "@/lib/analysis/service";
import { currentUser } from "@/auth";
import { AnalysisStream } from "@/components/AnalysisStream";
import { CompanyTabs } from "@/components/company";
import { AddToWatchlist } from "@/components/AddToWatchlist";
import { ExcelExportButton } from "@/components/ExcelExportButton";
import { StockKpiStrip } from "@/components/StockKpiStrip";
import { getCachedDeep } from "@/lib/deep/run";
import { getStockData } from "@/lib/data";
import { SymbolNotFoundError } from "@/lib/data/types";
import { shareUrlFor } from "@/lib/share";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/t/[ticker]">): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} analysis` };
}

export default async function TickerPage({ params }: PageProps<"/t/[ticker]">) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();
  if (!/^[A-Z0-9.\-^=]{1,12}$/.test(symbol)) notFound();
  const e = env();
  const [stored, user, cachedDeep] = await Promise.all([getLatestAnalysis(symbol), currentUser(), getCachedDeep(symbol).catch(() => null)]);
  if (e.DEMO_MODE && !stored) notFound();
  const tickerRow = await db().ticker.findUnique({ where: { symbol } });
  // Never seen this symbol: confirm it exists so a typo gets a real 404, not a 200 "not found" page.
  // The snapshot this caches is reused by the analysis run that follows, so it isn't wasted.
  if (!stored && !tickerRow) {
    try {
      await getStockData(symbol);
    } catch (err) {
      if (err instanceof SymbolNotFoundError) notFound();
      // Other provider failures: let the analysis view surface them.
    }
  }
  const shareUrl = tickerRow ? shareUrlFor("", tickerRow.shareToken) : null;
  // Only auto-start a (paid) run when there is no analysis at all. A stale one is shown as-is with
  // a Refresh button — merely visiting must never spend a user's credit or anonymous free try.
  const autoStart = !e.DEMO_MODE && !stored;
  const analysis = (
    <AnalysisStream ticker={symbol} initialAnalysis={stored?.analysis ?? null} stale={!!stored && !e.DEMO_MODE && !isFresh(stored)} shareUrl={shareUrl} autoStart={autoStart} signedIn={!!user} />
  );
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="text-lg font-semibold">{symbol}</div>
        <div className="flex items-center gap-2">
          {!e.DEMO_MODE && <ExcelExportButton symbol={symbol} />}
          {!e.DEMO_MODE && <AddToWatchlist symbol={symbol} />}
        </div>
      </div>
      {stored && <StockKpiStrip analysis={stored.analysis} deepOverall={cachedDeep?.scorecard.overall ?? null} />}
      <CompanyTabs symbol={symbol} analysis={analysis} signedIn={!!user} />
    </div>
  );
}
