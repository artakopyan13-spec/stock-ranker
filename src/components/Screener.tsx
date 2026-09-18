"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { UniverseRow } from "@/lib/universe";
import { applyScreen, PRESETS, type ScreenFilters } from "@/lib/screener";
import { FCF_EMOJI } from "@/lib/analysis/schema";
import { ActionChip } from "@/components/ui";
import { money, multiple, pct } from "@/lib/format";

type SortKey = "rating" | "fcfMarginPct" | "revenueGrowthPct" | "forwardPE" | "priceToFcf" | "marketCap";

export function Screener({ rows, sectors, saved, initial }: { rows: UniverseRow[]; sectors: string[]; saved: Array<{ id: string; name: string; filters: ScreenFilters }>; initial?: ScreenFilters }) {
  const [f, setF] = useState<ScreenFilters>(initial ?? {});
  const [sort, setSort] = useState<SortKey>("rating");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [screenName, setScreenName] = useState("");
  const [savedList, setSavedList] = useState(saved);

  const results = useMemo(() => {
    const filtered = applyScreen(rows, f);
    const mul = dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const av = a[sort];
      const bv = b[sort];
      if (av === null && bv === null) return 0;
      if (av === null) return 1;
      if (bv === null) return -1;
      return (av - bv) * mul;
    });
  }, [rows, f, sort, dir]);

  const num = (k: keyof ScreenFilters) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = e.target.value === "" ? undefined : Number(e.target.value);
    setF((cur) => ({ ...cur, [k]: v }));
  };
  const clickSort = (k: SortKey) => (k === sort ? setDir((d) => (d === "asc" ? "desc" : "asc")) : (setSort(k), setDir(k === "forwardPE" || k === "priceToFcf" ? "asc" : "desc")));

  const save = async () => {
    if (!screenName.trim()) return;
    const res = await fetch("/api/screens", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: screenName, filters: f }) });
    if (res.ok) {
      const body = (await res.json()) as { screen: { id: string; name: string; filters: ScreenFilters } };
      setSavedList((s) => [body.screen, ...s]);
      setScreenName("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.id} type="button" className="chip chip-purple" title={p.description} onClick={() => setF(p.filters)}>
            {p.name}
          </button>
        ))}
        <button type="button" className="chip chip-muted" onClick={() => setF({})}>clear</button>
      </div>

      <div className="card p-4 grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
        <label className="text-muted">Sector
          <select className="w-full mt-1 text-sm" value={f.sector ?? ""} onChange={(e) => setF((c) => ({ ...c, sector: e.target.value || undefined }))}>
            <option value="">any</option>
            {sectors.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="text-muted">Min market cap ($B)<input type="number" className="w-full mt-1" value={f.minMarketCap ?? ""} onChange={num("minMarketCap")} /></label>
        <label className="text-muted">Min rev growth %<input type="number" className="w-full mt-1" value={f.minRevGrowth ?? ""} onChange={num("minRevGrowth")} /></label>
        <label className="text-muted">Min FCF margin %<input type="number" className="w-full mt-1" value={f.minFcfMargin ?? ""} onChange={num("minFcfMargin")} /></label>
        <label className="text-muted">Max trailing P/E<input type="number" className="w-full mt-1" value={f.maxTrailingPE ?? ""} onChange={num("maxTrailingPE")} /></label>
        <label className="text-muted">Max forward P/E<input type="number" className="w-full mt-1" value={f.maxForwardPE ?? ""} onChange={num("maxForwardPE")} /></label>
        <label className="text-muted">Max P/FCF<input type="number" className="w-full mt-1" value={f.maxPriceToFcf ?? ""} onChange={num("maxPriceToFcf")} /></label>
        <label className="text-muted">Min AI rating<input type="number" min={1} max={10} className="w-full mt-1" value={f.minRating ?? ""} onChange={num("minRating")} /></label>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted">{results.length} of {rows.length} in the cache</span>
        <div className="ml-auto flex items-center gap-2">
          <input placeholder="Save this screen as…" className="text-sm" value={screenName} onChange={(e) => setScreenName(e.target.value)} />
          <button type="button" className="btn" onClick={save} disabled={!screenName.trim()}>Save</button>
        </div>
      </div>
      {savedList.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted">Saved:</span>
          {savedList.map((s) => <button key={s.id} type="button" className="chip chip-muted" onClick={() => setF(s.filters)}>{s.name}</button>)}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="tbl w-full text-sm min-w-[820px]">
          <thead><tr>
            <th>Ticker</th><th>Sector</th>
            {(["rating", "fcfMarginPct", "revenueGrowthPct", "forwardPE", "priceToFcf", "marketCap"] as SortKey[]).map((k) => (
              <th key={k} className="cursor-pointer" onClick={() => clickSort(k)}>{{ rating: "Rating", fcfMarginPct: "FCF margin", revenueGrowthPct: "Rev growth", forwardPE: "Fwd P/E", priceToFcf: "P/FCF", marketCap: "Mkt cap" }[k]}{k === sort ? (dir === "asc" ? " ↑" : " ↓") : ""}</th>
            ))}
            <th>Action</th><th>FCF</th>
          </tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.symbol} className="rowlink">
                <td><Link href={`/t/${r.symbol}`} className="no-underline text-text font-semibold">{r.symbol}</Link></td>
                <td className="text-xs text-muted">{r.sector ?? "—"}</td>
                <td className="text-gold font-semibold">{r.rating}/10</td>
                <td>{pct(r.fcfMarginPct)}</td>
                <td>{pct(r.revenueGrowthPct, 1, true)}</td>
                <td>{multiple(r.forwardPE)}</td>
                <td>{multiple(r.priceToFcf)}</td>
                <td>{money(r.marketCap, r.currency)}</td>
                <td><ActionChip action={r.action as "BUY" | "HOLD" | "SELL"} /></td>
                <td title={r.fcfVerdict}>{FCF_EMOJI[r.fcfVerdict as keyof typeof FCF_EMOJI]}</td>
              </tr>
            ))}
            {results.length === 0 && <tr><td colSpan={10} className="text-muted text-center py-6">No tickers match. Loosen the filters, or analyze more tickers to grow the cache.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-dim">The screener runs over the shared-cache universe (tickers anyone has analyzed). Dividend yield and debt/equity join once the Financials tab data is wired. Ratings are the model&apos;s judgment.</p>
    </div>
  );
}
