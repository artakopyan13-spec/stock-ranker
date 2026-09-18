"use client";

import { useState } from "react";
import Link from "next/link";
import type { EnrichedHolding, Holding, PortfolioMetrics, PortfolioPayload, PortfolioReview } from "@/lib/portfolio/schema";
import { FCF_EMOJI } from "@/lib/analysis/schema";
import { ChatPanel } from "@/components/ChatPanel";
import { money, pct } from "@/lib/format";

const ACTION_TONE: Record<string, string> = { BUY: "text-green", HOLD: "text-gold", SELL: "text-red" };
const PLACEHOLDER = `Paste your holdings — one per line. Examples:
AAPL 25 @ 150
NVDA 10
MSFT $8,000
GOOGL, 12, 120`;

function toHolding(h: EnrichedHolding): Holding {
  return { symbol: h.symbol, shares: h.shares, avgCost: h.avgCost, valueUsd: h.valueUsd };
}
function diversificationLabel(hhi: number | null): { label: string; tone: string } {
  if (hhi === null) return { label: "—", tone: "text-muted" };
  if (hhi < 0.15) return { label: "Well spread", tone: "text-green" };
  if (hhi < 0.25) return { label: "Moderate", tone: "text-gold" };
  return { label: "Concentrated", tone: "text-red" };
}

