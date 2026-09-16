"use client";

import type { ReactNode } from "react";
import type { Analysis, ModelOutput } from "@/lib/analysis/schema";
import { bandForScore } from "@/lib/analysis/schema";
import type { DataSections } from "@/lib/analysis/assemble";
import { ActionChip, Card, Estimate, ExpandableCard, FcfChip, Kpi, RatingChip, StaleBadge, Tag } from "@/components/ui";
import { BarChart, ForecastBands, LineChart, RangeMarker } from "@/components/charts";
import { dateLabel, money, multiple, MULTIPLE_LABEL, pct, price as fmtPrice } from "@/lib/format";

type Meta = DataSections["meta"];
type Price = Analysis["price"];
type Valuation = DataSections["valuation"] & Partial<Pick<Analysis["valuation"], "primaryMultiple" | "peakOnPeakCyclical">>;
type Growth = Analysis["growth"];
type Fcf = DataSections["fcf"] & { verdictReason?: string };
type Balance = Analysis["balanceSheet"];

const qLabel = (period: string) => {
  const [y, m] = period.split("-");
  return `Q${Math.ceil(Number(m) / 3)}'${y.slice(2)}`;
};

// ---------- header ----------
export function HeaderSection({ meta, price, rating, fcfVerdict, right }: { meta: Meta; price: Price; rating?: Analysis["rating"] | null; fcfVerdict?: Fcf["verdict"]; right?: ReactNode }) {
  return (
    <div className="card p-5 fade-up">
      <div className="flex flex-col md:flex-row md:flex-wrap md:items-start gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-semibold tracking-tight">{meta.ticker}</h1>
            <span className="text-muted">{meta.companyName}</span>
            {meta.exchange && <Tag>{meta.exchange}</Tag>}
            {meta.sector && <Tag tone="purple">{meta.sector}</Tag>}
            {meta.industry && <Tag>{meta.industry}</Tag>}
          </div>
          <div className="mt-2 flex items-baseline gap-3 flex-wrap">
            <span className="text-3xl font-semibold">{fmtPrice(price.current.value, meta.currency)}</span>
            <span className={`text-sm font-medium ${(price.dayChangePct.value ?? 0) >= 0 ? "text-green" : "text-red"}`}>{pct(price.dayChangePct.value, 2, true)} today</span>
            <span className="text-xs text-muted">
              {price.current.source} · {dateLabel(price.current.asOf)}
            </span>
            <StaleBadge asOf={price.current.asOf} />
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {rating && <RatingChip score={rating.score} />}
          {rating && <ActionChip action={rating.action} />}
          {fcfVerdict && <FcfChip verdict={fcfVerdict} large />}
        </div>
      </div>
      {right && <div className="mt-3 flex items-center gap-3 flex-wrap text-xs text-muted">{right}</div>}
    </div>
  );
}

// ---------- price & valuation ----------
export function PriceSection({ price, currency }: { price: Price; currency: string }) {
  return (
    <Card title="Price & market context">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Market cap" value={money(price.marketCap.value, currency, 2)} source={price.marketCap} />
        <Kpi label="Shares outstanding" value={price.sharesOutstanding.value === null ? "unverified" : `${(price.sharesOutstanding.value / 1e9).toFixed(2)}B`} source={price.sharesOutstanding} sub={price.dilution.note} tone={price.dilution.flag ? "red" : undefined} />
        <Kpi label="52-week low" value={fmtPrice(price.week52Low.value, currency)} source={price.week52Low} />
        <Kpi label="52-week high" value={fmtPrice(price.week52High.value, currency)} source={price.week52High} />
      </div>
      <div className="mt-4">
        <RangeMarker low={price.week52Low.value} high={price.week52High.value} current={price.current.value} currency={currency} />
      </div>
    </Card>
  );
}

