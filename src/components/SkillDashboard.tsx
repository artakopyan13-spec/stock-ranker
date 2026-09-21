"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { PortfolioReviewV2 } from "@/lib/portfolio/review-schema";
import type { EnrichedHolding } from "@/lib/portfolio/schema";
import { toSkillData } from "@/lib/portfolio/skill-map";
import { buildSkillDashboard } from "@/lib/portfolio/skill-dashboard";

/** Renders the portfolio review as the skill's exact HTML dashboard, isolated in an auto-sizing iframe. */
export function SkillDashboard({ review, holdings, newCashUsd, generatedAt }: { review: PortfolioReviewV2; holdings: EnrichedHolding[]; newCashUsd: number; generatedAt: string }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1400);

  const html = useMemo(() => {
    try {
      const today = (generatedAt || new Date().toISOString()).slice(0, 10);
      return buildSkillDashboard(toSkillData(review, holdings, { newCashUsd, today }));
    } catch (err) {
      return `<!doctype html><body style="font:14px system-ui;color:#b07a6e;padding:20px">Could not render the dashboard: ${err instanceof Error ? err.message : "unknown error"}</body>`;
    }
  }, [review, holdings, newCashUsd, generatedAt]);

  const [src, setSrc] = useState<string>("");
  useEffect(() => {
    const url = URL.createObjectURL(new Blob([html], { type: "text/html" }));
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSrc(url);
    return () => URL.revokeObjectURL(url);
  }, [html]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { __skillHeight?: number };
      if (data && typeof data.__skillHeight === "number" && ref.current && e.source === ref.current.contentWindow) {
        setHeight(Math.max(600, Math.ceil(data.__skillHeight) + 8));
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  if (!src) return <div className="card p-6 text-sm text-muted">Rendering your dashboard…</div>;
  return (
    <iframe
      ref={ref}
      title="Portfolio review dashboard"
      src={src}
      sandbox="allow-scripts allow-popups"
      className="w-full rounded-2xl border border-line bg-[#0E1116]"
      style={{ height, colorScheme: "dark" }}
    />
  );
}
