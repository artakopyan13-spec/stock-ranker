import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getChannel } from "@/lib/alerts/channels";
import { buildDigest, renderDigestHtml, renderDigestText, type DigestPayload } from "@/lib/digest/build";
import { listWatchlists } from "@/lib/watchlists";

export interface DigestSendResult {
  status: "sent" | "already_sent" | "no_watchlist" | "failed";
  slug: string | null;
  error?: string;
}

/** Sends today's digest once per watchlist per day (unique key `${date}:${slug}`). */
export async function sendDailyDigest(slug?: string, now: Date = new Date()): Promise<DigestSendResult> {
  const prisma = db();
  const e = env();
  const targetSlug = slug ?? e.DIGEST_WATCHLIST;
  let watchlist = (await listWatchlists()).find((w) => w.slug === targetSlug) ?? null;
  if (!watchlist) watchlist = (await listWatchlists())[0] ?? null;
  if (!watchlist) return { status: "no_watchlist", slug: null };

  const date = now.toISOString().slice(0, 10);
  const key = `${date}:${watchlist.slug}`;
  const existing = await prisma.digest.findUnique({ where: { key } });
  if (existing?.sentAt) return { status: "already_sent", slug: watchlist.slug };

  const payload: DigestPayload | null = await buildDigest(watchlist.slug, now);
  if (!payload) return { status: "no_watchlist", slug: watchlist.slug };

  const channel = getChannel();
  const row = existing
    ? await prisma.digest.update({ where: { key }, data: { payload: JSON.stringify(payload), channel: channel.name } })
    : await prisma.digest.create({ data: { key, date, watchlistId: watchlist.id, channel: channel.name, payload: JSON.stringify(payload) } });
  try {
    await channel.send({
      subject: `☀️ Morning digest — ${payload.watchlist.name} — ${date}`,
      text: renderDigestText(payload),
      html: renderDigestHtml(payload),
    });
    await prisma.digest.update({ where: { id: row.id }, data: { sentAt: new Date(), error: null } });
    return { status: "sent", slug: watchlist.slug };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.digest.update({ where: { id: row.id }, data: { error: message } });
    return { status: "failed", slug: watchlist.slug, error: message };
  }
}
