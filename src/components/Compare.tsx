"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { Analysis } from "@/lib/analysis/schema";
import type { CompanyData, FinancialRow } from "@/lib/data/company";
import { FCF_EMOJI } from "@/lib/analysis/schema";
import { computeScorecard, type Scorecard } from "@/lib/scorecard/compute";
import { LineChart } from "@/components/charts";
import { InfoDot } from "@/components/Info";
import { money, multiple, pct, price as fmtPrice, UNVERIFIED } from "@/lib/format";
import { fetchJson } from "@/lib/fetch-json";

const COLORS = ["var(--purple)", "var(--gold)", "var(--green)", "var(--red)", "#6ea8fe"];

type Basis = "ttm" | "annual";

interface Col {
  symbol: string;
  company: CompanyData | null;
  analysis: Analysis | null;
  loading: boolean;
  /** Couldn't load (rate limit, timeout…) — distinct from a ticker that genuinely doesn't exist. */
  error: string | null;
}
interface EnrichedCol extends Col {
  sc: Scorecard | null;
}

const latestAnnual = (c: CompanyData | null) => (c && c.annual.length ? c.annual[c.annual.length - 1] : null);
const latestQuarter = (c: CompanyData | null) => (c && c.quarterly.length ? c.quarterly[c.quarterly.length - 1] : null);

function marginOf(n: number | null | undefined, d: number | null | undefined): number | null {
  return n !== null && n !== undefined && d ? (n / d) * 100 : null;
}
function ratio(n: number | null | undefined, d: number | null | undefined): number | null {
  return n !== null && n !== undefined && d ? n / d : null;
}
function toneColor(p: number | null): string {
  if (p === null) return "var(--muted)";
  return p >= 70 ? "var(--green)" : p >= 45 ? "var(--gold)" : "var(--red)";
}
function gradeColor(g: string): string {
  return g.startsWith("A") ? "var(--green)" : g.startsWith("B") ? "var(--gold)" : "var(--red)";
}
/** "2026-06-30" → 2 (calendar quarter the period ends in). */
function quarterOf(period: string): number {
  const m = Number(period.slice(5, 7));
  return m <= 3 ? 1 : m <= 6 ? 2 : m <= 9 ? 3 : 4;
}
/** "2026-06-30" → "Q2 '26". */
function qLabel(period: string): string {
  return `Q${quarterOf(period)} '${period.slice(2, 4)}`;
}
/** Missing figures read as a dash in tables, not the word "unverified". */
const dash = (s: string) => (s === UNVERIFIED ? "—" : s);
const dashNode = (v: React.ReactNode) => (v === UNVERIFIED ? "—" : v);
/** A negative P/E, P/FCF or D/E means losses / cash burn / negative equity — not meaningful. */
const fmtMultiple = (v: number | null) => (v !== null && v <= 0 ? "n/m" : dash(multiple(v)));
/** Trailing-twelve-months sum of a flow metric over the last 4 quarters (null if incomplete). */
function sum4(rows: FinancialRow[], key: keyof FinancialRow): number | null {
  const last = rows.slice(-4);
  if (last.length < 4) return null;
  let s = 0;
  for (const r of last) {
    const v = r[key];
    if (typeof v !== "number") return null;
    s += v;
  }
  return s;
}

interface PeriodData {
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  netIncome: number | null;
  fcf: number | null;
  cash: number | null;
  totalDebt: number | null;
  equity: number | null;
  label: string;
}
/** The figures to compare, on the chosen basis. TTM keeps the in-progress year included by
 *  summing the last 4 quarters for flows and taking the latest quarter for balance-sheet items. */
