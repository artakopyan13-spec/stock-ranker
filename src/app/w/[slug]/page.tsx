import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { getRankings } from "@/lib/rankings";
import { WatchlistTools } from "@/components/WatchlistTools";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/w/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  return { title: `Rankings · ${slug}` };
}

export default async function WatchlistPage({ params }: PageProps<"/w/[slug]">) {
  const { slug } = await params;
  const rankings = await getRankings(slug);
  if (!rankings) notFound();
  const e = env();
  const analyzed = rankings.rows.filter((r) => r.analysisId).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold">{rankings.watchlist.name}</h1>
        <span className="text-sm text-muted">
          {analyzed}/{rankings.rows.length} analyzed · ranked by rating
        </span>
        {rankings.bestRiskAdjusted && (
          <span className="chip chip-green">
            best risk-adjusted: <Link href={`/t/${rankings.bestRiskAdjusted}`} className="text-green">{rankings.bestRiskAdjusted}</Link>
          </span>
        )}
        <span className="ml-auto text-xs text-dim">
          JSON: <code>/api/rankings/{slug}</code> · digest: <code>/api/digest/{slug}?format=md</code>
        </span>
      </div>
      <WatchlistTools slug={slug} symbols={rankings.watchlist.symbols} rows={rankings.rows} demo={e.DEMO_MODE} />
      <p className="text-xs text-dim">Nightly cron re-analyzes changed tickers (new filing, new news, price move ≥ {e.SMART_REFRESH_PRICE_MOVE_PCT}%, or analysis older than {e.ANALYSIS_TTL_HOURS}h). Ratings are the model&apos;s judgment, not fact.</p>
    </div>
  );
}
