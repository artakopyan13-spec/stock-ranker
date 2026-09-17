export interface Term {
  id: string;
  term: string;
  short: string; // one-line tooltip, plain language
  what: string; // what it is
  why: string; // why it matters
  good: string; // range/signal that's a green flag
  bad: string; // range/signal that's a red flag
}

/** Plain-language explanations for every metric the app shows. Keyed by id (used by <Term>). */
export const GLOSSARY: Term[] = [
  {
    id: "fcf",
    term: "Free cash flow (FCF)",
    short: "The real cash left over after a company pays to run and grow itself. The #1 thing we look at.",
    what: "Cash from the business minus what it spends on equipment, buildings, and other long-term assets (capex). It's the money truly left over.",
    why: "Profit on paper can be manipulated; cash is harder to fake. Companies that generate lots of free cash can pay dividends, buy back shares, pay down debt, or reinvest — without borrowing.",
    good: "Positive and growing. An FCF margin above ~15% of revenue is strong; above 20% is excellent.",
    bad: "Negative or shrinking. A company burning cash depends on raising money or debt to survive — the single biggest red flag.",
  },
  {
    id: "fcf-margin",
    term: "FCF margin",
    short: "Free cash flow as a percent of revenue — how much of each sales dollar becomes real cash.",
    what: "Free cash flow divided by revenue, shown as a percentage.",
    why: "It tells you how efficiently a company turns sales into spendable cash. Higher means a more profitable, self-funding business.",
    good: "Above 15% is strong; 20%+ is elite (think top software or chip firms).",
    bad: "Near zero or negative means the business isn't converting sales into cash.",
  },
  {
    id: "market-cap",
    term: "Market cap",
    short: "The total price tag of the whole company — share price times number of shares.",
    what: "Market capitalization = current share price × total shares outstanding.",
    why: "It's the company's size. Big caps (>$200B) are usually more stable; small caps can grow faster but swing harder.",
    good: "There's no 'good' value — match it to your goal: stability (large) vs. growth potential (small/mid).",
    bad: "Very small caps (<$1B) can be volatile and easier to manipulate.",
  },
  {
    id: "pe",
    term: "P/E ratio (price-to-earnings)",
    short: "How many years of current profit you're paying for the stock. Lower can mean cheaper.",
    what: "Share price divided by earnings per share. A P/E of 20 means you pay $20 for every $1 of annual profit.",
    why: "It's the most common gauge of how expensive a stock is versus its profits.",
    good: "Roughly 10–20 is moderate for a steady company. A high P/E can be fine if growth is fast.",
    bad: "Very high (>40) means big expectations are priced in — risky if growth slows. No P/E means no profit.",
  },
  {
    id: "forward-pe",
    term: "Forward P/E",
    short: "Like P/E, but using next year's expected profit instead of the past.",
    what: "Share price divided by analysts' estimated earnings for the year ahead.",
    why: "Shows how expensive the stock is relative to where profits are heading, not where they've been.",
    good: "Lower than the trailing P/E usually signals profits are expected to grow.",
    bad: "Higher than trailing P/E can mean profits are expected to fall.",
  },
  {
    id: "ps",
    term: "P/S ratio (price-to-sales)",
    short: "The price versus total sales — useful for fast growers that aren't profitable yet.",
    what: "Market cap divided by annual revenue.",
    why: "When a company has little or no profit, P/S is a fairer size-vs-value check than P/E.",
    good: "Under ~5 is reasonable for most; high-growth software often trades higher.",
    bad: "Double-digit P/S means a lot of future growth is already priced in.",
  },
  {
    id: "pfcf",
    term: "P/FCF (price-to-free-cash-flow)",
    short: "Price versus the real cash the company generates. Our favorite value check.",
    what: "Market cap divided by trailing free cash flow.",
    why: "Because FCF is hard to fake, P/FCF is a cleaner 'cheap or expensive' signal than P/E.",
    good: "Under ~20 is attractive for a quality compounder.",
    bad: "Very high or not meaningful (negative FCF) is a caution sign.",
  },
  {
    id: "ev-ebitda",
    term: "EV/EBITDA",
    short: "Company value (including debt) versus its core operating earnings. Good for capital-heavy firms.",
    what: "Enterprise value (market cap + debt − cash) divided by earnings before interest, tax, depreciation, and amortization.",
    why: "It accounts for debt, so it compares companies with different borrowing more fairly than P/E.",
    good: "Roughly 8–12 is typical; lower can be cheaper.",
    bad: "Above ~20 is rich unless growth is very high.",
  },
  {
    id: "revenue-growth",
    term: "Revenue growth (YoY)",
    short: "How much sales grew versus the same quarter a year ago.",
    what: "This quarter's revenue compared to the same quarter last year, as a percentage.",
    why: "Growth is the engine of long-term returns. Accelerating growth is a strong signal.",
    good: "Steady double-digit growth is healthy; 30%+ is high-growth.",
    bad: "Flat or negative growth, especially if it's slowing each quarter.",
  },
  {
    id: "gross-margin",
    term: "Gross margin",
    short: "The profit left after the direct cost of making the product — pricing power in one number.",
    what: "Revenue minus cost of goods sold, divided by revenue.",
    why: "High gross margins mean strong pricing power and a better business model.",
    good: "Above 50% is strong; software/chip leaders can exceed 70%.",
    bad: "Thin margins (<20%) mean little cushion and easy damage from cost increases.",
  },
  {
    id: "operating-margin",
    term: "Operating margin",
    short: "Profit from the core business after running costs, before interest and taxes.",
    what: "Operating income divided by revenue.",
    why: "Shows how profitable the actual operations are, and whether the company scales efficiently.",
    good: "Above 20% is strong and often rising as a company grows.",
    bad: "Negative or falling operating margin signals trouble in the core business.",
  },
  {
    id: "debt-to-equity",
    term: "Debt-to-equity",
    short: "How much the company borrows versus what shareholders own. Lower is safer.",
    what: "Total debt divided by shareholder equity.",
    why: "High debt magnifies gains but also losses, and it's dangerous when rates rise or sales fall.",
    good: "Below ~1.0 is generally safe; below 0.5 is conservative.",
    bad: "Above ~2.0 is high leverage — riskier, especially for cyclical companies.",
  },
  {
    id: "net-cash",
    term: "Net cash / net debt",
    short: "Cash minus debt. Net cash means the company could pay off all its debt and still have money.",
    what: "Cash and short-term investments minus total debt.",
    why: "A net-cash balance sheet is a fortress — it survives downturns and can invest when rivals can't.",
    good: "Net cash (positive) is a green flag.",
    bad: "Large net debt, especially with weak cash flow, raises bankruptcy risk in bad times.",
  },
  {
    id: "dividend-yield",
    term: "Dividend yield",
    short: "The yearly cash payout to shareholders as a percent of the share price.",
    what: "Annual dividends per share divided by the share price.",
    why: "Income for holders; a stable, growing dividend often signals a mature, cash-generative business.",
    good: "1–4% that's well-covered by free cash flow is healthy.",
    bad: "A very high yield (>8%) can be a warning the market expects a cut.",
  },
  {
    id: "beta",
    term: "Beta",
    short: "How much the stock moves versus the overall market. Above 1 = more jumpy.",
    what: "A measure of volatility relative to the market (market = 1.0).",
    why: "Higher beta means bigger swings both up and down — more risk and more potential reward.",
    good: "Match to your risk tolerance; ~1 moves with the market.",
    bad: "Very high beta (>1.5) means large drops in downturns.",
  },
  {
    id: "moat",
    term: "Moat",
    short: "A durable advantage that keeps competitors out — like a castle's moat.",
    what: "Something that protects a company's profits: brand, network effects, switching costs, patents, scale, or unique tech.",
    why: "Warren Buffett's favorite idea: a wide moat lets a company earn high returns for years without being copied.",
    good: "A clear, widening moat (e.g. NVIDIA's software lock-in, Apple's ecosystem).",
    bad: "No moat — a commodity business where price is the only differentiator.",
  },
  {
    id: "rating",
    term: "AI rating (1–10)",
    short: "Our model's overall score for the stock, from the analysis — judgment, not fact.",
    what: "A 1–10 score combining cash generation, moat, growth, valuation, and risks, with a BUY/HOLD/SELL tag.",
    why: "A quick, consistent way to compare stocks — but always read the reasoning, not just the number.",
    good: "7–10: strong business with a clear thesis. 8+ is our high-conviction band.",
    bad: "1–4: broken or cash-burning; speculative only.",
  },
  {
    id: "catalyst",
    term: "Catalyst",
    short: "An upcoming event that could move the stock — earnings, a product launch, a policy decision.",
    what: "A dated event likely to change the story: earnings reports, approvals, big contracts, or political/regulatory action.",
    why: "Even a great company needs a spark. Catalysts (including political interest, e.g. AI or chip policy) can unlock potential.",
    good: "Near-term catalysts with upside and a clear date.",
    bad: "A calendar full of risks (lawsuits, lock-up expiries, refinancing) with no offsetting positives.",
  },
  {
    id: "tripwire",
    term: "Tripwire",
    short: "The one thing that, if it happens, would change our rating.",
    what: "A specific, watch-this metric or event that would move the score up or down.",
    why: "It turns a static rating into something you can monitor — you know exactly what to watch.",
    good: "A clearly defined tripwire tied to a measurable number.",
    bad: "N/A — every good analysis should name one.",
  },
];

