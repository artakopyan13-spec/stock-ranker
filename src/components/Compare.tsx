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

interface Row {
  label: string;
  info?: string;
  fmt: (c: Col) => React.ReactNode;
  num?: (c: Col) => number | null; // numeric value for best/worst highlighting
  better?: "high" | "low"; // which end is "better"
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

  const fcfMargin = (c: Col): number | null => {
    const fcf = latestAnnual(c.company)?.fcf ?? c.analysis?.fcf.ttm.value ?? null;
    const rev = latestAnnual(c.company)?.revenue ?? c.analysis?.growth.revenueTTM.value ?? null;
    return marginOf(fcf, rev);
  };

  const rows: Row[] = [
    { label: "AI rating", info: "rating", fmt: (c) => (c.analysis ? `${c.analysis.rating.score}/10 ${c.analysis.rating.action}` : <Link href={`/t/${c.symbol}`} className="text-purple text-xs">analyze →</Link>), num: (c) => c.analysis?.rating.score ?? null, better: "high" },
    { label: "Price", fmt: (c) => fmtPrice(c.analysis?.price.current.value ?? null, c.analysis?.meta.currency ?? "USD") },
    { label: "Market cap", info: "market-cap", fmt: (c) => money(c.analysis?.price.marketCap.value ?? c.company?.overview.keyStats.marketCap ?? null, c.company?.currency ?? "USD") },
    { label: "Revenue (latest FY)", fmt: (c) => money(latestAnnual(c.company)?.revenue ?? null, c.company?.currency ?? "USD") },
    { label: "Free cash flow", info: "fcf", fmt: (c) => money(latestAnnual(c.company)?.fcf ?? c.analysis?.fcf.ttm.value ?? null, c.company?.currency ?? "USD"), num: (c) => latestAnnual(c.company)?.fcf ?? c.analysis?.fcf.ttm.value ?? null, better: "high" },
    { label: "FCF margin", info: "fcf-margin", fmt: (c) => pct(fcfMargin(c)), num: fcfMargin, better: "high" },
    { label: "FCF verdict", info: "fcf", fmt: (c) => (c.analysis ? `${FCF_EMOJI[c.analysis.fcf.verdict]} ${c.analysis.fcf.verdict}` : "—") },
    { label: "Rev growth (YoY)", info: "revenue-growth", fmt: (c) => pct(c.analysis?.growth.revenueGrowthYoYLatestQ.value ?? null, 1, true), num: (c) => c.analysis?.growth.revenueGrowthYoYLatestQ.value ?? null, better: "high" },
    { label: "Gross margin", info: "gross-margin", fmt: (c) => pct(c.analysis?.growth.grossMarginPct.value ?? marginOf(latestAnnual(c.company)?.grossProfit, latestAnnual(c.company)?.revenue)), num: (c) => c.analysis?.growth.grossMarginPct.value ?? marginOf(latestAnnual(c.company)?.grossProfit, latestAnnual(c.company)?.revenue), better: "high" },
    { label: "Operating margin", info: "operating-margin", fmt: (c) => pct(c.analysis?.growth.operatingMarginPct.value ?? marginOf(latestAnnual(c.company)?.operatingIncome, latestAnnual(c.company)?.revenue)), num: (c) => c.analysis?.growth.operatingMarginPct.value ?? marginOf(latestAnnual(c.company)?.operatingIncome, latestAnnual(c.company)?.revenue), better: "high" },
    { label: "Trailing P/E", info: "pe", fmt: (c) => multiple(c.analysis?.valuation.trailingPE.value ?? null), num: (c) => c.analysis?.valuation.trailingPE.value ?? null, better: "low" },
    { label: "Forward P/E", info: "forward-pe", fmt: (c) => multiple(c.analysis?.valuation.forwardPE.value ?? null), num: (c) => c.analysis?.valuation.forwardPE.value ?? null, better: "low" },
    { label: "P/FCF", info: "pfcf", fmt: (c) => multiple(c.analysis?.valuation.priceToFcf.value ?? null), num: (c) => c.analysis?.valuation.priceToFcf.value ?? null, better: "low" },
    { label: "Dividend yield", info: "dividend-yield", fmt: (c) => pct(c.company?.overview.keyStats.dividendYieldPct ?? null), num: (c) => c.company?.overview.keyStats.dividendYieldPct ?? null, better: "high" },
  ];

  // best/worst per row for green/red highlighting
  const marks = (r: Row): Map<string, "best" | "worst"> => {
    const m = new Map<string, "best" | "worst">();
    if (!r.num || !r.better) return m;
    const vals = shown.map((c) => ({ s: c.symbol, v: r.num!(c) })).filter((x): x is { s: string; v: number } => x.v !== null && Number.isFinite(x.v));
    if (vals.length < 2) return m;
    const sorted = [...vals].sort((a, b) => (r.better === "high" ? b.v - a.v : a.v - b.v));
    if (sorted[0].v !== sorted[sorted.length - 1].v) {
      m.set(sorted[0].s, "best");
      m.set(sorted[sorted.length - 1].s, "worst");
    }
    return m;
  };

  const withData = shown.filter((c) => c.company && c.company.annual.length >= 2);
  const refCo = withData.slice().sort((a, b) => b.company!.annual.length - a.company!.annual.length)[0];
  const maxLen = refCo ? refCo.company!.annual.length : 0;
  const labels = refCo ? refCo.company!.annual.map((r) => r.period.slice(0, 4)) : [];
  const series = withData.map((c, i) => {
    const arr = c.company!.annual.map((r) => (r.revenue === null ? null : r.revenue / 1e9));
    const padded = Array(Math.max(0, maxLen - arr.length)).fill(null).concat(arr);
    return { name: c.symbol, color: COLORS[i % COLORS.length], values: padded };
  });

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

      {tickers.length === 0 && <div className="card p-8 text-center text-muted">Add up to 5 tickers to compare. Green marks the best value in each row, red the weakest.</div>}

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
              {rows.map((r) => {
                const mk = marks(r);
                return (
                  <tr key={r.label}>
                    <td className="text-muted text-xs whitespace-nowrap">{r.label} {r.info && <InfoDot id={r.info} />}</td>
                    {shown.map((c) => {
                      const mark = mk.get(c.symbol);
                      const cls = mark === "best" ? "text-green font-semibold" : mark === "worst" ? "text-red" : "";
                      return (
                        <td key={c.symbol} className={`text-right ${cls}`}>{c.company === null && c.analysis === null && !c.loading ? <span className="text-dim">not found</span> : r.fmt(c)}</td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {maxLen > 0 && (
        <div className="card p-4 md:p-5">
          <LineChart title="Revenue over time ($B)" unit="" labels={labels} series={series} height={200} area />
        </div>
      )}
    </div>
  );
}