export function PortfolioWorkspace({ initial, signedIn }: { initial: PortfolioPayload | null; signedIn: boolean }) {
  const [pf, setPf] = useState<PortfolioPayload | null>(initial);
  const [editing, setEditing] = useState(!initial || initial.holdings.length === 0);
  const [text, setText] = useState("");
  const [cash, setCash] = useState(initial?.cashUsd ? String(initial.cashUsd) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  if (!signedIn) {
    return (
      <div className="card p-8 text-center">
        <div className="text-lg font-semibold">Sign in to X-ray your portfolio</div>
        <p className="text-muted text-sm mt-2 max-w-md mx-auto">Paste your holdings and get an honest, source-verified review — concentration, hidden single bets, weak free-cash-flow exposure — then chat about it.</p>
        <a href="/signin" className="btn btn-primary no-underline mt-4 inline-block">Sign in</a>
      </div>
    );
  }

  async function save(body: Record<string, unknown>) {
    setSaving(true);
    setNotice(null);
    try {
      const res = await fetch("/api/portfolio", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = (await res.json()) as { portfolio?: PortfolioPayload; error?: string };
      if (d.error) setNotice(d.error);
      if (d.portfolio) {
        setPf(d.portfolio);
        if (d.portfolio.holdings.length > 0) setEditing(false);
      }
    } catch {
      setNotice("Could not save. Try again.");
    } finally {
      setSaving(false);
    }
  }

  const importText = () => save({ text, cashUsd: cash ? Number(cash) : 0, notes: notes.trim() || null });
  const removeHolding = (symbol: string) => {
    if (!pf) return;
    void save({ holdings: pf.holdings.filter((h) => h.symbol !== symbol).map(toHolding), cashUsd: pf.cashUsd, notes: pf.notes });
  };

  async function runReview() {
    setReviewing(true);
    setNotice(null);
    try {
      const res = await fetch("/api/portfolio/review", { method: "POST" });
      const d = (await res.json()) as { review?: PortfolioReview; notice?: { message: string }; error?: string };
      if (d.review && pf) setPf({ ...pf, review: d.review, reviewAt: new Date().toISOString() });
      if (d.notice) setNotice(d.notice.message);
      if (d.error) setNotice(d.error);
    } catch {
      setNotice("Could not generate the review.");
    } finally {
      setReviewing(false);
    }
  }

  const hasHoldings = pf && pf.holdings.length > 0;

  return (
    <div className="space-y-5">
      {notice && <div className="card p-3 text-sm border-l-2 border-l-gold text-muted">{notice}</div>}

      {(editing || !hasHoldings) && (
        <div className="card p-4 space-y-3">
          <div className="text-sm font-semibold">{hasHoldings ? "Edit / re-import holdings" : "Add your holdings"}</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={PLACEHOLDER} rows={6} className="w-full text-sm font-mono" />
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="text-xs text-muted">Cash (USD)
              <input value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" className="w-full mt-1 text-sm" inputMode="decimal" />
            </label>
            <label className="text-xs text-muted">Your goals / horizon / risk tolerance (optional)
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. long-term, high risk tolerance, want more income" className="w-full mt-1 text-sm" />
            </label>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={saving || (!text.trim() && !hasHoldings)} onClick={importText}>{saving ? "Saving…" : hasHoldings ? "Import & merge" : "Analyze portfolio"}</button>
            {hasHoldings && <button className="btn" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
          <p className="text-[0.65rem] text-dim">Parsed on the server — the table below shows what was understood. Your holdings are private to your account. Not financial advice.</p>
        </div>
      )}

      {hasHoldings && !editing && (
        <>
          <Metrics m={pf.metrics} onEdit={() => setEditing(true)} />
          <HoldingsTable holdings={pf.holdings} onRemove={removeHolding} />

          <div className="card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold">Honest review</div>
              <button className="btn btn-primary py-1 px-3 text-sm" disabled={reviewing} onClick={runReview}>{reviewing ? "Reviewing…" : pf.review ? "Refresh review" : "Generate review"}</button>
            </div>
            {pf.review ? <ReviewView review={pf.review} /> : <p className="text-sm text-muted">Get a candid read on concentration, hidden correlated bets, free-cash-flow quality, and what to consider — grounded in each holding&rsquo;s verified rating.</p>}
          </div>

          <div>
            <div className="text-sm font-semibold mb-2">Chat about your portfolio</div>
            <ChatPanel
              endpoint="/api/portfolio/chat"
              body={{}}
              historyUrl="/api/portfolio/chat"
              signedIn={signedIn}
              placeholder="Ask about your portfolio…"
              emptyHint="Ask anything about your holdings — concentration, what to watch, where you're doubling up. Grounded in your positions and their verified ratings."
              suggestions={["Where am I most concentrated?", "What's my biggest hidden risk?", "Which holdings have weak cash flow?", "Am I too tech-heavy?"]}
            />
          </div>
        </>
      )}
    </div>
  );
}

function Metrics({ m, onEdit }: { m: PortfolioMetrics; onEdit: () => void }) {
  const div = diversificationLabel(m.hhi);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Total value" value={m.totalValueUsd === null ? "—" : money(m.totalValueUsd, "USD", 0)} sub={m.cashPct === null ? undefined : `${m.cashPct.toFixed(0)}% cash`} />
        <Stat label="Positions" value={`${m.holdingsCount}`} sub={`${m.analyzedPct.toFixed(0)}% analyzed`} />
        <Stat label="Top 3 weight" value={m.top3WeightPct === null ? "—" : `${m.top3WeightPct.toFixed(0)}%`} sub={m.topWeightPct === null ? undefined : `top ${m.topWeightPct.toFixed(0)}%`} valueClass={m.top3WeightPct !== null && m.top3WeightPct > 60 ? "text-red" : "text-text"} />
        <Stat label="Diversification" value={div.label} valueClass={div.tone} sub={m.hhi === null ? undefined : `HHI ${m.hhi.toFixed(2)}`} />
        <Stat label="Weighted AI rating" value={m.weightedRating === null ? "—" : `${m.weightedRating.toFixed(1)}/10`} sub="value-weighted, analyzed" />
        <Stat label="Weak-FCF exposure" value={m.weakFcfPct === null ? "—" : `${m.weakFcfPct.toFixed(0)}%`} valueClass={m.weakFcfPct !== null && m.weakFcfPct > 25 ? "text-red" : "text-text"} sub="thin / negative FCF" />
        <div className="card p-4 col-span-2">
          <div className="text-xs uppercase tracking-wider text-muted mb-2">Sector exposure</div>
          <div className="space-y-1">
            {m.sectors.slice(0, 5).map((s) => (
              <div key={s.sector} className="flex items-center gap-2 text-xs">
                <span className="w-24 truncate text-muted">{s.sector}</span>
                <span className="flex-1 h-2 bg-card2 rounded overflow-hidden"><span className="block h-full bg-purple" style={{ width: `${Math.min(100, s.weightPct)}%` }} /></span>
                <span className="w-10 text-right tabular-nums">{s.weightPct.toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex justify-end"><button className="chip chip-muted" onClick={onEdit}>Edit holdings</button></div>
    </div>
  );
}

function Stat({ label, value, sub, valueClass = "text-text" }: { label: string; value: string; sub?: string; valueClass?: string }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wider text-muted">{label}</div>
      <div className={`text-xl font-bold mt-1 ${valueClass}`}>{value}</div>
      {sub && <div className="text-[0.65rem] text-dim mt-1">{sub}</div>}
    </div>
  );
}

function HoldingsTable({ holdings, onRemove }: { holdings: EnrichedHolding[]; onRemove: (s: string) => void }) {
  const sorted = [...holdings].sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0));
  return (
    <div className="card overflow-x-auto">
      <table className="tbl w-full text-sm min-w-[640px]">
        <thead>
          <tr>
            <th>Ticker</th>
            <th className="text-right">Weight</th>
            <th className="text-right">Value</th>
            <th className="text-right">Rating</th>
            <th>Call</th>
            <th>FCF</th>
            <th className="text-right">Gain</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((h) => (
            <tr key={h.symbol}>
              <td>
                <Link href={`/t/${h.symbol}`} className="text-text no-underline hover:underline font-medium">{h.symbol}</Link>
                <div className="text-[0.65rem] text-dim truncate max-w-[160px]">{h.name ?? ""}</div>
              </td>
              <td className="text-right">
                <div className="flex items-center gap-2 justify-end">
                  <span className="w-16 h-1.5 bg-card2 rounded overflow-hidden hidden sm:block"><span className="block h-full bg-purple" style={{ width: `${Math.min(100, h.weightPct ?? 0)}%` }} /></span>
                  <span className="tabular-nums">{h.weightPct === null ? "—" : `${h.weightPct.toFixed(1)}%`}</span>
                </div>
              </td>
              <td className="text-right tabular-nums text-muted">{h.valueUsd === null ? "—" : money(h.valueUsd, "USD", 0)}</td>
              <td className="text-right tabular-nums">{h.rating === null ? <Link href={`/t/${h.symbol}`} className="text-purple text-xs no-underline">analyze</Link> : `${h.rating}/10`}</td>
              <td className={ACTION_TONE[h.action ?? ""] ?? "text-dim"}>{h.action ?? "—"}</td>
              <td>{h.fcfVerdict ? FCF_EMOJI[h.fcfVerdict as keyof typeof FCF_EMOJI] : "—"}</td>
              <td className={`text-right tabular-nums ${h.gainPct === null ? "text-dim" : h.gainPct >= 0 ? "text-green" : "text-red"}`}>{h.gainPct === null ? "—" : pct(h.gainPct, 1, true)}</td>
              <td className="text-right"><button className="text-red text-xs" title="Remove" onClick={() => onRemove(h.symbol)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReviewView({ review }: { review: PortfolioReview }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-2xl font-bold">{review.score}/10</span>
        <span className="text-sm font-medium">{review.headline}</span>
      </div>
      <p className="text-sm leading-relaxed text-muted">{review.summary}</p>
      <div className="card-2 p-3 border-l-2 border-l-red">
        <div className="text-xs uppercase tracking-wider text-red mb-1">Concentration</div>
        <p className="text-sm">{review.concentration}</p>
      </div>
      {review.themes.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted mb-2">Bets that move together</div>
          <div className="grid sm:grid-cols-2 gap-2">
            {review.themes.map((t) => (
              <div key={t.name} className="card-2 p-3">
                <div className="text-sm font-medium">{t.name} <span className="text-xs text-dim">{t.tickers.join(", ")}</span></div>
                <p className="text-xs text-muted mt-1">{t.note}</p>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="grid md:grid-cols-3 gap-3">
        <Column title="Strengths" items={review.strengths} tone="text-green" />
        <Column title="Risks" items={review.risks} tone="text-red" />
        <Column title="Gaps" items={review.gaps} tone="text-gold" />
      </div>
      {review.questionsToConsider.length > 0 && (
        <div>
          <div className="text-xs uppercase tracking-wider text-muted mb-2">Questions to consider</div>
          <ul className="list-disc ml-5 text-sm text-muted space-y-1">{review.questionsToConsider.map((q, i) => <li key={i}>{q}</li>)}</ul>
        </div>
      )}
      <p className="text-[0.65rem] text-dim">A construction review of what you hold, grounded in each name&rsquo;s verified rating — not a recommendation to buy or sell. Not financial advice.</p>
    </div>
  );
}

function Column({ title, items, tone }: { title: string; items: string[]; tone: string }) {
  if (!items.length) return null;
  return (
    <div>
      <div className={`text-xs uppercase tracking-wider mb-2 ${tone}`}>{title}</div>
      <ul className="space-y-1 text-sm text-muted">{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
    </div>
  );
}
