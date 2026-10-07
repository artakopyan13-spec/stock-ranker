"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { UniverseRow } from "@/lib/universe";
import { applyScreen, meaningfulMultiple, PRESETS, type ScreenFilters } from "@/lib/screener";
import { FCF_EMOJI } from "@/lib/analysis/schema";
import { ActionChip } from "@/components/ui";
import { dateLabel, money, multiple, pct } from "@/lib/format";
import { postJson } from "@/lib/fetch-json";

type SortKey = "rating" | "fcfMarginPct" | "revenueGrowthPct" | "forwardPE" | "priceToFcf" | "marketCap";
const SORT_LABEL: Record<SortKey, string> = { rating: "Rating", fcfMarginPct: "FCF margin", revenueGrowthPct: "Rev growth", forwardPE: "Fwd P/E", priceToFcf: "P/FCF", marketCap: "Mkt cap" };
const MULTIPLE_KEYS: SortKey[] = ["forwardPE", "priceToFcf"];

/** Sort value: a negative multiple is "n/m" (losses), not the cheapest — it sorts with the blanks. */
const sortValue = (r: UniverseRow, k: SortKey): number | null => (MULTIPLE_KEYS.includes(k) ? meaningfulMultiple(r[k]) : r[k]);

const dash = (s: string, v: number | null) => (v === null ? "—" : s);
const fmtMultiple = (v: number | null) => (v === null ? "—" : v <= 0 ? "n/m" : multiple(v));

export function Screener({ rows, sectors, saved, initial }: { rows: UniverseRow[]; sectors: string[]; saved: Array<{ id: string; name: string; filters: ScreenFilters }>; initial?: ScreenFilters }) {
  const [f, setF] = useState<ScreenFilters>(initial ?? {});
  const [sort, setSort] = useState<SortKey>("rating");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [screenName, setScreenName] = useState("");
  const [savedList, setSavedList] = useState(saved);
  const [saveError, setSaveError] = useState<string | null>(null);

  const results = useMemo(() => {
    const filtered = applyScreen(rows, f);
    const mul = dir === "asc" ? 1 : -1;
    return filtered.sort((a, b) => {
      const av = sortValue(a, sort);
      const bv = sortValue(b, sort);
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
  const clickSort = (k: SortKey) => (k === sort ? setDir((d) => (d === "asc" ? "desc" : "asc")) : (setSort(k), setDir(MULTIPLE_KEYS.includes(k) ? "asc" : "desc")));

  const save = async () => {
    if (!screenName.trim()) return;
    const res = await postJson<{ screen: { id: string; name: string; filters: ScreenFilters } }>("/api/screens", { name: screenName, filters: f });
    if (res.ok && res.data) {
      const { screen } = res.data;
      setSavedList((s) => [screen, ...s]);
      setScreenName("");
      setSaveError(null);
    } else {
      setSaveError(res.error);
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
        <label className="text-muted">Max AI rating<input type="number" min={1} max={10} className="w-full mt-1" value={f.maxRating ?? ""} onChange={num("maxRating")} /></label>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-muted">{results.length} of {rows.length} in the cache</span>
        <div className="ml-auto flex items-center gap-2">
          <input aria-label="Name for this screen" placeholder="Save this screen as…" className="text-sm" value={screenName} onChange={(e) => setScreenName(e.target.value)} />
          <button type="button" className="btn" onClick={save} disabled={!screenName.trim()}>Save</button>
        </div>
        {saveError && <span role="alert" className="w-full text-right text-xs text-red">{saveError}</span>}
      </div>
      {savedList.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <span className="text-muted">Saved:</span>
          {savedList.map((s) => <button key={s.id} type="button" className="chip chip-muted" onClick={() => setF(s.filters)}>{s.name}</button>)}
        </div>
      )}

      <div className="card overflow-x-auto">
        <table className="tbl w-full text-sm min-w-[900px]">
          <thead><tr>
            <th>Ticker</th><th>Sector</th>
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <th key={k} aria-sort={k === sort ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                <button type="button" className="uppercase hover:text-text" onClick={() => clickSort(k)}>
                  {SORT_LABEL[k]}{k === sort ? (dir === "asc" ? " ↑" : " ↓") : ""}
                </button>
              </th>
            ))}
            <th>Action</th><th>FCF</th><th>Analyzed</th>
          </tr></thead>
          <tbody>
            {results.map((r) => (
              <tr key={r.symbol} className="rowlink">
                <td><Link href={`/t/${r.symbol}`} className="no-underline text-text font-semibold">{r.symbol}</Link></td>
                <td className="text-xs text-muted">{r.sector ?? "—"}</td>
                <td className="text-gold font-semibold">{r.rating}/10</td>
                <td>{dash(pct(r.fcfMarginPct), r.fcfMarginPct)}</td>
                <td>{dash(pct(r.revenueGrowthPct, 1, true), r.revenueGrowthPct)}</td>
                <td title={r.forwardPE !== null && r.forwardPE <= 0 ? "Not meaningful — negative earnings" : undefined}>{fmtMultiple(r.forwardPE)}</td>
                <td title={r.priceToFcf !== null && r.priceToFcf <= 0 ? "Not meaningful — negative free cash flow" : undefined}>{fmtMultiple(r.priceToFcf)}</td>
                <td>{dash(money(r.marketCap, r.currency), r.marketCap)}</td>
                <td><ActionChip action={r.action as "BUY" | "HOLD" | "SELL"} /></td>
                <td title={r.fcfVerdict}>{FCF_EMOJI[r.fcfVerdict as keyof typeof FCF_EMOJI]}</td>
                <td className="text-xs text-muted whitespace-nowrap">
                  {dateLabel(r.analyzedAt)}
                  {r.stale && <span className="chip chip-red ml-1" title="Analysis is over a week old or built on stale data">stale</span>}
                </td>
              </tr>
            ))}
            {results.length === 0 && <tr><td colSpan={11} className="text-muted text-center py-6">No tickers match. Loosen the filters, or analyze more tickers to grow the cache.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-dim">The screener runs over the shared-cache universe (tickers anyone has analyzed). Dividend yield and debt/equity join once the Financials tab data is wired. Ratings are the model&apos;s judgment.</p>
    </div>
  );
}
