"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Analysis } from "@/lib/analysis/schema";
import type { CompanyData } from "@/lib/data/company";
import { FCF_EMOJI } from "@/lib/analysis/schema";
import { LineChart } from "@/components/charts";
import { InfoDot } from "@/components/Info";
import { money, multiple, pct, price as fmtPrice } from "@/lib/format";

const COLORS = ["var(--purple)", "var(--gold)", "var(--green)", "var(--red)", "#6ea8fe"];

interface Col {
  symbol: string;
  company: CompanyData | null;
  analysis: Analysis | null;
  loading: boolean;
}

const latestAnnual = (c: CompanyData | null) => (c && c.annual.length ? c.annual[c.annual.length - 1] : null);
function marginOf(n: number | null | undefined, d: number | null | undefined): number | null {
  return n !== null && n !== undefined && d ? (n / d) * 100 : null;
}

export function Compare({ initial }: { initial: string[] }) {
  const [tickers, setTickers] = useState<string[]>(initial.slice(0, 5));
  const [input, setInput] = useState("");
  const [cols, setCols] = useState<Record<string, Col>>({});

  const load = useCallback(async (syms: string[]) => {
    await Promise.all(
      syms.map(async (s) => {
        setCols((c) => (c[s] ? c : { ...c, [s]: { symbol: s, company: null, analysis: null, loading: true } }));
        const [company, analysis] = await Promise.all([
          fetch(`/api/company/${s}`).then((r) => (r.ok ? (r.json() as Promise<CompanyData>) : null)).catch(() => null),
          fetch(`/api/analysis/${s}`).then((r) => (r.ok ? (r.json() as Promise<{ analysis: Analysis }>).then((d) => d.analysis) : null)).catch(() => null),
        ]);
        setCols((c) => ({ ...c, [s]: { symbol: s, company, analysis, loading: false } }));
      }),
    );
  }, []);

  useEffect(() => {
    const missing = tickers.filter((t) => !cols[t]);
    if (missing.length) void load(missing);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tickers]);

  const add = () => {
    const s = input.trim().toUpperCase();
    if (s && !tickers.includes(s) && tickers.length < 5) setTickers([...tickers, s]);
    setInput("");
  };
  const remove = (s: string) => setTickers(tickers.filter((t) => t !== s));

  const shown = tickers.map((t) => cols[t]).filter((c): c is Col => Boolean(c));
  const anyLoading = shown.some((c) => c.loading);

  const rows: Array<{ label: string; info?: string; get: (c: Col) => React.ReactNode; tone?: (c: Col) => string }> = [
    { label: "AI rating", info: "rating", get: (c) => (c.analysis ? `${c.analysis.rating.score}/10 ${c.analysis.rating.action}` : <Link href={`/t/${c.symbol}`} className="text-purple text-xs">analyze →</Link>), tone: (c) => (c.analysis ? "text-gold" : "") },
    { label: "Price", get: (c) => fmtPrice(c.analysis?.price.current.value ?? null, c.analysis?.meta.currency ?? "USD") },
    { label: "Market cap", info: "market-cap", get: (c) => money(c.analysis?.price.marketCap.value ?? c.company?.overview.keyStats.marketCap ?? null, c.company?.currency ?? "USD") },
    { label: "Revenue (latest FY)", get: (c) => money(latestAnnual(c.company)?.revenue ?? null, c.company?.currency ?? "USD") },
    { label: "Net income (latest FY)", get: (c) => money(latestAnnual(c.company)?.netIncome ?? null, c.company?.currency ?? "USD") },
    { label: "Free cash flow", info: "fcf", get: (c) => money(latestAnnual(c.company)?.fcf ?? c.analysis?.fcf.ttm.value ?? null, c.company?.currency ?? "USD") },
    { label: "FCF verdict", info: "fcf", get: (c) => (c.analysis ? `${FCF_EMOJI[c.analysis.fcf.verdict]} ${c.analysis.fcf.verdict}` : "—") },
    { label: "Rev growth (YoY)", info: "revenue-growth", get: (c) => pct(c.analysis?.growth.revenueGrowthYoYLatestQ.value ?? null, 1, true) },
    { label: "Gross margin", info: "gross-margin", get: (c) => pct(c.analysis?.growth.grossMarginPct.value ?? marginOf(latestAnnual(c.company)?.grossProfit, latestAnnual(c.company)?.revenue)) },
    { label: "Operating margin", info: "operating-margin", get: (c) => pct(c.analysis?.growth.operatingMarginPct.value ?? marginOf(latestAnnual(c.company)?.operatingIncome, latestAnnual(c.company)?.revenue)) },
    { label: "Trailing P/E", info: "pe", get: (c) => multiple(c.analysis?.valuation.trailingPE.value ?? null) },
    { label: "Forward P/E", info: "forward-pe", get: (c) => multiple(c.analysis?.valuation.forwardPE.value ?? null) },
    { label: "P/FCF", info: "pfcf", get: (c) => multiple(c.analysis?.valuation.priceToFcf.value ?? null) },
    { label: "Dividend yield", info: "dividend-yield", get: (c) => pct(c.company?.overview.keyStats.dividendYieldPct ?? null) },
  ];

  const withData = shown.filter((c) => c.company && c.company.annual.length >= 2);
  const maxLen = Math.max(0, ...withData.map((c) => c.company!.annual.length));
  const labels = Array.from({ length: maxLen }, (_, i) => `Y${i + 1}`);
  const series = withData.map((c, i) => ({ name: c.symbol, color: COLORS[i % COLORS.length], values: c.company!.annual.map((r) => (r.revenue === null ? null : r.revenue / 1e9)) }));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {tickers.map((t) => (
          <span key={t} className="chip chip-muted">{t}{" "}<button type="button" onClick={() => remove(t)} className="text-red">×</button></span>
        ))}
        {tickers.length < 5 && (
          <span className="inline-flex gap-1">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="add ticker" className="py-1 text-sm w-28" />
            <button type="button" className="btn py-1 px-2 text-xs" onClick={add}>add</button>
          </span>
        )}
        {anyLoading && <span className="text-xs text-muted">loading…</span>}
      </div>

      {tickers.length === 0 && <div className="card p-8 text-center text-muted">Add up to 5 tickers to compare. Financials come from the data provider; the AI rating shows when a ticker has been analyzed.</div>}

      {shown.length > 0 && (
        <div className="card overflow-x-auto">
          <table className="tbl w-full text-sm min-w-[560px]">
            <thead>
              <tr>
                <th></th>
                {shown.map((c) => (
                  <th key={c.symbol} className="text-right">
                    <Link href={`/t/${c.symbol}`} className="no-underline text-text">{c.symbol}</Link>
                    {c.company && <div className="text-[0.65rem] text-muted font-normal truncate max-w-[120px] ml-auto">{c.company.overview.sector ?? ""}</div>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label}>
                  <td className="text-muted text-xs whitespace-nowrap">{r.label} {r.info && <InfoDot id={r.info} />}</td>
                  {shown.map((c) => (
                    <td key={c.symbol} className={`text-right ${r.tone?.(c) ?? ""}`}>{c.company === null && c.analysis === null && !c.loading ? <span className="text-dim">not found</span> : r.get(c)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {maxLen > 0 && (
        <div className="card p-4">
          <LineChart title="Revenue history ($B, overlaid)" unit="" labels={labels} series={series} />
        </div>
      )}
    </div>
  );
}
