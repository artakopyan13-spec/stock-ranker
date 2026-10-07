"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import type { Analysis, ModelOutput, Verification } from "@/lib/analysis/schema";
import type { DataSections } from "@/lib/analysis/assemble";
import { AnalysisView } from "@/components/AnalysisView";
import { AnalyzedAgo, ErrorState, SkeletonCard } from "@/components/ui";
import { dateLabel } from "@/lib/format";
import { BalanceSection, BusinessSection, CatalystsSection, FcfSection, ForecastSection, GrowthSection, HeaderSection, NewsSection, PriceSection, RatingSection, ThesisSection, TripwireSection, ValuationSection } from "@/components/sections";

interface StreamState {
  phase: "idle" | "running" | "done" | "error" | "notice";
  status: string;
  data: DataSections | null;
  sections: Partial<ModelOutput>;
  analysis: Analysis | null;
  error: string | null;
  details: Verification | null;
  notice: string | null;
  /** The shown analysis is past its TTL (and no refresh has replaced it yet). */
  stale: boolean;
}

const initial = (analysis: Analysis | null, stale: boolean): StreamState => ({ phase: analysis ? "done" : "idle", status: "", data: null, sections: {}, analysis, error: null, details: null, notice: null, stale: !!analysis && stale });

/** Vercel answers platform failures (timeout, rate limit) as HTML/text, never JSON. */
async function httpErrorMessage(res: Response): Promise<string> {
  const isJson = (res.headers.get("content-type") ?? "").includes("application/json");
  const body = isJson ? ((await res.json().catch(() => null)) as { error?: string } | null) : null;
  if (body?.error) return body.error;
  if (res.status === 504) return "This took too long and timed out. Try again — it usually works on a second run.";
  if (res.status === 429) return "Too many requests right now. Wait a moment and try again.";
  return `Something went wrong (${res.status}). Try again.`;
}

function FailureDetails({ details }: { details: Verification | null }) {
  if (!details) return null;
  return (
    <ul className="list-disc ml-4">
      {details.checks.filter((c) => !c.ok).map((c) => (
        <li key={c.id}>
          {c.id}: {c.detail}
        </li>
      ))}
    </ul>
  );
}

/**
 * Drives POST /api/analyze (SSE). Code-derived sections render the moment data arrives;
 * model sections appear one by one; the verified document replaces everything on `done`.
 */
