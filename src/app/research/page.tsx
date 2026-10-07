import type { Metadata } from "next";
import { ResearchPanel } from "@/components/ResearchPanel";
import { POPULAR_INDUSTRIES } from "@/lib/research/run";

export const metadata: Metadata = {
  title: "Market Research",
  description: "Pick an industry or theme and get the notable public companies to review — what they do, the bull case and the key risk.",
};
export const dynamic = "force-dynamic";

export default async function ResearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const sp = await searchParams;
  const initial = typeof sp.q === "string" ? sp.q : "";
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Market Research</h1>
        <p className="text-muted text-sm mt-1">Pick an industry or theme and get the notable public companies to review — what they do, the bull case, and the key risk — each linking to its sourced Scorecard.</p>
      </div>
      <ResearchPanel initial={initial} suggestions={POPULAR_INDUSTRIES} />
    </div>
  );
}
