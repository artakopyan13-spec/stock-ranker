import type { MetadataRoute } from "next";
import { db } from "@/lib/db";
import { env } from "@/lib/env";

export const revalidate = 3600; // rebuilt hourly; new tickers show up within the hour

const PUBLIC_PAGES: [path: string, priority: number, freq: "daily" | "weekly" | "monthly"][] = [
  ["/", 1, "daily"],
  ["/leaderboard", 0.8, "daily"],
  ["/screener", 0.8, "daily"],
  ["/track-record", 0.8, "daily"],
  ["/macro", 0.7, "daily"],
  ["/calendar", 0.6, "daily"],
  ["/research", 0.6, "weekly"],
  ["/compare", 0.6, "weekly"],
  ["/examples", 0.6, "monthly"],
  ["/how-it-works", 0.6, "monthly"],
  ["/learn", 0.6, "monthly"],
  ["/learn/glossary", 0.5, "monthly"],
  ["/pricing", 0.5, "monthly"],
  ["/terms", 0.2, "monthly"],
  ["/privacy", 0.2, "monthly"],
];

/** Static public pages + every ticker with a verified analysis (one cheap, portable query). */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = env().APP_URL.replace(/\/$/, "");
  const pages: MetadataRoute.Sitemap = PUBLIC_PAGES.map(([path, priority, changeFrequency]) => ({ url: `${base}${path}`, changeFrequency, priority }));
  try {
    const tickers = await db().ticker.findMany({
      where: { analyses: { some: { verified: true } } },
      select: { symbol: true, updatedAt: true },
      orderBy: { searchCount: "desc" },
      take: 5000,
    });
    for (const t of tickers) {
      pages.push({ url: `${base}/t/${encodeURIComponent(t.symbol)}`, lastModified: t.updatedAt, changeFrequency: "weekly", priority: 0.7 });
    }
  } catch (err) {
    console.error("[sitemap] ticker list unavailable:", err instanceof Error ? err.message : err); // static pages still ship
  }
  return pages;
}