function periodData(c: Col, basis: Basis): PeriodData {
  const a = latestAnnual(c.company);
  const q = c.company?.quarterly ?? [];
  const lq = q.length ? q[q.length - 1] : null;
  if (basis === "ttm" && q.length >= 4) {
    return {
      revenue: sum4(q, "revenue"),
      grossProfit: sum4(q, "grossProfit"),
      operatingIncome: sum4(q, "operatingIncome"),
      netIncome: sum4(q, "netIncome"),
      fcf: sum4(q, "fcf"),
      cash: lq?.cash ?? a?.cash ?? null,
      totalDebt: lq?.totalDebt ?? a?.totalDebt ?? null,
      equity: lq?.equity ?? a?.equity ?? null,
      label: lq ? `TTM · through ${qLabel(lq.period)}` : "TTM",
    };
  }
  return {
    revenue: a?.revenue ?? null,
    grossProfit: a?.grossProfit ?? null,
    operatingIncome: a?.operatingIncome ?? null,
    netIncome: a?.netIncome ?? null,
    fcf: a?.fcf ?? c.analysis?.fcf.ttm.value ?? null,
    cash: a?.cash ?? null,
    totalDebt: a?.totalDebt ?? null,
    equity: a?.equity ?? null,
    label: a ? `FY ${a.period.slice(0, 4)}` : "",
  };
}

interface Row {
  label: string;
  info?: string;
  fmt: (c: Col) => React.ReactNode;
  num?: (c: Col) => number | null;
  /** Mark best/worst. Omitted on size rows (market cap, revenue, FCF): bigger isn't "better". */
  better?: "high" | "low";
  /** Valuation multiples: values <= 0 are "n/m" and never ranked best. */
  positiveOnly?: boolean;
  /** Amounts in each company's own currency — only ranked when every column shares one. */
  monetary?: boolean;
}

/**
 * Per-company series for the charts, keyed by period (calendar quarter or year) and merged on the
 * union of periods — companies with different fiscal calendars or reporting lags line up by date
 * instead of by array index. Gaps are null (the chart skips them).
 */
function chartData(cols: EnrichedCol[], rowsOf: (c: EnrichedCol) => FinancialRow[], val: (r: FinancialRow) => number | null, keyOf: (r: FinancialRow) => { key: string; label: string }) {
  const withRows = cols.filter((c) => rowsOf(c).length >= 2);
  const labelByKey = new Map<string, string>();
  const byCol = withRows.map((c) => {
    const m = new Map<string, number | null>();
    for (const r of rowsOf(c)) {
      const k = keyOf(r);
      labelByKey.set(k.key, k.label);
      m.set(k.key, val(r));
    }
    return m;
  });
  const keys = [...labelByKey.keys()].sort();
  const series = withRows.map((c, i) => ({ name: c.symbol, color: COLORS[i % COLORS.length], values: keys.map((k) => byCol[i].get(k) ?? null) }));
  return { len: keys.length, labels: keys.map((k) => labelByKey.get(k) ?? k), series };
}

/** Company data: null for a genuine not-found; an error message for anything else (429, 504…). */
async function loadCompany(s: string): Promise<{ company: CompanyData | null; error: string | null }> {
  const res = await fetchJson<CompanyData>(`/api/company/${encodeURIComponent(s)}`);
  if (res.ok && res.data) return { company: res.data, error: null };
  if (res.status === 404 || res.status === 400) return { company: null, error: null };
  return { company: null, error: res.error ?? "Couldn't load this company. Try again." };
}