export function ValuationSection({ valuation }: { valuation: Valuation }) {
  const keys = ["trailingPE", "forwardPE", "evToEbitda", "priceToSales", "priceToFcf", "priceToBook"] as const;
  return (
    <Card title="Valuation" right={valuation.primaryMultiple ? <Tag tone="purple">lens: {MULTIPLE_LABEL[valuation.primaryMultiple]}</Tag> : undefined}>
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
        {keys.map((k) => (
          <Kpi key={k} label={MULTIPLE_LABEL[k]} value={multiple(valuation[k].value)} source={valuation[k]} tone={valuation.primaryMultiple === k ? "gold" : undefined} />
        ))}
      </div>
      {valuation.peakOnPeakCyclical && (
        <p className={`mt-3 text-sm ${valuation.peakOnPeakCyclical.flag ? "text-red" : "text-muted"}`}>
          {valuation.peakOnPeakCyclical.flag ? "⚠ Peak multiple on peak earnings: " : "Cycle check: "}
          {valuation.peakOnPeakCyclical.reasoning}
        </p>
      )}
    </Card>
  );
}

// ---------- growth ----------
export function GrowthSection({ growth, currency }: { growth: Growth; currency: string }) {
  const dir = growth.marginDirection;
  return (
    <Card title="Revenue growth & margins">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Revenue (TTM)" value={money(growth.revenueTTM.value, currency)} source={growth.revenueTTM} />
        <Kpi label="Rev growth YoY (latest Q)" value={pct(growth.revenueGrowthYoYLatestQ.value, 1, true)} source={growth.revenueGrowthYoYLatestQ} tone={(growth.revenueGrowthYoYLatestQ.value ?? 0) >= 0 ? "green" : "red"} />
        <Kpi label="Gross margin" value={pct(growth.grossMarginPct.value)} source={growth.grossMarginPct} />
        <Kpi label="Operating margin" value={pct(growth.operatingMarginPct.value)} source={growth.operatingMarginPct} sub={`direction: ${dir}`} tone={dir === "deteriorating" ? "red" : dir === "improving" ? "green" : undefined} />
      </div>
      <div className="grid md:grid-cols-2 gap-4 mt-4">
        <BarChart title="Quarterly revenue" currency={currency} points={growth.revenueHistory.map((r) => ({ label: qLabel(r.period), value: r.revenue }))} />
        <LineChart title="Margins (the honest gauge for cyclicals)" labels={growth.marginHistory.map((m) => qLabel(m.period))} series={[{ name: "gross", color: "var(--purple)", values: growth.marginHistory.map((m) => m.grossPct) }, { name: "operating", color: "var(--gold)", values: growth.marginHistory.map((m) => m.operatingPct) }]} />
      </div>
    </Card>
  );
}

