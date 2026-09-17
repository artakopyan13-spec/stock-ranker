import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getPublicProfile } from "@/lib/profiles";

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: PageProps<"/u/[username]">): Promise<Metadata> {
  const { username } = await params;
  return { title: `@${username}` };
}

export default async function UserProfile({ params }: PageProps<"/u/[username]">) {
  const { username } = await params;
  const profile = await getPublicProfile(username);
  if (!profile) notFound();
  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">@{profile.username}</h1>
        <p className="text-muted text-sm">Joined {profile.joinedAt.toISOString().slice(0, 10)} · {profile.watchlists.length} public watchlist{profile.watchlists.length === 1 ? "" : "s"}</p>
      </div>
      {profile.watchlists.length === 0 ? (
        <div className="card p-6 text-sm text-muted">This user has no public watchlists.</div>
      ) : (
        <div className="space-y-3">
          {profile.watchlists.map((w) => (
            <Link key={w.slug} href={`/w/${w.slug}`} className="card p-4 block no-underline text-text hover:border-purple">
              <div className="font-semibold">{w.name}</div>
              <div className="text-xs text-muted mt-1">{w.symbols.join(" · ") || "empty"}</div>
            </Link>
          ))}
        </div>
      )}
      <Link href="/users" className="text-sm">← find more people</Link>
    </div>
  );
}
