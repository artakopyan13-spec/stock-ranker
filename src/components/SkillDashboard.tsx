"use client";

import { useMemo } from "react";
import type { PortfolioReviewV2 } from "@/lib/portfolio/review-schema";
import type { EnrichedHolding } from "@/lib/portfolio/schema";
import { toSkillData } from "@/lib/portfolio/skill-map";
import { buildSkillDashboard } from "@/lib/portfolio/skill-dashboard";
import { DashboardFrame } from "@/components/DashboardFrame";

/** Renders the portfolio review as the skill's exact HTML dashboard. */
export function SkillDashboard({ review, holdings, newCashUsd, generatedAt }: { review: PortfolioReviewV2; holdings: EnrichedHolding[]; newCashUsd: number; generatedAt: string }) {
  const html = useMemo(() => {
    try {
      const today = (generatedAt || new Date().toISOString()).slice(0, 10);
      return buildSkillDashboard(toSkillData(review, holdings, { newCashUsd, today }));
    } catch (err) {
      return `<!doctype html><body style="font:14px system-ui;color:#b07a6e;padding:20px">Could not render the dashboard: ${err instanceof Error ? err.message : "unknown error"}</body>`;
    }
  }, [review, holdings, newCashUsd, generatedAt]);

  return <DashboardFrame html={html} />;
}
