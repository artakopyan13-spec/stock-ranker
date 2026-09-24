"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/ThemeToggle";
import { FeatureIcon } from "@/components/FeatureIcon";

const CTA_PRIMARY = "Analyze a stock — free";

const SCROLLY_STEPS = ["Pull the live data", "Read the financials", "Free cash flow first", "Five analysts weigh in", "A rating, on the record"];

const PROBLEMS: { icon: string; h: string; p: string }[] = [
  { icon: "🤖", h: "AI that makes things up", p: "Chatbots invent numbers and never show a source. You can’t act on a confident guess." },
  { icon: "🗣️", h: "Anonymous hot takes", p: "Undated opinions from strangers who are never graded when they turn out wrong." },
  { icon: "⏳", h: "Hours of digging", p: "Real diligence — filings, cash flow, multiples — takes time you don’t have before the open." },
];

const FEATURES: { icon: string; h: string; p: string }[] = [
  { icon: "xray", h: "Portfolio X-ray", p: "Paste holdings or upload a statement for an honest, FCF-first review: concentration, price zones, trim / hold, ideas to fill the gaps." },
  { icon: "ask", h: "Ask this stock", p: "A copilot that answers only from the verified analysis on the page. It will not make up a number." },
  { icon: "track", h: "A public track record", p: "Every rating ever made, graded against today’s price — the losers included. No cherry-picking." },
  { icon: "time", h: "Time machine", p: "Scrub the AI’s past calls over the price chart and see the return since each one." },
  { icon: "screener", h: "Screener & compare", p: "Filter the whole universe by rating, cash flow, growth and value; compare five names side by side." },
];

const STEPS: { n: string; h: string; p: string }[] = [
  { n: "01", h: "Live data, every time", p: "Prices, multiples, free cash flow, debt and earnings dates are pulled live. An unverifiable figure is labelled “unverified” — never invented." },
  { n: "02", h: "AI judges, code counts", p: "Claude analyses the business; every number is computed by code and reconciled by a verifier before it is ever shown to you." },
  { n: "03", h: "Free cash flow first", p: "Each report leads with FCF and a ✅ / ⚠️ / ❌ verdict. Collapsing cash flow is headline risk, not a footnote." },
  { n: "04", h: "Sourced, dated, honest", p: "Every figure carries its source and date, and the app keeps a public scorecard of whether its own calls were right." },
];

const FAQ: { q: string; a: string }[] = [
  { q: "Is this financial advice?", a: "No. It’s research — the model’s judgment, clearly labelled as an estimate. You make the call, and you should verify any figure against its cited source before acting." },
  { q: "How do I know the numbers are right?", a: "Every figure is computed by code, reconciled by a verifier, and shown with its source and date. Anything it can’t verify is labelled “unverified”, never invented." },
  { q: "Is it really free?", a: "Yes — free, no credit card. You can run your first full analysis in about a minute." },
  { q: "Won’t it just say “buy” on everything?", a: "No. It grades its own calls in public and shows the losers, and it hands out HOLD and SELL too — leading with free cash flow, not hype." },
  { q: "What can it analyze?", a: "Any listed stock, plus your whole portfolio. Screen the universe, compare names, or X-ray what you already own." },
];

