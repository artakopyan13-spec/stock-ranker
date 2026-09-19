"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { PortfolioReviewV2, ReviewCard } from "@/lib/portfolio/review-schema";
import type { Kpi } from "@/lib/portfolio/kpis";
import { BarChart, ForecastBands, RangeMarker } from "@/components/charts";
import { InfoDot } from "@/components/Info";
import { ago, dateLabel, money, price as fmtPrice } from "@/lib/format";

const TONE_TEXT: Record<string, string> = { green: "text-green", gold: "text-gold", red: "text-red", purple: "text-purple", cyan: "text-purple" };
const TONE_CHIP: Record<string, string> = { green: "chip-green", gold: "chip-gold", red: "chip-red", purple: "chip-purple", cyan: "chip-muted" };
const FLAG_TEXT: Record<string, string> = { good: "text-green", warn: "text-gold", bad: "text-red", none: "text-text" };
const IMPACT_CHIP: Record<string, string> = { high: "chip-red", med: "chip-gold", low: "chip-muted" };

function money0(n: number | null): string {
  return n === null ? "—" : money(n, "USD", 0);
}
function signedMoney(n: number | null): string {
  if (n === null) return "—";
  return `${n >= 0 ? "+" : "−"}${money(Math.abs(n), "USD", 0)}`;
}

type TabId = "overview" | "honest" | "calendar" | "plan" | "zones" | "ideas" | "stocks" | "history";

