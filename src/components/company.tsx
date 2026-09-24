"use client";

import { useEffect, useMemo, useState } from "react";
import type { CompanyData, FinancialRow, PricePoint, PriceRange } from "@/lib/data/company";
import { BarChart, LineChart } from "@/components/charts";
import { compact, dateLabel, money, multiple, pct, price as fmtPrice } from "@/lib/format";
import { SkeletonCard, Card, Tag } from "@/components/ui";
import { ChatPanel } from "@/components/ChatPanel";
import { Committee } from "@/components/Committee";
import { Scorecard } from "@/components/Scorecard";
import { TimeMachine } from "@/components/TimeMachine";

const qLabel = (p: string) => {
  const [y, m] = p.split("-");
  return `Q${Math.ceil(Number(m) / 3)}'${y.slice(2)}`;
};
const yLabel = (p: string) => p.slice(0, 4);

// ---------- Financials tables ----------
type LineDef = { key: keyof FinancialRow; label: string; kind: "money" | "num2" };
const INCOME: LineDef[] = [
  { key: "revenue", label: "Revenue", kind: "money" },
  { key: "grossProfit", label: "Gross profit", kind: "money" },
  { key: "operatingIncome", label: "Operating income", kind: "money" },
  { key: "netIncome", label: "Net income", kind: "money" },
  { key: "ebitda", label: "EBITDA", kind: "money" },
  { key: "eps", label: "EPS (diluted)", kind: "num2" },
];
const BALANCE: LineDef[] = [
  { key: "cash", label: "Cash & equivalents", kind: "money" },
  { key: "totalDebt", label: "Total debt", kind: "money" },
  { key: "totalAssets", label: "Total assets", kind: "money" },
  { key: "equity", label: "Shareholder equity", kind: "money" },
  { key: "sharesOutstanding", label: "Shares outstanding", kind: "money" },
];
const CASHFLOW: LineDef[] = [
  { key: "operatingCashFlow", label: "Operating cash flow", kind: "money" },
  { key: "capex", label: "Capital expenditure", kind: "money" },
  { key: "fcf", label: "Free cash flow", kind: "money" },
];

