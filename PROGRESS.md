# Progress

Public, multi-user AI stock research & ranking app. Cheapest-viable stack (Yahoo keyless data,
Sonnet 5, DB-backed quotas — no paid Redis), high-quality UI. FCF-first; every number sourced.

## Done — v1

- [x] Analysis engine: live data → `stock-analysis` framework via Claude → verified, streamed, source-stamped analysis (numbers from data only; Step-6 verifier gates publish)
- [x] Global shared cache: one analysis per ticker, free for all users; raw data 15 min, analyses 24 h / until cron
- [x] **Cost-control spine (critical):** login-gated fresh analyses through one gate — per-user daily quota, global daily cap, dollar spend kill switch, per-user + per-IP rate limits; denials degrade to cached ("high demand" notice), never an error; usage attributed per user
- [x] **Admin-editable at runtime** (no redeploy): kill switch, spend ceiling, global cap, free quota, per-user quota overrides, ban
- [x] **1,000-user load test** proving fresh spend can't exceed the cap or the dollar ceiling
- [x] Auth.js v5 (Google + local dev sign-in), accounts, profile, quota badge
- [x] Per-user watchlists (ownership enforced); public watchlists read-only
- [x] Rankings: sortable scoreboard, compare-in-list, analyze missing/stale
- [x] Top Rated leaderboard (highest rated / most searched) from the shared cache
- [x] Financials tab: 10yr annual + 12q quarterly IS/BS/CF tables (annual/quarterly toggle)
- [x] Charts: interactive price (1M–MAX, hover), valuation history (P/E, P/S, P/FCF, EV/EBITDA vs 5-yr avg), revenue/net income/FCF/margins/shares/debt-vs-cash trends
- [x] Company overview: description, key stats, ownership, top institutions, insider transactions
- [x] Stock screener over the cache universe + presets (Cash machines, GAFP, Rated 8+, Turnarounds) + saved screens per user
- [x] Compare up to 5 tickers side by side (KPIs + overlaid chart), cached-only
- [x] Earnings & catalysts calendar from cached analyses
- [x] Cron: nightly Message-Batch refresh of every watched ticker (shared), morning collect; kill-switch-aware; idempotent
- [x] "What changed" page (rating changes, verdict flips, tripwires, FCF negative)
- [x] Public share links `/s/:token`
- [x] Admin panel: dashboard + costs (top tickers/users) + user management
- [x] Legal: Terms, Privacy, cookie notice, disclaimer at sign-in and in the footer
- [x] Demo mode + seed script
- [x] UI per style guide: dark theme, expandable cards, animated SVG charts, skeletons, empty/error states, mobile, sticky nav
- [x] 70 tests (adapters, schema, verifier, assembly, changes, screener, company data, quota + load test, e2e pipeline); build + lint clean; browser-verified

## Blocked on you (secrets/OAuth I cannot supply)

- [ ] `ANTHROPIC_API_KEY` in `.env` → first live analysis; then `npm run seed:demo` (~5 calls) and commit `data/demo/`
- [ ] `AUTH_SECRET` (`openssl rand -base64 32`) + Google OAuth client id/secret → real sign-in (or `AUTH_DEV_LOGIN=true` locally)
- [ ] `ADMIN_EMAILS=you@…` → admin panel access
- [ ] Neon/Supabase `DATABASE_URL` + `vercel login` + env vars + deploy (see DEPLOY.md) → live URL
- [ ] Optional: Cloudflare Turnstile keys → CAPTCHA on the fresh-analysis path

## v2 (not started — after v1 is live and costs confirmed)

- Earnings-call transcripts + AI summary (cached per quarter, shared)
- "Ask about this stock" copilot (quota-gated, grounded in cached data)
- Segment/KPI charts, custom dashboards, dividend/buyback history, SEC filings feed, CSV portfolio import
- Paid tier (Stripe) for higher quotas/copilot/transcripts — the quota + Setting layer is already built to make this a small addition
- The skill's multi-agent deep dive as an opt-in second analysis type
