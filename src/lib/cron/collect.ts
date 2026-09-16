import { db } from "@/lib/db";
import { anthropic, logUsage } from "@/lib/ai/client";
import { finalize } from "@/lib/ai/analyze";
import { persistAnalysis, VerificationFailedError } from "@/lib/analysis/service";
import { StockData } from "@/lib/data/types";
import { sendPendingAlerts } from "@/lib/alerts/send";
import { sendDailyDigest } from "@/lib/digest/send";

export interface CollectOutcome {
  runKey: string | null;
  batch: "none" | "pending" | "collected" | "already_collected";
  stored: string[];
  failed: Array<{ symbol: string; error: string }>;
  alerts: { sent: number; failed: number };
  digest: { status: string; slug: string | null; error?: string };
}

/**
 * Morning step. Collects the newest submitted batch (if it has ended), stores + verifies each
 * result, sends queued alerts, then sends the daily digest. Every part is idempotent:
 * runs flip to `collected`, alerts carry a unique key and `sentAt`, digests a unique day key.
 */
export async function runCollect(now: Date = new Date()): Promise<CollectOutcome> {
  const prisma = db();
  const out: CollectOutcome = { runKey: null, batch: "none", stored: [], failed: [], alerts: { sent: 0, failed: 0 }, digest: { status: "skipped", slug: null } };

  const run = await prisma.refreshRun.findFirst({ where: { status: "submitted", batchId: { not: null } }, orderBy: { startedAt: "desc" } });
  if (run?.batchId) {
    out.runKey = run.runKey;
    const client = anthropic();
    const batch = await client.messages.batches.retrieve(run.batchId);
    if (batch.processing_status !== "ended") {
      out.batch = "pending";
    } else {
      const payloads = await prisma.cronPayload.findMany({ where: { runKey: run.runKey } });
      const bySymbol = new Map(payloads.map((p) => [p.symbol, p]));
      let usd = 0;
      for await (const item of await client.messages.batches.results(run.batchId)) {
        const symbol = item.custom_id.split(":").pop() ?? "";
        const payload = bySymbol.get(symbol);
        if (!payload) {
          out.failed.push({ symbol, error: "no snapshot for this request" });
          continue;
        }
        if (item.result.type !== "succeeded") {
          out.failed.push({ symbol, error: item.result.type === "errored" ? item.result.error.type : item.result.type });
          continue;
        }
        try {
          const already = await prisma.analysis.findFirst({ where: { symbol, source: "cron", createdAt: { gte: run.startedAt } } });
          if (already) {
            out.stored.push(symbol);
            continue; // re-run safety: this result was stored on a previous collect attempt
          }
          const result = finalize(item.result.message, item.result.message.model);
          const usage = await logUsage("batch_analysis", result.model, result.usage, { symbol, batch: true });
          usd += usage.usd;
          const data = StockData.parse(JSON.parse(payload.data));
          await persistAnalysis({ data, result, source: "cron", usage, previousTripwire: payload.previousTripwire });
          out.stored.push(symbol);
        } catch (err) {
          out.failed.push({ symbol, error: err instanceof VerificationFailedError ? "verification failed" : err instanceof Error ? err.message : String(err) });
        }
      }
      await prisma.refreshRun.update({
        where: { id: run.id },
        data: { status: "collected", collectedAt: now, usdCost: usd, error: out.failed.length ? JSON.stringify(out.failed) : null },
      });
      await prisma.cronPayload.deleteMany({ where: { runKey: run.runKey } });
      out.batch = "collected";
    }
  }

  out.alerts = await sendPendingAlerts();
  if (out.batch !== "pending") {
    const digest = await sendDailyDigest(undefined, now);
    out.digest = { status: digest.status, slug: digest.slug, error: digest.error };
  }
  return out;
}
