import type { Metadata } from "next";
import Link from "next/link";
import { searchUsers } from "@/lib/profiles";

export const metadata: Metadata = { title: "People" };
export const dynamic = "force-dynamic";

export default async function UsersPage({ searchParams }: PageProps<"/users">) {
  const sp = await searchParams;
  const q = typeof sp.q === "string" ? sp.q : "";
  const results = q ? await searchUsers(q) : [];
  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-2xl font-semibold">Find people</h1>
      <form className="flex gap-2" action="/users">
        <input name="q" defaultValue={q} placeholder="Search usernames…" className="flex-1" />
        <button className="btn btn-primary" type="submit">Search</button>
      </form>
      {q && results.length === 0 && <div className="card p-5 text-sm text-muted">No users found for &ldquo;{q}&rdquo;.</div>}
      <div className="space-y-2">
        {results.map((u) => (
          <Link key={u.username} href={`/u/${u.username}`} className="card p-4 flex items-center justify-between no-underline text-text hover:border-purple">
            <span className="font-semibold">@{u.username}</span>
            <span className="text-xs text-muted">{u.publicLists} public watchlist{u.publicLists === 1 ? "" : "s"}</span>
          </Link>
        ))}
      </div>
      <p className="text-xs text-dim">Set your username and make watchlists public from your <Link href="/profile">profile</Link>.</p>
    </div>
  );
}
