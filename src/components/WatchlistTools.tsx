"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Analysis } from "@/lib/analysis/schema";
import type { RankingRow } from "@/lib/rankings-sort";
import { AnalysisView } from "@/components/AnalysisView";
import { Scoreboard } from "@/components/Scoreboard";

/** Create a watchlist from a comma/space separated ticker list. */
export function CreateWatchlist({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [symbols, setSymbols] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="card p-4 space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/watchlists", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, symbols: symbols.split(/[\s,;]+/) }) });
        const body = (await res.json()) as { watchlist?: { slug: string }; error?: string };
        setBusy(false);
        if (body.watchlist) router.push(`/w/${body.watchlist.slug}`);
        else setError(body.error ?? "Failed");
      }}
    >
      <div className="text-sm font-semibold">New watchlist</div>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (e.g. AI infrastructure)" className="w-full" required disabled={disabled} />
      <textarea value={symbols} onChange={(e) => setSymbols(e.target.value)} placeholder="NVDA, AMD, TSM, ASML, AVGO" rows={2} className="w-full" required disabled={disabled} />
      {error && <div className="text-sm text-red">{error}</div>}
      <button type="submit" className="btn btn-primary" disabled={busy || disabled}>
        {busy ? "Creating…" : "Create"}
      </button>
      {disabled && <div className="text-xs text-dim">Read-only in demo mode.</div>}
    </form>
  );
}

/** Edit symbols + "Analyze all" (sequential, respects the daily cap) + compare view. */
export function WatchlistTools({ slug, symbols, rows, demo, canEdit = true }: { slug: string; symbols: string[]; rows: RankingRow[]; demo: boolean; canEdit?: boolean }) {
  const readOnly = demo || !canEdit;
  const router = useRouter();
  const [text, setText] = useState(symbols.join(", "));
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [compare, setCompare] = useState<Analysis[]>([]);
  const [loadingCompare, setLoadingCompare] = useState(false);

  const save = async () => {
    setSaving(true);
    await fetch(`/api/watchlists/${slug}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbols: text.split(/[\s,;]+/) }) });
    setSaving(false);
    router.refresh();
  };

  const analyzeAll = async (onlyMissing: boolean) => {
    const targets = rows.filter((r) => !onlyMissing || !r.analysisId || r.stale).map((r) => r.symbol);
    for (let i = 0; i < targets.length; i++) {
      const symbol = targets[i];
      setProgress(`Analyzing ${symbol} (${i + 1}/${targets.length})…`);
      try {
        const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker: symbol, force: !onlyMissing }) });
        const text = await res.text();
        if (text.includes("event: error")) {
          const m = text.match(/event: error\ndata: (.*)\n/);
          const msg = m ? (JSON.parse(m[1]) as { message: string }).message : "error";
          setProgress(`${symbol}: ${msg}`);
          if (/cap reached/i.test(msg)) break;
        }
      } catch (err) {
        setProgress(`${symbol}: ${err instanceof Error ? err.message : "failed"}`);
      }
    }
    setProgress("Done.");
    router.refresh();
  };

  const loadCompare = async () => {
    setLoadingCompare(true);
    const out: Analysis[] = [];
    for (const s of selected) {
      const res = await fetch(`/api/analysis/${s}`);
      const body = (await res.json()) as { analysis?: Analysis };
      if (body.analysis) out.push(body.analysis);
    }
    setCompare(out);
    setLoadingCompare(false);
  };

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <input value={text} onChange={(e) => setText(e.target.value)} className="flex-1 min-w-[240px]" disabled={readOnly} aria-label="Tickers" />
          <button type="button" className="btn" onClick={save} disabled={saving || readOnly}>
            {saving ? "Saving…" : "Save tickers"}
          </button>
          <button type="button" className="btn btn-primary" onClick={() => analyzeAll(true)} disabled={readOnly || progress?.startsWith("Analyzing")}>
            Analyze missing / stale
          </button>
          <button type="button" className="btn" onClick={() => analyzeAll(false)} disabled={readOnly || progress?.startsWith("Analyzing")}>
            Re-analyze all
          </button>
        </div>
        {progress && <div className="text-sm text-muted">{progress}</div>}
        {readOnly && <div className="text-xs text-dim">{demo ? "Demo mode: watchlists are read-only." : "You can view and compare this watchlist. Sign in as its owner to edit or analyze."}</div>}
      </div>

      <Scoreboard rows={rows} selectable selected={selected} onToggle={(s) => setSelected((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : cur.length < 4 ? [...cur, s] : cur))} />

      <div className="flex items-center gap-3">
        <button type="button" className="btn" onClick={loadCompare} disabled={selected.length < 2 || loadingCompare}>
          {loadingCompare ? "Loading…" : `Compare ${selected.length ? `(${selected.length})` : ""}`}
        </button>
        <span className="text-xs text-dim">Select 2–4 analyzed tickers to compare side by side.</span>
      </div>

      {compare.length >= 2 && (
        <div className={`grid gap-4 ${compare.length >= 3 ? "lg:grid-cols-3" : "lg:grid-cols-2"}`}>
          {compare.map((a) => (
            <div key={a.meta.ticker} className="min-w-0">
              <AnalysisView analysis={a} compact />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
