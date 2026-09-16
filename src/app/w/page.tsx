import Link from "next/link";
import { env } from "@/lib/env";
import { listWatchlists } from "@/lib/watchlists";
import { CreateWatchlist } from "@/components/WatchlistTools";

export const dynamic = "force-dynamic";

export default async function WatchlistsPage() {
  const watchlists = await listWatchlists();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Watchlists</h1>
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          {watchlists.length === 0 && <div className="card p-5 text-sm text-muted">No watchlists yet.</div>}
          {watchlists.map((w) => (
            <Link key={w.id} href={`/w/${w.slug}`} className="card p-4 block no-underline text-text hover:border-purple transition-colors">
              <div className="font-semibold">{w.name}</div>
              <div className="text-xs text-muted mt-1">{w.symbols.join(" · ") || "empty"}</div>
            </Link>
          ))}
        </div>
        <CreateWatchlist disabled={env().DEMO_MODE} />
      </div>
    </div>
  );
}
