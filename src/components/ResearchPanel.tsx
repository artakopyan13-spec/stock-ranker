"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ResearchOutput } from "@/lib/research/schema";
import type { ReportMeta } from "@/lib/reports/freshness";
import { postJson } from "@/lib/fetch-json";
import { dateLabel } from "@/lib/format";

interface Notice {
  reason: string;
  message: string;
}
interface ResearchResponse {
  data?: ResearchOutput;
  cached?: boolean;
  meta?: ReportMeta;
  notice?: Notice;
}

/** The quota gate words its denials for stock analyses; say "research" here. */
const RESEARCH_COPY: Record<string, string> = {
  login_required: "Sign in to run fresh research — it's free. Cached industries stay free to view.",
  kill_switch: "Fresh research is paused right now due to high demand. Cached results are still available.",
  global_cap: "Today's fresh-research limit is reached. Cached results are still available; fresh runs resume tomorrow.",
};

export function ResearchPanel({ initial, suggestions }: { initial?: string; suggestions: string[] }) {
  const [industry, setIndustry] = useState(initial ?? "");
  const [data, setData] = useState<ResearchOutput | null>(null);
  const [meta, setMeta] = useState<ReportMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function run(q: string, force = false) {
    const term = q.trim();
    if (!term || busy) return;
    setBusy(true);
    setNotice(null);
    setIndustry(term);
    const res = await postJson<ResearchResponse>("/api/research", { industry: term, force });
    const body = res.data ?? {};
    // Cached research is always worth showing — a notice (quota, "already verified", a failed
    // refresh) rides along as a banner instead of replacing it.
    if (body.data) {
      setData(body.data);
      setMeta(body.meta ?? null);
    }
    if (body.notice) setNotice({ reason: body.notice.reason, message: RESEARCH_COPY[body.notice.reason] ?? body.notice.message });
    else if (!body.data) setNotice({ reason: "error", message: res.error ?? "Couldn't build research for that. Try another industry." });
    setBusy(false);
  }

  // Deep links (/research?q=…) open straight onto the result. Deferred a tick so the effect
  // doesn't set state synchronously; the cleanup keeps Strict Mode's double-mount to one run.
  useEffect(() => {
    if (!initial?.trim()) return;
    const t = setTimeout(() => void run(initial), 0);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once for the URL's ?q=
  }, []);

  return (
    <div className="space-y-5">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(industry);
        }}
      >
        <label htmlFor="research-industry" className="sr-only">Industry or theme</label>
        <input id="research-industry" value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Enter an industry or theme — e.g. weight-loss drugs, AI chips, defense" className="flex-1 min-w-[240px] py-2 px-3" />
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Researching…" : "Find companies"}</button>
      </form>

      {!data && !busy && (
        <div className="flex flex-wrap gap-2">
          {suggestions.map((s) => (
            <button key={s} type="button" className="chip chip-muted hover:text-text" onClick={() => void run(s)}>{s}</button>
          ))}
        </div>
      )}

      {notice && (
        <div role="status" className="card p-4 text-sm flex items-center gap-3 flex-wrap">
          <span className="text-gold">{notice.message}</span>
          {notice.reason === "login_required" && <Link href="/signin" className="btn btn-primary no-underline text-xs px-3 py-1">Sign in →</Link>}
          {notice.reason === "user_quota" && <Link href="/pricing" className="btn btn-primary no-underline text-xs px-3 py-1">Upgrade →</Link>}
        </div>
      )}

      {busy && !data && <div className="card p-8 text-center text-muted">Scanning the {industry || "industry"} landscape and pulling companies to review…</div>}

      {data && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-lg font-semibold capitalize">{data.industry}</h2>
              <div className="flex items-center gap-3">
                {meta && (
                  <span className={`text-[0.7rem] ${meta.mode === "web" ? "text-green" : "text-muted"}`}>
                    {meta.mode === "web" ? "Web-verified" : "From AI knowledge (may be out of date)"} · built {dateLabel(meta.builtAt)}
                  </span>
                )}
                <button type="button" onClick={() => void run(industry, true)} disabled={busy} className="btn text-xs py-1 px-2" title="Regenerate with the latest, plainest explanation">↻ Regenerate</button>
              </div>
            </div>
            <p className="text-sm text-muted mt-2 leading-relaxed">{data.overview}</p>
            {data.themes.length > 0 && (
              <div className="flex flex-col gap-1.5 mt-3">
                {data.themes.map((t) => (
                  <div key={t} className="text-xs text-purple-ish flex gap-2">
                    <span className="text-purple shrink-0">•</span>
                    <span className="break-words">{t}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {data.companies.map((c) => (
              <div key={c.ticker} className="card p-4 flex flex-col gap-2 min-w-0">
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <Link href={`/t/${c.ticker}`} className="no-underline text-text font-semibold">{c.ticker}</Link>
                  <span className="text-muted text-sm break-words">{c.name}</span>
                </div>
                {c.role && <div className="text-[0.72rem] text-purple break-words">{c.role}</div>}
                <p className="text-sm text-muted leading-relaxed break-words">{c.whatTheyDo}</p>
                <div className="text-sm space-y-1.5">
                  <div className="flex gap-2"><span className="text-green shrink-0">+</span><span className="break-words">{c.bullCase}</span></div>
                  <div className="flex gap-2"><span className="text-red shrink-0">−</span><span className="break-words">{c.keyRisk}</span></div>
                </div>
                <Link href={`/t/${c.ticker}`} className="text-purple text-xs no-underline mt-auto">See the full breakdown →</Link>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted">
            Plain-English research to help you build a watchlist — not a recommendation to buy or sell anything. Open each name to see its sourced Scorecard.
          </p>
        </div>
      )}
    </div>
  );
}