export function Landing() {
  const router = useRouter();
  const [ticker, setTicker] = useState("");
  const tryIt = (e: React.FormEvent) => {
    e.preventDefault();
    const t = ticker.trim().toUpperCase().replace(/[^A-Z.\-]/g, "");
    if (t) router.push(`/t/${encodeURIComponent(t)}`);
  };

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

  // Scroll-driven "assemble an analysis" section. Progressively reveals dashboard
  // parts as the pinned stage scrolls through. DOM-only (no React state) so it stays
  // cheap on scroll; degrades to fully-shown for reduced-motion / no-JS.
  const scrollyRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const wrap = scrollyRef.current;
    if (!wrap) return;
    const parts = Array.from(wrap.querySelectorAll<HTMLElement>(".lp-appear"));
    const caption = wrap.querySelector<HTMLElement>(".lp-step-caption");
    const barFill = wrap.querySelector<HTMLElement>(".lp-step-bar-fill");
    const dots = Array.from(wrap.querySelectorAll<HTMLElement>(".lp-step-dot"));
    const N = SCROLLY_STEPS.length;

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      parts.forEach((p) => p.classList.add("on"));
      dots.forEach((d) => d.classList.add("on"));
      if (caption) caption.textContent = SCROLLY_STEPS[N - 1];
      if (barFill) barFill.style.width = "100%";
      return;
    }

    let raf = 0;
    let lastStep = -1;
    const update = () => {
      raf = 0;
      const rect = wrap.getBoundingClientRect();
      const total = wrap.offsetHeight - window.innerHeight;
      const progress = total > 0 ? Math.min(1, Math.max(0, -rect.top / total)) : 0;
      const step = rect.top > 0 ? 0 : Math.min(N, Math.floor(progress * N) + 1);
      if (barFill) barFill.style.width = `${Math.round(progress * 100)}%`;
      if (step !== lastStep) {
        lastStep = step;
        parts.forEach((p, i) => p.classList.toggle("on", i < step));
        dots.forEach((d, i) => d.classList.toggle("on", i < step));
        if (caption) caption.textContent = SCROLLY_STEPS[Math.min(N - 1, Math.max(0, step - 1))];
      }
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div className="lp-theme min-h-full flex flex-col">
      {/* value / risk-reversal bar */}
      <div className="w-full text-center text-[0.72rem] sm:text-xs py-1.5 px-4 lp-topbar">
        Free · no credit card · every figure sourced &amp; dated — or flagged unverified, never invented
      </div>

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
      <section className="relative overflow-hidden lp-gradient border-b border-line">
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
              <span className="lp-live-dot" /> For investors who want the truth, not a hot take
            </div>
            <h1 className="mt-4 text-4xl md:text-6xl font-semibold tracking-tight leading-[1.04]">
              Know what a stock is <span className="lp-title-grad">really worth</span> — in about a minute.
            </h1>
            <p className="text-muted mt-5 max-w-lg leading-relaxed text-[1.02rem]">
              A full analyst‑grade report on any stock — rating, bull vs. bear, catalysts, a 12‑month view.
              <span className="text-text"> Every number is sourced and dated, or flagged unverified. Never invented.</span>
            </p>
            <form onSubmit={tryIt} className="mt-7 flex gap-2 max-w-md">
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value)}
                placeholder="Try any ticker — e.g. NVDA"
                aria-label="Ticker to analyze"
                autoComplete="off"
                autoCapitalize="characters"
                className="flex-1"
              />
              <button type="submit" className="btn btn-primary px-5 lp-shine">Analyze free →</button>
            </form>
            <div className="mt-2 text-xs text-muted">One free analysis, no signup. After that, <Link href="/signin" className="text-purple no-underline hover:underline">sign in — it&rsquo;s free</Link> — to run more.</div>
            <div className="mt-3">
              <Link href="/examples" className="text-sm text-muted hover:text-text no-underline">or see a live example →</Link>
            </div>
            <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted">
              <span className="lp-tick">Source‑verified</span>
              <span className="lp-tick">Free cash flow first</span>
              <span className="lp-tick">It grades itself</span>
            </div>
          </div>

          {/* animated mock analysis card */}
          <div className="lp-in md:justify-self-end w-full max-w-sm" style={{ animationDelay: "0.12s" }}>
            <div className="lp-float-card relative">
              <div aria-hidden className="lp-card-glow" />
              <div className="card lp-glass p-5 relative">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold tracking-tight">NVDA</span>
                      <span className="chip chip-green text-[0.62rem] py-0.5 px-2">▲ 2.4%</span>
                    </div>
                    <div className="text-xs text-muted mt-0.5">NVIDIA Corporation · $178.34</div>
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

                <div className="mt-4 flex gap-1.5 text-[0.7rem]">
                  <span className="lp-tab lp-tab-on">Overview</span>
                  <span className="lp-tab">Financials</span>
                  <span className="lp-tab">Catalysts</span>
                </div>

                <div className="mt-3 relative">
                  <svg viewBox="0 0 320 96" className="w-full h-24" preserveAspectRatio="none" aria-hidden>
                    <defs>
                      <linearGradient id="lpspark" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.3" />
                        <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0 80 L26 72 L52 78 L78 58 L104 66 L130 48 L156 56 L182 38 L208 44 L234 28 L260 33 L286 20 L312 12 L320 12 L320 96 L0 96 Z" fill="url(#lpspark)" />
                    <path className="line-draw" d="M0 80 L26 72 L52 78 L78 58 L104 66 L130 48 L156 56 L182 38 L208 44 L234 28 L260 33 L286 20 L312 12" fill="none" stroke="var(--gold)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                    <circle className="lp-dot-ping" cx="312" cy="12" r="3.5" fill="var(--gold)" />
                    <circle cx="312" cy="12" r="3.5" fill="var(--gold)" />
                  </svg>
                  <div className="flex justify-between text-[0.58rem] text-dim mt-0.5"><span>12M ago</span><span>today</span></div>
                </div>

                <div className="mt-3 card-2 p-3 flex items-center gap-2 border-l-2 border-l-green">
                  <span className="text-lg">✅</span>
                  <div className="text-xs"><b>Free cash flow healthy</b><div className="text-muted">$127B TTM · 42% margin · +18% YoY</div></div>
                </div>

                <dl className="mt-3 grid grid-cols-4 gap-2 text-center">
                  {([["Fwd P/E", "13.7×", ""], ["FCF margin", "42%", "up"], ["Rev growth", "+106%", "up"], ["Net cash", "$26B", "up"]] as const).map(([k, v, t], i) => (
                    <div key={k} className="card-2 p-2 fade-up" style={{ animationDelay: `${0.9 + i * 0.08}s` }}>
                      <dt className="text-[0.55rem] uppercase tracking-wider text-muted">{k}</dt>
                      <dd className="text-sm font-semibold flex items-center justify-center gap-0.5">
                        {v}{t === "up" && <span className="text-green text-[0.6rem]">▲</span>}
                      </dd>
                    </div>
                  ))}
                </dl>

                <div className="mt-3">
                  <div className="flex justify-between text-[0.58rem] text-muted mb-1"><span>Bull case 62%</span><span>38% Bear</span></div>
                  <div className="h-1.5 rounded-full overflow-hidden flex bg-card2">
                    <span className="bg-green" style={{ width: "62%" }} />
                    <span className="bg-red" style={{ width: "38%" }} />
                  </div>
                </div>

                <div className="mt-3 text-[0.6rem] text-dim">Every figure carries its source &amp; date · illustrative</div>
              </div>
            </div>
          </div>
        </div>

        {/* coverage ticker */}
        <div className="relative border-t border-line/70 bg-bg/40 backdrop-blur">
          <div className="lp-marquee py-2.5">
            <div className="lp-marquee-track">
              {[...COVERAGE, ...COVERAGE].map(([sym, rating, fcf], i) => (
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

      {/* ---------- problem ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:py-24">
        <div className="reveal max-w-2xl">
          <div className="text-xs uppercase tracking-[0.18em] text-gold">The problem</div>
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight mt-2">Most stock “research” is a confident guess.</h2>
          <p className="text-muted mt-3">You deserve better than vibes with a chart attached.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3 mt-10">
          {PROBLEMS.map((p, i) => (
            <div key={p.h} className="reveal card p-5" style={{ transitionDelay: `${i * 70}ms` }}>
              <div className="text-2xl" aria-hidden>{p.icon}</div>
              <div className="font-semibold mt-2">{p.h}</div>
              <p className="text-sm text-muted mt-1.5 leading-snug">{p.p}</p>
            </div>
          ))}
        </div>
        <p className="reveal text-center text-muted mt-10 text-lg">So we built the opposite — <span className="text-text font-medium">research you can actually check.</span></p>
      </section>

      {/* ---------- mechanism / how it works ---------- */}
      <section className="border-y border-line bg-card/40 lp-grid-bg">
        <div className="mx-auto max-w-6xl px-4 py-20 md:py-24">
          <div className="reveal max-w-2xl">
            <div className="text-xs uppercase tracking-[0.18em] text-gold">Why you can trust it</div>
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
        </div>
      </section>

      {/* ---------- proof: assemble an analysis (scroll) ---------- */}
      <section ref={scrollyRef} className="lp-scrolly border-b border-line" style={{ height: "300vh" }}>
        <div className="lp-stage">
          <div className="mx-auto max-w-5xl px-4 w-full grid md:grid-cols-[1fr_1.1fr] gap-10 items-center">
            <div>
              <div className="text-xs uppercase tracking-[0.18em] text-gold">Watch it work</div>
              <h2 className="text-2xl md:text-4xl font-semibold tracking-tight mt-2 leading-tight">An analysis, taking shape.</h2>
              <p className="text-muted mt-3 max-w-md">Live data in, a full picture out — assembled the same way every time. Scroll to watch it build.</p>
              <ol className="mt-6 space-y-2.5">
                {SCROLLY_STEPS.map((s, i) => (
                  <li key={s} className="lp-step-dot flex items-center gap-3 text-sm">
                    <span className="lp-step-num">{i + 1}</span>
                    <span className="lp-step-label">{s}</span>
                  </li>
                ))}
              </ol>
              <div className="lp-step-bar mt-6"><span className="lp-step-bar-fill" /></div>
              <div className="lp-step-caption text-xs text-muted mt-2">{SCROLLY_STEPS[0]}</div>
            </div>

            <div className="relative">
              <div aria-hidden className="lp-card-glow" />
              <div className="card lp-glass p-5 relative">
                <div className="lp-appear flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="chip chip-muted text-xs">▲ TICKER</span>
                    <span className="text-xs text-muted">Company, Inc.</span>
                  </div>
                  <span className="chip chip-purple text-xs">◐ Analyzing</span>
                </div>

                <div className="lp-appear mt-4">
                  <div className="space-y-2">
                    <div className="skeleton h-3 w-3/4" />
                    <div className="skeleton h-3 w-1/2" />
                    <div className="skeleton h-3 w-2/3" />
                  </div>
                  <div className="mt-3 grid grid-cols-4 gap-2">
                    {Array.from({ length: 4 }).map((_v, i) => (
                      <div key={i} className="card-2 p-2">
                        <div className="skeleton h-1.5 w-3/4 mb-1.5" />
                        <div className="skeleton h-3 w-full" />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="lp-appear mt-4">
                  <svg viewBox="0 0 320 90" className="w-full h-20" preserveAspectRatio="none" aria-hidden>
                    <defs>
                      <linearGradient id="lpscrolly" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--gold)" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="var(--gold)" stopOpacity="0" />
                      </linearGradient>
                    </defs>
                    <path d="M0 74 L30 66 L60 72 L92 52 L120 60 L150 42 L180 50 L210 32 L244 40 L270 24 L300 16 L320 14 L320 90 L0 90 Z" fill="url(#lpscrolly)" />
                    <path className="lp-chartline" d="M0 74 L30 66 L60 72 L92 52 L120 60 L150 42 L180 50 L210 32 L244 40 L270 24 L300 16 L320 14" fill="none" stroke="var(--gold)" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>

                <div className="lp-appear mt-4">
                  <div className="card-2 p-3 flex items-center gap-2 border-l-2 border-l-green">
                    <span className="text-lg">✅</span>
                    <div className="text-xs"><b>Free cash flow</b><div className="text-muted">healthy &amp; growing</div></div>
                    <span className="chip chip-green text-xs ml-auto">Healthy</span>
                  </div>
                  <div className="mt-3">
                    <div className="flex justify-between text-[0.58rem] text-muted mb-1"><span>Bull case</span><span>Bear case</span></div>
                    <div className="h-1.5 rounded-full overflow-hidden flex bg-card2">
                      <span className="bg-green" style={{ width: "62%" }} />
                      <span className="bg-red" style={{ width: "38%" }} />
                    </div>
                  </div>
                </div>

                <div className="lp-appear mt-4">
                  <div className="flex items-center gap-3">
                    <div className="flex -space-x-2">
                      {["🔬", "🛡️", "🌐", "😈", "💰"].map((a, i) => (
                        <span key={i} className="lp-avatar" aria-hidden>{a}</span>
                      ))}
                    </div>
                    <span className="text-xs text-muted">Committee agrees</span>
                    <span className="chip chip-gold text-xs ml-auto">HOLD</span>
                  </div>
                  <div className="mt-3 flex gap-1">
                    {Array.from({ length: 10 }).map((_v, i) => (
                      <span key={i} className={`flex-1 h-1.5 rounded ${i < 7 ? "bg-gold" : "bg-card2"}`} />
                    ))}
                  </div>
                </div>

                <div className="mt-4 text-[0.6rem] text-dim">Illustrative — a real report carries every figure with its source &amp; date.</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- value stack ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:py-24">
        <div className="reveal max-w-2xl">
          <div className="text-xs uppercase tracking-[0.18em] text-gold">Everything you get</div>
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight mt-2">A research desk in your browser — free.</h2>
          <p className="text-muted mt-3">Six tools that work together, not a single chat box. No add-ons, no upsells.</p>
        </div>

        <div className="mt-10 grid grid-cols-1 md:grid-cols-3 auto-rows-[minmax(0,1fr)] gap-4">
          <div className="reveal card p-6 md:col-span-2 md:row-span-2 relative overflow-hidden hover:border-purple transition-colors">
            <div aria-hidden className="lp-tile-glow" />
            <div className="w-11 h-11 rounded-xl grid place-items-center bg-[color:var(--gold-bg)] text-gold">
              <FeatureIcon name="committee" />
            </div>
            <div className="font-semibold text-lg mt-3">Investment committee</div>
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

          {FEATURES.map((f, i) => (
            <div key={f.h} className="reveal card p-5 hover:border-purple transition-colors" style={{ transitionDelay: `${(i % 3) * 60}ms` }}>
              <div className="w-11 h-11 rounded-xl grid place-items-center bg-[color:var(--gold-bg)] text-gold">
                <FeatureIcon name={f.icon} />
              </div>
              <div className="font-semibold mt-3">{f.h}</div>
              <p className="text-sm text-muted mt-1.5 leading-snug">{f.p}</p>
            </div>
          ))}
        </div>

        <div className="reveal mt-10 text-center">
          <Link href="/signin" className="btn btn-primary no-underline px-6 py-3 lp-shine">{CTA_PRIMARY}</Link>
          <div className="text-xs text-muted mt-3">Free · no credit card · cancel nothing, there’s nothing to cancel</div>
        </div>
      </section>

      {/* ---------- guarantee / risk reversal ---------- */}
      <section className="mx-auto max-w-6xl px-4 py-20 md:py-24">
        <div className="reveal card lp-glass p-8 md:p-14 text-center lp-gradient relative overflow-hidden">
          <div aria-hidden className="lp-tile-glow" />
          <div className="text-xs uppercase tracking-[0.18em] text-gold relative">Our promise</div>
          <div className="mt-3 text-2xl md:text-4xl font-semibold tracking-tight max-w-3xl mx-auto leading-tight relative">
            “Every number carries its source and date. <span className="lp-title-grad">Unverifiable is unverified</span> — never invented.”
          </div>
          <p className="text-muted mt-5 max-w-xl mx-auto relative">A verifier reconciles every figure before an analysis ships, and the app grades its own calls in public. If it can’t back a number, it won’t show one.</p>
        </div>
      </section>

      {/* ---------- FAQ / objections ---------- */}
      <section className="mx-auto max-w-3xl px-4 py-20 md:py-24">
        <div className="reveal text-center">
          <div className="text-xs uppercase tracking-[0.18em] text-gold">Questions</div>
          <h2 className="text-2xl md:text-4xl font-semibold tracking-tight mt-2">Before you ask.</h2>
        </div>
        <div className="mt-8 space-y-3">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="reveal card p-5 lp-faq">
              <summary className="font-semibold cursor-pointer flex items-center justify-between gap-4">
                {q}
                <span className="lp-faq-plus text-muted text-lg leading-none">+</span>
              </summary>
              <p className="text-sm text-muted mt-3 leading-relaxed">{a}</p>
            </details>
          ))}
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
          <p className="reveal text-muted mt-4 max-w-md mx-auto">Run your first analysis in about a minute. See exactly what it gets right — and where it says it’s unsure.</p>
          <div className="reveal mt-8 flex flex-wrap gap-3 justify-center">
            <Link href="/signin" className="btn btn-primary no-underline px-6 py-3 lp-shine">{CTA_PRIMARY}</Link>
            <Link href="/examples" className="btn no-underline px-6 py-3">See a live example →</Link>
          </div>
          <div className="reveal mt-5 flex flex-wrap gap-x-5 gap-y-1 justify-center text-xs text-muted">
            <span className="lp-tick">Free</span>
            <span className="lp-tick">No credit card</span>
            <span className="lp-tick">Not financial advice</span>
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

/** A slice of the coverage universe for the scrolling ticker — illustrative, not live quotes. */
const COVERAGE: [string, string, string][] = [
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
