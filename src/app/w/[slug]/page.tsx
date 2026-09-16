import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { env } from "@/lib/env";
import { currentUser, isAdmin } from "@/auth";
import { getRankings } from "@/lib/rankings";
import { ownsWatchlist } from "@/lib/watchlists";
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
  const user = await currentUser();
  const canEdit = await ownsWatchlist(slug, user?.id ?? null, await isAdmin());
  const analyzed = rankings.rows.filter((r) => r.analysisId).length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold">{rankings.watchlist.name}</h1>
        <span className="text-sm text-muted">{analyzed}/{rankings.rows.length} analyzed · ranked by rating</span>
        {rankings.bestRiskAdjusted && (
          <span className="chip chip-green">best risk-adjusted: <Link href={`/t/${rankings.bestRiskAdjusted}`} className="text-green">{rankings.bestRiskAdjusted}</Link></span>
        )}
        <Link href="/changes" className="ml-auto text-xs">what changed →</Link>
      </div>
      <WatchlistTools slug={slug} symbols={rankings.watchlist.symbols} rows={rankings.rows} demo={e.DEMO_MODE} canEdit={canEdit} />
      <p className="text-xs text-dim">Nightly cron re-analyzes changed tickers across the shared cache (new filing, new news, price move ≥ {e.SMART_REFRESH_PRICE_MOVE_PCT}%, or analysis older than {e.ANALYSIS_TTL_HOURS}h). Ratings are the model&apos;s judgment, not fact.</p>
    </div>
  );
}
