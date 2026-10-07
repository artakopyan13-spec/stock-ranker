"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Quote } from "@/lib/data/quotes";
import { squarify } from "@/lib/treemap";
import { fetchJson } from "@/lib/fetch-json";

const DEFAULT = "NQ=F,ES=F,NVDA,AAPL,MSFT,GOOGL,AMZN,META,TSLA,AVGO,AMD,NFLX,JPM,V,WMT,XOM,UNH,LLY,COST,ORCL";
const KEY = "heatmap-symbols";

/** Tiles mix toward the page background so the theme's own text color stays readable on them. */
function colorFor(chg: number | null): string {
  if (chg === null) return "var(--card-2)";
  const c = Math.max(-4, Math.min(4, chg)) / 4; // clamp to +-4%
  if (c >= 0) return `color-mix(in srgb, var(--green) ${Math.round(20 + c * 70)}%, var(--bg))`;
  return `color-mix(in srgb, var(--red) ${Math.round(20 + -c * 70)}%, var(--bg))`;
}

function savedSymbols(): string {
  try {
    return localStorage.getItem(KEY) || DEFAULT;
  } catch {
    return DEFAULT; // server render / storage blocked
  }
}

/** The quotes (or error) for one exact symbols string + reload count, so a stale response can't show. */
interface Loaded {
  key: string;
  quotes: Quote[] | null;
  error: string | null;
}

export function Heatmap() {
  const router = useRouter();
  // Read saved tickers up front: a separate "load saved" effect raced the default fetch.
  const [symbols, setSymbols] = useState<string>(savedSymbols);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(symbols);
  const [reload, setReload] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const key = `${symbols}#${reload}`;

  useEffect(() => {
    const ctrl = new AbortController();
    void fetchJson<{ quotes?: Quote[] }>(`/api/quotes?symbols=${encodeURIComponent(symbols)}`, { signal: ctrl.signal }).then((res) => {
      if (ctrl.signal.aborted) return;
      const quotes = res.ok ? res.data?.quotes : undefined;
      setLoaded(quotes ? { key, quotes, error: null } : { key, quotes: null, error: res.error ?? "Couldn't load quotes. Try again." });
    });
    return () => ctrl.abort();
  }, [symbols, key]);

  const current = loaded?.key === key ? loaded : null;
  const quotes = current?.quotes ?? null;

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
          <label htmlFor="heatmap-symbols" className="sr-only">Tickers to show</label>
          <textarea id="heatmap-symbols" value={draft} onChange={(e) => setDraft(e.target.value)} rows={2} className="w-full text-sm" />
          <div className="flex gap-2 items-center">
            <button className="btn btn-primary py-1 px-3 text-xs" onClick={save}>Save</button>
            <span className="text-xs text-dim">Comma or space separated. Futures: NQ=F, ES=F. Up to 60 tickers.</span>
          </div>
        </div>
      )}
      {current?.error ? (
        <div role="alert" className="card p-6 text-sm text-center space-y-2">
          <div className="text-red">{current.error}</div>
          <button type="button" className="btn py-1 px-3 text-xs" onClick={() => setReload((n) => n + 1)}>Retry</button>
        </div>
      ) : quotes === null ? (
        <div className="card skeleton" style={{ paddingTop: "60%" }} />
      ) : quotes.length === 0 ? (
        <div className="card p-6 text-sm text-center text-muted">No valid tickers to show — edit the list above.</div>
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
