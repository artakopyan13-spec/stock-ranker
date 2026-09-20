"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { EnrichedHolding, Holding, PortfolioPayload } from "@/lib/portfolio/schema";
import type { PortfolioReviewV2 } from "@/lib/portfolio/review-schema";
import { FCF_EMOJI } from "@/lib/analysis/schema";
import { ChatPanel } from "@/components/ChatPanel";
import { SkillDashboard } from "@/components/SkillDashboard";
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
const REVIEW_STAGES = [
  "Pulling live prices & fundamentals for each holding…",
  "Checking free cash flow, valuation and debt…",
  "Scanning for concentration, correlated bets and gaps…",
  "Setting buy/sell zones and the sell·trim·hold calls…",
  "Writing your review — almost there…",
];

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve((reader.result as string).split(",")[1] ?? "");
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function PortfolioWorkspace({ initial, signedIn }: { initial: PortfolioPayload | null; signedIn: boolean }) {
  const [pf, setPf] = useState<PortfolioPayload | null>(initial);
  const [editing, setEditing] = useState(!initial || initial.holdings.length === 0);
  const [text, setText] = useState("");
  const [cash, setCash] = useState(initial?.cashUsd ? String(initial.cashUsd) : "");
  const [newCash, setNewCash] = useState(initial?.newCashUsd ? String(initial.newCashUsd) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [saving, setSaving] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [reviewStage, setReviewStage] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  if (!signedIn) {
    return (
      <div className="card p-8 text-center">
        <div className="text-lg font-semibold">Sign in to X-ray your portfolio</div>
        <p className="text-muted text-sm mt-2 max-w-md mx-auto">Paste holdings or upload a statement, and get an honest, FCF-first review — concentration, price zones, sell/trim/hold with tax notes, and ideas to fill the gaps — then chat about it.</p>
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

  const importText = () => save({ text, cashUsd: cash ? Number(cash) : 0, newCashUsd: newCash ? Number(newCash) : 0, notes: notes.trim() || null });
  const removeHolding = (symbol: string) => {
    if (!pf) return;
    void save({ holdings: pf.holdings.filter((h) => h.symbol !== symbol).map(toHolding), cashUsd: pf.cashUsd, newCashUsd: pf.newCashUsd, notes: pf.notes });
  };

  async function onFile(file: File) {
    setUploading(true);
    setNotice(null);
    try {
      const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      let body: Record<string, unknown>;
      if (isCsv) {
        body = { kind: "csv", text: await file.text() };
      } else if (isPdf) {
        body = { kind: "pdf", mediaType: "application/pdf", dataBase64: await readAsBase64(file) };
      } else {
        body = { kind: "image", mediaType: file.type || "image/png", dataBase64: await readAsBase64(file) };
      }
      const res = await fetch("/api/portfolio/import", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const d = (await res.json()) as { portfolio?: PortfolioPayload; imported?: number; note?: string | null; error?: string; notice?: { message: string } };
      if (d.error) setNotice(d.error);
      if (d.notice) setNotice(d.notice.message);
      if (d.portfolio) {
        setPf(d.portfolio);
        setEditing(false);
        setNotice(`Imported ${d.imported ?? 0} position${d.imported === 1 ? "" : "s"}${d.note ? ` — ${d.note}` : ""}.`);
      }
    } catch {
      setNotice("Could not read that file.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function runReview() {
    setReviewing(true);
    setReviewStage(0);
    setNotice(null);
    const timer = setInterval(() => setReviewStage((s) => Math.min(s + 1, REVIEW_STAGES.length - 1)), 12000);
    try {
      const res = await fetch("/api/portfolio/review", { method: "POST" });
      const d = (await res.json()) as { review?: PortfolioReviewV2; notice?: { message: string }; error?: string };
      if (d.review && pf) setPf({ ...pf, review: d.review, reviewAt: new Date().toISOString() });
      if (d.notice) setNotice(d.notice.message);
      if (d.error) setNotice(d.error);
    } catch {
      setNotice("Could not generate the review.");
    } finally {
      clearInterval(timer);
      setReviewing(false);
    }
  }

  const hasHoldings = pf && pf.holdings.length > 0;

  return (
    <div className="space-y-5">
      {notice && <div className="card p-3 text-sm border-l-2 border-l-gold text-muted">{notice}</div>}

      {(editing || !hasHoldings) && (
        <div className="card p-4 space-y-3">
          <div className="text-sm font-semibold">{hasHoldings ? "Edit / add holdings" : "Add your holdings"}</div>

          <input ref={fileRef} type="file" accept="image/*,application/pdf,.csv,text/csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
          <div
            role="button"
            tabIndex={0}
            onClick={() => !uploading && fileRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !uploading && fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files?.[0]; if (f) void onFile(f); }}
            className={`w-full border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${dragging ? "border-purple bg-purple/5" : "border-line hover:border-purple"}`}
          >
            <div className="text-3xl">📎</div>
            <div className="text-sm font-semibold mt-1">{uploading ? "Reading your file…" : "Upload a statement or CSV"}</div>
            <div className="text-xs text-dim mt-1 max-w-md mx-auto">Click or drag in a screenshot / PDF of your holdings, or a brokerage activity CSV (the CSV also unlocks the all-time scorecard).</div>
          </div>

          <div className="text-xs text-dim text-center">— or paste your holdings below —</div>
          <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder={PLACEHOLDER} rows={5} className="w-full text-sm font-mono" />
          <div className="grid sm:grid-cols-3 gap-3">
            <label className="text-xs text-muted">Cash (USD)
              <input value={cash} onChange={(e) => setCash(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" className="w-full mt-1 text-sm" inputMode="decimal" />
            </label>
            <label className="text-xs text-muted">New cash to deploy (USD)
              <input value={newCash} onChange={(e) => setNewCash(e.target.value.replace(/[^\d.]/g, ""))} placeholder="0" className="w-full mt-1 text-sm" inputMode="decimal" />
            </label>
            <label className="text-xs text-muted">Goals / horizon / risk (optional)
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="long-term, high risk tolerance…" className="w-full mt-1 text-sm" />
            </label>
          </div>
          <div className="flex gap-2">
            <button className="btn btn-primary" disabled={saving || (!text.trim() && !hasHoldings)} onClick={importText}>{saving ? "Saving…" : hasHoldings ? "Save" : "Analyze portfolio"}</button>
            {hasHoldings && <button className="btn" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
          <p className="text-[0.65rem] text-dim">Your holdings are private to your account. Not financial advice.</p>
        </div>
      )}

      {hasHoldings && !editing && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Your holdings <span className="text-muted font-normal">· {pf.holdings.length} position{pf.holdings.length === 1 ? "" : "s"}{pf.cashUsd > 0 ? ` · ${money(pf.cashUsd, "USD", 0)} cash` : ""}</span></div>
            <button className="chip chip-muted" onClick={() => setEditing(true)}>Edit / add holdings</button>
          </div>
          <HoldingsTable holdings={pf.holdings} onRemove={removeHolding} />

          <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold">Full review {pf.hasActivity && <span className="chip chip-green ml-1">activity loaded</span>}</div>
              <p className="text-xs text-muted mt-1">FCF-first cards, price zones, sell/trim/hold with tax notes, ideas to fill the gaps{pf.newCashUsd > 0 ? `, and a plan for ${money(pf.newCashUsd, "USD", 0)}` : ""}.</p>
            </div>
            <button className="btn btn-primary" disabled={reviewing} onClick={runReview}>{reviewing ? "Reviewing…" : pf.review ? "Refresh review" : "Generate full review"}</button>
          </div>

          {reviewing && (
            <div className="card p-4 flex items-center gap-3">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-gold animate-pulse shrink-0" />
              <div>
                <div className="text-sm">{REVIEW_STAGES[reviewStage]}</div>
                <div className="text-xs text-dim mt-0.5">Full reviews take about a minute or two — it pulls live data for every holding and writes several pages. Refreshes are quicker.</div>
              </div>
            </div>
          )}

          {pf.review && <SkillDashboard review={pf.review} holdings={pf.holdings} newCashUsd={pf.newCashUsd} generatedAt={pf.review.generatedAt} />}

          <div>
            <div className="text-sm font-semibold mb-2">Chat about your portfolio</div>
            <ChatPanel
              endpoint="/api/portfolio/chat"
              body={{}}
              historyUrl="/api/portfolio/chat"
              signedIn={signedIn}
              placeholder="Ask about your portfolio…"
              emptyHint="Ask anything — concentration, what to watch, where you're doubling up, at what price to add to X. Grounded in your positions and their verified ratings."
              suggestions={["Where am I most concentrated?", "What's my biggest hidden risk?", "At what price should I add to my top holding?", "Am I too tech-heavy?"]}
            />
          </div>
        </>
      )}
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