// ---------- FCF (the #1 KPI) ----------
export function FcfSection({ fcf, currency }: { fcf: Fcf; currency: string }) {
  const tone = fcf.verdict === "healthy" ? "green" : fcf.verdict === "negative" ? "red" : "gold";
  return (
    <Card title="Free cash flow — #1 KPI" tone={tone} right={<FcfChip verdict={fcf.verdict} large />}>
      {fcf.headlineRisk && <div className="mb-3 text-sm text-red font-medium">❌ Headline risk: free cash flow is {fcf.verdict === "negative" ? "negative" : "deteriorating"}.</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="FCF (TTM)" value={money(fcf.ttm.value, currency)} source={fcf.ttm} tone={(fcf.ttm.value ?? 0) < 0 ? "red" : "green"} />
        <Kpi label="FCF (latest Q)" value={money(fcf.latestQuarter.value, currency)} source={fcf.latestQuarter} />
        <Kpi label="FCF margin" value={pct(fcf.marginPct.value)} source={fcf.marginPct} />
        <Kpi label="Trend" value={fcf.trend} tone={fcf.trend === "deteriorating" ? "red" : fcf.trend === "improving" ? "green" : undefined} sub="TTM vs prior TTM, else YoY" />
      </div>
      <div className="mt-4">
        <BarChart title="Quarterly free cash flow" currency={currency} points={fcf.history.map((h) => ({ label: qLabel(h.period), value: h.fcf }))} />
      </div>
      {fcf.verdictReason ? <p className="mt-3 text-sm">{fcf.verdictReason}</p> : <div className="skeleton h-4 w-2/3 mt-3" />}
    </Card>
  );
}

// ---------- balance sheet ----------
export function BalanceSection({ balanceSheet, currency, capitalActions }: { balanceSheet: Balance; currency: string; capitalActions?: string | null }) {
  return (
    <Card title="Balance sheet">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Kpi label="Cash & investments" value={money(balanceSheet.cash.value, currency)} source={balanceSheet.cash} />
        <Kpi label="Total debt" value={money(balanceSheet.totalDebt.value, currency)} source={balanceSheet.totalDebt} />
        <Kpi label={balanceSheet.posture === "net_debt" ? "Net debt" : "Net cash"} value={balanceSheet.netCash === null ? "unverified" : money(Math.abs(balanceSheet.netCash), currency)} tone={balanceSheet.posture === "net_debt" ? "red" : "green"} sub={balanceSheet.selfFundsCapex === null ? "capex funding unverified" : balanceSheet.selfFundsCapex ? "self-funds capex" : "cannot self-fund capex"} />
        <Kpi label="Buybacks (TTM)" value={money(balanceSheet.buybacksTTM.value, currency)} source={balanceSheet.buybacksTTM} sub={balanceSheet.netShareIssuanceTTM.value !== null && balanceSheet.netShareIssuanceTTM.value > 0 ? `net issuance ${money(balanceSheet.netShareIssuanceTTM.value, currency)}` : undefined} />
      </div>
      {(capitalActions ?? balanceSheet.capitalActions) && <p className="mt-3 text-sm text-muted">{capitalActions ?? balanceSheet.capitalActions}</p>}
    </Card>
  );
}

// ---------- news ----------
const IMPACT_TONE = { positive: "green", negative: "red", neutral: "muted" } as const;

export function NewsSection({ news, newsSource, note, pending }: { news: Analysis["news"] | Array<ModelOutput["news"][number]>; newsSource?: Analysis["newsSource"]; note?: string | null; pending?: boolean }) {
  return (
    <Card title="Last 7 days — material news" right={newsSource === "web_search" ? <Tag tone="purple">via web search</Tag> : undefined}>
      {news.length === 0 && <p className="text-sm text-muted">{note ?? "No material news found in the window."}</p>}
      <ul className="space-y-2">
        {news.map((n) => {
          const full = "headline" in n ? n : null;
          return (
            <li key={n.id} className="card-2 p-3">
              <div className="flex items-center gap-2 flex-wrap">
                <Tag tone={IMPACT_TONE[n.thesisImpact]}>{n.thesisImpact}</Tag>
                <Tag>{n.category.replace("_", " ")}</Tag>
                {full && (
                  <span className="text-xs text-muted">
                    {full.source} · {dateLabel(full.date)}
                  </span>
                )}
              </div>
              {full ? (
                <div className="mt-1 text-sm font-medium">
                  {full.url ? (
                    <a href={full.url} target="_blank" rel="noreferrer" className="text-text no-underline hover:underline">
                      {full.headline}
                    </a>
                  ) : (
                    full.headline
                  )}
                </div>
              ) : (
                pending && <div className="skeleton h-3 w-2/3 mt-2" />
              )}
              {n.summary && <div className="text-sm text-muted mt-0.5">{n.summary}</div>}
            </li>
          );
        })}
      </ul>
      {note && news.length > 0 && <p className="text-xs text-muted mt-2">{note}</p>}
    </Card>
  );
}

// ---------- business & thesis ----------
export function BusinessSection({ business }: { business: ModelOutput["business"] }) {
  return (
    <Card title="Business">
      <dl className="grid md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
        <div>
          <dt className="text-muted text-xs uppercase tracking-wider">What it does</dt>
          <dd className="mt-0.5">{business.whatItDoes}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs uppercase tracking-wider">Best at</dt>
          <dd className="mt-0.5">{business.bestAt}</dd>
        </div>
        <div>
          <dt className="text-muted text-xs uppercase tracking-wider">Works with</dt>
          <dd className="mt-1 flex flex-wrap gap-1.5">
            {business.worksWith.map((w) => (
              <span key={w.name} className="chip chip-muted" title={w.relationship}>
                {w.name}
              </span>
            ))}
            {!business.worksWith.length && <span className="text-dim italic">unverified</span>}
          </dd>
        </div>
        <div>
          <dt className="text-muted text-xs uppercase tracking-wider">
            Moat · durability <Tag tone={business.moat.durability === "high" ? "green" : business.moat.durability === "low" ? "red" : "gold"}>{business.moat.durability}</Tag>
          </dt>
          <dd className="mt-0.5">{business.moat.description}</dd>
        </div>
      </dl>
    </Card>
  );
}

export function ThesisSection({ thesis }: { thesis: ModelOutput["thesis"] }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card title="Bull thesis" tone="green">
        <p className="text-sm">{thesis.bull}</p>
      </Card>
      <Card title="Bear case — stated as loudly" tone="red">
        <p className="text-sm">{thesis.bear}</p>
        <p className="text-sm mt-3">
          <span className="text-muted text-xs uppercase tracking-wider">Primary failure mode</span>
          <br />
          {thesis.primaryFailureMode}
        </p>
      </Card>
    </div>
  );
}

