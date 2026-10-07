"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import type { EnrichedHolding, Holding, PortfolioPayload } from "@/lib/portfolio/schema";
import type { PortfolioReviewV2, BeatQQQ } from "@/lib/portfolio/review-schema";
import { FCF_EMOJI } from "@/lib/analysis/schema";
import { ChatPanel } from "@/components/ChatPanel";
import { ProgressLine } from "@/components/ProgressLine";
import { SkillDashboard } from "@/components/SkillDashboard";
import { money, pct } from "@/lib/format";
import { fetchJson, postJson } from "@/lib/fetch-json";

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

/** Must match the import route's base64 cap — Vercel rejects bodies over 4.5 MB with a bare 413. */
const MAX_BASE64 = 4_200_000;
const MAX_CSV_CHARS = 2_000_000;
const UPLOAD_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

/** Phone screenshots are often 5-10 MB: shrink (long edge ≤ 2000px, JPEG) until the upload fits. */
async function imageForUpload(file: File): Promise<{ mediaType: string; dataBase64: string }> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  const small = bitmap ? Math.max(bitmap.width, bitmap.height) <= 2000 : true;
  if (UPLOAD_IMAGE_TYPES.includes(file.type) && small && file.size * 1.37 <= MAX_BASE64) {
    bitmap?.close();
    return { mediaType: file.type, dataBase64: await readAsBase64(file) };
  }
  if (!bitmap) throw new Error("Couldn't read that image. Try a PNG or JPEG screenshot.");
  try {
    for (const [maxPx, quality] of [[2000, 0.85], [1600, 0.75], [1200, 0.7]] as const) {
      const scale = Math.min(1, maxPx / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) break;
      ctx.fillStyle = "#fff"; // JPEG has no transparency
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const data = canvas.toDataURL("image/jpeg", quality).split(",")[1] ?? "";
      if (data && data.length <= MAX_BASE64) return { mediaType: "image/jpeg", dataBase64: data };
    }
  } finally {
    bitmap.close();
  }
  throw new Error("That image is too large to upload, even shrunk. Try a smaller screenshot.");
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
  const hasHoldings = pf && pf.holdings.length > 0;

  if (!signedIn) {
    return (
      <div className="card p-8 text-center">
        <div className="text-lg font-semibold">Sign in to X-ray your portfolio</div>
        <p className="text-muted text-sm mt-2 max-w-md mx-auto">Paste holdings or upload a statement, and get an honest, FCF-first review — concentration, price zones, sell/trim/hold with tax notes, and ideas to fill the gaps — then chat about it.</p>
        <div className="flex gap-2 justify-center mt-4 flex-wrap">
          <a href="/signin" className="btn btn-primary no-underline inline-block">Sign in</a>
          <Link href="/examples" className="btn no-underline inline-block">See a sample review →</Link>
        </div>
      </div>
    );
  }

  /** Saves holdings; returns the saved portfolio (null on failure — the notice says why). */
  async function save(body: Record<string, unknown>): Promise<PortfolioPayload | null> {
    setSaving(true);
    setNotice(null);
    try {
      const res = await postJson<{ portfolio?: PortfolioPayload; imported?: number | null; skipped?: number }>("/api/portfolio", body);
      if (!res.ok || !res.data?.portfolio) {
        setNotice(res.error ?? "Could not save. Try again.");
        return null;
      }
      const saved = res.data.portfolio;
      setPf(saved);
      if (saved.holdings.length > 0) setEditing(false);
      const { imported, skipped = 0 } = res.data;
      if (typeof imported === "number") {
        setNotice(`Imported ${imported} position${imported === 1 ? "" : "s"}${skipped ? `, skipped ${skipped} line${skipped === 1 ? "" : "s"} we couldn't read` : ""}.`);
        if (imported > 0) setText("");
      }
      return saved;
    } finally {
      setSaving(false);
    }
  }

  const importText = async () => {
    const firstSave = !hasHoldings;
    const saved = await save({ text, cashUsd: cash ? Number(cash) : 0, newCashUsd: newCash ? Number(newCash) : 0, notes: notes.trim() || null });
    // The first-time button says "Analyze portfolio" — so analyze, don't just save.
    if (firstSave && saved && saved.holdings.length > 0) void runReview(true);
  };
  const removeHolding = (symbol: string) => {
    if (!pf || reviewing) return;
    void save({ holdings: pf.holdings.filter((h) => h.symbol !== symbol).map(toHolding), cashUsd: pf.cashUsd, newCashUsd: pf.newCashUsd, notes: pf.notes });
  };

  async function onFile(file: File) {
    if (reviewing) return setNotice("Wait for the review to finish before importing more holdings.");
    setUploading(true);
    setNotice(null);
    try {
      const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv";
      const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
      let body: Record<string, unknown>;
      if (isCsv) {
        const csv = await file.text();
        if (csv.length > MAX_CSV_CHARS) throw new Error("That CSV is too large (max ~2 MB). Export a shorter date range.");
        body = { kind: "csv", text: csv };
      } else if (isPdf) {
        if (file.size * 1.37 > MAX_BASE64) throw new Error("That PDF is too large to upload (max ~3 MB). Try a screenshot of the holdings page instead.");
        body = { kind: "pdf", mediaType: "application/pdf", dataBase64: await readAsBase64(file) };
      } else {
        body = { kind: "image", ...(await imageForUpload(file)) };
      }
      const res = await postJson<{ portfolio?: PortfolioPayload; imported?: number; skipped?: number; note?: string | null; notice?: { message: string } }>("/api/portfolio/import", body);
      const d = res.data;
      if (!res.ok) setNotice(res.error);
      else if (d?.notice) setNotice(d.notice.message);
      else if (d?.portfolio) {
        setPf(d.portfolio);
        setEditing(false);
        const skipped = d.skipped ?? 0;
        setNotice(`Imported ${d.imported ?? 0} position${d.imported === 1 ? "" : "s"}${skipped ? `, skipped ${skipped}` : ""}${d.note ? ` — ${d.note}` : ""}.`);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not read that file.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function runReview(keepNotice = false) {
    setReviewing(true);
    setReviewStage(0);
    if (!keepNotice) setNotice(null);
    const timer = setInterval(() => setReviewStage((s) => Math.min(s + 1, REVIEW_STAGES.length - 1)), 12000);
    try {
      const res = await fetchJson<{ review?: PortfolioReviewV2; stale?: boolean; notice?: { message: string } }>("/api/portfolio/review", { method: "POST" });
      const d = res.data;
      if (!res.ok) setNotice(res.error);
      else if (d?.notice) setNotice(d.notice.message);
      else if (d?.stale) setNotice("Your holdings changed while the review was being written, so it wasn't saved. Generate it again for the current holdings.");
      else if (d?.review) {
        const review = d.review;
        // Functional update: merge into the CURRENT portfolio, not the one captured when we started.
        setPf((cur) => (cur ? { ...cur, review, reviewAt: new Date().toISOString() } : cur));
      } else setNotice("The review came back empty. Try again.");
    } finally {
      clearInterval(timer);
      setReviewing(false);
    }
  }

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
            <button className="btn btn-primary" disabled={saving || reviewing || (!text.trim() && !hasHoldings)} onClick={importText}>{saving ? "Saving…" : hasHoldings ? "Save" : "Analyze portfolio"}</button>
            {hasHoldings && <button className="btn" onClick={() => setEditing(false)}>Cancel</button>}
          </div>
          <p className="text-[0.65rem] text-dim">Your holdings are private to your account. Not financial advice.</p>
        </div>
      )}

      {hasHoldings && !editing && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="text-sm font-semibold">Your holdings <span className="text-muted font-normal">· {pf.holdings.length} position{pf.holdings.length === 1 ? "" : "s"}{pf.cashUsd > 0 ? ` · ${money(pf.cashUsd, "USD", 0)} cash` : ""}</span></div>
            <button className="chip chip-muted" disabled={reviewing} title={reviewing ? "Wait for the review to finish" : undefined} onClick={() => setEditing(true)}>Edit / add holdings</button>
          </div>
          <HoldingsTable holdings={pf.holdings} onRemove={removeHolding} locked={reviewing || saving} />

          <div className="card p-4 flex items-center justify-between gap-3 flex-wrap">
            <div>
              <div className="text-sm font-semibold">Full review {pf.hasActivity && <span className="chip chip-green ml-1">activity loaded</span>}</div>
              <p className="text-xs text-muted mt-1">FCF-first cards, price zones, sell/trim/hold with tax notes, ideas to fill the gaps{pf.newCashUsd > 0 ? `, and a plan for ${money(pf.newCashUsd, "USD", 0)}` : ""}.</p>
            </div>
            <button className="btn btn-primary" disabled={reviewing} onClick={() => runReview()}>{reviewing ? "Reviewing…" : pf.review ? "Refresh review" : "Generate full review"}</button>
          </div>

          {reviewing && (
            <div className="card p-4 flex items-center gap-3">
              <span className="inline-block w-2.5 h-2.5 rounded-full bg-gold animate-pulse shrink-0" />
              <div className="flex-1">
                <div className="text-sm">{REVIEW_STAGES[reviewStage]}</div>
                <div className="text-xs text-dim mt-0.5">This pulls live data for every holding and writes several pages — usually under a minute.</div>
                <ProgressLine key={reviewing ? "on" : "off"} active={reviewing} estSeconds={45} label="Building your review" />
              </div>
            </div>
          )}

          {!reviewing && pf.review?.failedSections?.length ? (
            <div className="card p-3 text-sm border-l-2 border-l-red flex items-center justify-between gap-3 flex-wrap">
              <span className="text-muted">Part of this review didn&rsquo;t generate: <span className="text-text">{pf.review.failedSections.join(" · ")}</span>. Those parts are marked &ldquo;not generated&rdquo; below.</span>
              <button className="btn" onClick={() => runReview()}>Regenerate review</button>
            </div>
          ) : null}

          {pf.review?.beatQQQ?.verdict && <BeatQQQPanel b={pf.review.beatQQQ} />}

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

function BeatQQQPanel({ b }: { b: BeatQQQ }) {
  return (
    <div className="card p-5 space-y-4" style={{ borderTop: "3px solid var(--purple)" }}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="chip chip-muted font-mono">vs QQQ</span>
        <h3 className="text-base font-semibold">Your plan to beat the Nasdaq-100</h3>
      </div>
      <p className="text-sm leading-relaxed font-medium">{b.verdict}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        {b.overlap && (
          <div className="card-2 p-3 rounded-lg">
            <div className="text-[0.66rem] uppercase tracking-wide text-muted mb-1">How much you already are QQQ</div>
            <p className="text-sm text-muted">{b.overlap}</p>
          </div>
        )}
        {b.gap && (
          <div className="card-2 p-3 rounded-lg" style={{ borderLeft: "2px solid var(--red)" }}>
            <div className="text-[0.66rem] uppercase tracking-wide text-red mb-1">Where you&rsquo;ll lag the index</div>
            <p className="text-sm text-muted">{b.gap}</p>
          </div>
        )}
      </div>

      {b.edges.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-green mb-1.5">Your edges over QQQ</div>
          <ul className="space-y-1.5 text-sm">
            {b.edges.map((e, i) => (
              <li key={i} className="flex gap-2"><span className="text-green shrink-0">▲</span><span className="text-muted">{e}</span></li>
            ))}
          </ul>
        </div>
      )}

      {b.moves.length > 0 && (
        <div>
          <div className="text-xs font-semibold mb-2">The moves that create alpha</div>
          <ol className="space-y-2">
            {b.moves.map((m, i) => (
              <li key={i} className="card-2 p-3 rounded-lg flex gap-3">
                <span className="w-5 h-5 rounded-full bg-purple text-white text-xs flex items-center justify-center shrink-0 font-semibold">{i + 1}</span>
                <div>
                  <div className="text-sm font-medium">{m.step}</div>
                  <div className="text-xs text-muted mt-0.5"><span className="text-purple">edge: </span>{m.edge}</div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {b.risk && (
        <div className="text-sm">
          <span className="text-gold font-semibold">⚠ How this plan loses to QQQ instead: </span>
          <span className="text-muted">{b.risk}</span>
        </div>
      )}
      <p className="text-[0.65rem] text-dim">A framework built from your holdings&rsquo; real numbers vs QQQ&rsquo;s profile — estimates and rules, not a promise or financial advice.</p>
    </div>
  );
}

function HoldingsTable({ holdings, onRemove, locked }: { holdings: EnrichedHolding[]; onRemove: (s: string) => void; locked: boolean }) {
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
              <td className="text-right"><button className="text-red text-xs disabled:opacity-30" title={locked ? "Wait for the review to finish" : "Remove"} disabled={locked} onClick={() => onRemove(h.symbol)}>×</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
