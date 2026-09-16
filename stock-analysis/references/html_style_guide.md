# HTML Dashboard Style Guide

Every dashboard is ONE self-contained `.html` file: pure HTML/CSS/JS, no external
libraries, no fetch calls, works fully offline, mobile-responsive. All animation is
CSS/SVG-based.

## Palette & theme (dark)

- Page background: `#0E1116`
- Card background: `#161B22`
- Accents: green `#7C9A82` (positive/bull), red `#B07A6E` (negative/bear/bottleneck),
  gold `#C9A35C` (rating/highlight), purple `#8E86D8` (future/optionality).
- Text: light neutral on dark; muted gray for secondary labels.
- Use a clean system/sans font stack. Generous spacing, rounded card corners, subtle borders.

## Structure

1. **Header** — title + subtitle + a build stamp with the date and the macro context that
   matters (e.g. CPI print, upcoming FOMC). One line: "not financial advice, research notebook."
2. **Overview / scoreboard** (when >1 stock) — a compact sortable table or grid: ticker,
   rating (1–10), BUY/HOLD/SELL chip, FCF ✅/⚠️/❌, fwd P/E, rev growth.
3. **Optional SVG diagram** — for portfolios/themes, an animated money-flow or relationship
   diagram with clickable nodes that scroll to the relevant card.
4. **Allocation donut** (portfolio mode) — animated draw-in SVG; center total; color-coded
   legend; verify slices sum to 100% / the stated dollar total.
5. **Stock cards** — one expandable card per ticker, in priority/allocation order, each
   containing the full field list from `analysis_framework.md`. Collapsed shows ticker +
   rating + price + FCF verdict; expanded reveals KPIs, theses, charts, catalysts, forecast.
6. **"What I rejected and why"** panel (when relevant) — the names considered and passed on,
   with the one-line reason each. This matters as much as what's owned.
7. **Forecast / timeline** — bear/base/bull bands and a dated deployment or review timeline.
8. **Footer** — sources list (with dates) and the not-financial-advice disclaimer.

## Cards

- Expandable pattern: click header to toggle; smooth CSS height/opacity transition.
- Rating chip uses gold; BUY=green, HOLD=gold, SELL/AVOID=red.
- FCF verdict chip is prominent: ✅ green, ⚠️ gold, ❌ red.
- Each KPI shows its value and, on hover/footnote, its source + date.

## SVG charts (inline, hand-built — no chart libraries)

- Per stock include small animated SVGs: e.g. revenue/FCF trend bars, margin line,
  price 52-week range marker. Animate with CSS (draw-in, grow bars) — no JS chart libs.
- Color bars by sign (green positive, red negative). Label axes in the native currency.
- For cyclicals, prefer an operating-margin chart over a P/E chart — it's the honest gauge.
- Keep charts readable on mobile (viewBox + responsive width).

## Interactions

- Clickable diagram/scoreboard rows scroll to and auto-expand the target card.
- Optional tooltips/definitions for jargon (HBM, FCF, memory cycle, etc.).
- A "Compare" or sort control on the scoreboard is a plus, kept in vanilla JS.

## Quality bar before shipping

- Allocations sum exactly to the stated total; percentages sum to 100.
- No placeholder/"TODO" text; every number has a source.
- JS syntax-checked; file opens offline with no console errors.
- Mobile breakpoint included; cards stack cleanly.
- Disclaimer present in footer.