export function CatalystsSection({ catalysts }: { catalysts: ModelOutput["catalysts"] }) {
  const sorted = [...catalysts].sort((a, b) => (a.date === "TBD" ? 1 : b.date === "TBD" ? -1 : a.date.localeCompare(b.date)));
  return (
    <Card title="Catalysts" tone="purple">
      {sorted.length === 0 && <p className="text-sm text-muted">No dated catalysts identified.</p>}
      <ol className="relative border-l border-line ml-2 space-y-3">
        {sorted.map((c, i) => (
          <li key={i} className="ml-4">
            <span className={`absolute -left-1.5 mt-1.5 w-3 h-3 rounded-full ${c.expectedDirection === "up" ? "bg-green" : c.expectedDirection === "down" ? "bg-red" : "bg-purple"}`} />
            <div className="text-xs text-muted">
              {c.date === "TBD" ? `TBD${c.dateSource ? ` · ${c.dateSource}` : ""}` : dateLabel(c.date)} · {c.type}
            </div>
            <div className="text-sm">{c.event}</div>
          </li>
        ))}
      </ol>
    </Card>
  );
}

// ---------- rating, forecast, tripwire ----------
export function RatingSection({ rating }: { rating: ModelOutput["rating"] & { band?: Analysis["rating"]["band"] } }) {
  const band = rating.band ?? bandForScore(rating.score);
  return (
    <Card title="Rating" tone="gold" right={<Estimate />}>
      <div className="flex items-center gap-3 flex-wrap">
        <RatingChip score={rating.score} />
        <ActionChip action={rating.action} />
        <Tag tone="muted">{band}</Tag>
        <Tag tone="muted">confidence: {rating.confidence}</Tag>
      </div>
      <p className="mt-3 text-sm">{rating.justification}</p>
    </Card>
  );
}

