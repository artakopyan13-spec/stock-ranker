import type { Metadata } from "next";
import Link from "next/link";
import { CHANGE_LABEL, type ChangeType } from "@/lib/changes/detect";
import { listChanges, recentRuns } from "@/lib/changes/list";
import { env } from "@/lib/env";
import { dateLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "What changed" };

const TYPES: ChangeType[] = ["rating_change", "verdict_flip", "tripwire", "fcf_negative"];
const TONE: Record<ChangeType, string> = { rating_change: "chip-gold", verdict_flip: "chip-purple", tripwire: "chip-red", fcf_negative: "chip-red" };

export default async function ChangesPage({ searchParams }: PageProps<"/changes">) {
  const sp = await searchParams;
  const typeParam = typeof sp.type === "string" ? sp.type : undefined;
  const type = TYPES.find((t) => t === typeParam);
  const [days, runs] = await Promise.all([listChanges(30, type), recentRuns(7)]);
  const lastRun = runs[0];
  const e = env();
  const total = days.reduce((n, d) => n + d.rows.length, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h1 className="text-2xl font-semibold">What changed</h1>
        <span className="text-sm text-muted">{total} change{total === 1 ? "" : "s"} in the last 30 days</span>
      </div>

      <div className="card p-4 text-sm flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <span className="text-muted text-xs uppercase tracking-wider">Last refresh</span>
          <div>
            {lastRun ? (
              <>
                {dateLabel(lastRun.runKey)} · <span className="chip chip-muted">{lastRun.status}</span> · {lastRun.submitted.length} analyzed, {lastRun.skipped.length} skipped
                {lastRun.error && <span className="text-red ml-2">with errors</span>}
              </>
            ) : (
              <span className="text-muted">no nightly refresh has run yet</span>
            )}
          </div>
        </div>
        <div>
          <span className="text-muted text-xs uppercase tracking-wider">Schedule</span>
          <div className="text-muted">nightly batch submit, morning collect (see vercel.json) · re-analyzes only tickers where something changed</div>
        </div>
        {e.DEMO_MODE && <div className="text-dim text-xs w-full">Demo mode: the cron is disabled; changes shown are from the seeded history.</div>}
      </div>

      <div className="flex flex-wrap gap-2 text-xs">
        <Link href="/changes" className={`chip ${type ? "chip-muted" : "chip-gold"} no-underline`}>
          all
        </Link>
        {TYPES.map((t) => (
          <Link key={t} href={`/changes?type=${t}`} className={`chip ${type === t ? "chip-gold" : "chip-muted"} no-underline`}>
            {CHANGE_LABEL[t]}
          </Link>
        ))}
      </div>

      {days.length === 0 && (
        <div className="card p-8 text-center">
          <div className="text-lg font-semibold">Nothing has changed yet</div>
          <p className="text-muted text-sm mt-2 max-w-md mx-auto">
            Changes appear after a ticker is re-analyzed and its rating moves, its BUY/HOLD/SELL verdict flips, its tripwire triggers, or its free cash flow turns negative.
          </p>
        </div>
      )}

      {days.map((d) => (
        <section key={d.date}>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-2">{dateLabel(d.date)}</h2>
          <ul className="space-y-2">
            {d.rows.map((r) => (
              <li key={r.id} className="card p-4 flex flex-wrap items-start gap-3 fade-up">
                <Link href={`/t/${r.symbol}`} className="font-semibold text-text no-underline min-w-[64px]">
                  {r.symbol}
                </Link>
                <span className={`chip ${TONE[r.type]}`}>{CHANGE_LABEL[r.type]}</span>
                <span className="text-sm flex-1 min-w-[240px]">{r.message}</span>
                <span className="text-xs text-dim">{r.runKey ? "nightly" : "on demand"} · {r.createdAt.toISOString().slice(11, 16)} UTC</span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      <p className="text-xs text-dim">Ratings and verdicts are the model&apos;s judgment, not fact. Each line links to the full analysis with sources.</p>
    </div>
  );
}
