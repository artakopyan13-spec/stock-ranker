"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

const FEATURES = [
  { icon: "🧠", h: "Investment committee", p: "Five AI analysts debate a stock — Research, Risk, Macro, Devil’s Advocate, Capital Allocation — then a chair rules a score and a call." },
  { icon: "🩺", h: "Portfolio X-ray", p: "Paste holdings or upload a statement for an honest, FCF-first review: concentration, price zones, sell/trim/hold with tax notes, ideas to fill the gaps." },
  { icon: "📊", h: "It grades itself", p: "Every rating ever published, scored against today’s price — including the losers. No cherry-picking." },
  { icon: "💬", h: "Ask this stock", p: "A copilot that answers only from the verified analysis on the page. It will not make up a number." },
  { icon: "⏱️", h: "Time machine", p: "Scrub the AI’s past ratings over the price chart and see the return since each call." },
  { icon: "🔎", h: "Screener & compare", p: "Filter the universe by rating, free cash flow, growth and value; compare up to five names side by side." },
];

const STEPS = [
  { n: "1", h: "Live data, every time", p: "Prices, multiples, free cash flow, debt and earnings dates pulled live. An unverifiable figure is labelled “unverified”, never invented." },
  { n: "2", h: "AI judges, code counts", p: "Claude analyses the business; every number is computed by code and reconciled by a verifier before it’s ever shown." },
  { n: "3", h: "Free cash flow first", p: "Each analysis leads with FCF and a ✅ / ⚠️ / ❌ verdict. Collapsing cash flow is headline risk." },
  { n: "4", h: "Sourced, dated, honest", p: "Every figure carries its source and date. Ratings are labelled estimates — research, not financial advice." },
];

