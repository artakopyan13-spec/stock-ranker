import Link from "next/link";
import type { Analysis } from "@/lib/analysis/schema";
import { money, multiple, pct, price as fmtPrice } from "@/lib/format";

function deepTone(s: number): string {
  return s >= 7 ? "text-green" : s >= 5 ? "text-gold" : "text-red";
}

/** A clean dashboard-style KPI strip for the top of a stock page, from the stored analysis.
 *  When a cached Deep Analysis exists, its overall score leads the strip and links to the tab. */
export function StockKpiStrip({ analysis, deepOverall }: { analysis: Analysis; deepOverall?: number | null }) {
  const cur = analysis.meta?.currency ?? "USD";
  const action = analysis.rating.action;
  const actionTone = action === "BUY" ? "text-green" : action === "SELL" ? "text-red" : "text-gold";
  const g = analysis.growth.revenueGrowthYoYLatestQ.value;

  const tiles: { label: string; value: React.ReactNode; sub?: React.ReactNode }[] = [
    { label: "AI rating", value: <span className="tabular-nums">{analysis.rating.score}/10</span>, sub: <span className={actionTone}>{action}</span> },
    { label: "Price", value: <span className="tabular-nums">{fmtPrice(analysis.price.current.value ?? null, cur)}</span> },
    { label: "Market cap", value: <span className="tabular-nums">{money(analysis.price.marketCap.value ?? null, cur)}</span> },
    { label: "Rev growth (YoY)", value: <span className={`tabular-nums ${g !== null && g !== undefined ? (g >= 0 ? "text-green" : "text-red") : ""}`}>{pct(g ?? null, 1, true)}</span> },
    { label: "Gross margin", value: <span className="tabular-nums">{pct(analysis.growth.grossMarginPct.value ?? null)}</span> },
    { label: "Trailing P/E", value: <span className="tabular-nums">{multiple(analysis.valuation.trailingPE.value ?? null)}</span> },
  ];

  const cols = typeof deepOverall === "number" ? "lg:grid-cols-7" : "lg:grid-cols-6";

  return (
    <div className={`grid grid-cols-2 sm:grid-cols-3 ${cols} gap-2`}>
      {typeof deepOverall === "number" && (
        <Link href="?tab=deep" className="card px-3 py-2.5 no-underline ring-1 ring-purple/30 hover:ring-purple/60 transition-shadow" title="Overall investment attractiveness — tap for the full Deep Analysis">
          <div className="text-[0.62rem] uppercase tracking-wide text-muted">Deep score</div>
          <div className={`text-xl font-bold leading-tight mt-0.5 ${deepTone(deepOverall)}`}>
            {deepOverall}<span className="text-sm text-muted">/10</span>
          </div>
          <div className="text-[0.7rem] font-semibold mt-0.5 text-purple">view →</div>
        </Link>
      )}
      {tiles.map((t) => (
        <div key={t.label} className="card px-3 py-2.5">
          <div className="text-[0.62rem] uppercase tracking-wide text-muted">{t.label}</div>
          <div className="text-xl font-bold leading-tight mt-0.5">{t.value}</div>
          {t.sub && <div className="text-[0.7rem] font-semibold mt-0.5">{t.sub}</div>}
        </div>
      ))}
    </div>
  );
}