export function AnalysisStream({ ticker, initialAnalysis, stale = false, shareUrl, autoStart, signedIn = false }: { ticker: string; initialAnalysis: Analysis | null; stale?: boolean; shareUrl: string | null; autoStart: boolean; signedIn?: boolean }) {
  const [state, setState] = useState<StreamState>(() => initial(initialAnalysis, stale));
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(
    async (force: boolean) => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setState((s) => ({ ...s, phase: "running", status: "Starting…", data: null, sections: {}, error: null, details: null, notice: null }));
      try {
        const res = await fetch("/api/analyze", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ticker, force }), signal: ctrl.signal });
        if (!res.ok || !res.body) throw new Error(await httpErrorMessage(res));
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) >= 0) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
            const eventLine = frame.split("\n").find((l) => l.startsWith("event: "));
            if (!dataLine) continue;
            const payload = JSON.parse(dataLine.slice(6)) as Record<string, unknown>;
            const type = eventLine?.slice(7) ?? (payload.type as string);
            setState((s) => {
              switch (type) {
                case "status":
                  return { ...s, status: String(payload.message) };
                case "data":
                  return { ...s, data: payload.sections as DataSections, status: "Live data loaded. Analyzing…" };
                case "section":
                  return { ...s, sections: { ...s.sections, [String(payload.key)]: payload.value } };
                case "done":
                  // A "done" after a notice is the cached fallback — still stale.
                  return { ...s, phase: "done", analysis: payload.analysis as Analysis, status: "", stale: s.notice ? s.stale : false };
                case "notice":
                  return { ...s, notice: String(payload.message) };
                case "error":
                  return { ...s, phase: "error", error: String(payload.message) };
                case "details":
                  return { ...s, details: payload as unknown as Verification };
                default:
                  return s;
              }
            });
          }
        }
        setState((s) => (s.phase === "running" ? (s.notice ? { ...s, phase: "notice" } : { ...s, phase: "error", error: "The stream ended before the analysis completed." }) : s));
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setState((s) => ({ ...s, phase: "error", error: err instanceof Error ? err.message : "Unexpected error" }));
      }
    },
    [ticker],
  );

  useEffect(() => {
    if (autoStart && state.phase === "idle") void run(false);
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  // An analysis already on screen stays on screen through a refresh, its errors and notices.
  if (state.analysis) {
    const a = state.analysis;
    const running = state.phase === "running";
    return (
      <div className="space-y-3">
        {running && (
          <div className="card p-3 flex items-center gap-3 text-sm">
            <span className="inline-block w-2 h-2 rounded-full bg-gold animate-pulse" />
            <span className="text-muted">Refreshing{state.status ? ` — ${state.status}` : "…"} The analysis below stays until the new one is verified.</span>
          </div>
        )}
        {!running && state.stale && !state.notice && state.phase !== "error" && (
          <div className="card p-3 text-sm border-l-2 border-l-gold text-muted flex flex-wrap items-center gap-2">
            <span>Analysis from {dateLabel(a.meta.analyzedAt)}.</span>
            <button type="button" className="btn btn-primary py-1 px-3 text-xs ml-auto" onClick={() => run(true)}>
              Refresh
            </button>
          </div>
        )}
        {state.notice && !running && (
          <div className="card p-3 text-sm border-l-2 border-l-gold text-muted flex flex-wrap items-center gap-2">
            <span>{state.notice} Showing the latest cached analysis.</span>
            {!signedIn && <a href="/signin" className="btn btn-primary py-1 px-3 text-xs no-underline ml-auto">Sign in — free</a>}
          </div>
        )}
        {state.phase === "error" && (
          <div className="card p-3 text-sm border-l-2 border-l-red space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-red">Refresh failed: {state.error ?? "Unknown error"}</span>
              <button type="button" className="btn py-1 px-3 text-xs ml-auto" onClick={() => run(true)}>
                Try again
              </button>
            </div>
            <div className="text-xs text-muted">Showing the previous analysis.</div>
            {state.details && (
              <div className="text-xs text-muted">
                <FailureDetails details={state.details} />
              </div>
            )}
          </div>
        )}
        <AnalysisView
          analysis={a}
          headerRight={
            <>
              <AnalyzedAgo analyzedAt={a.meta.analyzedAt} onRefresh={a.meta.demo ? undefined : () => run(true)} refreshing={running} />
              <span>· data as of {a.meta.dataAsOf.slice(0, 10)}</span>
              <span>· {a.meta.dataProvider}</span>
              {shareUrl && (
                <Link href={shareUrl} className="chip chip-purple no-underline">
                  public link ↗
                </Link>
              )}
            </>
          }
        />
      </div>
    );
  }

  if (state.phase === "notice") {
    return (
      <div className="card p-8 text-center border-l-2 border-l-gold">
        <div className="text-lg font-semibold">Fresh analysis unavailable right now</div>
        <p className="text-muted text-sm mt-2 max-w-md mx-auto">{state.notice}</p>
        <div className="mt-4 flex gap-2 justify-center">
          {!signedIn && <a href="/signin" className="btn btn-primary no-underline">Sign in</a>}
          <button type="button" className={`btn ${signedIn ? "btn-primary" : ""}`} onClick={() => run(false)}>Try again</button>
        </div>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className="space-y-4">
        <ErrorState
          title={`Could not analyze ${ticker}`}
          message={state.error ?? "Unknown error"}
          details={state.details ? <FailureDetails details={state.details} /> : undefined}
        />
        <button type="button" className="btn" onClick={() => run(true)}>
          Try again
        </button>
      </div>
    );
  }

  if (state.phase === "idle") {
    return (
      <div className="card p-8 text-center">
        <div className="text-lg font-semibold">No analysis yet for {ticker}</div>
        <button type="button" className="btn btn-primary mt-4" onClick={() => run(false)}>
          Analyze now
        </button>
      </div>
    );
  }

  const d = state.data;
  const m = state.sections;
  const currency = d?.meta.currency ?? "USD";
  const price = d?.price.current.value ?? null;
  return (
    <div className="space-y-4">
      <div className="card p-4 flex items-center gap-3 text-sm">
        <span className="inline-block w-2 h-2 rounded-full bg-gold animate-pulse" />
        <span className="text-muted">{state.status || "Working…"}</span>
      </div>
      {d ? (
        <>
          <HeaderSection meta={d.meta} price={d.price} fcfVerdict={d.fcf.verdict} rating={m.rating ? { ...m.rating, band: "hold", isEstimate: true } : null} />
          {m.summary && (
            <div className="card p-4 border-l-2 border-l-gold">
              <div className="text-xs uppercase tracking-wider text-gold mb-1">In plain terms</div>
              <p className="text-sm leading-relaxed">{m.summary}</p>
            </div>
          )}
          <FcfSection fcf={{ ...d.fcf, verdictReason: m.fcfVerdictReason }} currency={currency} />
          {m.rating ? <RatingSection rating={m.rating} /> : <SkeletonCard lines={2} />}
          {m.thesis ? <ThesisSection thesis={m.thesis} /> : <SkeletonCard lines={4} />}
          <PriceSection price={d.price} currency={currency} />
          <ValuationSection valuation={{ ...d.valuation, ...(m.valuation ?? {}) }} />
          <GrowthSection growth={d.growth} currency={currency} />
          <BalanceSection balanceSheet={d.balanceSheet} currency={currency} capitalActions={m.capitalActions} />
          {m.news ? <NewsSection news={m.news} note={m.newsScanNote} pending /> : <SkeletonCard lines={3} />}
          {m.business ? <BusinessSection business={m.business} /> : <SkeletonCard lines={4} />}
          {m.catalysts ? <CatalystsSection catalysts={m.catalysts} /> : <SkeletonCard lines={2} />}
          {m.forecast12m ? <ForecastSection forecast={m.forecast12m} currentPrice={price} currency={currency} /> : <SkeletonCard lines={3} />}
          {m.tripwire ? <TripwireSection tripwire={m.tripwire} /> : <SkeletonCard lines={2} />}
          <div className="text-xs text-dim">Verification runs before this analysis is published. Sections above are provisional until it passes.</div>
        </>
      ) : (
        <>
          <SkeletonCard lines={2} />
          <SkeletonCard lines={4} />
          <SkeletonCard lines={3} />
        </>
      )}
    </div>
  );
}
