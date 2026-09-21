"use client";

import { useMemo } from "react";
import example from "@/lib/portfolio/example-portfolio.json";
import { buildSkillDashboard, type SkillData } from "@/lib/portfolio/skill-dashboard";
import { DashboardFrame } from "@/components/DashboardFrame";

/** A fully-rendered sample portfolio review (dated example data) for logged-out visitors to explore. */
export function ExamplePortfolioDashboard() {
  const html = useMemo(() => buildSkillDashboard(example as unknown as SkillData), []);
  return <DashboardFrame html={html} />;
}
