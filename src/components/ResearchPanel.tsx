"use client";

import { useState } from "react";
import Link from "next/link";
import type { ResearchOutput } from "@/lib/research/schema";

const SUGGESTIONS = ["Artificial intelligence", "Nuclear energy", "Cybersecurity", "Weight-loss drugs (GLP-1)", "Semiconductors", "Defense", "Quantum computing", "Space"];

export function ResearchPanel({ initial }: { initial?: string }) {
  const [industry, setIndustry] = useState(initial ?? "");
  const [data, setData] = useState<ResearchOutput | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [upgrade, setUpgrade] = useState(false);
  const [cached, setCached] = useState(false);

  async function run(q: string) {
    const term = q.trim();
    if (!term || busy) return;
    setBusy(true);
    setNotice(null);
    setUpgrade(false);
    setIndustry(term);
    try {
      const res = await fetch("/api/research", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ industry: term }) });
      const body = (await res.json().catch(() => ({}))) as { data?: ResearchOutput; cached?: boolean; notice?: { reason: string; message: string }; error?: string };
      if (body.notice) {
        setNotice(body.notice.message);
        setUpgrade(body.notice.reason === "user_quota");
      } else if (body.data) {
        setData(body.data);
        setCached(Boolean(body.cached));
      } else {
        setNotice(body.error ?? "Couldn't build research for that. Try another industry.");
      }
    } catch {
      setNotice("Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void run(industry);
        }}
      >
        <input value={industry} onChange={(e) => setIndustry(e.target.value)} placeholder="Enter an industry or theme — e.g. nuclear energy, AI chips, defense" className="flex-1 min-w-[240px] py-2 px-3" />
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Researching…" : "Find companies"}</button>
      </form>

      {!data && !busy && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" className="chip chip-muted hover:text-text" onClick={() => void run(s)}>{s}</button>
          ))}
        </div>
      )}

      {notice && (
        <div className="card p-4 text-sm flex items-center gap-3 flex-wrap">
          <span className="text-gold">{notice}</span>
          {upgrade && <a href="/pricing" className="btn btn-primary no-underline text-xs px-3 py-1">Upgrade →</a>}
        </div>
      )}

      {busy && !data && <div className="card p-8 text-center text-muted">Scanning the {industry || "industry"} landscape and pulling companies to review…</div>}

      {data && (
        <div className="space-y-4">
          <div className="card p-5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <h2 className="text-lg font-semibold capitalize">{data.industry}</h2>
              <span className="text-[0.7rem] text-muted">as of {data.asOf}{cached ? " · cached" : ""}</span>
            </div>
            <p className="text-sm text-muted mt-2 leading-relaxed">{data.overview}</p>
            {data.themes.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-3">
                {data.themes.map((t) => (
                  <span key={t} className="chip chip-purple text-xs">{t}</span>
                ))}
              </div>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {data.companies.map((c) => (
              <div key={c.ticker} className="card p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/t/${c.ticker}`} className="no-underline text-text font-semibold">{c.ticker}</Link>
                    <span className="text-muted text-sm"> · {c.name}</span>
                  </div>
                  <span className="chip chip-muted text-[0.65rem] whitespace-nowrap">{c.role}</span>
                </div>
                <p className="text-xs text-muted">{c.whatTheyDo}</p>
                <div className="text-xs space-y-1">
                  <div className="flex gap-1.5"><span className="text-green">+</span><span>{c.bullCase}</span></div>
                  <div className="flex gap-1.5"><span className="text-red">−</span><span>{c.keyRisk}</span></div>
                </div>
                <Link href={`/t/${c.ticker}`} className="text-purple text-xs no-underline mt-auto">Grade it on the Scorecard →</Link>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted">
            Neutral research to help you build a watchlist — not a recommendation to buy or sell anything. Verify every name yourself; open each one to see its sourced Scorecard.
          </p>
        </div>
      )}
    </div>
  );
}
