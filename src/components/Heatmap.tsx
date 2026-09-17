"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Quote } from "@/lib/data/quotes";
import { squarify } from "@/lib/treemap";

const DEFAULT = "NQ=F,ES=F,NVDA,AAPL,MSFT,GOOGL,AMZN,META,TSLA,AVGO,AMD,NFLX,JPM,V,WMT,XOM,UNH,LLY,COST,ORCL";
const KEY = "heatmap-symbols";

function colorFor(chg: number | null): string {
  if (chg === null) return "var(--card-2)";
  const c = Math.max(-4, Math.min(4, chg)) / 4; // clamp to +-4%
  if (c >= 0) return `color-mix(in srgb, var(--green) ${Math.round(20 + c * 70)}%, #0e1116)`;
  return `color-mix(in srgb, var(--red) ${Math.round(20 + -c * 70)}%, #0e1116)`;
}

export function Heatmap() {
  const router = useRouter();
  const [symbols, setSymbols] = useState<string>(DEFAULT);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(DEFAULT);
  const [quotes, setQuotes] = useState<Quote[] | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setSymbols(saved);
        setDraft(saved);
      }
    } catch {}
  }, []);

  const fetchQuotes = useCallback(async (syms: string) => {
    setQuotes(null);
    try {
      const res = await fetch(`/api/quotes?symbols=${encodeURIComponent(syms)}`);
      const d = (await res.json()) as { quotes: Quote[] };
      setQuotes(d.quotes);
    } catch {
      setQuotes([]);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchQuotes(symbols);
  }, [symbols, fetchQuotes]);

  const save = () => {
    const cleaned = draft.split(/[\s,;]+/).filter(Boolean).join(",");
    setSymbols(cleaned);
    setDraft(cleaned);
    try {
      localStorage.setItem(KEY, cleaned);
    } catch {}
    setEditing(false);
  };
  const reset = () => {
    setDraft(DEFAULT);
    setSymbols(DEFAULT);
    try {
      localStorage.setItem(KEY, DEFAULT);
    } catch {}
  };

  const rects = useMemo(() => {
    if (!quotes) return [];
    const maxCap = Math.max(1, ...quotes.map((q) => q.marketCap ?? 0));
    const items = quotes.map((q) => ({ symbol: q.symbol, weight: q.marketCap ?? maxCap * 0.4 })); // futures ~ mid-size
    return squarify(items, 100, 60);
  }, [quotes]);

  const bySym = new Map((quotes ?? []).map((q) => [q.symbol, q]));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted">Tiles sized by market cap, colored by today&apos;s move. Click a tile to open it.</span>
        <div className="ml-auto flex gap-2">
          <button className="btn py-1 px-3 text-xs" onClick={() => setEditing((e) => !e)}>{editing ? "Cancel" : "Edit tickers"}</button>
          <button className="btn py-1 px-3 text-xs" onClick={reset}>Reset</button>
        </div>
      </div>
      {editing && (
        <div className="card p-3 space-y-2">
          <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} className="w-full text-sm" />
          <div className="flex gap-2 items-center">
            <button className="btn btn-primary py-1 px-3 text-xs" onClick={save}>Save</button>
            <span className="text-xs text-dim">Comma or space separated. Futures: NQ=F, ES=F. Up to 60 tickers.</span>
          </div>
        </div>
      )}
      {quotes === null ? (
        <div className="card skeleton" style={{ paddingTop: "60%" }} />
      ) : (
        <div className="relative w-full card overflow-hidden" style={{ paddingTop: "60%" }}>
          {rects.map((r) => {
            const q = bySym.get(r.symbol);
            const chg = q?.changePct ?? null;
            const big = r.w > 14 && r.h > 10;
            return (
              <button
                key={r.symbol}
                onClick={() => router.push(`/t/${encodeURIComponent(r.symbol)}`)}
                className="absolute flex flex-col items-center justify-center overflow-hidden text-center"
                style={{ left: `${r.x}%`, top: `${(r.y / 60) * 100}%`, width: `${r.w}%`, height: `${(r.h / 60) * 100}%`, background: colorFor(chg), border: "1px solid var(--bg)" }}
                title={`${q?.name ?? r.symbol} · ${chg === null ? "n/a" : chg.toFixed(2) + "%"}`}
              >
                <span className={`font-semibold ${big ? "text-sm" : "text-[0.6rem]"} text-text leading-none`}>{r.symbol.replace("=F", "")}</span>
                {big && chg !== null && <span className="text-[0.65rem] text-text/80">{chg >= 0 ? "+" : ""}{chg.toFixed(2)}%</span>}
              </button>
            );
          })}
        </div>
      )}
      <p className="text-xs text-dim">Live quotes from Yahoo Finance, delayed. Not financial advice.</p>
    </div>
  );
}
