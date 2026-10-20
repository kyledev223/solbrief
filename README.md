# SOLBRIEF

```
  ████████    ██████    ██          ████████    ████████    ██████████  ██████████  ██████████
██  ░░░░░░░░██  ░░░░██  ██░░        ██░░░░░░██  ██░░░░░░██    ░░██░░░░░░██░░░░░░░░░░██░░░░░░░░░░
██░░        ██░░    ██░░██░░        ██░░    ██░░██░░    ██░░    ██░░    ██░░        ██░░
  ██████    ██░░    ██░░██░░        ████████  ░░████████  ░░    ██░░    ████████    ████████
    ░░░░██  ██░░    ██░░██░░        ██░░░░░░██  ██░░██░░░░      ██░░    ██░░░░░░░░  ██░░░░░░░░
        ██░░██░░    ██░░██░░        ██░░    ██░░██░░  ██        ██░░    ██░░        ██░░
████████  ░░  ██████  ░░██████████  ████████  ░░██░░    ██  ██████████  ██████████  ██░░
  ░░░░░░░░      ░░░░░░    ░░░░░░░░░░  ░░░░░░░░    ░░      ░░  ░░░░░░░░░░  ░░░░░░░░░░  ░░
```

An AI agent that publishes a daily brief of the Solana ecosystem. Deterministic code collects data and detects anomalies, and Gemini explains them. Every item is labeled **VERIFIED** (with a source link) or **SPECULATION**, and every token mention carries its risk flags. Premium features unlock by holding the access token (`$BRIEF`). The token grants access only. It has no yield, revenue share or buybacks.

> **Renaming:** the product name lives in one constant: `APP_NAME` in [`src/config/site.ts`](src/config/site.ts). The hero logo, OG image, page titles, prompts and emails are all generated from it.

---

## Contents

