import { db } from "@/lib/db";

export interface PublicProfile {
  username: string;
  joinedAt: Date;
  watchlists: Array<{ slug: string; name: string; symbols: string[] }>;
}

export async function getPublicProfile(username: string): Promise<PublicProfile | null> {
  const user = await db().user.findUnique({ where: { username: username.toLowerCase() }, select: { id: true, username: true, createdAt: true } });
  if (!user?.username) return null;
  const lists = await db().watchlist.findMany({ where: { userId: user.id, isPublic: true }, include: { items: { orderBy: { position: "asc" } } }, orderBy: { createdAt: "asc" } });
  return {
    username: user.username,
    joinedAt: user.createdAt,
    watchlists: lists.map((w) => ({ slug: w.slug, name: w.name, symbols: w.items.map((i) => i.symbol) })),
  };
}

export async function searchUsers(q: string): Promise<Array<{ username: string; publicLists: number }>> {
  const needle = q.trim().toLowerCase();
  if (!needle) return [];
  const users = await db().user.findMany({ where: { username: { contains: needle } }, select: { id: true, username: true }, take: 20 });
  const out: Array<{ username: string; publicLists: number }> = [];
  for (const u of users) {
    if (!u.username) continue;
    const publicLists = await db().watchlist.count({ where: { userId: u.id, isPublic: true } });
    out.push({ username: u.username, publicLists });
  }
  return out;
}
