import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { getChannel, withFooter } from "@/lib/alerts/channels";
import { shareUrlFor } from "@/lib/share";

export interface SendSummary {
  sent: number;
  failed: number;
}

const LABEL: Record<string, string> = {
  rating_change: "Rating change",
  verdict_flip: "Verdict flip",
  tripwire: "Tripwire triggered",
  fcf_negative: "FCF went negative",
};

/** Sends every queued alert (sentAt null). Safe to call repeatedly: rows are marked sent. */
export async function sendPendingAlerts(): Promise<SendSummary> {
  const prisma = db();
  const pending = await prisma.alert.findMany({ where: { sentAt: null }, orderBy: { createdAt: "asc" }, take: 50 });
  if (!pending.length) return { sent: 0, failed: 0 };
  const channel = getChannel();
  const base = env().APP_URL.replace(/\/$/, "");
  let sent = 0;
  let failed = 0;
  for (const a of pending) {
    const ticker = await prisma.ticker.findUnique({ where: { symbol: a.symbol } });
    const link = ticker ? shareUrlFor(base, ticker.shareToken) : `${base}/t/${a.symbol}`;
    try {
      await channel.send({
        subject: `⚠️ ${LABEL[a.type] ?? a.type}: ${a.symbol}`,
        text: withFooter(`${a.message}\n\nFull analysis: ${link}`),
      });
      await prisma.alert.update({ where: { id: a.id }, data: { sentAt: new Date(), channel: channel.name, error: null } });
      sent++;
    } catch (err) {
      failed++;
      await prisma.alert.update({ where: { id: a.id }, data: { error: err instanceof Error ? err.message : String(err) } });
    }
  }
  return { sent, failed };
}
