"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Analysis } from "@/lib/analysis/schema";
import { FCF_EMOJI } from "@/lib/analysis/schema";
import { LineChart } from "@/components/charts";
import { money, multiple, pct, price as fmtPrice } from "@/lib/format";

const COLORS = ["var(--purple)", "var(--gold)", "var(--green)", "var(--red)", "#6ea8fe"];

export function Compare({ initial }: { initial: string[] }) {
  const [tickers, setTickers] = useState<string[]>(initial.slice(0, 5));
  const [input, setInput] = useState("");
  const [data, setData] = useState<Record<string, Analysis | null>>({});
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (syms: string[]) => {
    setLoading(true);
    const out: Record<string, Analysis | null> = {};
    await Promise.all(
      syms.map(async (s) => {
        try {
          const res = await fetch(`/api/analysis/${s}`);
          out[s] = res.ok ? ((await res.json()) as { analysis: Analysis }).analysis : null;
        } catch {
          out[s] = null;
        }
      }),
    );
    setData(out);
    setLoading(false);
  }, []);

  useEffect(() => {
    // load() is async; the initial setLoading runs in a microtask, not a cascading render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (tickers.length) void load(tickers);
  }, [tickers, load]);

  const add = () => {
    const s = input.trim().toUpperCase();
    if (s && !tickers.includes(s) && tickers.length < 5) setTickers([...tickers, s]);
    setInput("");
  };
  const remove = (s: string) => setTickers(tickers.filter((t) => t !== s));

  const present = tickers.filter((t) => data[t]);
  const rows: Array<{ label: string; get: (a: Analysis) => string; tone?: (a: Analysis) => string }> = [
    { label: "Rating", get: (a) => `${a.rating.score}/10`, tone: () => "text-gold" },
    { label: "Action", get: (a) => a.rating.action },
    { label: "Price", get: (a) => fmtPrice(a.price.current.value, a.meta.currency) },
    { label: "Market cap", get: (a) => money(a.price.marketCap.value, a.meta.currency) },
    { label: "FCF verdict", get: (a) => `${FCF_EMOJI[a.fcf.verdict]} ${a.fcf.verdict}` },
    { label: "FCF margin", get: (a) => pct(a.fcf.marginPct.value) },
    { label: "Rev growth (YoY)", get: (a) => pct(a.growth.revenueGrowthYoYLatestQ.value, 1, true) },
    { label: "Gross margin", get: (a) => pct(a.growth.grossMarginPct.value) },
    { label: "Operating margin", get: (a) => pct(a.growth.operatingMarginPct.value) },
    { label: "Trailing P/E", get: (a) => multiple(a.valuation.trailingPE.value) },
    { label: "Forward P/E", get: (a) => multiple(a.valuation.forwardPE.value) },
    { label: "P/FCF", get: (a) => multiple(a.valuation.priceToFcf.value) },
    { label: "Net cash", get: (a) => money(a.balanceSheet.netCash, a.meta.currency) },
  ];

  // Overlaid FCF-margin history (aligns by index across companies).
  const maxLen = Math.max(0, ...present.map((t) => data[t]!.fcf.history.length));
  const labels = Array.from({ length: maxLen }, (_, i) => `Q${i + 1}`);
  const series = present.map((t, i) => ({ name: t, color: COLORS[i % COLORS.length], values: data[t]!.fcf.history.map((h) => h.marginPct) }));

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
      </div>

      {tickers.length === 0 && <div className="card p-8 text-center text-muted">Add up to 5 tickers to compare. Only cached analyses are shown (no fresh analysis is triggered here).</div>}

      {present.length > 0 && (
        <>
          <div className="card overflow-x-auto">
            <table className="tbl w-full text-sm">
              <thead><tr><th></th>{present.map((t) => <th key={t}><Link href={`/t/${t}`} className="no-underline text-text">{t}</Link></th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.label}><td className="text-muted text-xs">{r.label}</td>{present.map((t) => <td key={t} className={r.tone?.(data[t]!) ?? ""}>{r.get(data[t]!)}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
          {maxLen > 0 && (
            <div className="card p-4"><LineChart title="FCF margin history (overlaid)" labels={labels} series={series} /></div>
          )}
        </>
      )}

      {loading && <div className="text-sm text-muted">Loading…</div>}
      {tickers.filter((t) => data[t] === null).map((t) => (
        <div key={t} className="text-xs text-muted">{t}: no cached analysis yet — <Link href={`/t/${t}`}>analyze it</Link> first.</div>
      ))}
    </div>
  );
}
