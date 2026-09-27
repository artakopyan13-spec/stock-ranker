# Stock Ranker — Scorecard Metrics, in Plain English
*Wall Street Einstein's cheat sheet. Research, not financial advice — every number lives on the Scorecard, sourced and dated.*

Each entry: **what it is → a simple example → why it matters → the trap → the rule of thumb.**

---

## 🟢 Quality & Earnings

### EPS — Earnings Per Share
**What:** Net income ÷ shares outstanding. The slice of profit that belongs to one share.
**Example:** $1B profit ÷ 1B shares = **$1** EPS. Same profit with 500M shares = **$2** — fewer slices, bigger each.
**Why:** It's the profit *you own* per share, and the base for most valuation ("20x earnings" means 20× EPS).
**Trap:** A company can lift EPS just by buying back shares — profit flat, but fewer shares = higher EPS. That's financial engineering, not a better business.
**Rule:** Never read EPS alone. Cross-check against revenue, free cash flow, and ROIC.

### EPS Growth
**What:** How fast EPS expands year over year. $2 → $2.50 = **25%** growth.
**Why:** Real earnings growth is the engine of long-term returns.
**Trap:** EPS can climb while the business stalls — borrow money, buy back stock, EPS goes up. Smoke.
**Rule (real vs. fake):** EPS growth should track **revenue growth** *and* **operating cash flow growth**. All three rising together = legit. EPS soaring while revenue is flat = someone's playing games. **20%+ is strong; single digits is weak.**

