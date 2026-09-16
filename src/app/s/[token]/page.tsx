import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { getLatestAnalysis } from "@/lib/analysis/service";
import { AnalysisView } from "@/components/AnalysisView";
import { ago } from "@/lib/format";

/** Public, read-only share page. Cached at the edge (see next.config headers). */
export const revalidate = 3600;

export async function generateMetadata({ params }: PageProps<"/s/[token]">): Promise<Metadata> {
  const { token } = await params;
  const t = await db().ticker.findUnique({ where: { shareToken: token } });
  return { title: t ? `${t.symbol} · ${t.name}` : "Analysis", description: "Source-verified stock analysis. Not financial advice." };
}

export default async function SharePage({ params }: PageProps<"/s/[token]">) {
  const { token } = await params;
  const ticker = await db().ticker.findUnique({ where: { shareToken: token } });
  if (!ticker) notFound();
  const stored = await getLatestAnalysis(ticker.symbol);
  if (!stored) notFound();
  const a = stored.analysis;
  return (
    <div className="space-y-4">
      <div className="text-xs text-muted flex flex-wrap gap-3 items-center">
        <span className="chip chip-purple">public · read-only</span>
        <span>analyzed {ago(a.meta.analyzedAt)}</span>
        <span>· data as of {a.meta.dataAsOf.slice(0, 10)}</span>
        <span>· prompt {a.meta.promptVersion}</span>
        <Link href="/" className="ml-auto">
          Stock Ranker ↗
        </Link>
      </div>
      <AnalysisView analysis={a} />
    </div>
  );
}