type ForecastCase = { returnPct: number; reasoning: string; priceTarget?: number | null };
export function ForecastSection({ forecast, currentPrice, currency }: { forecast: { bear: ForecastCase; base: ForecastCase; bull: ForecastCase }; currentPrice: number | null; currency: string }) {
  const target = (r: number) => (currentPrice === null ? null : Math.round(currentPrice * (1 + r / 100) * 100) / 100);
  const cases = [
    { key: "bear", tone: "text-red", ...forecast.bear, priceTarget: forecast.bear.priceTarget ?? target(forecast.bear.returnPct) },
    { key: "base", tone: "text-purple", ...forecast.base, priceTarget: forecast.base.priceTarget ?? target(forecast.base.returnPct) },
    { key: "bull", tone: "text-green", ...forecast.bull, priceTarget: forecast.bull.priceTarget ?? target(forecast.bull.returnPct) },
  ];
  return (
    <Card title="12-month view" tone="purple" right={<Estimate />}>
      <ForecastBands current={currentPrice} bear={cases[0].priceTarget} base={cases[1].priceTarget} bull={cases[2].priceTarget} currency={currency} />
      <div className="grid md:grid-cols-3 gap-3 mt-2">
        {cases.map((c) => (
          <div key={c.key} className="card-2 p-3">
            <div className={`text-xs uppercase tracking-wider font-semibold ${c.tone}`}>
              {c.key} · {pct(c.returnPct, 0, true)} · {fmtPrice(c.priceTarget, currency)}
            </div>
            <div className="text-sm text-muted mt-1">{c.reasoning}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

export function TripwireSection({ tripwire, previous }: { tripwire: ModelOutput["tripwire"]; previous?: Analysis["previousTripwire"] }) {
  return (
    <Card title="Tripwire — what flips the rating" tone="gold">
      <p className="text-sm">{tripwire.description}</p>
      <div className="mt-2 flex gap-2 flex-wrap text-xs">
        <Tag>metric: {tripwire.metric}</Tag>
        {tripwire.threshold && <Tag>threshold: {tripwire.threshold}</Tag>}
        <Tag tone={tripwire.direction === "down" ? "red" : tripwire.direction === "up" ? "green" : "gold"}>direction: {tripwire.direction}</Tag>
      </div>
      {previous && (
        <p className={`mt-3 text-sm ${previous.triggered ? "text-red" : "text-muted"}`}>
          Previous tripwire &ldquo;{previous.description}&rdquo; {previous.triggered ? "TRIGGERED" : "not triggered"}: {previous.reason}
        </p>
      )}
    </Card>
  );
}

export function DataConcerns({ concerns }: { concerns: string[] }) {
  if (!concerns.length) return null;
  return (
    <Card title="Data concerns the model flagged" tone="red">
      <ul className="list-disc ml-5 text-sm space-y-1">
        {concerns.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ul>
    </Card>
  );
}

export function SourcesFooter({ analysis }: { analysis: Analysis }) {
  const v = analysis.meta.verification;
  return (
    <ExpandableCard header={<div className="text-sm font-semibold text-muted uppercase tracking-wide">Sources ({analysis.sources.length}) · verification {v.passed ? "✓ passed" : "✗ failed"} · {analysis.meta.model} · ${analysis.meta.usage.usd.toFixed(3)}</div>}>
      <ul className="text-xs text-muted space-y-1">
        {analysis.sources.map((s) => (
          <li key={s.id}>
            <span className="text-text">{s.name}</span> · {dateLabel(s.asOf)} · {s.usedFor.join(", ")}
            {s.url && (
              <>
                {" · "}
                <a href={s.url} target="_blank" rel="noreferrer">
                  link
                </a>
              </>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-4 text-xs text-muted">
        <div className="uppercase tracking-wider mb-1">Verification checks</div>
        <ul className="grid md:grid-cols-2 gap-x-4">
          {v.checks.map((c) => (
            <li key={c.id} className={c.ok ? "" : "text-red"}>
              {c.ok ? "✓" : "✗"} {c.id} — {c.detail}
            </li>
          ))}
        </ul>
      </div>
      <p className="mt-4 text-xs text-dim">{analysis.disclaimer}</p>
    </ExpandableCard>
  );
}