### Cash-Backed Earnings (Operating Cash Flow ÷ Net Income)
**What:** How much of reported profit actually turned into spendable cash.
**Why it matters:** A company can report $100M profit, but if $80M is stuck in receivables (customers who haven't paid) or inventory, only $20M hit the bank. Reported ≠ real.
**What "1.2x" means:** For every $1 of net income, the company generated **$1.20 of operating cash** — excellent. Earnings are rock-solid, not accounting magic. Compare to **0.7x** (only 70¢ of cash per $1 of profit) = warning sign; cash collection is dragging.
**How is >1x even possible?**
- *SaaS / annual contracts:* customers pre-pay a year upfront → cash lands now, revenue is recognized later. Cash > earnings this year.
- *Inventory reduction:* selling down old stock converts inventory to cash → extra inflow on top of profit.
- General rule: cash and revenue **timing** don't always match — you can collect cash before you record revenue (pre-payments, deposits).
**Trap:** A *one-time* spike is noise. A *repeating* pattern (like SaaS) is a business-model feature. Check **multiple years** on the Scorecard.
**Rule:** OCF at or above net income = solid. OCF well below = dig deeper.

### EBITDA — Earnings Before Interest, Taxes, Depreciation & Amortization
**What:** Operating profit *before* financing and non-cash accounting charges. Start at net income and **add back** interest, taxes, depreciation, and amortization.
**Example:** Net income $100M + $20M interest + $15M taxes + $10M depreciation + $5M amortization = **$150M EBITDA**. (Add back — don't subtract.)
**Why:** It lets you compare two companies' raw operating engines regardless of debt loads or tax situations.
**Trap:** EBITDA **ignores capital spending.** A business burning $50M/yr replacing equipment looks great on EBITDA but weak on free cash flow. Always cross-check with OCF and FCF.

### Free Cash Flow (FCF)
**What:** Operating cash flow **minus** capital expenditures (capex). The cash left over after keeping the lights on and the equipment running.
**Example:** $120M operating cash flow − $30M capex = **$90M free cash flow** — money genuinely free to pay down debt, pay dividends, buy back stock, or reinvest.
**Why:** It's the hardest number to fake and the truest measure of a quality business. Profit is an opinion; free cash flow is a fact.
**Trap:** A company can be "profitable" on paper and still have negative FCF for years (heavy capex, cash burn). That's a red flag.
**Rule:** Consistent, growing FCF is the single best quality tell. This is why the Scorecard weights it heavily.

---

## 🔵 Financial Health & Leverage

### Net Debt / EBITDA
**What:** (Total Debt − Cash) ÷ EBITDA. Roughly how many years of operating profit it would take to pay off *net* debt.
**Example:** $500M debt − $100M cash = $400M net debt ÷ $200M EBITDA = **2.0x** → about two years of EBITDA to clear it.
**Why we use it:** It's a quick read on **repayment capacity** — can this company comfortably carry its debt?
**"How do taxes / depreciation / amortization help clear debt?" — the honest answer:** They don't *pay off* debt. We **add them back** to net income to build EBITDA because it approximates the **pre-financing cash the business throws off** — the fuel available to service debt before interest, taxes, and non-cash charges muddy the picture. Depreciation and amortization aren't real cash leaving the company (they're accounting spread-outs of past spending), so adding them back gets closer to true operating cash. **Caveat:** EBITDA *overstates* real cash because it ignores capex and actual taxes/interest — so pair it with FCF, never trust it alone.
**Rule:** Below 2.0x = healthy. 2–3x = fine, depends on the sector (utilities/telecom run higher and that's normal). Above 4.0x = overleveraged and fragile.

### Debt / Equity
**What:** Total Debt ÷ Shareholders' Equity. How much the company is financed by borrowing vs. owner capital.
**Example:** $500M debt ÷ $1B equity = **0.5x** → 50¢ borrowed for every $1 of owner money.
**Why:** Leverage amplifies both gains *and* losses. If a company can't pay interest, creditors get paid first — equity holders can get wiped out.
**Difference from Net Debt/EBITDA:** D/E is a balance-sheet snapshot (how much debt vs. equity exists *right now*). Net Debt/EBITDA measures *capacity* (years of profit to repay).
**Rule:** 0.5x = solid. ~1.0x = reasonable for many industries. Above 2.0x = getting risky.

### Equity (Shareholders' Equity)
**What:** Assets − Liabilities. The owners' residual stake — what shareholders actually own.
**Example:** $2B assets − $500M debt = **$1.5B equity.** In bankruptcy, creditors get paid first; equity holders get the scraps (often nothing).
**What's inside it:** paid-in capital (money investors put in) + retained earnings (profits kept, not paid out) ± buybacks and adjustments.
**Rule:** Higher equity relative to debt = more cushion = safer. Think of it as the owners' net worth in the business.

---

## 🟡 Valuation — "Am I overpaying?"

### P/E — Price / Earnings
**What:** Share price ÷ EPS. What you pay for $1 of annual profit.
**Why:** The most common valuation yardstick.
**Trap:** Earnings can be manipulated; P/E is meaningless if earnings are negative, and a high P/E is only justified by real growth.
**Rule:** Judge it *against growth* (see PEG) and its own history — never as a raw number.

### P/S — Price / Sales
**What:** Market cap ÷ revenue (or price ÷ sales per share). What you pay for $1 of revenue.
**Why:** Useful for young companies with little or no profit yet.
**Trap:** Sales with no path to profit are worthless. A high P/S only makes sense with high margins *and* fast growth.

### P/FCF — Price / Free Cash Flow
**What:** Market cap ÷ free cash flow. Roughly how many years of FCF it takes to pay for the whole company.
**Why:** The valuation metric that's hardest to fake — FCF is real cash. The Scorecard leans on this one.
**Rule:** Lower = cheaper. Read it next to growth: a low P/FCF on a growing business is the sweet spot.

### P/OCF — Price / Operating Cash Flow
**What:** Market cap ÷ operating cash flow (before capex).
**Why:** A cleaner read than P/FCF for capex-heavy or lumpy-investment businesses, where FCF jumps around year to year.
**Rule:** Lower = cheaper. Use alongside P/FCF, not instead of it.

### PEG — P/E ÷ Growth
**What:** P/E divided by the earnings growth rate. It puts the P/E in context of how fast the company is growing.
**Example:** P/E of 30 with 30% growth = PEG **1.0**. A P/E of 30 sounds expensive until you see it's growing 30%.
**Why:** A high P/E can be cheap if growth is high; a low P/E can be expensive if growth is zero. PEG catches that.
**Rule:** ~1.0 = fairly priced. Below 1.0 = potentially cheap for the growth. Above 2.0 = pricey.
**Trap:** PEG relies on *forecast* growth — and forecasts are often wrong. Treat it as a clue, not gospel.

---

## The one rule that ties it all together
**Real vs. fake:** genuine quality shows up as **EPS growth, revenue growth, and operating-cash-flow growth all climbing together.** When they diverge — EPS up but revenue flat, or profit up but cash flow down — someone's leaning on accounting, not building a better business. Pull the **Scorecard**, line up the trends over multiple years, and let the numbers settle it.

*Educational only — not financial advice, and never a recommendation to buy or sell.*