export const GLOSSARY_BY_ID: Record<string, Term> = Object.fromEntries(GLOSSARY.map((t) => [t.id, t]));

export interface Faq {
  q: string;
  a: string;
}

export const FAQS: Faq[] = [
  {
    q: "How do I spot a stock with potential to rise?",
    a: "Start with the business, not the chart. Look for (1) growing free cash flow and high margins — the company makes real money; (2) a moat that keeps rivals out; (3) reasonable valuation versus that cash flow (P/FCF); and (4) a catalyst ahead. A stock can look expensive on today's numbers but still have high potential if a big change is coming — a new product cycle, a policy tailwind (like AI or defense spending), or a market it's just entering. That's why a name like a fast-growing AI infrastructure company can be worth watching even before its financials look 'cheap.' Balance the upside against the risks, and never bet more than you can lose on a high-potential, high-uncertainty name.",
  },
  {
    q: "What do the biggest investors actually look for?",
    a: "Warren Buffett's checklist in plain terms: a business you understand, a durable moat, honest and capable management, and a fair price. Peter Lynch added: buy what you know and can explain in a sentence. The common thread is quality first, price second — a wonderful company at a fair price beats a mediocre one at a cheap price. Our analysis follows the same order: what the company does, its edge and moat, its cash generation, then valuation and risks.",
  },
  {
    q: "Should I care more about profit or cash flow?",
    a: "Cash flow. Reported profit uses accounting choices that can flatter the picture; free cash flow is the actual money left over and is much harder to fake. That's why we put FCF first and treat negative or shrinking FCF as the headline risk.",
  },
  {
    q: "Is a high P/E always bad?",
    a: "No. A high P/E means the market expects strong growth. If that growth shows up, the stock can still do well. The danger is paying a high multiple for growth that then slows — the stock can fall even if the company is fine. Compare the P/E to the growth rate and to the company's own history.",
  },
  {
    q: "What makes a stock risky even if the company is good?",
    a: "Valuation (paying too much), concentration (one customer or product), cyclicality (peak profits that won't last), heavy debt, and single-event risk (a court case, a regulation). A great company bought at a bad price can still be a bad investment. That's why we state the bear case as loudly as the bull case.",
  },
  {
    q: "How often is the analysis updated?",
    a: "Each ticker is analyzed once and shared with everyone — you see 'analyzed X ago.' Watchlisted tickers refresh automatically overnight, and the analysis re-runs when something material changes (new earnings, fresh news, or a big price move). You can also refresh manually within your daily quota.",
  },
];
