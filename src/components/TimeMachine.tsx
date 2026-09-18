"use client";

import { useEffect, useMemo, useState } from "react";
import type { PricePoint } from "@/lib/data/company";
import type { RatingPoint } from "@/app/api/analysis/[ticker]/history/route";
import { SkeletonCard } from "@/components/ui";
import { dateLabel, pct, price as fmtPrice } from "@/lib/format";

const ACTION_COLOR: Record<string, string> = { BUY: "var(--green)", HOLD: "var(--gold)", SELL: "var(--red)" };
const ACTION_TONE: Record<string, string> = { BUY: "text-green", HOLD: "text-gold", SELL: "text-red" };

/** Nearest price index at or before a date (falls back to the closest). */
function indexForDate(prices: PricePoint[], date: string): number {
  let best = -1;
  for (let i = 0; i < prices.length; i++) {
    if (prices[i].date <= date) best = i;
    else break;
  }
  return best === -1 ? 0 : best;
}

export function TimeMachine({ symbol }: { symbol: string }) {
  const [prices, setPrices] = useState<PricePoint[] | null>(null);
  const [points, setPoints] = useState<RatingPoint[] | null>(null);
  const [sel, setSel] = useState(0);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetch(`/api/company/${symbol}/prices?range=5Y`).then((r) => (r.ok ? r.json() : { prices: [] })),
      fetch(`/api/analysis/${symbol}/history`).then((r) => (r.ok ? r.json() : { points: [] })),
    ])
      .then(([p, h]: [{ prices: PricePoint[] }, { points: RatingPoint[] }]) => {
        if (!alive) return;
        setPrices(p.prices ?? []);
        setPoints(h.points ?? []);
        setSel(Math.max(0, (h.points?.length ?? 1) - 1));
      })
      .catch(() => {
        if (alive) {
          setPrices([]);
          setPoints([]);
        }
      });
    return () => {
      alive = false;
    };
  }, [symbol]);

  const view = useMemo(() => {
    if (!prices || prices.length < 2) return null;
    const w = 680;
    const h = 240;
    const pad = { l: 46, r: 12, t: 12, b: 22 };
    const closes = prices.map((p) => p.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const rng = max - min || 1;
    const x = (i: number) => pad.l + (i / (prices.length - 1)) * (w - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - min) / rng) * (h - pad.t - pad.b);
    const path = prices.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join(" ");
    return { w, h, pad, x, y, path, min, max };
  }, [prices]);

  if (prices === null || points === null) return <SkeletonCard lines={6} />;

  if (points.length === 0) {
    return (
      <div className="card p-8 text-center">
        <div className="text-lg font-semibold">No rating history yet</div>
        <p className="text-muted text-sm mt-2 max-w-md mx-auto">The Time Machine plots how the AI&rsquo;s rating for {symbol} moved over time against its price. It fills in as {symbol} is re-analyzed — check back after the next refresh.</p>
      </div>
    );
  }

  const latestPrice = prices.length ? prices[prices.length - 1].close : null;
  const p = points[Math.min(sel, points.length - 1)];
  const fwd = p.price !== null && latestPrice !== null && p.price > 0 ? ((latestPrice - p.price) / p.price) * 100 : null;

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <div className="flex items-baseline justify-between mb-1">
          <div className="text-sm text-muted">Rating history over price · 5Y</div>
          <div className="text-xs text-dim">{points.length} call{points.length === 1 ? "" : "s"}</div>
        </div>
        {view ? (
          <svg viewBox={`0 0 ${view.w} ${view.h}`} className="w-full h-auto">
            {[view.max, (view.max + view.min) / 2, view.min].map((t) => (
              <g key={t}>
                <line x1={view.pad.l} x2={view.w - view.pad.r} y1={view.y(t)} y2={view.y(t)} stroke="var(--line)" strokeDasharray="2 3" />
                <text x={view.pad.l - 5} y={view.y(t) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{fmtPrice(t).replace(/\.00$/, "")}</text>
              </g>
            ))}
            <path d={view.path} fill="none" stroke="var(--muted)" strokeWidth="1.5" opacity="0.55" />
            {points.map((pt, i) => {
              const idx = indexForDate(prices, pt.date);
              const cx = view.x(idx);
              const cy = view.y(prices[idx]?.close ?? view.min);
              const active = i === sel;
              return (
                <g key={pt.version} style={{ cursor: "pointer" }} onClick={() => setSel(i)}>
                  {active && <line x1={cx} x2={cx} y1={view.pad.t} y2={view.h - view.pad.b} stroke="var(--gold)" strokeWidth="1" strokeDasharray="3 3" />}
                  <circle cx={cx} cy={cy} r={active ? 7 : 5} fill={ACTION_COLOR[pt.action] ?? "var(--muted)"} stroke="var(--bg)" strokeWidth="2" />
                  <text x={cx} y={cy - (active ? 11 : 9)} textAnchor="middle" fontSize="8" fontWeight={active ? 700 : 400} fill="var(--text)">{pt.rating}</text>
                </g>
              );
            })}
          </svg>
        ) : (
          <p className="text-sm text-muted">Price history unavailable — showing the rating timeline only.</p>
        )}
        <div className="flex gap-3 text-[0.68rem] text-muted mt-1">
          <span className="inline-flex items-center gap-1"><Dot c="var(--green)" /> BUY</span>
          <span className="inline-flex items-center gap-1"><Dot c="var(--gold)" /> HOLD</span>
          <span className="inline-flex items-center gap-1"><Dot c="var(--red)" /> SELL</span>
          <span className="ml-auto">number = rating /10</span>
        </div>
      </div>

      {points.length > 1 && (
        <input type="range" min={0} max={points.length - 1} value={sel} onChange={(e) => setSel(Number(e.target.value))} className="w-full" aria-label="Scrub rating history" />
      )}

      <div className="card p-4 space-y-2 fade-up">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs text-muted">{dateLabel(p.date)}</span>
          <span className="text-lg font-bold">{p.rating}/10</span>
          <span className={`font-semibold ${ACTION_TONE[p.action] ?? "text-text"}`}>{p.action}</span>
          <span className="chip chip-muted">{p.confidence} confidence</span>
          {p.price !== null && <span className="text-xs text-muted">price then {fmtPrice(p.price)}</span>}
        </div>
        {fwd !== null && (
          <div className="text-sm">
            Since this call: <span className={fwd >= 0 ? "text-green" : "text-red"}>{pct(fwd, 1, true)}</span>
            <span className="text-dim"> to today&rsquo;s {fmtPrice(latestPrice)}</span>
          </div>
        )}
        <p className="text-sm text-muted leading-relaxed">{p.summary}</p>
      </div>
      <p className="text-[0.65rem] text-dim">Forward return is the price change since the call, not a return the tool earned — ratings are the model&rsquo;s judgment, not advice. Drag the slider or tap a dot to move through time.</p>
    </div>
  );
}

function Dot({ c }: { c: string }) {
  return <span className="inline-block w-2 h-2 rounded-full" style={{ background: c }} />;
}
