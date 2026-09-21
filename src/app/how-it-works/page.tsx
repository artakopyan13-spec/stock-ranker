import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How it works",
  description: "FCF-first, source-verified AI stock research — how the analysis, the committee, the track record and the portfolio review work.",
};

const STEPS = [
  { n: "1", h: "Live data, every time", p: "For any ticker we pull live prices, valuation multiples, free cash flow, margins, debt and the earnings date. Nothing comes from stale memory — an unverifiable figure is labelled “unverified”, never invented." },
  { n: "2", h: "The AI does the judgment, code does the numbers", p: "Claude analyses the business — rating, bull vs. bear, catalysts, a 12-month view — but every KPI on the page is computed from the data by code, then reconciled by a verifier before anything is published." },
  { n: "3", h: "Free cash flow leads", p: "Every analysis and every position card leads with free cash flow and a ✅ / ⚠️ / ❌ verdict. Negative or collapsing cash flow is headline risk and an automatic “no new money”." },
  { n: "4", h: "Sourced and dated", p: "Each number carries its source and as-of date. The rating, forecasts and price zones are labelled as the model’s estimates — research, not financial advice." },
];

const FEATURES = [
  { icon: "🧠", h: "Investment committee", p: "Five AI analysts — Research, Risk, Macro, Devil’s Advocate, Capital Allocation — debate a stock, then a chair rules a score and a BUY/HOLD/SELL.", href: "/examples" },
  { icon: "💬", h: "Ask this stock", p: "A copilot that answers only from that stock’s verified data — it won’t make up a number.", href: "/examples" },
  { icon: "⏱️", h: "Time machine", p: "Scrub the AI’s past ratings over the price chart and see the return since each call.", href: "/examples" },
  { icon: "📊", h: "Track record", p: "Every rating ever published, graded against today’s price. The app grades itself — no cherry-picking.", href: "/track-record" },
  { icon: "🩺", h: "Portfolio X-ray", p: "Paste holdings or upload a statement for an honest, FCF-first review: concentration, price zones, sell/trim/hold with tax notes, ideas to fill the gaps.", href: "/examples" },
  { icon: "🔎", h: "Screener & compare", p: "Filter the universe by rating, FCF, growth and value; compare up to five names side by side.", href: "/screener" },
];

export default function HowItWorksPage() {
  return (
    <div className="space-y-10">
      <section className="pt-4">
        <div className="text-xs uppercase tracking-wider text-gold">How it works</div>
        <h1 className="text-3xl md:text-4xl font-semibold tracking-tight mt-1">
          Honest, source-verified stock research — <span className="text-gold">free cash flow first</span>.
        </h1>
        <p className="text-muted mt-3 max-w-2xl leading-relaxed">
          It turns live market data into a full analyst-style report through Claude, with one rule above all: never invent a number. Every figure is sourced and dated, the judgment is the model&rsquo;s, and it&rsquo;s honest about whether it&rsquo;s been right.
        </p>
        <div className="mt-5 flex gap-2 flex-wrap">
          <Link href="/examples" className="btn btn-primary no-underline">See a live example</Link>
          <Link href="/" className="btn no-underline">Search a stock</Link>
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">The method</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {STEPS.map((s) => (
            <div key={s.n} className="card p-5">
              <div className="flex items-center gap-3">
                <span className="w-7 h-7 rounded-lg bg-card2 border border-line grid place-items-center text-gold font-semibold text-sm">{s.n}</span>
                <span className="font-semibold">{s.h}</span>
              </div>
              <p className="text-sm text-muted mt-2 leading-relaxed">{s.p}</p>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">What you can do</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Link key={f.h} href={f.href} className="card p-5 no-underline text-text hover:border-purple transition-colors">
              <div className="flex items-center gap-2">
                <span className="text-xl" aria-hidden>{f.icon}</span>
                <span className="font-semibold">{f.h}</span>
              </div>
              <p className="text-sm text-muted mt-2 leading-snug">{f.p}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="card p-6">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3">Why you can trust the numbers</h2>
        <ul className="space-y-2 text-sm text-muted leading-relaxed list-disc ml-5">
          <li><b className="text-text">Reconciled before publishing.</b> A verifier checks that every figure ties out, the bear case is stated as loudly as the bull, sources are present, and there are no placeholders — or the analysis isn&rsquo;t shown.</li>
          <li><b className="text-text">It grades itself.</b> The <Link href="/track-record" className="text-purple no-underline">track record</Link> compares every past call to where the stock trades now, including the losers.</li>
          <li><b className="text-text">Not financial advice.</b> Ratings, forecasts and price zones are the model&rsquo;s estimates. Verify every figure against its cited source and make your own decisions.</li>
        </ul>
      </section>

      <section className="text-center">
        <div className="text-lg font-semibold">Try it on a real stock, or on your own portfolio</div>
        <div className="mt-4 flex gap-2 justify-center flex-wrap">
          <Link href="/examples" className="btn no-underline">See the example</Link>
          <Link href="/signin" className="btn btn-primary no-underline">Sign in / sign up</Link>
        </div>
      </section>
    </div>
  );
}