function FinTable({ rows, defs, currency, label }: { rows: FinancialRow[]; defs: LineDef[]; currency: string; label: (p: string) => string }) {
  return (
    <table className="tbl w-full text-sm min-w-[640px]">
      <thead>
        <tr>
          <th className="sticky left-0 bg-card">Line item</th>
          {rows.map((r) => (
            <th key={r.period} className="text-right">{label(r.period)}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {defs.map((d) => (
          <tr key={String(d.key)}>
            <td className="sticky left-0 bg-card text-muted">{d.label}</td>
            {rows.map((r) => {
              const v = r[d.key] as number | null;
              return (
                <td key={r.period} className="text-right tabular-nums">
                  {v === null ? <span className="text-dim">—</span> : d.kind === "money" ? money(v, currency) : v.toFixed(2)}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Financials({ data }: { data: CompanyData }) {
  const [mode, setMode] = useState<"annual" | "quarterly">("annual");
  const rows = mode === "annual" ? data.annual : data.quarterly;
  const label = mode === "annual" ? yLabel : qLabel;
  if (rows.length === 0) return <Card title="Financials"><p className="text-sm text-muted">Financial statements are unavailable for this ticker from the data provider.</p></Card>;
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button className={`chip ${mode === "annual" ? "chip-gold" : "chip-muted"}`} onClick={() => setMode("annual")}>Annual</button>
        <button className={`chip ${mode === "quarterly" ? "chip-gold" : "chip-muted"}`} onClick={() => setMode("quarterly")}>Quarterly</button>
        <span className="text-xs text-dim ml-auto">{data.overview.source} · {rows.length} periods · {data.currency}</span>
      </div>
      {[["Income statement", INCOME], ["Balance sheet", BALANCE], ["Cash flow", CASHFLOW]].map(([title, defs]) => (
        <Card key={title as string} title={title as string}>
          <div className="overflow-x-auto">
            <FinTable rows={rows} defs={defs as LineDef[]} currency={data.currency} label={label} />
          </div>
        </Card>
      ))}
    </div>
  );
}

// ---------- Interactive price chart ----------
export function PriceChart({ symbol }: { symbol: string }) {
  const [range, setRange] = useState<PriceRange>("1Y");
  const [prices, setPrices] = useState<PricePoint[] | null>(null);
  const [hover, setHover] = useState<PricePoint | null>(null);
  useEffect(() => {
    let live = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrices(null);
    fetch(`/api/company/${symbol}/prices?range=${range}`)
      .then((r) => r.json())
      .then((d) => live && setPrices(d.prices))
      .catch(() => live && setPrices([]));
    return () => {
      live = false;
    };
  }, [symbol, range]);

  const view = useMemo(() => {
    if (!prices || prices.length < 2) return null;
    const w = 640;
    const h = 200;
    const pad = { l: 44, r: 8, t: 10, b: 20 };
    const closes = prices.map((p) => p.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range2 = max - min || 1;
    const x = (i: number) => pad.l + (i / (prices.length - 1)) * (w - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - min) / range2) * (h - pad.t - pad.b);
    const path = prices.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.close).toFixed(1)}`).join(" ");
    const up = prices[prices.length - 1].close >= prices[0].close;
    return { w, h, pad, x, y, path, up, min, max };
  }, [prices]);

  return (
    <Card title="Price" right={<div className="flex gap-1">{(["1M", "6M", "1Y", "5Y", "MAX"] as PriceRange[]).map((r) => <button key={r} className={`chip ${range === r ? "chip-gold" : "chip-muted"} text-xs`} onClick={() => setRange(r)}>{r}</button>)}</div>}>
      {prices === null ? (
        <SkeletonCard lines={3} />
      ) : !view ? (
        <p className="text-sm text-muted">Price history unavailable.</p>
      ) : (
        <>
          <div className="text-sm text-muted mb-1">{hover ? `${dateLabel(hover.date)} · ${fmtPrice(hover.close)}` : `${fmtPrice(prices[prices.length - 1].close)} latest`}</div>
          <svg
            viewBox={`0 0 ${view.w} ${view.h}`}
            className="w-full h-auto"
            onMouseMove={(e) => {
              const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
              const px = ((e.clientX - rect.left) / rect.width) * view.w;
              const i = Math.round(((px - view.pad.l) / (view.w - view.pad.l - view.pad.r)) * (prices.length - 1));
              if (i >= 0 && i < prices.length) setHover(prices[i]);
            }}
            onMouseLeave={() => setHover(null)}
          >
            {[view.max, (view.max + view.min) / 2, view.min].map((t) => (
              <g key={t}>
                <line x1={view.pad.l} x2={view.w - view.pad.r} y1={view.y(t)} y2={view.y(t)} stroke="var(--line)" strokeDasharray="2 3" />
                <text x={view.pad.l - 4} y={view.y(t) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{compact(t)}</text>
              </g>
            ))}
            <path className="line-draw" d={view.path} fill="none" stroke={view.up ? "var(--green)" : "var(--red)"} strokeWidth="2" />
            {hover && <line x1={view.x(prices.indexOf(hover))} x2={view.x(prices.indexOf(hover))} y1={view.pad.t} y2={view.h - view.pad.b} stroke="var(--gold)" strokeWidth="1" />}
          </svg>
        </>
      )}
    </Card>
  );
}

// ---------- Financial trend charts ----------
export function Trends({ data }: { data: CompanyData }) {
  const a = data.annual;
  if (a.length < 2) return null;
  const labels = a.map((r) => yLabel(r.period));
  const marginPct = (n: number | null, d: number | null) => (n !== null && d ? (n / d) * 100 : null);
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Revenue"><BarChart currency={data.currency} points={a.map((r) => ({ label: yLabel(r.period), value: r.revenue }))} /></Card>
      <Card title="Net income"><BarChart currency={data.currency} points={a.map((r) => ({ label: yLabel(r.period), value: r.netIncome }))} /></Card>
      <Card title="Free cash flow"><BarChart currency={data.currency} points={a.map((r) => ({ label: yLabel(r.period), value: r.fcf }))} /></Card>
      <Card title="Margins">
        <LineChart labels={labels} series={[
          { name: "gross", color: "var(--purple)", values: a.map((r) => marginPct(r.grossProfit, r.revenue)) },
          { name: "operating", color: "var(--gold)", values: a.map((r) => marginPct(r.operatingIncome, r.revenue)) },
          { name: "FCF", color: "var(--green)", values: a.map((r) => marginPct(r.fcf, r.revenue)) },
        ]} />
      </Card>
      <Card title="Shares outstanding"><BarChart currency={data.currency} points={a.map((r) => ({ label: yLabel(r.period), value: r.sharesOutstanding }))} /></Card>
      <Card title="Debt vs cash">
        <LineChart unit="" labels={labels} series={[
          { name: "cash", color: "var(--green)", values: a.map((r) => (r.cash === null ? null : r.cash / 1e9)) },
          { name: "debt", color: "var(--red)", values: a.map((r) => (r.totalDebt === null ? null : r.totalDebt / 1e9)) },
        ]} />
        <div className="text-[0.65rem] text-dim">{data.currency} billions</div>
      </Card>
    </div>
  );
}

export function ValuationHistory({ data }: { data: CompanyData }) {
  const v = data.valuationHistory.filter((p) => p.pe !== null || p.ps !== null || p.pfcf !== null);
  if (v.length < 2) return null;
  const labels = v.map((p) => p.period);
  const avg = (xs: Array<number | null>) => {
    const c = xs.filter((n): n is number => n !== null);
    return c.length ? c.reduce((s, n) => s + n, 0) / c.length : null;
  };
  const series = [
    { name: "P/E", color: "var(--gold)", values: v.map((p) => p.pe) },
    { name: "P/S", color: "var(--purple)", values: v.map((p) => p.ps) },
    { name: "P/FCF", color: "var(--green)", values: v.map((p) => p.pfcf) },
    { name: "EV/EBITDA", color: "#6ea8fe", values: v.map((p) => p.evEbitda) },
  ];
  return (
    <Card title="Valuation history (vs 5-yr average)">
      <LineChart unit="x" labels={labels} series={series} height={180} />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3 text-xs">
        {series.map((s) => {
          const last = s.values[s.values.length - 1];
          const a = avg(s.values);
          const rich = last !== null && a !== null && last > a;
          return (
            <div key={s.name} className="card-2 p-2">
              <div className="text-muted">{s.name}</div>
              <div className="text-text font-semibold">{multiple(last)}</div>
              <div className={rich ? "text-red" : "text-green"}>avg {multiple(a)} · {rich ? "above" : "below"}</div>
            </div>
          );
        })}
      </div>
      <p className="text-[0.68rem] text-dim mt-2">Computed from year-end price × shares vs each year&apos;s reported fundamentals ({data.overview.source}). Approximate; verify against filings.</p>
    </Card>
  );
}

// ---------- Company overview ----------
export function Overview({ data }: { data: CompanyData }) {
  const o = data.overview;
  const news = data.news ?? [];
  return (
    <div className="space-y-4">
      <Card title="Company">
        {o.description ? <p className="text-sm leading-relaxed">{o.description}</p> : <p className="text-sm text-muted">No description available.</p>}
        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          {o.sector && <Tag tone="purple">{o.sector}</Tag>}
          {o.industry && <Tag>{o.industry}</Tag>}
          {o.country && <Tag>{o.country}</Tag>}
          {o.employees && <Tag>{o.employees.toLocaleString()} employees</Tag>}
          {o.website && <a href={o.website} target="_blank" rel="noreferrer" className="chip chip-muted no-underline">website ↗</a>}
        </div>
      </Card>
      {news.length > 0 && (
        <Card title="Recent news">
          <ul className="space-y-2">
            {news.map((n) => (
              <li key={n.id} className="text-sm">
                {n.url ? <a href={n.url} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline">{n.headline}</a> : n.headline}
                <span className="text-xs text-muted ml-2">{n.source} · {dateLabel(n.date)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
      <div className="grid md:grid-cols-2 gap-4">
        <Card title="Key stats">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Market cap</dt><dd className="text-right">{money(o.keyStats.marketCap, data.currency)}</dd>
            <dt className="text-muted">Shares out</dt><dd className="text-right">{o.keyStats.sharesOutstanding ? compact(o.keyStats.sharesOutstanding) : "—"}</dd>
            <dt className="text-muted">Beta</dt><dd className="text-right">{o.keyStats.beta?.toFixed(2) ?? "—"}</dd>
            <dt className="text-muted">Dividend yield</dt><dd className="text-right">{pct(o.keyStats.dividendYieldPct)}</dd>
            <dt className="text-muted">Profit margin</dt><dd className="text-right">{pct(o.keyStats.profitMarginPct)}</dd>
          </dl>
        </Card>
        <Card title="Ownership">
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-muted">Insiders</dt><dd className="text-right">{pct(o.majorHolders.insidersPctHeld)}</dd>
            <dt className="text-muted">Institutions</dt><dd className="text-right">{pct(o.majorHolders.institutionsPctHeld)}</dd>
            <dt className="text-muted"># institutions</dt><dd className="text-right">{o.majorHolders.institutionsCount?.toLocaleString() ?? "—"}</dd>
          </dl>
        </Card>
      </div>
      {o.institutions.length > 0 && (
        <Card title="Top institutional holders">
          <table className="tbl w-full text-sm"><thead><tr><th>Institution</th><th className="text-right">% held</th><th className="text-right">Value</th></tr></thead>
            <tbody>{o.institutions.slice(0, 10).map((h) => (<tr key={h.organization}><td>{h.organization}</td><td className="text-right">{pct(h.pctHeld !== null ? h.pctHeld * 100 : null)}</td><td className="text-right">{money(h.value, data.currency)}</td></tr>))}</tbody>
          </table>
        </Card>
      )}
      {o.insiders.length > 0 && (
        <Card title="Recent insider transactions">
          <table className="tbl w-full text-sm min-w-[560px]"><thead><tr><th>Date</th><th>Name</th><th>Relation</th><th>Action</th><th className="text-right">Shares</th></tr></thead>
            <tbody>{o.insiders.slice(0, 12).map((t, i) => (<tr key={i}><td className="text-xs text-muted">{dateLabel(t.date)}</td><td>{t.name}</td><td className="text-xs text-muted">{t.relation}</td><td className="text-xs">{t.action}</td><td className="text-right">{t.shares?.toLocaleString() ?? "—"}</td></tr>))}</tbody>
          </table>
          <p className="text-[0.68rem] text-dim mt-2">{o.source} · as of {dateLabel(o.asOf)}</p>
        </Card>
      )}
    </div>
  );
}

// ---------- Tab wrapper ----------
type TabId = "analysis" | "scorecard" | "committee" | "copilot" | "timemachine" | "financials" | "charts" | "overview";
const DATA_TABS: TabId[] = ["scorecard", "financials", "charts", "overview"];

const TAB_IDS: TabId[] = ["analysis", "scorecard", "committee", "copilot", "timemachine", "financials", "charts", "overview"];

export function CompanyTabs({ symbol, analysis, signedIn = false, initialTab }: { symbol: string; analysis: React.ReactNode; signedIn?: boolean; initialTab?: string }) {
  const [tab, setTab] = useState<TabId>(TAB_IDS.includes(initialTab as TabId) ? (initialTab as TabId) : "analysis");
  const [data, setData] = useState<CompanyData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!DATA_TABS.includes(tab) || data || loading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    fetch(`/api/company/${symbol}`)
      .then(async (r) => (r.ok ? ((await r.json()) as CompanyData) : Promise.reject(new Error((await r.json()).error))))
      .then((d) => setData(d))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tab, symbol, data, loading]);

  const tabs: Array<[TabId, string]> = [
    ["analysis", "AI analysis"],
    ["scorecard", "Scorecard"],
    ["committee", "Committee"],
    ["copilot", "Ask this stock"],
    ["timemachine", "Time machine"],
    ["financials", "Financials"],
    ["charts", "Charts"],
    ["overview", "Overview"],
  ];
  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-line overflow-x-auto">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-4 py-2 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === id ? "border-gold text-text" : "border-transparent text-muted hover:text-text"}`}>{label}</button>
        ))}
      </div>
      <div hidden={tab !== "analysis"}>{analysis}</div>
      {tab === "committee" && <Committee symbol={symbol} signedIn={signedIn} />}
      {tab === "timemachine" && <TimeMachine symbol={symbol} />}
      {tab === "copilot" && (
        <ChatPanel
          endpoint="/api/ticker-chat"
          body={{ ticker: symbol }}
          historyUrl={`/api/ticker-chat?ticker=${symbol}`}
          signedIn={signedIn}
          placeholder={`Ask about ${symbol}…`}
          emptyHint={`Ask anything about ${symbol}. Answers come only from the verified analysis and financials on this page — with dates — and it won't invent numbers.`}
          suggestions={["Why this rating?", "What's the biggest risk?", "Is free cash flow healthy?", "What would change the thesis?"]}
        />
      )}
      {DATA_TABS.includes(tab) && (
        loading ? <SkeletonCard lines={5} /> : error ? <div className="card p-6 text-sm text-red">{error}</div> : data ? (
          <>
            {tab === "scorecard" && <Scorecard data={data} />}
            {tab === "financials" && <Financials data={data} />}
            {tab === "charts" && <div className="space-y-4"><PriceChart symbol={symbol} /><ValuationHistory data={data} /><Trends data={data} /></div>}
            {tab === "overview" && <Overview data={data} />}
          </>
        ) : null
      )}
    </div>
  );
}
