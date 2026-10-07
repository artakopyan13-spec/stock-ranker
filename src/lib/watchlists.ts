import { db } from "@/lib/db";

export interface WatchlistSummary {
  id: string;
  slug: string;
  name: string;
  symbols: string[];
  userId: string | null;
  isPublic: boolean;
  updatedAt: Date;
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "list"
  );
}

export function normalizeSymbols(input: string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const s = raw.trim().toUpperCase();
    if (/^[A-Z0-9.\-^=]{1,12}$/.test(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

function toSummary(w: { id: string; slug: string; name: string; userId: string | null; isPublic: boolean; updatedAt: Date; items: { symbol: string }[] }): WatchlistSummary {
  return { id: w.id, slug: w.slug, name: w.name, userId: w.userId, isPublic: w.isPublic, symbols: w.items.map((i) => i.symbol), updatedAt: w.updatedAt };
}

/** A user's own watchlists (plus seeded/global ones when `includeGlobal`). */
export async function listWatchlists(userId?: string | null, includeGlobal = false): Promise<WatchlistSummary[]> {
  const where = userId ? (includeGlobal ? { OR: [{ userId }, { userId: null }] } : { userId }) : includeGlobal ? {} : { userId: null };
  const rows = await db().watchlist.findMany({ where, include: { items: { orderBy: { position: "asc" } } }, orderBy: { createdAt: "asc" } });
  return rows.map(toSummary);
}

export async function getWatchlist(slug: string): Promise<WatchlistSummary | null> {
  const w = await db().watchlist.findUnique({ where: { slug }, include: { items: { orderBy: { position: "asc" } } } });
  return w ? toSummary(w) : null;
}

/**
 * Who may READ a watchlist: anyone for public or seeded/system lists (userId null), otherwise only
 * the owner or an admin. Private lists are the default, and slugs are guessable (name + "-2"…), so
 * every read path — page, API, rankings — must check this.
 */
export function canViewWatchlist(w: { isPublic: boolean; userId: string | null }, user: { id?: string | null; role?: string | null } | null | undefined): boolean {
  if (w.isPublic || w.userId === null) return true;
  if (!user?.id) return false;
  return w.userId === user.id || user.role === "admin";
}

/** True when the watchlist belongs to the user (or the user is allowed to edit a global one as admin). */
export async function ownsWatchlist(slug: string, userId: string | null, isAdmin = false): Promise<boolean> {
  if (!userId) return false;
  const w = await db().watchlist.findUnique({ where: { slug }, select: { userId: true } });
  if (!w) return false;
  return w.userId === userId || (isAdmin && w.userId === null);
}

async function ensureTickers(symbols: string[]): Promise<void> {
  const prisma = db();
  for (const symbol of symbols) {
    await prisma.ticker.upsert({
      where: { symbol },
      create: { symbol, name: symbol, shareToken: `${symbol.toLowerCase()}-${Math.random().toString(16).slice(2, 14)}` },
      update: {},
    });
  }
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: unknown }).code === "P2002";
}

export async function createWatchlist(name: string, symbols: string[], userId: string | null = null): Promise<WatchlistSummary> {
  const prisma = db();
  const clean = normalizeSymbols(symbols);
  const base = slugify(name);
  let slug = base;
  let n = 1;
  while (await prisma.watchlist.findUnique({ where: { slug } })) slug = `${base}-${++n}`;
  await ensureTickers(clean);
  // Check-then-write: a concurrent create can take the same slug between the lookup and the insert,
  // so on a unique-constraint hit retry with a random suffix instead of surfacing a 500.
  for (let attempt = 0; ; attempt++) {
    try {
      const w = await prisma.watchlist.create({
        data: { slug, name: name.trim() || slug, userId, items: { create: clean.map((symbol, position) => ({ symbol, position })) } },
        include: { items: { orderBy: { position: "asc" } } },
      });
      return toSummary(w);
    } catch (err) {
      if (!isUniqueViolation(err) || attempt >= 3) throw err;
      slug = `${base}-${Math.random().toString(36).slice(2, 7)}`;
    }
  }
}

export async function setWatchlistSymbols(slug: string, symbols: string[]): Promise<WatchlistSummary | null> {
  const prisma = db();
  const w = await prisma.watchlist.findUnique({ where: { slug } });
  if (!w) return null;
  const clean = normalizeSymbols(symbols);
  await ensureTickers(clean);
  await prisma.$transaction([
    prisma.watchlistItem.deleteMany({ where: { watchlistId: w.id } }),
    prisma.watchlistItem.createMany({ data: clean.map((symbol, position) => ({ watchlistId: w.id, symbol, position })) }),
    prisma.watchlist.update({ where: { id: w.id }, data: { updatedAt: new Date() } }),
  ]);
  return getWatchlist(slug);
}

export async function deleteWatchlist(slug: string): Promise<boolean> {
  const res = await db().watchlist.deleteMany({ where: { slug } });
  return res.count > 0;
}

/** Every symbol any user is watching, deduped — the shared universe the cron refreshes. */
export async function allWatchedSymbols(): Promise<string[]> {
  const items = await db().watchlistItem.findMany({ select: { symbol: true } });
  return normalizeSymbols(items.map((i) => i.symbol));
}
