"use client";

import { useCallback, useEffect, useState } from "react";
import type { EarningsReportOutput } from "@/lib/earnings/schema";
import { ProgressLine } from "@/components/ProgressLine";
import { ReportNotice, SlowHint, reportProvenance, type ReportMetaView, type ReportNoticeView } from "@/components/ui";
import { fetchJson, postJson } from "@/lib/fetch-json";

const VERDICT_TONE: Record<string, string> = {
  beat: "text-green",
  above: "text-green",
  miss: "text-red",
  below: "text-red",
  inline: "text-muted",
  na: "text-muted",
};
function headlineTone(v: string): { label: string; cls: string } {
  if (v === "beat") return { label: "Beat", cls: "text-green border-green" };
  if (v === "miss") return { label: "Miss", cls: "text-red border-red" };
  return { label: "Mixed", cls: "text-gold border-gold" };
}
function fmtMoneyM(m: number): string {
  if (Math.abs(m) >= 1000) return `$${(m / 1000).toFixed(1)}B`;
  return `$${Math.round(m)}M`;
}

interface EarningsResponse {
  data?: EarningsReportOutput;
  meta?: ReportMetaView;
  notice?: ReportNoticeView;
}

export function Earnings({ symbol, signedIn = false }: { symbol: string; signedIn?: boolean }) {
  const [data, setData] = useState<EarningsReportOutput | null>(null);
  const [meta, setMeta] = useState<ReportMetaView | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<ReportNoticeView | null>(null);

  useEffect(() => {
    let live = true;
    // 404 = none built yet (normal); any other failure just leaves the "Build" prompt.
    void fetchJson<EarningsResponse>(`/api/earnings/${symbol}`).then((r) => {
      if (!live) return;
      if (r.ok && r.data?.data) {
        setData(r.data.data);
        setMeta(r.data.meta ?? null);
      }
      setLoading(false);
    });
    return () => {
      live = false;
    };
  }, [symbol]);

  const generate = useCallback(
    async (force = false) => {
      if (busy) return;
      setBusy(true);
      setNotice(null);
      const r = await postJson<EarningsResponse>(`/api/earnings/${symbol}`, { force });
      const body = r.data;
      if (body?.data) {
        setData(body.data);
        setMeta(body.meta ?? null);
      }
      if (body?.notice) setNotice(body.notice);
      else if (!r.ok || !body?.data) setNotice({ reason: "error", message: r.error ?? "Couldn't build the earnings report. Try again shortly." });
      setBusy(false);
    },
    [busy, symbol],
  );

  if (loading) return <div className="card p-8 text-center text-muted text-sm">Loading earnings…</div>;

  if (!data) {
    return (
      <div className="card p-8 text-center space-y-3">
        <p className="text-sm text-muted">No earnings report yet for {symbol}.</p>
        <button type="button" onClick={() => void generate(false)} disabled={busy} className="btn btn-primary">{busy ? "Building report…" : "Build earnings report"}</button>
        <ProgressLine key={busy ? "on" : "off"} active={busy} estSeconds={20} label="Building report" />
        <SlowHint key={busy ? "slow-on" : "slow-off"} active={busy} />
        {notice && (
          <div className="text-xs flex items-center justify-center">
            <ReportNotice notice={notice} signedIn={signedIn} className="justify-center" />
          </div>
        )}
      </div>
    );
  }

  // Every metric "na" means the figures weren't found — a confident "Mixed" chip would be invented.
  const noFigures = data.headlineVerdict === "unknown" || (data.metrics.length > 0 && data.metrics.every((m) => m.verdict === "na"));
  const hv = noFigures ? { label: "Figures unavailable", cls: "text-muted border-line" } : headlineTone(data.headlineVerdict);
  const approx = meta?.mode === "knowledge" ? "~" : "";
  const maxRev = Math.max(1, ...data.revenueTrend.map((p) => p.revenue));

  return (
    <div className="space-y-4">
      {meta?.outdated && <div className="card p-3 text-sm border-l-2 border-l-gold text-muted">Built with an older version of this report — Refresh to rebuild.</div>}
      {/* header */}
      <div className="card p-5 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-lg font-semibold">{data.company || symbol}</h3>
            <span className={`chip ${hv.cls}`}>{hv.label}</span>
          </div>
          <div className="text-sm text-muted mt-1">
            {data.quarterLabel} earnings · reported {data.reportDate}
            {data.timing ? ` · ${data.timing}` : ""}
          </div>
        </div>
        {data.priceReactionPct !== null && (
          <div className="text-right">
            <div className={`text-xl font-semibold tabular-nums ${data.priceReactionPct >= 0 ? "text-green" : "text-red"}`}>
              {data.priceReactionPct >= 0 ? "▲" : "▼"} {approx}{Math.abs(data.priceReactionPct).toFixed(1)}%
            </div>
            <div className="text-[0.66rem] text-muted">post‑earnings move</div>
          </div>
        )}
      </div>

      {/* KPI tiles */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        {data.metrics.map((m, i) => (
          <div key={i} className="card p-4">
            <div className="text-[0.68rem] text-muted">{m.label}</div>
            <div className="text-2xl font-bold tabular-nums mt-1">{m.value}</div>
            <div className="text-[0.66rem] text-muted mt-1">vs {m.consensus} est.</div>
            <div className={`text-xs font-semibold mt-1 ${VERDICT_TONE[m.verdict] ?? "text-muted"}`}>
              {m.deltaPct !== null ? `${m.deltaPct >= 0 ? "▲ +" : "▼ −"}${Math.abs(m.deltaPct).toFixed(1)}% ` : ""}
              {m.verdict !== "na" ? m.verdict : ""}
            </div>
          </div>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* revenue trend */}
        {data.revenueTrend.length > 0 && (
          <div className="card p-5">
            <div className="text-sm font-semibold mb-4">Revenue trend</div>
            <div className="flex items-end justify-between gap-2 h-44">
              {data.revenueTrend.map((p, i) => (
                <div key={i} className="flex-1 flex flex-col items-center justify-end gap-1 h-full">
                  <div className="text-[0.6rem] text-muted tabular-nums">{fmtMoneyM(p.revenue)}</div>
                  <div className="w-full rounded-t" style={{ height: `${Math.max(4, (p.revenue / maxRev) * 100)}%`, background: "linear-gradient(180deg,var(--purple),color-mix(in srgb,var(--purple) 55%,transparent))" }} />
                  <div className="text-[0.58rem] text-muted whitespace-nowrap">{p.period}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* highlights */}
        <div className="card p-5">
          <div className="text-sm font-semibold mb-3">Key highlights</div>
          <ul className="space-y-3">
            {data.highlights.map((h, i) => (
              <li key={i} className="flex gap-3">
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-purple shrink-0" />
                <span className="text-sm">
                  <span className="font-medium">{h.title}</span>
                  <span className="text-muted"> — {h.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* the bottleneck */}
      <div className="card p-5" style={{ borderLeft: "3px solid var(--gold)" }}>
        <div className="text-sm font-semibold text-gold mb-1">⚠ The bottleneck</div>
        <div className="font-medium">{data.bottleneck.title}</div>
        <p className="text-sm text-muted mt-1 leading-relaxed">{data.bottleneck.detail}</p>
      </div>

      {/* bull / bear future scenarios */}
      <div>
        <div className="text-sm font-semibold mb-2">What future earnings would mean</div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="card p-5" style={{ borderTop: "3px solid var(--green)" }}>
            <div className="text-sm font-semibold text-green mb-1">▲ Good direction (bull)</div>
            <div className="text-sm"><span className="text-muted">If: </span>{data.scenarios.bull.trigger}</div>
            <div className="text-sm mt-1"><span className="text-muted">Then: </span>{data.scenarios.bull.outcome}</div>
          </div>
          <div className="card p-5" style={{ borderTop: "3px solid var(--red)" }}>
            <div className="text-sm font-semibold text-red mb-1">▼ Bad direction (bear)</div>
            <div className="text-sm"><span className="text-muted">If: </span>{data.scenarios.bear.trigger}</div>
            <div className="text-sm mt-1"><span className="text-muted">Then: </span>{data.scenarios.bear.outcome}</div>
          </div>
        </div>
      </div>

      {/* footer */}
      {busy && (
        <div className="text-center">
          <ProgressLine active estSeconds={20} label="Rebuilding report" />
          <SlowHint active />
        </div>
      )}
      <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-muted">
        <span>{data.nextReportDate ? `Next report ≈ ${data.nextReportDate} · ` : ""}{meta ? reportProvenance(meta) : "Built by AI"} · verify figures · not advice</span>
        <span className="flex items-center gap-2 flex-wrap">
          <button type="button" onClick={() => void generate(true)} disabled={busy} className="btn text-xs py-1 px-2">{busy ? "Refreshing…" : "↻ Regenerate"}</button>
          {notice && <ReportNotice notice={notice} signedIn={signedIn} />}
        </span>
      </div>
    </div>
  );
}
