import type { Metadata } from "next";
import Link from "next/link";
import { loadUniverse } from "@/lib/universe";
import { FCF_EMOJI } from "@/lib/analysis/schema";
import { ActionChip } from "@/components/ui";
import { ago, multiple, pct } from "@/lib/format";

export const metadata: Metadata = {
  title: "Top Rated",
  description: "The highest-rated and most-searched stocks from every FCF-first AI analysis in the shared cache.",
};

const dash = (s: string, v: number | null) => (v === null ? "—" : s);
export const dynamic = "force-dynamic";

export default async function LeaderboardPage({ searchParams }: PageProps<"/leaderboard">) {
  const sp = await searchParams;
  const by = sp.by === "searched" ? "searched" : "rated";
  const rows = await loadUniverse();
  const sorted = [...rows].sort((a, b) => (by === "searched" ? b.searchCount - a.searchCount || b.rating - a.rating : b.rating - a.rating || b.searchCount - a.searchCount));
  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h1 className="text-2xl font-semibold">Top Rated</h1>
        <span className="text-sm text-muted">from the shared cache — one analysis per ticker, seen by everyone</span>
      </div>
      <div className="flex gap-2 text-xs">
        <Link href="/leaderboard" className={`chip ${by === "rated" ? "chip-gold" : "chip-muted"} no-underline`}>Highest rated</Link>
        <Link href="/leaderboard?by=searched" className={`chip ${by === "searched" ? "chip-gold" : "chip-muted"} no-underline`}>Most searched</Link>
      </div>
      {sorted.length === 0 ? (
        <div className="card p-8 text-center text-muted">No analyses in the cache yet. Search a ticker to seed the leaderboard.</div>
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl w-full text-sm min-w-[760px]">
            <thead><tr><th>#</th><th>Ticker</th><th>Sector</th><th>Rating</th><th>Action</th><th>FCF</th><th>FCF margin</th><th>Rev growth</th><th>Fwd P/E</th><th>Searches</th><th>Analyzed</th></tr></thead>
            <tbody>
              {sorted.slice(0, 100).map((r, i) => (
                <tr key={r.symbol} className="rowlink">
                  <td className="text-muted">{i + 1}</td>
                  <td><Link href={r.shareToken ? `/s/${r.shareToken}` : `/t/${r.symbol}`} className="no-underline text-text font-semibold">{r.symbol}</Link><div className="text-xs text-muted truncate max-w-[160px]">{r.companyName}</div></td>
                  <td className="text-xs text-muted">{r.sector ?? "—"}</td>
                  <td className="text-gold font-semibold">{r.rating}/10</td>
                  <td><ActionChip action={r.action as "BUY" | "HOLD" | "SELL"} /></td>
                  <td title={r.fcfVerdict}>{FCF_EMOJI[r.fcfVerdict as keyof typeof FCF_EMOJI]}</td>
                  <td>{dash(pct(r.fcfMarginPct), r.fcfMarginPct)}</td>
                  <td>{dash(pct(r.revenueGrowthPct, 1, true), r.revenueGrowthPct)}</td>
                  <td>{r.forwardPE !== null && r.forwardPE <= 0 ? "n/m" : dash(multiple(r.forwardPE), r.forwardPE)}</td>
                  <td className="text-muted">{r.searchCount}</td>
                  <td className="text-xs text-muted whitespace-nowrap">{ago(r.analyzedAt)}{r.stale && <span className="chip chip-red ml-1">stale</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-xs text-dim">Ratings are the model&apos;s judgment, not fact. A <span className="text-red">stale</span> tag means the analysis is over a week old or was built on stale data.</p>
    </div>
  );
}
