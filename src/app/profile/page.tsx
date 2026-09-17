import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth";
import { db } from "@/lib/db";
import { effectiveLimits } from "@/lib/quota/settings";
import { userAnalysesToday } from "@/lib/quota/spend";
import { listWatchlists } from "@/lib/watchlists";
import { setUsername, setWatchlistPublic } from "@/lib/profile-actions";

export const metadata: Metadata = { title: "Profile" };
export const dynamic = "force-dynamic";

export default async function ProfilePage({ searchParams }: PageProps<"/profile">) {
  const sp = await searchParams;
  const err = typeof sp.err === "string" ? sp.err : null;
  const user = await currentUser();
  if (!user) redirect("/signin");
  const [limits, used, row, lists, screens] = await Promise.all([
    effectiveLimits(),
    userAnalysesToday(user.id),
    db().user.findUnique({ where: { id: user.id }, select: { dailyQuota: true, createdAt: true, email: true, username: true } }),
    listWatchlists(user.id),
    db().savedScreen.findMany({ where: { userId: user.id }, orderBy: { createdAt: "desc" } }),
  ]);
  const quota = row?.dailyQuota ?? limits.freeDailyFresh;
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold">{row?.username ? `@${row.username}` : (user.name ?? user.email)}</h1>
        <p className="text-muted text-sm">{row?.email} · joined {row?.createdAt.toISOString().slice(0, 10)} {user.role === "admin" && "· admin"}</p>
      </div>

      <form action={setUsername} className="card p-4 flex flex-wrap items-end gap-3">
        <label className="text-xs text-muted">Public username
          <div className="flex items-center gap-1 mt-1"><span className="text-muted">@</span><input name="username" defaultValue={row?.username ?? ""} placeholder="yourname" className="w-48" /></div>
        </label>
        <button type="submit" className="btn">Save username</button>
        {row?.username && <Link href={`/u/${row.username}`} className="text-xs ml-auto">view public profile →</Link>}
        {err && <div className="w-full text-xs text-red">{err}</div>}
      </form>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <div className="card-2 p-4"><div className="text-xs uppercase text-muted">Fresh analyses today</div><div className="text-2xl font-semibold">{used} / {quota}</div><div className="text-xs text-muted">resets at midnight UTC</div></div>
        <div className="card-2 p-4"><div className="text-xs uppercase text-muted">Cached views</div><div className="text-2xl font-semibold text-green">unlimited</div></div>
        <div className="card-2 p-4"><div className="text-xs uppercase text-muted">Plan</div><div className="text-2xl font-semibold">Free</div></div>
      </div>

      <section>
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Your watchlists</h2><Link href="/w" className="text-xs">manage →</Link></div>
        {lists.length === 0 ? <div className="card p-4 text-sm text-muted mt-2">No watchlists yet. <Link href="/w">Create one</Link>.</div> : (
          <ul className="space-y-2 mt-2">
            {lists.map((w) => (
              <li key={w.id} className="card p-3 flex items-center justify-between gap-3">
                <Link href={`/w/${w.slug}`} className="no-underline text-text"><span className="font-semibold">{w.name}</span> <span className="text-xs text-muted">{w.symbols.length} tickers</span></Link>
                <form action={setWatchlistPublic}>
                  <input type="hidden" name="slug" value={w.slug} />
                  <input type="hidden" name="isPublic" value={w.isPublic ? "false" : "true"} />
                  <button type="submit" className={`chip ${w.isPublic ? "chip-green" : "chip-muted"}`}>{w.isPublic ? "public ✓" : "make public"}</button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <div className="flex items-center justify-between"><h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Saved screens</h2><Link href="/screener" className="text-xs">screener →</Link></div>
        {screens.length === 0 ? <div className="card p-4 text-sm text-muted mt-2">No saved screens yet.</div> : (
          <ul className="grid md:grid-cols-2 gap-2 mt-2">{screens.map((s) => (<li key={s.id}><Link href={`/screener?saved=${s.id}`} className="card p-3 block no-underline text-text hover:border-purple">{s.name}</Link></li>))}</ul>
        )}
      </section>
    </div>
  );
}