export function Landing() {
  useEffect(() => {
    const els = Array.from(document.querySelectorAll<HTMLElement>(".reveal"));
    if (!("IntersectionObserver" in window)) {
      els.forEach((el) => el.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add("in")),
      { threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <div className="min-h-full flex flex-col">
      {/* minimal marketing header */}
      <header className="sticky top-0 z-40 bg-bg/80 backdrop-blur border-b border-line">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-4">
          <span className="text-lg font-semibold tracking-tight"><span className="text-gold">▲</span> Stock Ranker</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/how-it-works" className="text-muted hover:text-text no-underline hidden sm:inline">How it works</Link>
            <Link href="/examples" className="text-muted hover:text-text no-underline hidden sm:inline">Examples</Link>
            <ThemeToggle />
            <Link href="/signin" className="btn btn-primary py-1.5 px-4 text-sm no-underline">Sign in</Link>
          </nav>
        </div>
      </header>

      {/* hero */}
      <section className="relative overflow-hidden lp-gradient border-b border-line">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="lp-orb" style={{ width: 12, height: 12, left: "78%", top: "18%", background: "var(--purple)", animation: "lp-float1 7s ease-in-out infinite" }} />
          <span className="lp-orb" style={{ width: 8, height: 8, left: "88%", top: "52%", background: "var(--gold)", animation: "lp-pulse 5s ease-in-out infinite" }} />
          <span className="lp-orb" style={{ width: 16, height: 16, left: "8%", top: "30%", background: "#5AC8C8", animation: "lp-float2 9s ease-in-out infinite" }} />
          <span className="lp-orb" style={{ width: 6, height: 6, left: "60%", top: "72%", background: "var(--green)", animation: "lp-pulse 6s ease-in-out infinite" }} />
        </div>
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28 grid md:grid-cols-2 gap-12 items-center relative">
          <div className="lp-in">
            <div className="text-xs uppercase tracking-[0.18em] text-gold mb-3">AI stock research, done honestly</div>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-[1.08]">
              Know what a stock is really worth — <span className="text-gold">free cash flow first</span>.
            </h1>
            <p className="text-muted mt-4 max-w-lg leading-relaxed">
              A full analyst-style report on any stock in seconds — rating, bull vs. bear, catalysts, a 12-month view — with one rule above all: every number is sourced and dated, and nothing is invented.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/signin" className="btn btn-primary no-underline px-5 py-2.5">Get started — free</Link>
              <Link href="/examples" className="btn no-underline px-5 py-2.5">See a live example</Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
              <span>✓ Source-verified</span>
              <span>✓ Free cash flow first</span>
              <span>✓ It grades itself</span>
              <span>✓ Not financial advice</span>
            </div>
          </div>

          {/* floating mock analysis card */}
          <div className="lp-in md:justify-self-end" style={{ animationDelay: "0.12s" }}>
            <div className="card p-5 w-full max-w-sm shadow-2xl">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-lg font-bold">NVDA</div>
                  <div className="text-xs text-muted">NVIDIA Corporation</div>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold text-gold">7<span className="text-sm text-muted">/10</span></div>
                  <span className="chip chip-gold text-xs">HOLD</span>
                </div>
              </div>
              <div className="mt-3 flex gap-1">
                {Array.from({ length: 10 }).map((_v, i) => (
                  <span key={i} className={`flex-1 h-1.5 rounded ${i < 7 ? "bg-gold" : "bg-card2"}`} />
                ))}
              </div>
              <div className="mt-4 card-2 p-3 flex items-center gap-2 border-l-2 border-l-green">
                <span className="text-lg">✅</span>
                <div className="text-xs"><b>Free cash flow healthy</b><div className="text-muted">$127B TTM · 42% margin</div></div>
              </div>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                {[["Fwd P/E", "13.7×"], ["FCF margin", "42%"], ["Rev growth", "+106%"]].map(([k, v]) => (
                  <div key={k} className="card-2 p-2">
                    <dt className="text-[0.6rem] uppercase tracking-wider text-muted">{k}</dt>
                    <dd className="text-sm font-semibold">{v}</dd>
                  </div>
                ))}
              </dl>
              <div className="mt-3 text-[0.6rem] text-dim">Every figure carries its source &amp; date · illustrative</div>
            </div>
          </div>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="reveal text-center max-w-2xl mx-auto">
          <h2 className="text-2xl md:text-3xl font-semibold tracking-tight">More than a chatbot wrapper.</h2>
          <p className="text-muted mt-2">Six tools that make it feel like a research desk, not a prompt box.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 mt-10">
          {FEATURES.map((f, i) => (
            <div key={f.h} className="reveal card p-5 hover:border-purple transition-colors" style={{ transitionDelay: `${(i % 3) * 70}ms` }}>
              <div className="text-2xl" aria-hidden>{f.icon}</div>
              <div className="font-semibold mt-2">{f.h}</div>
              <p className="text-sm text-muted mt-1.5 leading-snug">{f.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* how it works */}
      <section className="border-y border-line bg-card/40">
        <div className="mx-auto max-w-6xl px-4 py-20">
          <div className="reveal text-center max-w-2xl mx-auto">
            <div className="text-xs uppercase tracking-wider text-gold">How it works</div>
            <h2 className="text-2xl md:text-3xl font-semibold tracking-tight mt-1">Honest by design.</h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mt-10">
            {STEPS.map((s, i) => (
              <div key={s.n} className="reveal card p-5" style={{ transitionDelay: `${i * 70}ms` }}>
                <span className="w-8 h-8 rounded-lg bg-card2 border border-line grid place-items-center text-gold font-semibold">{s.n}</span>
                <div className="font-semibold mt-3">{s.h}</div>
                <p className="text-sm text-muted mt-1.5 leading-snug">{s.p}</p>
              </div>
            ))}
          </div>
          <div className="reveal text-center mt-8">
            <Link href="/how-it-works" className="text-purple no-underline hover:underline text-sm">Read the full method →</Link>
          </div>
        </div>
      </section>

      {/* honesty highlight */}
      <section className="mx-auto max-w-6xl px-4 py-20">
        <div className="reveal card p-8 md:p-12 text-center lp-gradient">
          <div className="text-3xl md:text-4xl font-semibold tracking-tight max-w-2xl mx-auto leading-tight">
            &ldquo;Every number carries its source and date. <span className="text-gold">Unverifiable is unverified</span> — never invented.&rdquo;
          </div>
          <p className="text-muted mt-4 max-w-xl mx-auto">A verifier reconciles every figure before an analysis is published, and the app keeps a public track record of whether its calls were right.</p>
        </div>
      </section>

      {/* final CTA */}
      <section className="border-t border-line">
        <div className="mx-auto max-w-6xl px-4 py-20 text-center">
          <h2 className="reveal text-3xl md:text-4xl font-semibold tracking-tight">Start with a stock you own.</h2>
          <p className="reveal text-muted mt-3 max-w-md mx-auto">Free account. No card. Search a ticker, or X-ray your whole portfolio in one click.</p>
          <div className="reveal mt-7 flex flex-wrap gap-3 justify-center">
            <Link href="/signin" className="btn btn-primary no-underline px-6 py-3">Get started — free</Link>
            <Link href="/examples" className="btn no-underline px-6 py-3">See a live example</Link>
          </div>
        </div>
      </section>

      {/* footer */}
      <footer className="border-t border-line mt-auto">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-dim flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="font-semibold text-muted"><span className="text-gold">▲</span> Stock Ranker</span>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/examples">Examples</Link>
          <Link href="/signin">Sign in</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <span className="w-full mt-2 leading-relaxed">This is a research notebook, not financial advice. Ratings and forecasts are the model&rsquo;s judgment, not fact. Verify every figure against the cited source before acting.</span>
        </div>
      </footer>
    </div>
  );
}
