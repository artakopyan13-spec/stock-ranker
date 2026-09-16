import { db } from "@/lib/db";

export interface WatchlistSummary {
  id: string;
  slug: string;
  name: string;
  symbols: string[];
  updatedAt: Date;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "list";
}

export function normalizeSymbols(input: string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const s = raw.trim().toUpperCase();
    if (/^[A-Z0-9.\-^=]{1,12}$/.test(s) && !out.includes(s)) out.push(s);
  }
  return out;
}

export async function listWatchlists(): Promise<WatchlistSummary[]> {
  const rows = await db().watchlist.findMany({ include: { items: { orderBy: { position: "asc" } } }, orderBy: { createdAt: "asc" } });
  return rows.map((w) => ({ id: w.id, slug: w.slug, name: w.name, symbols: w.items.map((i) => i.symbol), updatedAt: w.updatedAt }));
}

export async function getWatchlist(slug: string): Promise<WatchlistSummary | null> {
  const w = await db().watchlist.findUnique({ where: { slug }, include: { items: { orderBy: { position: "asc" } } } });
  return w ? { id: w.id, slug: w.slug, name: w.name, symbols: w.items.map((i) => i.symbol), updatedAt: w.updatedAt } : null;
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

export async function createWatchlist(name: string, symbols: string[]): Promise<WatchlistSummary> {
  const prisma = db();
  const clean = normalizeSymbols(symbols);
  let slug = slugify(name);
  let n = 1;
  while (await prisma.watchlist.findUnique({ where: { slug } })) slug = `${slugify(name)}-${++n}`;
  await ensureTickers(clean);
  const w = await prisma.watchlist.create({
    data: { slug, name: name.trim() || slug, items: { create: clean.map((symbol, position) => ({ symbol, position })) } },
  });
  return { id: w.id, slug: w.slug, name: w.name, symbols: clean, updatedAt: w.updatedAt };
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

/** Every symbol on any watchlist, deduped, in first-seen order. */
export async function allWatchedSymbols(): Promise<string[]> {
  const lists = await listWatchlists();
  return normalizeSymbols(lists.flatMap((l) => l.symbols));
}
