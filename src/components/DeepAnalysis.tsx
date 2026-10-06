"use client";

import { useEffect, useState } from "react";
import type { DeepAnalysisOutput } from "@/lib/deep/schema";
import { ProgressLine } from "@/components/ProgressLine";

function toneFor(score: number): string {
  return score >= 7 ? "var(--green)" : score >= 5 ? "var(--gold)" : "var(--red)";
}
function ScoreTile({ label, score, big = false }: { label: string; score: number; big?: boolean }) {
  return (
    <div className="card p-3 text-center">
      <div className="text-[0.6rem] uppercase tracking-wide text-muted">{label}</div>
      <div className={`${big ? "text-3xl" : "text-2xl"} font-bold tabular-nums mt-0.5`} style={{ color: toneFor(score) }}>
        {score}
        <span className="text-sm text-muted">/10</span>
      </div>
    </div>
  );
}
function SevBar({ v }: { v: number }) {
  return (
    <span className="inline-block h-1.5 w-16 rounded-full overflow-hidden align-middle" style={{ background: "var(--card2)" }}>
      <span className="block h-full rounded-full" style={{ width: `${Math.min(100, v * 10)}%`, background: v >= 7 ? "var(--red)" : v >= 5 ? "var(--gold)" : "var(--green)" }} />
    </span>
  );
}
function Section({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  return (
    <details className="card" open={defaultOpen}>
      <summary className="px-4 py-3 cursor-pointer font-semibold text-sm list-none flex items-center justify-between">
        {title}
        <span className="text-muted text-xs">▾</span>
      </summary>
      <div className="px-4 pb-4 pt-1 border-t border-line">{children}</div>
    </details>
  );
}

export function DeepAnalysis({ symbol, signedIn = false }: { symbol: string; signedIn?: boolean }) {
  const [data, setData] = useState<DeepAnalysisOutput | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/deep/${symbol}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { data?: DeepAnalysisOutput } | null) => live && d?.data && setData(d.data))
      .catch(() => undefined)
      .finally(() => live && setLoading(false));
    return () => {
      live = false;
    };
  }, [symbol]);

  async function generate(force = false) {
    if (busy) return;
    setBusy(true);
    setNotice(null);
    setUpgrade(false);
    try {
      const res = await fetch(`/api/deep/${symbol}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ force }) });
      const body = (await res.json().catch(() => ({}))) as { data?: DeepAnalysisOutput; notice?: { reason: string; message: string }; error?: string };
      if (body.notice) {
        setNotice(body.notice.message);
        setUpgrade(body.notice.reason === "user_quota");
      } else if (body.data) setData(body.data);
      else setNotice(body.error ?? "Couldn't build the deep analysis. Try again shortly.");
    } catch {
      setNotice("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <div className="card p-8 text-center text-muted text-sm">Loading deep analysis…</div>;

  if (!data) {
    return (
      <div className="card p-8 text-center space-y-3">
        <p className="text-sm text-muted">No deep analysis yet for {symbol}. This researches moat, bottlenecks &amp; management&rsquo;s fixes, growth, valuation vs peers, catalysts, risks, bull/base/bear scenarios, and the next earnings watchlist.</p>
        <button type="button" onClick={() => void generate(false)} disabled={busy} className="btn btn-primary">{busy ? "Researching…" : "Build deep analysis"}</button>
        <ProgressLine key={busy ? "on" : "off"} active={busy} estSeconds={55} label="Researching" />
        {notice && (
          <div className="text-xs flex items-center justify-center gap-2 flex-wrap">
            <span className="text-gold">{notice}</span>
            {upgrade && <a href="/pricing" className="btn btn-primary no-underline text-xs px-3 py-1">Upgrade →</a>}
            {!signedIn && !upgrade && <a href="/signin" className="btn btn-primary no-underline text-xs px-3 py-1">Sign in</a>}
          </div>
        )}
      </div>
    );
  }

  const sc = data.scorecard;

  return (
    <div className="space-y-4">
      {data.headline && <div className="card p-4 text-sm leading-relaxed">{data.headline}</div>}

      {/* investment scorecard */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2">
        <ScoreTile label="Moat" score={sc.moat} />
        <ScoreTile label="Growth" score={sc.growth} />
        <ScoreTile label="Fin. strength" score={sc.financialStrength} />
        <ScoreTile label="Management" score={sc.management} />
        <ScoreTile label="Valuation" score={sc.valuation} />
        <ScoreTile label="Catalysts" score={sc.catalysts} />
        <ScoreTile label="Risk (safe)" score={sc.risk} />
        <ScoreTile label="Overall" score={sc.overall} big />
      </div>

      {/* thesis */}
      <div className="grid gap-3 md:grid-cols-2">
        <div className="card p-4"><div className="text-xs font-semibold text-green mb-1">Why own it</div><p className="text-sm text-muted">{data.thesis.whyOwn}</p></div>
        <div className="card p-4"><div className="text-xs font-semibold text-red mb-1">Why avoid it</div><p className="text-sm text-muted">{data.thesis.whyAvoid}</p></div>
        <div className="card p-4"><div className="text-xs font-semibold text-gold mb-1">What changes the thesis</div><p className="text-sm text-muted">{data.thesis.whatChanges}</p></div>
        <div className="card p-4"><div className="text-xs font-semibold text-purple mb-1">What price gets attractive</div><p className="text-sm text-muted">{data.thesis.attractivePrice}</p></div>
      </div>

      {/* MOAT */}
      <Section title={`Moat — ${data.moat.score}/10 · ${data.moat.strength} · ${data.moat.direction}`} defaultOpen>
        <p className="text-sm text-muted mt-2 mb-3">{data.moat.summary}</p>
        <ul className="space-y-1.5 text-sm">
          {data.moat.advantages.map((a, i) => (
            <li key={i} className="flex gap-2"><span className="text-green shrink-0">+</span><span>{a}</span></li>
          ))}
        </ul>
      </Section>

      {/* BOTTLENECKS + SOLUTIONS */}
      <Section title={`Bottlenecks & what management is doing (${data.bottlenecks.length})`} defaultOpen>
        <div className="space-y-3 mt-2">
          {data.bottlenecks.map((b, i) => (
            <div key={i} className="card-2 p-3 rounded-lg">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="font-medium text-sm">{b.rank}. {b.title}</div>
                <div className="flex items-center gap-2 text-xs text-muted">severity <SevBar v={b.severity} /> {b.severity}/10</div>
              </div>
              <p className="text-xs text-muted mt-1">{b.detail}</p>
              <div className="mt-2 pl-3 border-l-2 border-line">
                <div className="text-xs"><span className="text-green font-semibold">Solution: </span>{b.solution.summary}</div>
                <div className="text-xs text-muted mt-0.5">{b.solution.detail}</div>
                {b.solution.timeline && b.solution.timeline !== "—" && <div className="text-[0.68rem] text-gold mt-0.5">⏱ {b.solution.timeline}</div>}
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* GROWTH */}
      <Section title={`Growth — ${data.growth.score}/10`}>
        <p className="text-sm text-muted mt-2 mb-3">{data.growth.summary}</p>
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm min-w-[420px]">
            <thead><tr><th className="text-left">Metric</th><th className="text-right">Value</th><th className="text-right">YoY</th><th className="text-right">Forward</th></tr></thead>
            <tbody>{data.growth.metrics.map((m, i) => (<tr key={i}><td className="text-muted">{m.label}</td><td className="text-right tabular-nums">{m.value}</td><td className="text-right tabular-nums">{m.yoy}</td><td className="text-right tabular-nums">{m.forward}</td></tr>))}</tbody>
          </table>
        </div>
      </Section>

      {/* VALUATION */}
      <Section title={`Valuation — ${data.valuation.score}/10 attractiveness`}>
        <p className="text-sm text-muted mt-2 mb-3">{data.valuation.summary}</p>
        <div className="overflow-x-auto mb-3">
          <table className="tbl w-full text-sm min-w-[460px]">
            <thead><tr><th className="text-left">Multiple</th><th className="text-right">Now</th><th className="text-right">vs history</th><th className="text-right">vs peers</th></tr></thead>
            <tbody>{data.valuation.multiples.map((m, i) => (<tr key={i}><td className="text-muted">{m.label}</td><td className="text-right tabular-nums">{m.value}</td><td className="text-right">{m.vsHistory}</td><td className="text-right">{m.vsPeers}</td></tr>))}</tbody>
          </table>
        </div>
        {data.valuation.peers.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {data.valuation.peers.map((p, i) => (<span key={i} className="chip chip-muted text-xs" title={p.note}>{p.ticker}</span>))}
          </div>
        )}
        <div className="card-2 p-3 rounded-lg text-sm"><span className="text-gold font-semibold">Great company vs great stock: </span>{data.valuation.greatCompanyVsStock}</div>
      </Section>

      {/* CATALYSTS */}
      <Section title={`Catalysts (next 6–24 months)`}>
        <ul className="space-y-2 mt-2">
          {data.catalysts.map((c, i) => (
            <li key={i} className="text-sm"><span className="chip chip-green text-[0.6rem] mr-2">{c.window}</span><span className="font-medium">{c.title}</span><span className="text-muted"> — {c.detail}</span></li>
          ))}
        </ul>
      </Section>

      {/* RISKS */}
      <Section title="Risks / bear case (what could drop it 20%+)">
        <ul className="space-y-2 mt-2">
          {data.risks.map((r, i) => (
            <li key={i} className="text-sm flex gap-2"><span className="text-red shrink-0">−</span><span><span className="font-medium">{r.title}</span><span className="text-muted"> — {r.detail}</span></span></li>
          ))}
        </ul>
      </Section>

      {/* SCENARIOS */}
      <Section title="Bull / Base / Bear (12–24 months · estimates)" defaultOpen>
        <div className="grid gap-3 md:grid-cols-3 mt-2">
          <div className="card-2 p-3 rounded-lg" style={{ borderTop: "3px solid var(--green)" }}><div className="text-xs font-semibold text-green mb-1">Bull · {data.scenarios.bull.priceRange}</div><p className="text-xs text-muted">{data.scenarios.bull.operational}</p>{data.scenarios.bull.note && <p className="text-[0.68rem] text-muted mt-1 italic">{data.scenarios.bull.note}</p>}</div>
          <div className="card-2 p-3 rounded-lg" style={{ borderTop: "3px solid var(--gold)" }}><div className="text-xs font-semibold text-gold mb-1">Base · {data.scenarios.base.priceRange}</div><p className="text-xs text-muted">{data.scenarios.base.operational}</p>{data.scenarios.base.note && <p className="text-[0.68rem] text-muted mt-1 italic">{data.scenarios.base.note}</p>}</div>
          <div className="card-2 p-3 rounded-lg" style={{ borderTop: "3px solid var(--red)" }}><div className="text-xs font-semibold text-red mb-1">Bear · {data.scenarios.bear.priceRange}</div><p className="text-xs text-muted">{data.scenarios.bear.operational}</p>{data.scenarios.bear.note && <p className="text-[0.68rem] text-muted mt-1 italic">{data.scenarios.bear.note}</p>}</div>
        </div>
        <p className="text-[0.68rem] text-muted mt-2">Price ranges are AI estimates, not targets or advice.</p>
      </Section>

      {/* EARNINGS WATCHLIST */}
      <Section title={`Earnings watchlist${data.earningsWatchlist.nextDate && data.earningsWatchlist.nextDate !== "—" ? ` · next ≈ ${data.earningsWatchlist.nextDate}` : ""}`}>
        <div className="overflow-x-auto mt-2">
          <table className="tbl w-full text-sm min-w-[560px]">
            <thead><tr><th className="text-left">KPI</th><th className="text-right">Previous</th><th className="text-right">Expected</th><th className="text-right text-green">Bullish</th><th className="text-right text-gold">Neutral</th><th className="text-right text-red">Bearish</th></tr></thead>
            <tbody>{data.earningsWatchlist.kpis.map((k, i) => (<tr key={i}><td className="text-muted">{k.name}</td><td className="text-right tabular-nums">{k.previous}</td><td className="text-right tabular-nums">{k.expectation}</td><td className="text-right text-green tabular-nums">{k.bullish}</td><td className="text-right text-gold tabular-nums">{k.neutral}</td><td className="text-right text-red tabular-nums">{k.bearish}</td></tr>))}</tbody>
          </table>
        </div>
      </Section>

      {/* sources + footer */}
      {data.sources.length > 0 && (
        <div className="card p-4">
          <div className="text-xs font-semibold mb-2">Sources</div>
          <ul className="space-y-1 text-xs">
            {data.sources.map((s, i) => (
              <li key={i}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-purple no-underline hover:underline">{s.title}</a> <span className="text-muted">· {s.date}</span></li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-muted">
        <span>as of {data.asOf} · sourced research, estimates labelled, not financial advice</span>
        <span className="flex items-center gap-2">
          <button type="button" onClick={() => void generate(true)} disabled={busy} className="btn text-xs py-1 px-2">{busy ? "Refreshing…" : "↻ Refresh analysis"}</button>
          {notice && <span className="text-gold">{notice}</span>}
          {upgrade && <a href="/pricing" className="btn btn-primary no-underline text-xs px-2 py-1">Upgrade →</a>}
        </span>
      </div>
    </div>
  );
}
