import { computeScorecard, type ScPillar, type ScMetric, type Tone } from "@/lib/scorecard/compute";
import type { CompanyData } from "@/lib/data/company";

const TONE: Record<Tone, string> = { good: "text-green", ok: "text-gold", bad: "text-red", unknown: "text-muted" };

function Squares({ frac }: { frac: number }) {
  const filled = Math.max(0, Math.min(10, Math.round(frac * 10)));
  return (
    <div className="flex gap-0.5" aria-hidden>
      {Array.from({ length: 10 }).map((_v, i) => (
        <span key={i} className={`h-2.5 w-2.5 rounded-[3px] ${i < filled ? "bg-gold" : "bg-card2"}`} />
      ))}
    </div>
  );
}

function MetricRow({ m }: { m: ScMetric }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2.5 border-b border-line last:border-0">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-sm text-text">{m.label}</span>
          <button type="button" className="kpi text-dim text-xs leading-none" aria-label={`About ${m.label}`}>
            ⓘ
            <span className="src normal-case">{m.help} <b className="text-muted">Ideal: {m.ideal}.</b></span>
          </button>
        </div>
        <div className="text-xs text-muted mt-0.5">{m.ideal}</div>
      </div>
      <div className="text-right shrink-0">
        <div className={`text-sm font-semibold ${TONE[m.tone]}`}>{m.value}</div>
        <div className="text-[0.65rem] text-dim">{m.points}/{m.max}</div>
      </div>
    </div>
  );
}

function Pillar({ p, open }: { p: ScPillar; open: boolean }) {
  return (
    <details className="sc-pillar card p-4" open={open}>
      <summary className="cursor-pointer list-none">
        <div className="flex items-center justify-between gap-3">
          <span className="font-semibold uppercase tracking-wide text-sm">{p.name}</span>
          <span className="text-sm text-muted"><b className="text-text">{p.score}</b>/{p.max}</span>
        </div>
        <div className="mt-2"><Squares frac={p.max > 0 ? p.score / p.max : 0} /></div>
      </summary>
      <div className="mt-3 border-t border-line pt-1">
        {p.metrics.map((m) => (
          <MetricRow key={m.label} m={m} />
        ))}
      </div>
    </details>
  );
}

export function Scorecard({ data }: { data: CompanyData }) {
  const sc = computeScorecard(data);
  if (!sc) return <div className="card p-6 text-sm text-muted">Not enough financial data from the provider to score this ticker.</div>;
  return (
    <div className="space-y-3">
      <div className="card p-5">
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted">Quality &amp; value score</div>
            <div className="mt-1 text-3xl font-bold tracking-tight">
              {sc.overall.score}
              <span className="text-lg text-muted">/{sc.overall.max}</span>
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gold leading-none">{sc.overall.grade}</div>
            <div className="text-xs text-muted mt-1">{sc.overall.verdict}</div>
          </div>
        </div>
        <div className="mt-4">
          <Squares frac={sc.overall.pct / 100} />
        </div>
        <p className="mt-3 text-xs text-dim leading-relaxed">
          Computed from the provider&rsquo;s financials — math, not model judgment — and weighted toward free cash flow. The ideal standard is shown on each metric; missing figures score neutral. Not financial advice.
        </p>
      </div>
      {sc.pillars.map((p, i) => (
        <Pillar key={p.key} p={p} open={i === 0} />
      ))}
    </div>
  );
}
