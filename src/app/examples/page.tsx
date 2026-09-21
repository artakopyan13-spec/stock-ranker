import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { ExamplePortfolioDashboard } from "@/components/ExamplePortfolioDashboard";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "See it in action",
  description: "A full example portfolio review and live examples — no account needed.",
};

export default async function ExamplesPage() {
  // Feature a real analyzed ticker if one exists (its cached analysis is free to view).
  const latest = await db().analysis.findFirst({ where: { verified: true }, orderBy: { createdAt: "desc" }, select: { symbol: true } }).catch(() => null);
  const featured = latest?.symbol ?? "NVDA";

  const links = [
    { href: `/t/${featured}`, label: "A full stock analysis", desc: `${featured}: FCF-first rating, bull vs. bear, catalysts, 12-month view.` },
    { href: "/track-record", label: "The AI's track record", desc: "Every past rating graded against today's price — the honesty page." },
    { href: "/screener", label: "The screener", desc: "Filter the universe by rating, FCF, growth, value; presets and a heatmap." },
    { href: "/compare", label: "Compare stocks", desc: "Up to 5 side by side, best value in green, weakest in red." },
    { href: "/leaderboard", label: "Top rated", desc: "The highest-rated names from everything analyzed so far." },
    { href: "/learn", label: "Learn", desc: "Plain-English glossary explaining every metric, with good/bad ranges." },
  ];

  return (
    <div className="space-y-8">
      <section className="pt-4">
        <div className="text-xs uppercase tracking-wider text-gold">Live demo</div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-1">See it in action — no account needed</h1>
        <p className="text-muted mt-2 max-w-2xl">
          This is a real, generated <b className="text-text">portfolio review</b> on example data — the same output you get for your own holdings. Click through its tabs (Overview, Honest review, Buy/Sell, My stocks…), hover the <span className="text-purple">?</span> marks, open a stock&rsquo;s full page.
        </p>
      </section>

      <ExamplePortfolioDashboard />

      <p className="text-xs text-dim">
        Numbers above are a dated worked example, not live. Your own review pulls live prices and free-cash-flow data for every holding.
        <Link href="/portfolio" className="text-purple no-underline ml-1">X-ray your portfolio →</Link>
      </p>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3">Explore the real thing (free to browse)</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="card p-4 no-underline text-text hover:border-purple transition-colors">
              <div className="font-semibold">{l.label}</div>
              <p className="text-sm text-muted mt-1 leading-snug">{l.desc}</p>
            </Link>
          ))}
        </div>
        <p className="text-xs text-dim mt-3">Viewing cached analyses is free and unlimited. Running fresh analyses, the committee, the copilot and your own portfolio review need a free account.</p>
      </section>

      <section className="card p-6 text-center">
        <div className="text-lg font-semibold">Ready to run your own?</div>
        <p className="text-muted text-sm mt-1 max-w-md mx-auto">Free account. Paste holdings or upload a statement, and get this exact review on your real portfolio.</p>
        <div className="mt-4 flex gap-2 justify-center">
          <Link href="/signin" className="btn btn-primary no-underline">Sign in / sign up</Link>
          <Link href="/how-it-works" className="btn no-underline">How it works</Link>
        </div>
      </section>
    </div>
  );
}
