import Link from "next/link";
import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { DEMO_TICKERS } from "@/lib/demo";
import { listWatchlists } from "@/lib/watchlists";
import { currentUser } from "@/auth";
import { SearchBox } from "@/components/SearchBox";
import { CreateWatchlist } from "@/components/WatchlistTools";
import { ActionChip } from "@/components/ui";
import { FCF_EMOJI } from "@/lib/analysis/schema";
import { ago } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Home() {
  const e = env();
  const prisma = db();
  const user = await currentUser();
  const [watchlists, recent] = await Promise.all([
    listWatchlists(user?.id ?? null, true),
    prisma.analysis.findMany({ where: { verified: true }, orderBy: { createdAt: "desc" }, take: 40, select: { symbol: true, rating: true, action: true, fcfVerdict: true, createdAt: true, ticker: { select: { name: true, isDemo: true } } } }),
  ]);
  const latestBySymbol = new Map<string, (typeof recent)[number]>();
  for (const r of recent) if (!latestBySymbol.has(r.symbol)) latestBySymbol.set(r.symbol, r);
  const tiles = e.DEMO_MODE ? [...latestBySymbol.values()].filter((r) => r.ticker.isDemo) : [...latestBySymbol.values()].slice(0, 12);

  return (
    <div className="space-y-8">
      <section className="pt-6">
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight">
          Search a stock. Get the full <span className="text-gold">FCF-first</span> analysis.
        </h1>
        <p className="text-muted mt-2 max-w-2xl">
          Live data → the <code>stock-analysis</code> framework via Claude → rating, bull &amp; bear, catalysts, 12-month view. Every number carries its source and date. Unverifiable means unverified, never invented.
        </p>
        <div className="mt-5 max-w-2xl">
          <SearchBox autoFocus />
        </div>
        {!e.ANTHROPIC_API_KEY && !e.DEMO_MODE && <p className="mt-2 text-xs text-red">ANTHROPIC_API_KEY is not set — new analyses will fail until it is. Cached analyses still render.</p>}
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">{e.DEMO_MODE ? "Demo tickers" : "Recently analyzed"}</h2>
          {e.DEMO_MODE && <span className="text-xs text-dim">pre-analyzed · served from cache · {DEMO_TICKERS.join(", ")}</span>}
        </div>
        {tiles.length === 0 ? (
          <div className="card p-6 text-sm text-muted mt-3">{e.DEMO_MODE ? "Demo data has not been seeded yet. Run `npm run seed:demo` once with an API key, commit data/demo, and redeploy." : "Nothing analyzed yet. Search a ticker above."}</div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
            {tiles.map((t) => (
              <Link key={t.symbol} href={`/t/${t.symbol}`} className="card p-4 no-underline text-text hover:border-purple transition-colors">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{t.symbol}</span>
                  <span className="text-gold font-semibold">{t.rating}/10</span>
                </div>
                <div className="text-xs text-muted truncate">{t.ticker.name}</div>
                <div className="mt-2 flex items-center gap-2 text-xs">
                  <ActionChip action={t.action as "BUY" | "HOLD" | "SELL"} />
                  <span>{FCF_EMOJI[t.fcfVerdict as keyof typeof FCF_EMOJI]}</span>
                  <span className="text-dim ml-auto">{ago(t.createdAt)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="grid md:grid-cols-2 gap-4">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3">Watchlists</h2>
          {watchlists.length === 0 ? (
            <div className="card p-5 text-sm text-muted">No watchlists yet. Create one to get nightly rankings and a &ldquo;what changed&rdquo; log.</div>
          ) : (
            <ul className="space-y-2">
              {watchlists.map((w) => (
                <li key={w.id}>
                  <Link href={`/w/${w.slug}`} className="card p-4 flex items-center justify-between no-underline text-text hover:border-purple transition-colors">
                    <span>
                      <span className="font-semibold">{w.name}</span>
                      <span className="text-xs text-muted ml-2">{w.symbols.length} tickers</span>
                    </span>
                    <span className="text-xs text-dim">{w.symbols.slice(0, 6).join(" · ")}{w.symbols.length > 6 ? " …" : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        {user ? <CreateWatchlist disabled={e.DEMO_MODE} /> : <div className="card p-5 text-sm text-muted"><Link href="/signin">Sign in</Link> to save watchlists, get nightly rankings, and run fresh analyses.</div>}
      </section>
    </div>
  );
}
