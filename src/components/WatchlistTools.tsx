"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Analysis } from "@/lib/analysis/schema";
import type { RankingRow } from "@/lib/rankings-sort";
import { AnalysisView } from "@/components/AnalysisView";
import { Scoreboard } from "@/components/Scoreboard";
import { fetchJson, postJson } from "@/lib/fetch-json";

/** First `event: error` or `event: notice` (quota/cap denial) in an SSE transcript, if any. */
function streamProblem(text: string): { kind: "error" | "notice"; message: string } | null {
  const m = text.match(/event: (error|notice)\ndata: (.*)\n/);
  if (!m) return null;
  try {
    return { kind: m[1] as "error" | "notice", message: (JSON.parse(m[2]) as { message?: string }).message ?? "failed" };
  } catch {
    return { kind: m[1] as "error" | "notice", message: "failed" };
  }
}

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
        try {
          const res = await postJson<{ watchlist?: { slug: string } }>("/api/watchlists", { name, symbols: symbols.split(/[\s,;]+/) });
          if (res.data?.watchlist) router.push(`/w/${res.data.watchlist.slug}`);
          else setError(res.error ?? "Couldn't create the watchlist. Try again.");
        } finally {
          setBusy(false);
        }
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
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [compare, setCompare] = useState<Analysis[]>([]);
  const [loadingCompare, setLoadingCompare] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetchJson(`/api/watchlists/${slug}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ symbols: text.split(/[\s,;]+/) }) });
      if (!res.ok) setError(res.error);
      else router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const analyzeAll = async (onlyMissing: boolean) => {
    const targets = rows.filter((r) => !onlyMissing || !r.analysisId || r.stale).map((r) => r.symbol);
    const failed: string[] = [];
    let stopped: string | null = null;
    for (let i = 0; i < targets.length; i++) {
      const symbol = targets[i];
      setProgress(`Analyzing ${symbol} (${i + 1}/${targets.length})…`);
      try {
        const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker: symbol, force: !onlyMissing }) });
        if (!res.ok) {
          failed.push(symbol);
          continue;
        }
        const problem = streamProblem(await res.text());
        // A notice is a deny (daily quota, sign-in, global cap): every later ticker would get the
        // same answer, so stop and say why instead of looping through them all.
        if (problem?.kind === "notice" || (problem && /cap reached|quota|limit/i.test(problem.message))) {
          stopped = `Stopped at ${symbol}: ${problem.message}`;
          break;
        }
        if (problem) failed.push(symbol);
      } catch {
        failed.push(symbol);
      }
    }
    setProgress(stopped ?? (failed.length ? `Done — couldn't analyze ${failed.join(", ")}. Try those again in a moment.` : "Done."));
    router.refresh();
  };

  const analyzeOne = async (symbol: string) => {
    setAnalyzing(symbol);
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker: symbol }) });
      if (!res.ok) setProgress(`${symbol}: the analysis failed (${res.status}). Try again in a moment.`);
      else {
        const problem = streamProblem(await res.text());
        if (problem) setProgress(`${symbol}: ${problem.message}`);
      }
    } catch {
      setProgress(`${symbol}: network error — check your connection and try again.`);
    } finally {
      setAnalyzing(null);
    }
    router.refresh();
  };

  const loadCompare = async () => {
    setLoadingCompare(true);
    setError(null);
    try {
      const results = await Promise.all(selected.map((s) => fetchJson<{ analysis?: Analysis }>(`/api/analysis/${s}`)));
      const out = results.flatMap((r) => (r.data?.analysis ? [r.data.analysis] : []));
      const missing = selected.filter((_s, i) => !results[i].data?.analysis);
      if (missing.length) setError(`No saved analysis for ${missing.join(", ")} — analyze ${missing.length === 1 ? "it" : "them"} first.`);
      setCompare(out);
    } finally {
      setLoadingCompare(false);
    }
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
        {error && <div className="text-sm text-red">{error}</div>}
        {readOnly && <div className="text-xs text-dim">{demo ? "Demo mode: watchlists are read-only." : "You can view and compare this watchlist. Sign in as its owner to edit or analyze."}</div>}
      </div>

      <Scoreboard rows={rows} selectable selected={selected} onToggle={(s) => setSelected((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : cur.length < 4 ? [...cur, s] : cur))} onAnalyze={readOnly ? undefined : analyzeOne} analyzing={analyzing} />

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
