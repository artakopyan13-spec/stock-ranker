import Link from "next/link";
import { env } from "@/lib/env";
import { currentUser } from "@/auth";
import { listWatchlists } from "@/lib/watchlists";
import { CreateWatchlist } from "@/components/WatchlistTools";

export const dynamic = "force-dynamic";

export default async function WatchlistsPage() {
  const user = await currentUser();
  const watchlists = user ? await listWatchlists(user.id, true) : await listWatchlists(null, false);
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Watchlists</h1>
      {!user && <div className="card p-4 text-sm text-muted"><Link href="/signin">Sign in</Link> to create and refresh your own watchlists. Public ones are read-only.</div>}
      <div className="grid md:grid-cols-2 gap-4">
        <div className="space-y-2">
          {watchlists.length === 0 && <div className="card p-5 text-sm text-muted">No watchlists yet.</div>}
          {watchlists.map((w) => (
            <Link key={w.id} href={`/w/${w.slug}`} className="card p-4 block no-underline text-text hover:border-purple transition-colors">
              <div className="font-semibold">{w.name}{w.userId === null && <span className="chip chip-muted ml-2">public</span>}</div>
              <div className="text-xs text-muted mt-1">{w.symbols.join(" · ") || "empty"}</div>
            </Link>
          ))}
        </div>
        {user && <CreateWatchlist disabled={env().DEMO_MODE} />}
      </div>
    </div>
  );
}
