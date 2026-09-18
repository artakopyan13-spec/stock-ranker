import type { Metadata } from "next";
import Link from "next/link";
import { computeTrackRecord, type Bucket } from "@/lib/track-record";
import { pct } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI track record" };

const ACTION_TONE: Record<string, string> = { BUY: "text-green", HOLD: "text-gold", SELL: "text-red" };
const ACTION_COLOR: Record<string, string> = { BUY: "var(--green)", HOLD: "var(--gold)", SELL: "var(--red)" };

function signed(v: number | null): string {
  return v === null ? "—" : pct(v, 1, true);
}
function tone(v: number | null): string {
  return v === null ? "text-muted" : v >= 0 ? "text-green" : "text-red";
}

function BucketTable({ title, buckets, note }: { title: string; buckets: Bucket[]; note: string }) {
  return (
    <div className="card p-4">
      <div className="text-sm font-semibold mb-1">{title}</div>
      <p className="text-xs text-dim mb-3">{note}</p>
      <table className="tbl w-full text-sm">
        <thead>
          <tr>
            <th>Group</th>
            <th className="text-right">Calls</th>
            <th className="text-right">Avg return</th>
            <th className="text-right">Win rate</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => (
            <tr key={b.label}>
              <td>{b.label}</td>
              <td className="text-right tabular-nums">{b.n}</td>
              <td className={`text-right tabular-nums ${tone(b.avgReturnPct)}`}>{signed(b.avgReturnPct)}</td>
              <td className="text-right tabular-nums">{b.winRatePct === null ? "—" : `${b.winRatePct.toFixed(0)}%`}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Scatter({ points }: { points: Array<{ rating: number; returnPct: number; action: string }> }) {
  const w = 640;
  const h = 240;
  const pad = { l: 44, r: 12, t: 12, b: 28 };
  const rets = points.map((p) => p.returnPct);
  const lo = Math.min(-5, ...rets);
  const hi = Math.max(5, ...rets);
  const rng = hi - lo || 1;
  const x = (r: number) => pad.l + ((r - 1) / 9) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / rng) * (h - pad.t - pad.b);
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-auto" role="img" aria-label="rating vs forward return">
      <line x1={pad.l} x2={w - pad.r} y1={y(0)} y2={y(0)} stroke="var(--line)" />
      <text x={w - pad.r} y={y(0) - 4} textAnchor="end" fontSize="9" fill="var(--dim)">0%</text>
      {[2, 4, 6, 8, 10].map((r) => (
        <text key={r} x={x(r)} y={h - 10} textAnchor="middle" fontSize="9" fill="var(--muted)">{r}</text>
      ))}
      <text x={pad.l} y={h - 10} textAnchor="middle" fontSize="9" fill="var(--muted)">1</text>
      {points.map((p, i) => (
        <circle key={i} cx={x(p.rating)} cy={y(p.returnPct)} r="4" fill={ACTION_COLOR[p.action] ?? "var(--muted)"} opacity="0.8" />
      ))}
      <text x={w / 2} y={h - 1} textAnchor="middle" fontSize="9" fill="var(--dim)">AI rating (1–10) →  higher should sit higher</text>
    </svg>
  );
}

export default async function TrackRecordPage() {
  const tr = await computeTrackRecord();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Does the AI actually work?</h1>
        <p className="text-muted text-sm mt-1 max-w-2xl">
          Every rating this app has ever published, graded against where the stock trades today. No cherry-picking, no
          model call — just the stored call price versus the live price. Calls have different ages, so treat returns as
          &ldquo;since the call,&rdquo; not annualized.
        </p>
      </div>

      {tr.scoredCalls === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-lg font-semibold">The record starts with the first call</div>
          <p className="text-muted text-sm mt-2 max-w-md mx-auto">No priced calls yet. Analyze a few tickers and this page fills in automatically as prices move.</p>
          <Link href="/" className="btn btn-primary no-underline mt-4 inline-block">Analyze a stock</Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Stat label="Priced calls" value={`${tr.scoredCalls}`} sub={`${tr.tickers} tickers${tr.firstCall ? ` · since ${tr.firstCall}` : ""}`} />
            <Stat label="Avg return / call" value={signed(tr.avgReturnPct)} valueClass={tone(tr.avgReturnPct)} sub="since the call, to today" />
            <Stat label="Strong-minus-weak spread" value={signed(tr.spreadPct)} valueClass={tone(tr.spreadPct)} sub="rating ≥7 avg − rating <5 avg" />
            <Stat label="Avg holding" value={tr.avgHoldingDays === null ? "—" : `${Math.round(tr.avgHoldingDays)}d`} sub="call age" />
          </div>

          <div className="card p-4">
            <div className="text-sm font-semibold mb-1">Rating vs. what happened next</div>
            <p className="text-xs text-dim mb-2">If the model is skilled, higher-rated calls (right) should sit higher (better return). One dot per call.</p>
            <Scatter points={tr.scatter} />
          </div>

          <div className="grid md:grid-cols-3 gap-3">
            <BucketTable title="By rating band" buckets={tr.byRating} note="Win = right direction (strong up, weak down)." />
            <BucketTable title="By action" buckets={tr.byAction} note="Win = BUY up / SELL down. HOLD is undecidable." />
            <BucketTable title="Calibration by confidence" buckets={tr.byConfidence} note="Higher-confidence calls should win more often." />
          </div>

          <div className="card overflow-x-auto">
            <table className="tbl w-full text-sm min-w-[620px]">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ticker</th>
                  <th className="text-right">Rating</th>
                  <th>Call</th>
                  <th className="text-right">Entry</th>
                  <th className="text-right">Now</th>
                  <th className="text-right">Return</th>
                  <th className="text-right">Age</th>
                </tr>
              </thead>
              <tbody>
                {tr.rows.map((r, i) => (
                  <tr key={`${r.symbol}-${r.date}-${i}`}>
                    <td className="text-xs text-muted whitespace-nowrap">{r.date}</td>
                    <td><Link href={`/t/${r.symbol}`} className="text-text no-underline hover:underline">{r.symbol}</Link></td>
                    <td className="text-right tabular-nums">{r.rating}/10</td>
                    <td className={ACTION_TONE[r.action] ?? "text-text"}>{r.action}</td>
                    <td className="text-right tabular-nums text-muted">{r.entryPrice.toFixed(2)}</td>
                    <td className="text-right tabular-nums text-muted">{r.currentPrice.toFixed(2)}</td>
                    <td className={`text-right tabular-nums ${tone(r.returnPct)}`}>{signed(r.returnPct)}</td>
                    <td className="text-right tabular-nums text-dim">{r.days}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <p className="text-xs text-dim">
        A track record is not a promise. Past ratings reflect the data available at the time; markets and companies
        change. This is research, not financial advice.
      </p>
    </div>
  );
}

function Stat({ label, value, sub, valueClass = "text-text" }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className={`text-2xl font-bold mt-1 ${valueClass}`}>{value}</div>
      {sub && <div className="text-xs text-dim mt-1">{sub}</div>}
    </div>
  );
}
