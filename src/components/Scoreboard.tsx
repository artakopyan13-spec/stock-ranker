"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { sortRows, type RankingRow, type SortKey } from "@/lib/rankings-sort";
import { FCF_EMOJI } from "@/lib/analysis/schema";
import { ActionChip } from "@/components/ui";
import { ago, multiple, MULTIPLE_LABEL, pct, price as fmtPrice } from "@/lib/format";

const COLS: Array<{ key: SortKey; label: string }> = [
  { key: "rating", label: "Rating" },
  { key: "fcfMarginPct", label: "FCF margin" },
  { key: "revenueGrowthPct", label: "Rev growth" },
  { key: "forwardPE", label: "Fwd P/E" },
];

export function Scoreboard({ rows, selectable = false, selected = [], onToggle }: { rows: RankingRow[]; selectable?: boolean; selected?: string[]; onToggle?: (symbol: string) => void }) {
  const [sort, setSort] = useState<SortKey>("rating");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const sorted = useMemo(() => sortRows(rows, sort, dir), [rows, sort, dir]);
  const click = (key: SortKey) => {
    if (key === sort) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSort(key);
      setDir(key === "forwardPE" || key === "symbol" ? "asc" : "desc");
    }
  };
  const arrow = (key: SortKey) => (key === sort ? (dir === "asc" ? " ↑" : " ↓") : "");
  return (
    <div className="card overflow-x-auto">
      <table className="tbl w-full text-sm min-w-[720px]">
        <thead>
          <tr>
            {selectable && <th />}
            <th>#</th>
            <th className="cursor-pointer" onClick={() => click("symbol")}>
              Ticker{arrow("symbol")}
            </th>
            {COLS.map((c) => (
              <th key={c.key} className="cursor-pointer" onClick={() => click(c.key)}>
                {c.label}
                {arrow(c.key)}
              </th>
            ))}
            <th>Action</th>
            <th>FCF</th>
            <th>Lens</th>
            <th>Price</th>
            <th>Next catalyst</th>
            <th>Analyzed</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.symbol} className="rowlink">
              {selectable && (
                <td>
                  <input type="checkbox" className="p-0 w-4 h-4" checked={selected.includes(r.symbol)} onChange={() => onToggle?.(r.symbol)} disabled={!r.analysisId} aria-label={`compare ${r.symbol}`} />
                </td>
              )}
              <td className="text-muted">{i + 1}</td>
              <td>
                <Link href={`/t/${r.symbol}`} className="no-underline text-text font-semibold">
                  {r.symbol}
                </Link>
                <div className="text-xs text-muted truncate max-w-[160px]">{r.companyName}</div>
              </td>
              <td>
                {r.rating === null ? (
                  <span className="text-dim italic">not analyzed</span>
                ) : (
                  <span className="text-gold font-semibold">
                    {r.rating}/10
                    {r.ratingDelta !== null && r.ratingDelta !== 0 && <span className={`ml-1 text-xs ${r.ratingDelta > 0 ? "text-green" : "text-red"}`}>{r.ratingDelta > 0 ? `▲${r.ratingDelta}` : `▼${Math.abs(r.ratingDelta)}`}</span>}
                  </span>
                )}
              </td>
              <td className={r.fcfMarginPct !== null && r.fcfMarginPct < 0 ? "text-red" : ""}>{pct(r.fcfMarginPct)}</td>
              <td className={r.revenueGrowthPct !== null && r.revenueGrowthPct < 0 ? "text-red" : ""}>{pct(r.revenueGrowthPct, 1, true)}</td>
              <td>{multiple(r.forwardPE)}</td>
              <td>{r.action ? <ActionChip action={r.action} /> : "—"}</td>
              <td title={r.fcfVerdict ?? ""}>{r.fcfVerdict ? FCF_EMOJI[r.fcfVerdict] : "—"}{r.headlineRisk ? <span className="text-red text-xs ml-1">risk</span> : null}</td>
              <td className="text-xs text-muted">{r.primaryMultiple ? `${MULTIPLE_LABEL[r.primaryMultiple]} ${multiple(r.primaryMultipleValue)}` : "—"}</td>
              <td>{fmtPrice(r.price, r.currency)}</td>
              <td className="text-xs text-muted">{r.nextCatalyst ? `${r.nextCatalyst.date} · ${r.nextCatalyst.event.slice(0, 40)}` : "—"}</td>
              <td className="text-xs text-muted">
                {r.analyzedAt ? ago(r.analyzedAt) : "—"}
                {r.stale && <span className="chip chip-red ml-1">stale</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