export function PortfolioDashboard({ review }: { review: PortfolioReviewV2 }) {
  const r = review;
  const [tab, setTab] = useState<TabId>("overview");

  const glance = useMemo(() => {
    const inBuy = r.zones.filter((z) => {
      const now = r.cards.find((c) => c.numbers.symbol === z.t.toUpperCase())?.numbers.price ?? null;
      return now !== null && ((z.buyBelow !== null && now <= z.buyBelow) || (z.strongBuyBelow !== null && now <= z.strongBuyBelow));
    }).length;
    const inTrim = r.zones.filter((z) => {
      const now = r.cards.find((c) => c.numbers.symbol === z.t.toUpperCase())?.numbers.price ?? null;
      return now !== null && z.trimAbove !== null && now >= z.trimAbove;
    }).length;
    const today = new Date().toISOString().slice(0, 10);
    const upcoming = r.events.filter((e) => e.date >= today).sort((a, b) => a.date.localeCompare(b.date));
    const nextEarn = upcoming.find((e) => e.type.toLowerCase().includes("earn"));
    const nextRed = upcoming.find((e) => e.impact.toLowerCase() === "high");
    return { inBuy, inTrim, nextEarn, nextRed };
  }, [r]);

  const tabs: Array<[TabId, string]> = [
    ["overview", "Overview"],
    ["honest", "Honest review"],
    ["calendar", "Calendar"],
    ...(r.plan ? ([["plan", "Plan"]] as Array<[TabId, string]>) : []),
    ["zones", "Buy / Sell"],
    ["ideas", "New ideas"],
    ["stocks", "My stocks"],
    ...(r.alltime ? ([["history", "History"]] as Array<[TabId, string]>) : []),
  ];

  return (
    <div className="card p-0 overflow-hidden">
      <div className="flex gap-1 border-b border-line overflow-x-auto no-scrollbar px-2 bg-card sticky top-[80px] z-20">
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setTab(id)} className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px ${tab === id ? "border-gold text-text" : "border-transparent text-muted hover:text-text"}`}>{label}</button>
        ))}
      </div>

      <div className="p-4 space-y-5">
        {tab === "overview" && <Overview r={r} glance={glance} goto={setTab} />}
        {tab === "honest" && <Honest r={r} />}
        {tab === "calendar" && <Calendar r={r} />}
        {tab === "plan" && r.plan && <PlanTab r={r} />}
        {tab === "zones" && <Zones r={r} />}
        {tab === "ideas" && <Ideas r={r} />}
        {tab === "stocks" && <Stocks r={r} />}
        {tab === "history" && r.alltime && <History r={r} />}
      </div>

      <div className="border-t border-line px-4 py-3 text-[0.65rem] text-dim">
        Ratings, letter grades, 12-month ranges, price zones and sell/trim calls are the model&rsquo;s estimates — research, not financial advice or predictions. Verify every figure and consult a licensed professional before acting.
        {r.unverified && <span className="text-muted"> · Unverified: {r.unverified}</span>}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold mb-2 uppercase tracking-wider text-muted">{title}</h3>
      {children}
    </div>
  );
}

// ---------- Overview ----------
function Overview({ r, glance, goto }: { r: PortfolioReviewV2; glance: { inBuy: number; inTrim: number; nextEarn?: { date: string; tickers: string[]; title: string }; nextRed?: { date: string; title: string } }; goto: (t: TabId) => void }) {
  return (
    <>
      <div className="card-2 p-4 border-l-2 border-l-gold">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-2xl font-bold">{r.review.grade}</span>
          <span className="text-lg font-semibold">{r.headline}</span>
        </div>
        <p className="text-sm text-muted mt-2 leading-relaxed">{r.thesis}</p>
        <div className="text-[0.65rem] text-dim mt-2">Built {ago(r.generatedAt)} · {r.model} · framework, not advice</div>
      </div>

      <Section title="At a glance">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Glance label="In a buy zone" value={`${glance.inBuy}`} tone={glance.inBuy > 0 ? "green" : undefined} onClick={() => goto("zones")} />
          <Glance label="In a trim zone" value={`${glance.inTrim}`} tone={glance.inTrim > 0 ? "red" : undefined} onClick={() => goto("zones")} />
          <Glance label="Next earnings" value={glance.nextEarn ? `${glance.nextEarn.tickers[0] ?? ""} ${dateLabel(glance.nextEarn.date)}`.trim() : "—"} onClick={() => goto("calendar")} />
          <Glance label="Next red folder" value={glance.nextRed ? dateLabel(glance.nextRed.date) : "—"} tone="gold" onClick={() => goto("calendar")} />
        </div>
      </Section>

      <Section title="The honest read">
        <p className="text-sm leading-relaxed">{r.honestRead}</p>
      </Section>

      {r.nextSteps.length > 0 && (
        <Section title="What to do, in order">
          <ol className="space-y-2">
            {r.nextSteps.map((s, i) => (
              <li key={i} className="flex gap-2 text-sm">
                <span className="text-gold font-semibold">{i + 1}.</span>
                <span dangerouslySetInnerHTML={{ __html: s }} />
              </li>
            ))}
          </ol>
        </Section>
      )}

      {r.themes.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {r.themes.map((t) => (
            <div key={t.label} className="card-2 p-4">
              <div className="text-xs uppercase tracking-wider text-muted">{t.label}</div>
              <div className={`text-2xl font-bold ${TONE_TEXT[t.tone] ?? "text-text"}`}>{Math.round(t.pct)}%</div>
              <div className="text-xs text-muted mt-1">{t.sub}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Glance({ label, value, tone, onClick }: { label: string; value: string; tone?: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="card-2 p-3 text-left hover:border-purple transition-colors">
      <div className="text-[0.65rem] uppercase tracking-wider text-muted">{label}</div>
      <div className={`text-lg font-bold ${tone ? TONE_TEXT[tone] : "text-text"}`}>{value}</div>
      <div className="text-[0.6rem] text-dim">tap to jump →</div>
    </button>
  );
}

// ---------- Honest review ----------
function Honest({ r }: { r: PortfolioReviewV2 }) {
  const v = r.review;
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="text-4xl font-bold text-gold">{v.grade}</span>
        <div>
          <div className="text-sm text-muted">{v.gradeNote}</div>
          <p className="text-sm mt-1 leading-relaxed">{v.summary}</p>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-green mb-2">What you&rsquo;re doing right</div>
          <ul className="space-y-1 text-sm text-muted list-disc ml-5">{v.good.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
        <div>
          <div className="text-xs uppercase tracking-wider text-red mb-2">What worries me</div>
          <ul className="space-y-1 text-sm text-muted list-disc ml-5">{v.bad.map((s, i) => <li key={i}>{s}</li>)}</ul>
        </div>
      </div>
      {v.suggestions.length > 0 && (
        <Section title="Suggestions">
          <ol className="space-y-2 text-sm">
            {v.suggestions.map((s, i) => <li key={i} className="flex gap-2"><span className="text-gold">{i + 1}.</span><span dangerouslySetInnerHTML={{ __html: s }} /></li>)}
          </ol>
        </Section>
      )}
      {v.perStock.length > 0 && (
        <Section title="One line per stock">
          <div className="space-y-2">
            {v.perStock.map((p) => (
              <Link key={p.t} href={`/t/${p.t}`} className="card-2 p-3 flex items-center gap-3 no-underline text-text hover:border-purple transition-colors">
                <span className="font-semibold w-16">{p.t}</span>
                <span className={`chip ${TONE_CHIP[p.tone] ?? "chip-muted"}`}>{p.call}</span>
                <span className="text-sm text-muted flex-1">{p.line}</span>
                <span className="text-xs text-purple">open →</span>
              </Link>
            ))}
          </div>
        </Section>
      )}
      <p className="text-[0.65rem] text-dim">Plain-language judgment, consistent with the plan and price zones. Estimates, not advice.</p>
    </>
  );
}

// ---------- Calendar ----------
function Calendar({ r }: { r: PortfolioReviewV2 }) {
  return (
    <>
      {r.macro.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {r.macro.map((m, i) => (
            <div key={i} className="card-2 p-3">
              <div className="text-xs font-semibold text-gold mb-1">{m.h}</div>
              <p className="text-sm text-muted">{m.p}</p>
            </div>
          ))}
        </div>
      )}
      {r.events.length > 0 ? (
        <Section title="Event calendar">
          <ul className="space-y-2">
            {[...r.events].sort((a, b) => a.date.localeCompare(b.date)).map((e, i) => (
              <li key={i} className="flex items-start gap-3 text-sm">
                <span className="text-xs text-muted w-24 shrink-0">{e.date === "TBD" ? "TBD" : dateLabel(e.date)}{e.est ? " (est)" : ""}</span>
                <span className={`chip ${IMPACT_CHIP[e.impact.toLowerCase()] ?? "chip-muted"} shrink-0`}>{e.impact.toLowerCase() === "high" ? "🔴 " : ""}{e.type}</span>
                <span>
                  <span className="font-medium">{e.title}</span>
                  {e.tickers.length > 0 && <span className="text-dim"> · {e.tickers.join(", ")}</span>}
                  <span className="block text-xs text-muted">{e.watch}</span>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : <p className="text-sm text-muted">No dated events were verifiable from the data.</p>}
    </>
  );
}

// ---------- Plan ----------
function PlanTab({ r }: { r: PortfolioReviewV2 }) {
  const p = r.plan!;
  return (
    <>
      <Section title="Plan for new cash">
        <p className="text-sm mb-3">{p.why}</p>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-muted mb-2">Allocations</div>
            <table className="tbl w-full text-sm"><tbody>
              {p.allocations.map((a, i) => (<tr key={i}><td>{a.name}<div className="text-xs text-dim">{a.why}</div></td><td className="text-right tabular-nums">{money0(a.amt)}</td></tr>))}
            </tbody></table>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wider text-muted mb-2">Tranches</div>
            <ul className="space-y-2 text-sm">
              {p.tranches.map((t, i) => (<li key={i} className="card-2 p-2"><span className="font-medium">{money0(t.amt)} · {t.name}</span><div className="text-xs text-muted">{t.window} — {t.buy}. {t.logic}</div></li>))}
            </ul>
          </div>
        </div>
        {p.noAdds.length > 0 && <p className="text-xs text-muted mt-3"><span className="text-red font-medium">No new money: </span>{p.noAdds.join(" · ")}</p>}
      </Section>
      {r.guardrails.length > 0 && (
        <Section title="Guardrails">
          <ul className="list-disc ml-5 text-sm space-y-1">{r.guardrails.map((g, i) => <li key={i} dangerouslySetInnerHTML={{ __html: g }} />)}</ul>
        </Section>
      )}
    </>
  );
}

// ---------- Buy / Sell ----------
function Zones({ r }: { r: PortfolioReviewV2 }) {
  return (
    <>
      <Section title="Buy & sell price zones">
        <div className="space-y-3">
          {r.zones.map((z) => {
            const now = r.cards.find((c) => c.numbers.symbol === z.t.toUpperCase())?.numbers.price ?? null;
            return (
              <div key={z.t} className="card-2 p-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="font-semibold">{z.t}</span>
                  <div className="flex gap-3 text-xs flex-wrap">
                    {z.strongBuyBelow !== null && <span className="text-green">strong buy ≤ {fmtPrice(z.strongBuyBelow)}</span>}
                    {z.buyBelow !== null && <span className="text-green">buy ≤ {fmtPrice(z.buyBelow)}</span>}
                    {now !== null && <span className="text-gold">now {fmtPrice(now)}</span>}
                    {z.trimAbove !== null && <span className="text-red">trim ≥ {fmtPrice(z.trimAbove)}</span>}
                    {z.sellAbove !== null && <span className="text-red">sell ≥ {fmtPrice(z.sellAbove)}</span>}
                    {z.stopBelow !== null && <span className="text-muted">stop {fmtPrice(z.stopBelow)}</span>}
                  </div>
                </div>
                <p className="text-xs text-muted mt-1">{z.basis}</p>
              </div>
            );
          })}
        </div>
      </Section>
      {r.actions.length > 0 && (
        <Section title="Sell · trim · hold">
          <div className="overflow-x-auto">
            <table className="tbl w-full text-sm min-w-[560px]">
              <thead><tr><th>Call</th><th>Position</th><th>Size</th><th>Why</th></tr></thead>
              <tbody>
                {r.actions.map((a, i) => (
                  <tr key={i}>
                    <td><span className={`chip ${TONE_CHIP[a.tone] ?? "chip-muted"}`}>{a.action}</span></td>
                    <td className="font-medium">{a.position}</td>
                    <td className="text-xs text-muted">{a.size}</td>
                    <td className="text-sm">{a.why}{a.tax && <span className="block text-xs text-gold mt-1">Tax: {a.tax}</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </>
  );
}

// ---------- New ideas ----------
function Ideas({ r }: { r: PortfolioReviewV2 }) {
  if (r.ideas.length === 0) return <p className="text-sm text-muted">No gap sectors identified.</p>;
  return (
    <div className="space-y-4">
      {r.ideas.map((idea, i) => (
        <div key={i}>
          <div className="text-sm"><span className="font-semibold text-gold">{idea.sector}</span> <span className="text-muted">— {idea.gap}</span></div>
          <div className="grid sm:grid-cols-2 gap-2 mt-2">
            {idea.picks.map((p) => (
              <div key={p.t} className="card-2 p-3">
                <div className="flex justify-between"><Link href={`/t/${p.t}`} className="font-semibold text-text no-underline hover:underline">{p.t}</Link><span className="text-xs text-dim">{p.name}</span></div>
                <p className="text-xs text-muted mt-1">{p.why}</p>
                <p className="text-xs text-dim mt-1">{p.numbers}</p>
                <p className="text-xs text-red mt-1">Risk: {p.risk}</p>
              </div>
            ))}
          </div>
          {idea.leaders.length > 0 && (
            <div className="mt-2 overflow-x-auto">
              <table className="tbl w-full text-xs min-w-[520px]">
                <thead><tr><th>Peer leader</th><th className="text-right">1-yr</th><th className="text-right">Fwd P/E</th><th className="text-right">FCF</th><th>Note</th></tr></thead>
                <tbody>
                  {idea.leaders.map((l) => (
                    <tr key={l.t}><td><Link href={`/t/${l.t}`} className="text-text no-underline hover:underline">{l.t}</Link> <span className="text-dim">{l.name}</span></td><td className="text-right">{l.perf1y}</td><td className="text-right">{l.fwdPe}</td><td className="text-right">{l.fcf}</td><td className="text-muted">{l.note}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ))}
      <p className="text-[0.65rem] text-dim">Candidates drawn from this app&rsquo;s analyzed universe. Best-performing is not best-buy.</p>
    </div>
  );
}

// ---------- My stocks ----------
function Stocks({ r }: { r: PortfolioReviewV2 }) {
  const [active, setActive] = useState(r.cards[0]?.numbers.symbol ?? "");
  const card = r.cards.find((c) => c.numbers.symbol === active) ?? r.cards[0];
  if (!card) return <p className="text-sm text-muted">No positions.</p>;
  return (
    <div className="space-y-3">
      <div className="flex gap-1 flex-wrap">
        {r.cards.map((c) => (
          <button key={c.numbers.symbol} onClick={() => setActive(c.numbers.symbol)} className={`chip ${active === c.numbers.symbol ? "chip-gold" : "chip-muted"}`}>{c.numbers.symbol}</button>
        ))}
      </div>
      <PositionPage card={card} />
    </div>
  );
}

function KpiCell({ k }: { k: Kpi }) {
  return (
    <div className="flex items-baseline justify-between gap-2 text-sm">
      <span className="text-muted text-xs">{k.label}{k.info && <> <InfoDot id={k.info} /></>}</span>
      <span className={`tabular-nums ${FLAG_TEXT[k.flag] ?? "text-text"}`}>{k.value}</span>
    </div>
  );
}

function PositionPage({ card }: { card: ReviewCard }) {
  const { numbers: n, j } = card;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <Link href={`/t/${n.symbol}`} className="text-xl font-bold text-text no-underline hover:underline">{n.symbol}</Link>
          {j && <span className={`chip ${TONE_CHIP[j.tone] ?? "chip-muted"}`}>{j.tag}</span>}
          {j && <span className="text-sm text-muted">{j.rate}/10</span>}
        </div>
        <span className="text-sm text-muted">{n.price !== null ? fmtPrice(n.price, n.currency) : ""}</span>
      </div>
      {j && <p className="text-sm text-muted">{j.one}</p>}
      {j && <p className="text-sm"><span className="text-gold font-medium">Bottom line: </span>{j.why}</p>}

      {/* FCF verdict */}
      <div className="card-2 p-3 flex items-start gap-2">
        <span className="text-lg">{n.fcfIcon}</span>
        <div>
          <div className="text-sm font-medium">{j?.fcfHeadline ?? (n.fcfTtm !== null ? `${money(n.fcfTtm, n.currency)} TTM FCF` : "FCF not verified")} <InfoDot id="fcf" /></div>
          {j && <p className="text-xs text-muted">{j.fcfExplanation}</p>}
        </div>
      </div>

      {/* price section: 52-week range + 12-month view */}
      <div className="grid md:grid-cols-2 gap-3">
        {n.range52 && (
          <div className="card-2 p-3">
            <div className="text-xs text-muted mb-1">52-week range</div>
            <RangeMarker low={n.range52[0]} high={n.range52[1]} current={n.price} currency={n.currency} />
          </div>
        )}
        {j && (
          <div className="card-2 p-3">
            <div className="text-xs text-muted mb-1">12-month view (estimate)</div>
            <ForecastBands current={n.price} bear={j.fBear} base={j.fBase} bull={j.fBull} currency={n.currency} />
          </div>
        )}
      </div>

      {/* all the numbers */}
      <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1">
        {n.kgroups.map((g) => (
          <div key={g.name}>
            <div className="text-[0.65rem] uppercase tracking-wider text-dim mt-1 mb-0.5">{g.name}</div>
            {g.items.map((k) => <KpiCell key={k.label} k={k} />)}
          </div>
        ))}
      </div>

      {/* quarter-by-quarter */}
      {n.trends.length > 0 && (
        <div>
          <div className="text-[0.65rem] uppercase tracking-wider text-dim mb-1">Quarter by quarter</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {n.trends.map((t) => (
              <BarChart key={t.label} title={`${t.label} (${t.unit})`} currency={t.unit === "%" ? "%" : n.currency} points={t.periods.map((p, i) => ({ label: p, value: t.values[i] }))} height={120} />
            ))}
          </div>
        </div>
      )}

      {/* long-term history */}
      {n.history.length > 0 && (
        <div>
          <div className="text-[0.65rem] uppercase tracking-wider text-dim mb-1">Long-term history</div>
          <div className="grid sm:grid-cols-2 gap-3">
            {n.history.map((t) => (
              <BarChart key={t.label} title={`${t.label} (annual)`} currency={n.currency} points={t.periods.map((p, i) => ({ label: p, value: t.values[i] }))} height={120} />
            ))}
          </div>
        </div>
      )}

      {/* the case */}
      {j && (
        <div className="space-y-1 text-sm">
          <div><span className="text-green font-medium">Bull:</span> <span className="text-muted">{j.bull}</span></div>
          <div><span className="text-red font-medium">Bear:</span> <span className="text-muted">{j.bear}</span></div>
          <div><span className="text-gold font-medium">Tripwire:</span> <span className="text-muted">{j.trip}</span></div>
          <div><span className="text-purple font-medium">Next:</span> <span className="text-muted">{j.cat}</span></div>
        </div>
      )}
      {!j && <p className="text-xs text-dim">Not yet analyzed — <Link href={`/t/${n.symbol}`} className="text-purple no-underline">run an analysis</Link> to fill in the judgment.</p>}
    </div>
  );
}

// ---------- History (all-time scorecard) ----------
function History({ r }: { r: PortfolioReviewV2 }) {
  const a = r.alltime!;
  const allTimePl = a.accountValue !== null && a.netDeposits !== null ? a.accountValue - a.netDeposits : null;
  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Glance2 label="Net deposits" value={money0(a.netDeposits)} />
        <Glance2 label="Account value" value={money0(a.accountValue)} />
        <Glance2 label="All-time P/L" value={signedMoney(allTimePl)} tone={allTimePl !== null && allTimePl >= 0 ? "green" : "red"} />
        <Glance2 label="Realized P/L" value={signedMoney(a.realized)} tone={(a.realized ?? 0) >= 0 ? "green" : "red"} />
      </div>
      {a.closed.length > 0 && (
        <Section title="Closed positions">
          <div className="overflow-x-auto">
            <table className="tbl w-full text-sm">
              <thead><tr><th>Position</th><th className="text-right">Realized P/L</th></tr></thead>
              <tbody>
                {a.closed.slice(0, 20).map((c) => (
                  <tr key={c.t}><td>{c.t}</td><td className={`text-right tabular-nums ${c.pl >= 0 ? "text-green" : "text-red"}`}>{signedMoney(c.pl)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
      <p className="text-xs text-dim">Income {money0(a.income)} · fees {money0(a.fees)}. {a.footnote}</p>
      <div className="mt-4">
        <div className="text-xs uppercase tracking-wider text-muted mb-1">Sources</div>
        <ul className="text-xs text-muted space-y-1">{r.sources.map((s, i) => <li key={i}>{s}</li>)}</ul>
        {r.unverified && <p className="text-xs text-gold mt-2">Unverified: {r.unverified}</p>}
        <p className="text-[0.65rem] text-dim mt-2">Estimates, not advice or predictions. Verify every figure and consult a licensed professional before acting.</p>
      </div>
    </>
  );
}

function Glance2({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="card-2 p-3">
      <div className="text-[0.65rem] uppercase tracking-wider text-muted">{label}</div>
      <div className={`text-lg font-bold ${tone ? TONE_TEXT[tone] : "text-text"}`}>{value}</div>
    </div>
  );
}