1. [Stack](#stack)
2. [Local setup](#local-setup)
3. [Accounts & environment variables (in order)](#accounts--environment-variables-in-order)
4. [Deploy to Vercel](#deploy-to-vercel)
5. [Scheduling](#scheduling)
6. [How it works](#how-it-works)
7. [Configuration](#configuration)
8. [Security model](#security-model)
9. [Scripts](#scripts)
10. [Project layout](#project-layout)

---

## Stack

| Concern | Choice |
| --- | --- |
| App | Next.js 16 (App Router, Cache Components) · TypeScript · Tailwind CSS v4 |
| Database | Supabase Postgres (free tier). A JSON file store is used in local dev when Supabase isn't configured |
| LLM | Google Gemini via `@google/genai`. Default `gemini-3.8-flash` (current free-tier stable Flash), with fallback `gemini-3.5-flash-lite` |
| Wallets | `@solana/wallet-adapter-react` (Phantom, Solflare, Backpack and any Wallet Standard wallet) |
| Auth | Sign-In With Solana (signed message, no transaction) → HS256 JWT in an httpOnly cookie |
| Jobs | Vercel Cron (daily) + GitHub Actions (every 4h and daily fallback) calling protected routes |
| Tests | Vitest (+ PGlite to run the real SQL migration in-process) |

Data sources are all free, and keyless or free-key: DexScreener, GeckoTerminal, CoinGecko, Jupiter Token API, Solana RPC (Helius free tier or public), RugCheck (LP lock status), and RSS.

---

## Local setup

Requirements: Node ≥ 20.9 (22+ recommended), npm.

```bash
git clone https://github.com/kyledev223/solbrief.git
cd solbrief
npm install
cp .env.example .env.local      # fill in what you have; everything is optional locally
npm run pipeline                # fetch live data, detect anomalies, generate a brief
npm run dev                     # http://localhost:3000
```

- **No Supabase?** The app uses `./.data/*.json` as its store in development, so you can run everything locally first.
- **No Gemini key?** The pipeline publishes a *facts-only* brief: deterministic VERIFIED items rendered from templates. "Why it matters" is omitted, and Ask/Deep Research return 503.
- **Testing gated features locally:** set `DEV_TIER_OVERRIDE=WHALE` in `.env.local`. It is ignored when `NODE_ENV=production`.
- `npm run smoke` hits each data source once and prints a health table.

---

## Accounts & environment variables (in order)

Create these in this order. Each step lists the variables it produces. The full list is in [`.env.example`](.env.example).

1. **GitHub**: the repo already exists (`kyledev223/solbrief`).
2. **Google AI Studio → Gemini API key** (free): <https://aistudio.google.com/apikey>
   - `GEMINI_API_KEY`
   - Optional: `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `GEMINI_RPM` (default 8 requests/min; check your limits at <https://aistudio.google.com/rate-limit>)
3. **Supabase project** (free): <https://supabase.com/dashboard>
   1. New project → wait for it to provision.
   2. **SQL Editor** → paste and run [`supabase/migrations/0001_init.sql`](supabase/migrations/0001_init.sql), then [`supabase/seed.sql`](supabase/seed.sql).
   3. **Project Settings → API**: copy the Project URL and the `service_role` secret.
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY` (server-only, never expose it to the browser)
4. **Helius RPC** (free): <https://dashboard.helius.dev>
   - `SOLANA_RPC_URL=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY`
   - Without it, the public RPC is used. It rate-limits `getTokenLargestAccounts`, so top-10 concentration falls back to Jupiter's audit data.
   - `NEXT_PUBLIC_SOLANA_RPC_URL`: RPC used by the browser wallet adapter. Public mainnet is fine, because sign-in never sends a transaction.
5. **Secrets you generate yourself:**
   - `SESSION_SECRET`: `openssl rand -base64 48` (32+ chars, required in production)
   - `CRON_SECRET`: `openssl rand -hex 32`
   - `ADMIN_WALLETS`: comma-separated wallet addresses allowed into `/admin`
6. **Token (at launch):**
   - `NEXT_PUBLIC_TOKEN_MINT`: the `$BRIEF` SPL mint. Until it's set, everyone is FREE tier and the landing page says the address isn't published yet.
7. **Optional source keys** (raise rate limits):
   - `COINGECKO_API_KEY`: CoinGecko Demo key (<https://www.coingecko.com/en/api>)
   - `JUPITER_API_KEY`: <https://portal.jup.ag> (without it, keyless `lite-api.jup.ag` is used)
8. **Optional digest delivery** (WHALE tier):
   - Telegram: create a bot with [@BotFather](https://t.me/BotFather) → `TELEGRAM_BOT_TOKEN`
   - Email: [Resend](https://resend.com) free tier, verify a domain → `RESEND_API_KEY`, `EMAIL_FROM="SOLBRIEF <brief@yourdomain.com>"`
9. **Vercel** (Hobby/free): <https://vercel.com/new>
   - `NEXT_PUBLIC_SITE_URL`: your production URL, e.g. `https://solbrief.vercel.app`
   - Add **all** of the above in Project → Settings → Environment Variables.
10. **GitHub Actions secrets** (repo → Settings → Secrets and variables → Actions):
    - `APP_URL`: same as `NEXT_PUBLIC_SITE_URL`
    - `CRON_SECRET`: same value as on Vercel

---

## Deploy to Vercel

1. Import `kyledev223/solbrief` at <https://vercel.com/new>. The framework preset is detected (Next.js), and no build settings need changing.
2. Add the environment variables from the checklist above (Production + Preview).
3. Deploy. `vercel.json` registers the daily cron: `GET /api/cron/daily` at 12:00 UTC.
4. Publish the first brief right away (instead of waiting for 12:00 UTC):
   ```bash
   curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://YOUR_APP/api/cron/daily?force=1"
   ```
   Or sign in with an admin wallet and use **/admin → generate brief now**.
5. Add the GitHub Actions secrets (`APP_URL`, `CRON_SECRET`) so the 4-hourly refresh starts.

**Function duration:** pipeline routes declare `maxDuration = 300`. That is within Vercel Hobby's limit with Fluid Compute (on by default for new projects). A typical run takes 30–90s: about 25s of fetching plus Gemini calls spaced to the RPM budget.

---

## Scheduling

| Job | Route | Trigger |
| --- | --- | --- |
| Daily brief (12:00 UTC) | `/api/cron/daily` | Vercel Cron (`vercel.json`), plus a GitHub Actions fallback at 12:05. **Idempotent**: skipped if today's brief already exists. `?force=1` regenerates |
| 4-hourly refresh | `/api/cron/refresh` | GitHub Actions `0 */4 * * *`. Keeps snapshots fresh (7-day baselines, 24h liquidity deltas) and the ticker live |
| Balance re-check | `/api/cron/balances` | Runs after each refresh. Re-reads balances older than 6h. Balances are also re-checked lazily on any request once stale |

All cron routes require `Authorization: Bearer $CRON_SECRET` (what Vercel Cron sends) or an `x-cron-secret` header. Vercel Hobby crons run at most once per day, which is why the 4-hourly job lives in [`.github/workflows/cron.yml`](.github/workflows/cron.yml). You can also run any job manually from the Actions tab (`workflow_dispatch`).

Supabase free projects pause after a week of inactivity. The cron traffic keeps the project active.

---

## How it works

```
collect ──► persist ──► analyze (deterministic) ──► generate (Gemini) ──► validate/guard ──► publish
  │                         │                            │                     │
  DexScreener, GT,          baselines from own           one call per          zod schema (retry once,
  CoinGecko, RSS            snapshots + GT backfill,     section, facts        else omit section);
  (isolated, retried,       detectors, risk flags        only, cites fact      numeric grounding,
   logged per source)       via RPC/Jupiter/RugCheck     IDs, never URLs       banned phrases, sources
```

1. **Collect** ([`src/lib/pipeline/collect.ts`](src/lib/pipeline/collect.ts)): every fetcher runs inside `FetchContext.run()`, with its own timeout, retries, backoff and log row. A broken source contributes nothing and never aborts the run.
2. **Analyze** ([`src/lib/anomaly/engine.ts`](src/lib/anomaly/engine.ts)): pure functions, unit-tested:
   - **Unusual volume:** 24h volume > 3× the 7-day average. The baseline is the last snapshot of each prior UTC day from our own history (≥3 days); otherwise GeckoTerminal daily candles are used.
   - **Liquidity move:** |Δ liquidity| > 40% vs our snapshot from ~24h earlier, with Jupiter's 24h change as fallback. Ignored for pairs <24h old and pools under $25K.
   - **Noteworthy launch:** pair <24h old with ≥ $50K liquidity.
   - **Risk flags:** mint authority, freeze authority, top-10 holders > 50%, LP locked < 80%, pair < 24h. Missing data is **UNKNOWN**, never guessed.
3. **Generate** ([`src/lib/brief/generate.ts`](src/lib/brief/generate.ts)): one Gemini call per section with only that section's facts. The model returns JSON (schema derived from zod) and cites **fact IDs**. The server resolves IDs into source links and attaches risk flags, so the model never supplies URLs or flags.
4. **Guards** ([`src/lib/brief/guards.ts`](src/lib/brief/guards.ts)):
   - Every number must match a number in the facts (rounding tolerated).
   - Advice, prediction, "opportunity" and hype phrasing is rejected.
   - Unknown fact or token IDs are rejected.
   - Every VERIFIED item needs a resolvable source.
   - Any token mentioned by symbol is auto-tagged with its risk flags.

   One retry is allowed, with the violations fed back. After that, schema failures omit the section, and items that still violate a guard are dropped.
5. **Fallback:** if Gemini is unreachable, deterministic facts-only items are published for the factual sections.
6. **Rate limits:** a process-wide queue spaces Gemini calls to `GEMINI_RPM`. 429/5xx responses back off exponentially, honoring the server's `retryDelay`. A long quota wait switches to the fallback model.

**Tiers** ([`src/lib/tiers.ts`](src/lib/tiers.ts)):

| Tier | Requirement | Unlocks |
| --- | --- | --- |
| FREE | none | latest brief after a 24h delay, top 3 items per section |
| HOLDER | ≥ 100,000 tokens | today's brief at publish time, full archive, 5 personalized topics, Ask the Brief 10/day |
| WHALE | ≥ 1,000,000 tokens | + Ask 50/day, Deep Research 3/day, Telegram/email digest |

Personalized sections are cached **per topic per day**, not per user, so Gemini usage scales with distinct topics. Wallet-watch topics are computed deterministically without the LLM.

---

## Configuration

Everything tunable is in [`src/config/site.ts`](src/config/site.ts):

- `APP_NAME`, `SITE`, `TOKEN` (symbol and link builders; mint from env)
- `TIER_THRESHOLDS`, `LIMITS` (questions/day, reports/day, topics, delays, session length)
- `GEMINI` (model names, RPM budget)
- `ANOMALY` (all detector thresholds)
- `TOPIC_PRESETS`, `FAQ`

RSS defaults are in [`src/config/feeds.json`](src/config/feeds.json), seeded into the `rss_feeds` table and editable in `/admin`. Each feed can include `keywords` to filter general crypto outlets down to Solana stories.

---

## Security model

- **Tier never comes from the client.** Session cookie → wallet → server-side RPC balance (cached, re-checked every 6h) → tier. RPC errors keep the last known values.
- **SIWS:** the server builds the message and stores it with a single-use nonce (10-minute TTL). Verification uses the stored copy and checks the ed25519 signature, address, domain (anti-phishing) and expiry.
- **Sessions:** HS256 JWT, httpOnly + Secure + SameSite=Lax, 7 days.
- **Writes:** Origin must match Host (CSRF). Bodies are validated with zod.
- **Rate limits:** per-IP and per-wallet sliding windows on every API route. Durable per-wallet daily quotas are enforced atomically in Postgres (`consume_usage`), and refunded when the failure is on our side.
- **Database:** RLS is enabled on every table with no policies, so only the service role (server) can read or write.
- **Untrusted input to the LLM** (questions, research queries) is fenced in tags with instructions to ignore embedded commands. Outputs pass the same guards as the brief.
- **Headers:** `X-Frame-Options: DENY`, `nosniff`, strict referrer policy, locked-down permissions policy.

---

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run pipeline` | Full pipeline locally against live data (`-- --kind refresh`, `-- --no-llm`) |
| `npm run smoke` | Hit each data source once and print health |
| `npm run lint` | ESLint (Next core-web-vitals + TypeScript) |
| `npm run typecheck` | `next typegen && tsc --noEmit` |
| `npm test` | Vitest: signature verification, tiers, anomaly detection, brief JSON validation and guards, the SQL migration on PGlite, RSS parsing, store semantics |

---

## Project layout

```
src/
  config/site.ts, feeds.json     ← names, tiers, limits, thresholds, feeds
  app/                           ← pages + API routes (api/auth, ask, research, cron, admin, …)
  components/                    ← terminal UI kit, brief renderer, wallet sign-in, dashboard
  lib/
    fetchers/                    ← one module per source + FetchContext isolation
    anomaly/engine.ts            ← deterministic detectors + risk flags
    pipeline/                    ← collect → analyze → run
    brief/                       ← schema (zod), prompts, guards, generate, topics, ask, research
    llm/gemini.ts                ← queue, backoff, structured output
    auth/, tiers.ts, balance.ts  ← SIWS, sessions, tier logic
    db/                          ← Store interface, Supabase + file implementations
supabase/migrations, seed.sql
tests/
.github/workflows/               ← CI + scheduled jobs
```

---

**Not financial advice. Informational only.**
