# Go-live checklist (first deploy)

Do these once, top to bottom. After this, every `git push` auto-deploys. ~30–45 min the first time.
Secrets to paste are in the chat message that accompanies this file (not stored in the repo).

## 1. Put the code on GitHub

Create an empty repo at https://github.com/new (name it e.g. `stock-ranker`, Private is fine, don't add a README).
Then, from the project folder:

```bash
cd ~/stock-ranker
git remote add origin https://github.com/<your-username>/stock-ranker.git
git push -u origin main
```

If it asks you to sign in, use the browser prompt or a GitHub personal access token.

## 2. Free Postgres database (Neon)

1. Sign up at https://neon.tech (free tier).
2. Create a project → copy the **pooled** connection string (looks like `postgresql://user:pass@ep-xxx-pooler.../neondb?sslmode=require`).

## 3. Import to Vercel

1. Sign up / log in at https://vercel.com with your GitHub account.
2. **Add New → Project** → import the `stock-ranker` repo.
3. **Build & Output Settings → Build Command:** set to
   ```
   npm run vercel-build
   ```
4. **Environment Variables** — add these (Production):

| Name | Value |
|---|---|
| `DATABASE_PROVIDER` | `postgresql` |
| `DATABASE_URL` | your Neon pooled string |
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `ANALYSIS_MODEL` | `claude-sonnet-5` |
| `AUTH_SECRET` | (in chat) |
| `CRON_SECRET` | (in chat) |
| `ADMIN_EMAILS` | `taronsargsyanberg@gmail.com` |
| `APP_URL` | `https://<your-app>.vercel.app` (fill in after first deploy, then redeploy) |

5. Click **Deploy**. First build creates all the database tables automatically.

## 4. Turn on public sign-in (Google)

Local uses a password-less dev login; production needs Google (free):

1. https://console.cloud.google.com → APIs & Services → Credentials → **Create OAuth client ID** → Web application.
2. Authorized redirect URI: `https://<your-app>.vercel.app/api/auth/callback/google`
3. Copy the client ID and secret; add to Vercel env:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`
4. Redeploy (Vercel → Deployments → ⋯ → Redeploy), or just push any commit.

## 5. First run

1. Open your live URL, sign in with Google (your admin email → you'll see **Admin**).
2. `/admin` → set the spend ceiling and quotas; test the kill switch.
3. Create a watchlist, analyze a ticker, check `/admin/costs`.

## Updating later (the easy part)

```bash
git add -A && git commit -m "what changed" && git push
```

Vercel rebuilds and ships in ~1–2 min. A failed build keeps the old version live. Roll back any time from
Vercel → Deployments. Your Neon data is untouched by deploys. New database columns are applied automatically
by the build (`prisma db push`); a change that would delete data fails the build instead of dropping anything.

## Optional later

- **Demo build:** run `npm run seed:demo` locally (needs the API key), commit `data/demo/`, deploy a second project with `DEMO_MODE=true`.
- **CAPTCHA:** add Cloudflare Turnstile keys (`TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`).
- **Cron:** `vercel.json` already schedules the nightly refresh + morning collect; Vercel picks them up automatically.
