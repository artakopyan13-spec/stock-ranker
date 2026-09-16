import { db } from "@/lib/db";
import { env } from "@/lib/env";
import { estimatePerAnalysisUsd } from "@/lib/ai/pricing";
import { analysesToday } from "@/lib/ai/client";

export const dynamic = "force-dynamic";

function dayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

async function loadCosts() {
  const prisma = db();
  const since = new Date(Date.now() - 30 * 86_400_000);
  return Promise.all([
    prisma.usageLog.findMany({ where: { createdAt: { gte: since } }, orderBy: { createdAt: "desc" } }),
    prisma.refreshRun.findMany({ orderBy: { startedAt: "desc" }, take: 14 }),
    analysesToday(),
    prisma.watchlistItem.groupBy({ by: ["symbol"] }),
  ]);
}

export default async function CostsPage() {
  const e = env();
  const [logs, runs, today, watched] = await loadCosts();
  const byDay = new Map<string, { usd: number; calls: number; input: number; output: number }>();
  for (const l of logs) {
    const k = dayKey(l.createdAt);
    const cur = byDay.get(k) ?? { usd: 0, calls: 0, input: 0, output: 0 };
    cur.usd += l.usd;
    cur.calls += 1;
    cur.input += l.inputTokens + l.cacheReadTokens + l.cacheWriteTokens;
    cur.output += l.outputTokens;
    byDay.set(k, cur);
  }
  const total30 = logs.reduce((s, l) => s + l.usd, 0);
  const nightly = Math.min(watched.length, e.MAX_CRON_TICKERS);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Costs</h1>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="card-2 p-4"><div className="text-xs uppercase text-muted">Last 30 days</div><div className="text-2xl font-semibold text-gold">${total30.toFixed(2)}</div></div>
        <div className="card-2 p-4"><div className="text-xs uppercase text-muted">Analyses today / cap</div><div className="text-2xl font-semibold">{today} / {e.MAX_ANALYSES_PER_DAY}</div></div>
        <div className="card-2 p-4"><div className="text-xs uppercase text-muted">Est. per analysis ({e.ANALYSIS_MODEL})</div><div className="text-2xl font-semibold">${estimatePerAnalysisUsd(e.ANALYSIS_MODEL).toFixed(3)}</div><div className="text-xs text-muted">batch: ${estimatePerAnalysisUsd(e.ANALYSIS_MODEL, true).toFixed(3)}</div></div>
        <div className="card-2 p-4"><div className="text-xs uppercase text-muted">Est. per night ({nightly} tickers, batch)</div><div className="text-2xl font-semibold">${(estimatePerAnalysisUsd(e.ANALYSIS_MODEL, true) * nightly).toFixed(2)}</div><div className="text-xs text-muted">before smart-refresh skips</div></div>
      </div>

      <section className="card overflow-x-auto">
        <table className="tbl w-full text-sm">
          <thead><tr><th>Day</th><th>Calls</th><th>Input tokens</th><th>Output tokens</th><th>USD</th></tr></thead>
          <tbody>
            {[...byDay.entries()].map(([day, v]) => (
              <tr key={day}><td>{day}</td><td>{v.calls}</td><td>{v.input.toLocaleString()}</td><td>{v.output.toLocaleString()}</td><td className="text-gold">${v.usd.toFixed(3)}</td></tr>
            ))}
            {byDay.size === 0 && <tr><td colSpan={5} className="text-muted">No model calls logged yet.</td></tr>}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-2">Nightly refresh runs</h2>
        <div className="card overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead><tr><th>Run</th><th>Status</th><th>Mode</th><th>Submitted</th><th>Skipped</th><th>Collected</th><th>USD</th><th>Errors</th></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}><td>{r.runKey}</td><td>{r.status}</td><td>{r.mode}</td><td className="text-xs">{(JSON.parse(r.tickers) as string[]).join(", ") || "—"}</td><td className="text-xs text-muted">{(JSON.parse(r.skipped) as string[]).join(", ") || "—"}</td><td className="text-xs">{r.collectedAt ? dayKey(r.collectedAt) : "—"}</td><td>${r.usdCost.toFixed(3)}</td><td className="text-xs text-red max-w-[240px] truncate">{r.error ?? ""}</td></tr>
              ))}
              {runs.length === 0 && <tr><td colSpan={8} className="text-muted">No cron runs yet. Trigger one: <code>GET /api/cron/refresh</code> with the cron secret.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <p className="text-xs text-dim">Caps: MAX_ANALYSES_PER_DAY={e.MAX_ANALYSES_PER_DAY}, MAX_CRON_TICKERS={e.MAX_CRON_TICKERS}. Rates are Anthropic first-party list prices; cache reads at 10%, cache writes at 125%, batches at 50%.</p>
    </div>
  );
}
