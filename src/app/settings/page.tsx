import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { currentUser } from "@/auth";
import { db } from "@/lib/db";
import { setUsername, setDisplayName, deleteMyData } from "@/lib/profile-actions";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage({ searchParams }: PageProps<"/settings">) {
  const sp = await searchParams;
  const user = await currentUser();
  if (!user) redirect("/signin");
  const row = await db().user.findUnique({ where: { id: user.id }, select: { username: true, name: true, email: true, createdAt: true } });
  const err = typeof sp.err === "string" ? sp.err : null;
  const ok = sp.ok === "1";
  const deleted = sp.deleted === "1";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-semibold">Settings</h1>
      {ok && <div className="card p-3 text-sm border-l-2 border-l-green text-green">Saved.</div>}
      {deleted && <div className="card p-3 text-sm border-l-2 border-l-gold text-gold">Your watchlists and saved screens were deleted.</div>}

      <section className="card p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Account</h2>
        <div className="text-sm text-muted">Email: {row?.email ?? "—"} · joined {row?.createdAt.toISOString().slice(0, 10)}</div>

        <form action={setDisplayName} className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted">Display name<input name="name" defaultValue={row?.name ?? ""} placeholder="Your name" className="w-56 mt-1 block" /></label>
          <button type="submit" className="btn">Save name</button>
        </form>

        <form action={setUsername} className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-muted">Public username
            <div className="flex items-center gap-1 mt-1"><span className="text-muted">@</span><input name="username" defaultValue={row?.username ?? ""} placeholder="yourname" className="w-48" /></div>
          </label>
          <button type="submit" className="btn">Save username</button>
          {row?.username && <Link href={`/u/${row.username}`} className="text-xs">view public profile →</Link>}
        </form>
        {err && <div className="text-xs text-red">{err}</div>}
      </section>

      <section className="card p-5 space-y-3 border-l-2 border-l-red">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-red">Danger zone</h2>
        <p className="text-sm text-muted">Delete all of your watchlists and saved screens. This cannot be undone. Your account stays.</p>
        <form action={deleteMyData}>
          <button type="submit" className="btn" style={{ borderColor: "var(--red)", color: "var(--red)" }}>Delete my watchlists &amp; screens</button>
        </form>
      </section>

      <p className="text-xs text-dim"><Link href="/profile">← back to profile</Link></p>
    </div>
  );
}
