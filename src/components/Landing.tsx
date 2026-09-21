"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

/** A slice of the coverage universe for the scrolling ticker — illustrative, not live quotes. */
const TICKERS: [string, string, string][] = [
  ["NVDA", "8/10", "✅"],
  ["AAPL", "7/10", "✅"],
  ["MSFT", "8/10", "✅"],
  ["GOOGL", "7/10", "✅"],
  ["META", "7/10", "✅"],
  ["AMZN", "6/10", "⚠️"],
  ["COST", "6/10", "✅"],
  ["TSLA", "4/10", "⚠️"],
  ["AMD", "6/10", "✅"],
  ["NFLX", "7/10", "✅"],
  ["JPM", "7/10", "✅"],
  ["V", "8/10", "✅"],
];

const STATS: [string, string][] = [
  ["0", "invented numbers — every figure is sourced & dated"],
  ["5", "AI analysts debate before a call is made"],
  ["6", "research tools, not a single chat box"],
  ["1", "rule above all: free cash flow first"],
];

const STEPS: { n: string; h: string; p: string }[] = [
  { n: "01", h: "Live data, every time", p: "Prices, multiples, free cash flow, debt and earnings dates are pulled live. An unverifiable figure is labelled “unverified” — never invented." },
  { n: "02", h: "AI judges, code counts", p: "Claude analyses the business; every number is computed by code and reconciled by a verifier before it is ever shown to you." },
  { n: "03", h: "Free cash flow first", p: "Each report leads with FCF and a ✅ / ⚠️ / ❌ verdict. Collapsing cash flow is headline risk, not a footnote." },
  { n: "04", h: "Sourced, dated, honest", p: "Every figure carries its source and date, and the app keeps a public scorecard of whether its own calls were right." },
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
    <div className="min-h-full flex flex-col overflow-x-hidden">
      {/* ---------- header ---------- */}
      <header className="sticky top-0 z-50 bg-bg/70 backdrop-blur-xl border-b border-line/70">
        <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between gap-4">
          <span className="text-lg font-semibold tracking-tight"><span className="text-gold">▲</span> Stock Ranker</span>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/how-it-works" className="text-muted hover:text-text no-underline hidden sm:inline">How it works</Link>
            <Link href="/examples" className="text-muted hover:text-text no-underline hidden sm:inline">Examples</Link>
            <ThemeToggle />
            <Link href="/signin" className="btn btn-primary py-1.5 px-4 text-sm no-underline lp-shine">Sign in</Link>
          </nav>
        </div>
      </header>

      {/* ---------- hero ---------- */}
      <section className="relative overflow-hidden lp-gradient lp-grid-bg border-b border-line">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="lp-orb" style={{ width: 14, height: 14, left: "78%", top: "16%", background: "var(--purple)", animation: "lp-float1 7s ease-in-out infinite" }} />
          <span className="lp-orb" style={{ width: 8, height: 8, left: "90%", top: "50%", background: "var(--gold)", animation: "lp-pulse 5s ease-in-out infinite" }} />
          <span className="lp-orb" style={{ width: 18, height: 18, left: "7%", top: "28%", background: "#5AC8C8", animation: "lp-float2 9s ease-in-out infinite" }} />
          <span className="lp-orb" style={{ width: 6, height: 6, left: "58%", top: "74%", background: "var(--green)", animation: "lp-pulse 6s ease-in-out infinite" }} />
        </div>

        <div className="mx-auto max-w-6xl px-4 py-20 md:py-28 grid md:grid-cols-2 gap-12 items-center relative">
          {/* copy */}
          <div className="lp-in">
            <div className="inline-flex items-center gap-2 rounded-full border border-line bg-card/60 px-3 py-1 text-xs text-muted backdrop-blur">
              <span className="lp-live-dot" /> AI stock research, done honestly
            </div>
            <h1 className="mt-4 text-4xl md:text-6xl font-semibold tracking-tight leading-[1.04]">
              Know what a stock is <span className="lp-title-grad">really worth</span>.
            </h1>
            <p className="text-muted mt-5 max-w-lg leading-relaxed text-[1.02rem]">
              A full analyst‑grade report on any stock in seconds — rating, bull vs. bear, catalysts, a 12‑month view — with one rule above all:
              <span className="text-text"> every number is sourced, dated, and never invented.</span>
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/signin" className="btn btn-primary no-underline px-5 py-2.5 lp-shine">Get started — free</Link>
              <Link href="/examples" className="btn no-underline px-5 py-2.5">See a live example →</Link>
            </div>
            <div className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
              <span className="lp-tick">Source‑verified</span>
              <span className="lp-tick">Free cash flow first</span>
              <span className="lp-tick">It grades itself</span>
              <span className="lp-tick">No card required</span>
            </div>
          </div>

          {/* animated mock analysis card */}
          <div className="lp-in md:justify-self-end w-full max-w-sm" style={{ animationDelay: "0.12s" }}>
            <div className="lp-float-card relative">
              <div aria-hidden className="lp-card-glow" />
              <div className="card lp-glass p-5 relative">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-lg font-bold tracking-tight">NVDA</div>
                    <div className="text-xs text-muted">NVIDIA Corporation</div>
                  </div>
                  <div className="text-right">
                    <div className="text-3xl font-bold text-gold leading-none">7<span className="text-sm text-muted">/10</span></div>
                    <span className="chip chip-gold text-xs mt-1">HOLD</span>
                  </div>
                </div>

                <div className="mt-3 flex gap-1">
                  {Array.from({ length: 10 }).map((_v, i) => (
                    <span key={i} className={`lp-pip flex-1 h-1.5 rounded ${i < 7 ? "bg-gold" : "bg-card2"}`} style={{ animationDelay: `${0.5 + i * 0.06}s` }} />
                  ))}
                </div>

                {/* mini sparkline */}
                <svg viewBox="0 0 300 70" className="mt-4 w-full h-16" preserveAspectRatio="none" aria-hidden>
                  <defs>
                    <linearGradient id="lpspark" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <path d="M0 55 L40 48 L75 52 L110 38 L150 42 L190 26 L230 30 L270 16 L300 12 L300 70 L0 70 Z" fill="url(#lpspark)" />
                  <path className="line-draw" d="M0 55 L40 48 L75 52 L110 38 L150 42 L190 26 L230 30 L270 16 L300 12" fill="none" stroke="var(--gold)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>

                <div className="mt-3 card-2 p-3 flex items-center gap-2 border-l-2 border-l-green">
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
        </div>

        {/* ticker marquee */}
        <div className="relative border-t border-line/70 bg-bg/40 backdrop-blur">
          <div className="lp-marquee py-2.5">
            <div className="lp-marquee-track">
              {[...TICKERS, ...TICKERS].map(([sym, rating, fcf], i) => (
                <span key={`${sym}-${i}`} className="lp-tickitem">
                  <span className="font-semibold text-text">{sym}</span>
                  <span className="text-gold font-semibold">{rating}</span>
                  <span>{fcf}</span>
                </span>
              ))}
            </div>
          </div>
          <div className="pointer-events-none absolute inset-y-0 left-0 w-16 lp-fade-l" />
          <div className="pointer-events-none absolute inset-y-0 right-0 w-16 lp-fade-r" />
        </div>
      </section>

      {/* ---------- stats band ---------- */}
      <section className="border-b border-line">
        <div className="mx-auto max-w-6xl px-4 py-12 grid grid-cols-2 lg:grid-cols-4 gap-4">
          {STATS.map(([n, label], i) => (
            <div key={label} className="reveal" style={{ transitionDelay: `${i * 70}ms` }}>
              <div className="text-4xl font-semibold text-gold tracking-tight">{n}</div>
              <div className="text-xs text-muted mt-1 leading-snug">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- bento features ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:py-24">
        <div className="reveal max-w-2xl">
          <div className="text-xs uppercase tracking-[0.18em] text-gold">The desk</div>
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight mt-2">More than a chatbot wrapper.</h2>
          <p className="text-muted mt-3">Six tools that make it feel like a research floor — a committee, a copilot, a track record — not a prompt box.</p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 auto-rows-[minmax(0,1fr)] gap-4">
          {/* hero tile: committee */}
          <div className="reveal card p-6 md:col-span-2 md:row-span-2 relative overflow-hidden hover:border-purple transition-colors">
            <div aria-hidden className="lp-tile-glow" />
            <div className="text-2xl">🧠</div>
            <div className="font-semibold text-lg mt-2">Investment committee</div>
            <p className="text-sm text-muted mt-1.5 max-w-md leading-snug">Five AI analysts — Research, Risk, Macro, Devil’s Advocate, Capital Allocation — argue the stock out. A chair weighs the debate and rules a score and a call, with the dissent kept on the record.</p>
            <div className="mt-5 flex flex-wrap gap-2">
              {["Research", "Risk", "Macro", "Devil’s Advocate", "Capital Allocation"].map((r) => (
                <span key={r} className="chip chip-muted text-xs">{r}</span>
              ))}
            </div>
            <div className="mt-5 card-2 p-4 max-w-sm">
              <div className="flex items-center justify-between text-xs text-muted"><span>Chair’s verdict</span><span>after debate</span></div>
              <div className="mt-1.5 flex items-center gap-3">
                <span className="text-2xl font-bold text-gold">7<span className="text-sm text-muted">/10</span></span>
                <span className="chip chip-gold text-xs">HOLD</span>
                <span className="text-xs text-muted">2 dissents noted</span>
              </div>
            </div>
          </div>

          {[
            { icon: "🩺", h: "Portfolio X-ray", p: "Paste holdings or upload a statement for an honest, FCF-first review — concentration, price zones, sell / trim / hold with tax notes." },
            { icon: "💬", h: "Ask this stock", p: "A copilot that answers only from the verified analysis on the page. It will not make up a number." },
            { icon: "📊", h: "It grades itself", p: "Every rating ever published, scored against today’s price — the losers included. No cherry‑picking." },
            { icon: "⏱️", h: "Time machine", p: "Scrub the AI’s past ratings across the price chart and see the return since each call." },
            { icon: "🔎", h: "Screener & compare", p: "Filter the universe by rating, free cash flow, growth and value; compare up to five names side by side." },
          ].map((f, i) => (
            <div key={f.h} className="reveal card p-5 hover:border-purple transition-colors" style={{ transitionDelay: `${(i % 3) * 60}ms` }}>
              <div className="text-2xl" aria-hidden>{f.icon}</div>
              <div className="font-semibold mt-2">{f.h}</div>
              <p className="text-sm text-muted mt-1.5 leading-snug">{f.p}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- how it works ---------- */}
      <section className="border-y border-line bg-card/40 lp-grid-bg">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-24">
          <div className="reveal max-w-2xl">
            <div className="text-xs uppercase tracking-[0.18em] text-gold">How it works</div>
            <h2 className="text-2xl md:text-4xl font-semibold tracking-tight mt-2">Honest by design.</h2>
          </div>
          <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((s, i) => (
              <div key={s.n} className="reveal relative" style={{ transitionDelay: `${i * 80}ms` }}>
                <div className="text-sm font-mono text-gold/80">{s.n}</div>
                <div className="mt-2 h-px w-full bg-gradient-to-r from-gold/50 to-transparent" />
                <div className="font-semibold mt-4">{s.h}</div>
                <p className="text-sm text-muted mt-1.5 leading-snug">{s.p}</p>
              </div>
            ))}
          </div>
          <div className="reveal mt-10">
            <Link href="/how-it-works" className="text-purple no-underline hover:underline text-sm">Read the full method →</Link>
          </div>
        </div>
      </section>

      {/* ---------- honesty highlight ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:py-24">
        <div className="reveal card lp-glass p-8 md:p-14 text-center lp-gradient relative overflow-hidden">
          <div aria-hidden className="lp-tile-glow" />
          <div className="text-2xl md:text-4xl font-semibold tracking-tight max-w-3xl mx-auto leading-tight relative">
            “Every number carries its source and date. <span className="lp-title-grad">Unverifiable is unverified</span> — never invented.”
          </div>
          <p className="text-muted mt-5 max-w-xl mx-auto relative">A verifier reconciles every figure before an analysis is published, and the app keeps a public track record of whether its calls were right.</p>
        </div>
      </section>

      {/* ---------- final CTA ---------- */}
      <section className="relative border-t border-line lp-gradient overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <span className="lp-orb" style={{ width: 10, height: 10, left: "20%", top: "30%", background: "var(--gold)", animation: "lp-pulse 5s ease-in-out infinite" }} />
          <span className="lp-orb" style={{ width: 14, height: 14, left: "82%", top: "40%", background: "var(--purple)", animation: "lp-float1 8s ease-in-out infinite" }} />
        </div>
        <div className="mx-auto max-w-6xl px-4 py-24 text-center relative">
          <h2 className="reveal text-3xl md:text-5xl font-semibold tracking-tight">Start with a stock you own.</h2>
          <p className="reveal text-muted mt-4 max-w-md mx-auto">Free account, no card. Search a ticker, or X‑ray your whole portfolio in one click.</p>
          <div className="reveal mt-8 flex flex-wrap gap-3 justify-center">
            <Link href="/signin" className="btn btn-primary no-underline px-6 py-3 lp-shine">Get started — free</Link>
            <Link href="/examples" className="btn no-underline px-6 py-3">See a live example →</Link>
          </div>
        </div>
      </section>

      {/* ---------- footer ---------- */}
      <footer className="border-t border-line mt-auto">
        <div className="mx-auto max-w-6xl px-4 py-8 text-xs text-dim flex flex-wrap items-center gap-x-5 gap-y-2">
          <span className="font-semibold text-muted"><span className="text-gold">▲</span> Stock Ranker</span>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/examples">Examples</Link>
          <Link href="/signin">Sign in</Link>
          <Link href="/terms">Terms</Link>
          <Link href="/privacy">Privacy</Link>
          <span className="w-full mt-2 leading-relaxed">This is a research notebook, not financial advice. Ratings and forecasts are the model’s judgment, not fact. Verify every figure against the cited source before acting.</span>
        </div>
      </footer>
    </div>
  );
}