export function Compare({ initial }: { initial: string[] }) {
  const [tickers, setTickers] = useState<string[]>(initial.slice(0, 5));
  const [input, setInput] = useState("");
  const [cols, setCols] = useState<Record<string, Col>>({});
  const [basis, setBasis] = useState<Basis>("ttm");

  const load = useCallback(async (syms: string[]) => {
    await Promise.all(
      syms.map(async (s) => {
        setCols((c) => ({ ...c, [s]: { symbol: s, company: null, analysis: null, loading: true, error: null } }));
        const [{ company, error }, analysis] = await Promise.all([
          loadCompany(s),
          fetchJson<{ analysis: Analysis }>(`/api/analysis/${encodeURIComponent(s)}`).then((r) => r.data?.analysis ?? null), // 404 = not analyzed yet
        ]);
        setCols((c) => ({ ...c, [s]: { symbol: s, company, analysis, loading: false, error } }));
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
  const enriched: EnrichedCol[] = shown.map((c) => ({ ...c, sc: c.company ? computeScorecard(c.company) : null }));
  const anyLoading = shown.some((c) => c.loading);

  // ---- numeric helpers on the chosen basis ----
  const pd = (c: Col) => periodData(c, basis);
  const mcapOf = (c: Col) => c.analysis?.price.marketCap.value ?? c.company?.overview.keyStats.marketCap ?? null;
  const grossMargin = (c: Col) => marginOf(pd(c).grossProfit, pd(c).revenue);
  const opMargin = (c: Col) => marginOf(pd(c).operatingIncome, pd(c).revenue);
  const netMargin = (c: Col) => marginOf(pd(c).netIncome, pd(c).revenue);
  const fcfMargin = (c: Col) => marginOf(pd(c).fcf, pd(c).revenue);
  const roe = (c: Col) => marginOf(pd(c).netIncome, pd(c).equity);
  const debtEquity = (c: Col) => ratio(pd(c).totalDebt, pd(c).equity);
  const netCash = (c: Col) => {
    const p = pd(c);
    return p.cash !== null && p.totalDebt !== null ? p.cash - p.totalDebt : null;
  };
  const priceToSales = (c: Col) => ratio(mcapOf(c), pd(c).revenue);
  const cur = (c: Col) => c.company?.currency ?? c.analysis?.meta.currency ?? "USD";
  /** Latest reported quarter YoY revenue growth — current even without a cached analysis. */
  const revYoY = (c: Col): number | null => {
    const q = c.company?.quarterly ?? [];
    if (q.length >= 5) {
      const now = q[q.length - 1].revenue;
      const prior = q[q.length - 5].revenue;
      if (typeof now === "number" && typeof prior === "number" && prior) return ((now - prior) / prior) * 100;
    }
    return c.analysis?.growth.revenueGrowthYoYLatestQ.value ?? null;
  };

  const rows: Row[] = [
    { label: "AI rating", info: "rating", fmt: (c) => (c.analysis ? `${c.analysis.rating.score}/10 ${c.analysis.rating.action}` : <Link href={`/t/${c.symbol}`} className="text-purple text-xs">analyze →</Link>), num: (c) => c.analysis?.rating.score ?? null, better: "high" },
    { label: "Price", fmt: (c) => fmtPrice(c.analysis?.price.current.value ?? null, c.analysis?.meta.currency ?? "USD") },
    { label: "Market cap", info: "market-cap", fmt: (c) => money(mcapOf(c), cur(c)) },
    { label: "Revenue", fmt: (c) => money(pd(c).revenue, cur(c)) },
    { label: "Rev growth (YoY)", info: "revenue-growth", fmt: (c) => pct(revYoY(c), 1, true), num: revYoY, better: "high" },
    { label: "Gross margin", info: "gross-margin", fmt: (c) => pct(grossMargin(c)), num: grossMargin, better: "high" },
    { label: "Operating margin", info: "operating-margin", fmt: (c) => pct(opMargin(c)), num: opMargin, better: "high" },
    { label: "Net margin", fmt: (c) => pct(netMargin(c)), num: netMargin, better: "high" },
    { label: "Return on equity", fmt: (c) => pct(roe(c)), num: roe, better: "high" },
    { label: "Free cash flow", info: "fcf", fmt: (c) => money(pd(c).fcf, cur(c)) },
    { label: "FCF margin", info: "fcf-margin", fmt: (c) => pct(fcfMargin(c)), num: fcfMargin, better: "high" },
    { label: "FCF verdict", info: "fcf", fmt: (c) => (c.analysis ? `${FCF_EMOJI[c.analysis.fcf.verdict]} ${c.analysis.fcf.verdict}` : "—") },
    { label: "Net cash / (debt)", info: "net-cash", fmt: (c) => money(netCash(c), cur(c)), num: netCash, better: "high", monetary: true },
    { label: "Debt / equity", info: "debt-to-equity", fmt: (c) => fmtMultiple(debtEquity(c)), num: debtEquity, better: "low", positiveOnly: true },
    { label: "Trailing P/E", info: "pe", fmt: (c) => fmtMultiple(c.analysis?.valuation.trailingPE.value ?? null), num: (c) => c.analysis?.valuation.trailingPE.value ?? null, better: "low", positiveOnly: true },
    { label: "Forward P/E", info: "forward-pe", fmt: (c) => fmtMultiple(c.analysis?.valuation.forwardPE.value ?? null), num: (c) => c.analysis?.valuation.forwardPE.value ?? null, better: "low", positiveOnly: true },
    { label: "P/S", info: "ps", fmt: (c) => fmtMultiple(priceToSales(c)), num: priceToSales, better: "low", positiveOnly: true },
    { label: "P/FCF", info: "pfcf", fmt: (c) => fmtMultiple(c.analysis?.valuation.priceToFcf.value ?? null), num: (c) => c.analysis?.valuation.priceToFcf.value ?? null, better: "low", positiveOnly: true },
    { label: "Dividend yield", info: "dividend-yield", fmt: (c) => pct(c.company?.overview.keyStats.dividendYieldPct ?? null), num: (c) => c.company?.overview.keyStats.dividendYieldPct ?? null, better: "high" },
  ];

  const oneCurrency = new Set(shown.map(cur)).size <= 1;
  const marks = (r: Row): Map<string, "best" | "worst"> => {
    const m = new Map<string, "best" | "worst">();
    if (!r.num || !r.better) return m;
    if (r.monetary && !oneCurrency) return m; // ¥ vs $ amounts aren't comparable
    const vals = shown
      .map((c) => ({ s: c.symbol, v: r.num!(c) }))
      .filter((x): x is { s: string; v: number } => x.v !== null && Number.isFinite(x.v) && (!r.positiveOnly || x.v > 0));
    if (vals.length < 2) return m;
    const sorted = [...vals].sort((a, b) => (r.better === "high" ? b.v - a.v : a.v - b.v));
    if (sorted[0].v !== sorted[sorted.length - 1].v) {
      m.set(sorted[0].s, "best");
      m.set(sorted[sorted.length - 1].s, "worst");
    }
    return m;
  };

  // ---- charts driven by the basis toggle ----
  const useQ = basis === "ttm";
  const rowsOf = useQ ? (c: EnrichedCol) => (c.company ? c.company.quarterly.slice(-12) : []) : (c: EnrichedCol) => c.company?.annual ?? [];
  const keyOf = useQ
    ? (r: FinancialRow) => ({ key: `${r.period.slice(0, 4)}-Q${quarterOf(r.period)}`, label: qLabel(r.period) })
    : (r: FinancialRow) => ({ key: r.period.slice(0, 4), label: r.period.slice(0, 4) });
  const revChart = chartData(enriched, rowsOf, (r) => (r.revenue === null ? null : r.revenue / 1e9), keyOf);
  const marginChart = chartData(enriched, rowsOf, (r) => marginOf(r.netIncome, r.revenue), keyOf);

  const pillarKeys = enriched.find((c) => c.sc)?.sc?.pillars.map((p) => p.name) ?? [];

  return (
    <div className="space-y-5">
      {/* ticker input */}
      <div className="flex flex-wrap items-center gap-2">
        {tickers.map((t, i) => (
          <span key={t} className="chip chip-muted" style={{ borderColor: COLORS[i % COLORS.length] }}>
            <span style={{ color: COLORS[i % COLORS.length] }}>●</span> {t} <button type="button" onClick={() => remove(t)} className="text-red ml-1" aria-label={`Remove ${t}`}>×</button>
          </span>
        ))}
        {tickers.length < 5 && (
          <span className="inline-flex gap-1">
            <input value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add()} placeholder="add ticker" aria-label="Add a ticker to compare" className="py-1 text-sm w-28" />
            <button type="button" className="btn py-1 px-2 text-xs" onClick={add}>add</button>
          </span>
        )}
        {anyLoading && <span className="text-xs text-muted">loading…</span>}
      </div>

      {/* basis toggle */}
      {enriched.length > 0 && (
        <div className="flex items-center gap-2 text-xs">
          <span className="text-muted">Show:</span>
          <div className="inline-flex rounded-lg border border-line overflow-hidden">
            <button type="button" onClick={() => setBasis("ttm")} className={`px-3 py-1 ${basis === "ttm" ? "bg-card2 text-text font-semibold" : "text-muted"}`}>Quarterly · TTM</button>
            <button type="button" onClick={() => setBasis("annual")} className={`px-3 py-1 ${basis === "annual" ? "bg-card2 text-text font-semibold" : "text-muted"}`}>Annual (full FY)</button>
          </div>
          <span className="text-muted hidden sm:inline">{basis === "ttm" ? "flows are trailing-twelve-months through each company's latest quarter" : "last completed fiscal year"}</span>
        </div>
      )}

      {tickers.length === 0 && (
        <div className="card p-8 text-center text-muted">
          Add up to 5 tickers to compare. You&rsquo;ll get a full profile, a quality grade, strengths &amp; risks, and every KPI side by side — <span className="text-green">green</span> marks the best in each row, <span className="text-red">red</span> the weakest.
        </div>
      )}

      {/* 1 — company profile cards */}
      {enriched.length > 0 && (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {enriched.map((c, i) => (
            <CompanyCard key={c.symbol} col={c} color={COLORS[i % COLORS.length]} onRetry={() => void load([c.symbol])} />
          ))}
        </div>
      )}

      {/* 2 — scorecard pillar matrix */}
      {pillarKeys.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="px-4 pt-3 text-sm font-semibold flex items-center gap-1">Quality Scorecard <span className="text-xs text-muted font-normal">· sector-adjusted, code-computed</span></div>
          <table className="tbl w-full text-sm min-w-[560px]">
            <thead>
              <tr>
                <th className="text-left text-xs text-muted pl-4">Pillar</th>
                {enriched.map((c) => (
                  <th key={c.symbol} className="text-right pr-4">{c.symbol}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="text-xs font-semibold pl-4">Overall grade</td>
                {enriched.map((c) => (
                  <td key={c.symbol} className="text-right pr-4">
                    {c.sc ? (
                      <span className="inline-flex items-center gap-2 justify-end">
                        <ScoreBar pctVal={c.sc.overall.pct} />
                        <span className="font-bold tabular-nums" style={{ color: gradeColor(c.sc.overall.grade) }}>{c.sc.overall.grade}</span>
                      </span>
                    ) : "—"}
                  </td>
                ))}
              </tr>
              {pillarKeys.map((name) => (
                <tr key={name}>
                  <td className="text-xs text-muted pl-4">{name}</td>
                  {enriched.map((c) => {
                    const p = c.sc?.pillars.find((x) => x.name === name);
                    const pv = p ? (p.score / p.max) * 100 : null;
                    return (
                      <td key={c.symbol} className="text-right pr-4">
                        {p ? (
                          <span className="inline-flex items-center gap-2 justify-end">
                            <ScoreBar pctVal={pv} />
                            <span className="tabular-nums text-xs w-12 text-right" style={{ color: toneColor(pv) }}>{p.score}/{p.max}</span>
                          </span>
                        ) : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 3 — KPI table */}
      {enriched.length > 0 && (
        <div className="card overflow-x-auto">
          <div className="px-4 pt-3 text-sm font-semibold flex items-center gap-2">
            Head-to-head KPIs
            <span className="text-xs text-muted font-normal">· {basis === "ttm" ? "trailing twelve months through each company's latest quarter" : "last full fiscal year"}</span>
          </div>
          <table className="tbl w-full text-sm min-w-[560px]">
            <thead>
              <tr>
                <th></th>
                {enriched.map((c) => (
                  <th key={c.symbol} className="text-right pr-4">
                    <Link href={`/t/${c.symbol}`} className="no-underline text-text">{c.symbol}</Link>
                    <div className="text-[0.6rem] text-muted font-normal ml-auto">{pd(c).label}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const mk = marks(r);
                return (
                  <tr key={r.label}>
                    <td className="text-muted text-xs whitespace-nowrap pl-4">{r.label} {r.info && <InfoDot id={r.info} />}</td>
                    {enriched.map((c) => {
                      const mark = mk.get(c.symbol);
                      const cls = mark === "best" ? "text-green font-semibold" : mark === "worst" ? "text-red" : "";
                      return (
                        <td key={c.symbol} className={`text-right pr-4 tabular-nums ${cls}`}>
                          {c.error && !c.analysis ? (
                            <span className="text-dim" title={c.error}>couldn&rsquo;t load</span>
                          ) : c.company === null && c.analysis === null && !c.loading ? (
                            <span className="text-dim">not found</span>
                          ) : (
                            dashNode(r.fmt(c))
                          )}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 4 — charts */}
      {revChart.len > 0 && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="card p-4 md:p-5">
            <LineChart title={`Revenue by ${useQ ? "quarter" : "year"} ($B)`} unit="" labels={revChart.labels} series={revChart.series} height={200} area />
          </div>
          <div className="card p-4 md:p-5">
            <LineChart title={`Net profit margin by ${useQ ? "quarter" : "year"} (%)`} unit="%" labels={marginChart.labels} series={marginChart.series} height={200} />
          </div>
        </div>
      )}
    </div>
  );
}

/** Small 0–100 fill bar, colored by score. */
function ScoreBar({ pctVal }: { pctVal: number | null }) {
  const w = pctVal === null ? 0 : Math.max(3, Math.min(100, pctVal));
  return (
    <span className="inline-block h-1.5 rounded-full overflow-hidden align-middle" style={{ width: 64, background: "var(--card-2)" }}>
      <span className="block h-full rounded-full" style={{ width: `${w}%`, background: toneColor(pctVal) }} />
    </span>
  );
}

/** Per-company profile: what they do, grade + one-line verdict, latest quarter, and + / − lists. */
function CompanyCard({ col, color, onRetry }: { col: EnrichedCol; color: string; onRetry: () => void }) {
  const [open, setOpen] = useState(false);
  const o = col.company?.overview;
  const sc = col.sc;
  const lq = latestQuarter(col.company);
  const notFound = col.company === null && col.analysis === null && !col.loading && !col.error;

  return (
    <div className="card p-4 shrink-0 w-[260px] flex flex-col gap-2" style={{ borderTop: `3px solid ${color}` }}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Link href={`/t/${col.symbol}`} className="no-underline text-text font-semibold">{col.symbol}</Link>
          <div className="text-[0.7rem] text-muted truncate">{o?.industry ?? o?.sector ?? (col.loading ? "loading…" : notFound ? "not found" : "")}</div>
        </div>
        {sc && (
          <span className="chip" style={{ color: gradeColor(sc.overall.grade), borderColor: gradeColor(sc.overall.grade) }} title={`${sc.overall.verdict} · ${sc.overall.pct}%`}>
            {sc.overall.grade}
          </span>
        )}
      </div>

      {col.error && (
        <div role="alert" className="text-[0.72rem] text-red">
          {col.error}{" "}
          <button type="button" className="text-purple underline" onClick={onRetry}>Retry</button>
        </div>
      )}

      {sc && <div className="text-[0.72rem]" style={{ color: gradeColor(sc.overall.grade) }}>{sc.overall.verdict} quality · {sc.overall.pct}%</div>}

      <div className="flex flex-wrap gap-1.5 text-[0.68rem]">
        {col.analysis && <span className="chip chip-muted">AI {col.analysis.rating.score}/10 · {col.analysis.rating.action}</span>}
        {lq && <span className="chip chip-muted">latest {qLabel(lq.period)}</span>}
      </div>

      <div className="flex items-baseline gap-2 text-sm">
        <span className="font-semibold">{dash(fmtPrice(col.analysis?.price.current.value ?? null, col.analysis?.meta.currency ?? "USD"))}</span>
        <span className="text-xs text-muted">{dash(money(col.analysis?.price.marketCap.value ?? o?.keyStats.marketCap ?? null, col.company?.currency ?? "USD"))} cap</span>
      </div>

      {o?.description && (
        <p className={`text-[0.72rem] text-muted leading-relaxed ${open ? "" : "line-clamp-3"}`}>{o.description}</p>
      )}
      {o?.description && o.description.length > 160 && (
        <button type="button" className="text-[0.7rem] text-purple text-left" onClick={() => setOpen((v) => !v)}>{open ? "less" : "what they do →"}</button>
      )}

      {sc && (sc.overall.strengths.length > 0 || sc.overall.watch.length > 0) && (
        <div className="mt-1 space-y-1 text-[0.72rem]">
          {sc.overall.strengths.map((s) => (
            <div key={s} className="flex gap-1.5"><span className="text-green">+</span><span>{s}</span></div>
          ))}
          {sc.overall.watch.map((s) => (
            <div key={s} className="flex gap-1.5"><span className="text-red">−</span><span>{s}</span></div>
          ))}
        </div>
      )}

      {o && (o.employees || o.website) && (
        <div className="mt-auto pt-2 text-[0.66rem] text-muted flex flex-wrap gap-x-3 gap-y-0.5">
          {o.employees ? <span>{o.employees.toLocaleString()} employees</span> : null}
          {o.website ? <a href={o.website} target="_blank" rel="noopener noreferrer" className="text-purple no-underline truncate">site ↗</a> : null}
        </div>
      )}
    </div>
  );
}
