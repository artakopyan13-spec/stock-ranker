# Progress

## Done

- [x] Read skill files; recovered the full `stock-analysis` package (references were missing from the installed copy) into `stock-analysis/`
- [x] JSON analysis schema (`src/lib/analysis/schema.ts`) — numbers from data only, judgment from the model
- [x] Cost estimate (README) and pricing table in code (`src/lib/ai/pricing.ts`)
- [x] Scaffold: Next.js 16, TypeScript strict, Tailwind v4, Prisma 7 (sqlite local / postgres prod), vitest
- [x] Data adapters: Yahoo (keyless default), FMP, Finnhub, fixture; normalized `StockData`; 15-min raw cache
- [x] End-to-end NVDA path: fetch → data sections → streamed model sections → verify → store (tested with a fake model against real captured NVDA data)
- [x] Verification mirroring skill Step 6 (numbers reconcile, no placeholders, sources, footer, rating/action consistency, bear ≥ bull, forecast ordering, dated catalysts, news ids, FCF headline)
- [x] Rankings: watchlists CRUD, sortable scoreboard, side-by-side compare, "analyze missing / stale"
- [x] Caching: raw 15 min, analysis 24 h, "analyzed X ago · refresh", edge-cached share pages
- [x] Cron: smart refresh, nightly Message Batch submit, morning collect; idempotent per day
- [x] Alerts: rating change, verdict flip, tripwire triggered, FCF negative; unique keys, never duplicated; Telegram / email (Resend) / console
- [x] Morning digest: json / md / text / html template + `GET /api/digest/:watchlist`
- [x] JSON API with API key: `/api/analysis/:ticker`, `/api/rankings/:watchlist`, `/api/digest/:watchlist`
- [x] Public share links `/s/:token`
- [x] Demo mode + `npm run seed:demo` + `prisma/seed.ts`
- [x] UI per style guide: dark palette, expandable cards, animated SVG charts, KPI source tooltips, skeletons, empty/error states, mobile layout
- [x] `/admin/costs`
- [x] 56 tests passing; `npm run build` passes; lint clean
- [x] Verified in browser: home, /t/NVDA (charts, chips, source tooltips), /w/main (sortable scoreboard), /s/:token, /admin/costs, mobile layout, no console errors; JSON API + cron auth smoke-tested with curl
- [x] README, DEPLOY, ARCHITECTURE, `.env.example`, `vercel.json`

## Blocked on you (secrets I cannot supply)

- [ ] `ANTHROPIC_API_KEY` in `.env` → run the first live NVDA analysis (`npm run dev`, search NVDA)
- [ ] `npm run seed:demo` (about $0.70 on Opus 5) and commit `data/demo/` → demo mode becomes live
- [ ] `vercel login` + env vars + `vercel --prod` (see DEPLOY.md) → live URL
- [ ] Telegram bot token + chat id (or Resend key) → real alert channel

## Next (after keys)

- Watch the first nightly batch on `/admin/costs`; tune `ANALYSIS_EFFORT` / model against cost
- v2: multi-agent deep dive as an opt-in second analysis type
