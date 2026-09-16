import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getLatestAnalysis, isFresh } from "@/lib/analysis/service";
import { AnalysisStream } from "@/components/AnalysisStream";
import { CompanyTabs } from "@/components/company";
import { shareUrlFor } from "@/lib/share";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/t/[ticker]">): Promise<Metadata> {
  const { ticker } = await params;
  return { title: `${ticker.toUpperCase()} analysis` };
}

export default async function TickerPage({ params, searchParams }: PageProps<"/t/[ticker]">) {
  const { ticker } = await params;
  const sp = await searchParams;
  const symbol = ticker.toUpperCase();
  if (!/^[A-Z0-9.\-^=]{1,12}$/.test(symbol)) notFound();
  const e = env();
  const stored = await getLatestAnalysis(symbol);
  if (e.DEMO_MODE && !stored) notFound();
  const tickerRow = await db().ticker.findUnique({ where: { symbol } });
  const shareUrl = tickerRow ? shareUrlFor("", tickerRow.shareToken) : null;
  const fresh = stored ? isFresh(stored) : false;
  const autoStart = !e.DEMO_MODE && (!stored || !fresh || sp.refresh === "1");
  const analysis = (
    <div className="space-y-4">
      {stored && !fresh && !e.DEMO_MODE && <div className="text-xs text-muted">Cached analysis is older than {e.ANALYSIS_TTL_HOURS}h — refreshing automatically.</div>}
      <AnalysisStream ticker={symbol} initialAnalysis={stored && (fresh || e.DEMO_MODE) ? stored.analysis : null} shareUrl={shareUrl} autoStart={autoStart} />
    </div>
  );
  return <CompanyTabs symbol={symbol} analysis={analysis} />;
}
