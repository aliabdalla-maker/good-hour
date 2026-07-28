# Engineering Handoff

Read this first if you're picking up this project cold. It's a snapshot of
**what's built, what's live, what's broken, and what to do next** — not a
tutorial. For *how* the system works, see `ARCHITECTURE.md`,
`AGENT_DECISIONS.md`, and `DIAGRAMS.md`. For day-2 operations, see
`OPERATIONS.md`. For what end users can do, see `USER_GUIDE.md`.

## What this is

Good Hours — an hourly marketplace for rooms, cars, and travel services.
Two booking modes (instant search-and-pay, and an AI reverse-auction), a
CRM, an on-page agentic AI concierge, and two autonomous agents (dynamic
pricing, offer negotiation) with a full decision audit trail.

## Repo & where things live

- **GitHub**: `github.com/aliabdalla-maker/good-hour` (private), branch `main`.
  Push to `main` auto-runs CI (lint/typecheck/test/build + Docker build
  matrix) and CD (publishes `good-hour-{api,web,worker}` images to GHCR).
- **Deploy config, two ways** (Render is what's actually live):
  - `render.yaml` — Render Blueprint (managed Postgres/Redis, one-click).
    **This is the live deployment.** Auto-deploys on push to `main`.
  - `docker-compose.prod.yml` + `deploy/Caddyfile` — self-hosted VPS path,
    auto-HTTPS, no apex domain (CNAME-only: `www` + `api` subdomains).

  Railway was the live host earlier in the project's history and has been
  fully decommissioned — see "Migration off Railway" below.

## Current live state (as of this handoff)

- **Deployed on Render** via `render.yaml`: `goodhour-api`, `goodhour-worker`,
  `goodhour-web`, plus managed Postgres (`goodhour-db`) and Redis
  (`goodhour-redis`). Auto-deploys from `main`.
- **Domain is live**: `goodhour.shop` and `www.goodhour.shop` both serve from
  Render over HTTPS (root A record → Render's IP, `www` CNAME; apex redirects
  to `www`). GoDaddy holds DNS.
- **`api.goodhour.shop` does NOT exist** — no DNS record, no custom domain on
  `goodhour-api`. It was referenced in `render.yaml` as `NEXT_PUBLIC_API_URL`
  for a while, which silently broke *every* browser API call in production
  (search, register, login, booking) because `NEXT_PUBLIC_*` is inlined at
  build time. The web build now points at `https://goodhour-api.onrender.com`.
  If you want the pretty subdomain, add the custom domain on `goodhour-api`
  **and** the matching GoDaddy CNAME **before** pointing the build at it.
- **LLM provider is Groq, not OpenAI.** The original OpenAI account is out of
  quota (`429 insufficient_quota`). `OPENAI_BASE_URL=https://api.groq.com/openai/v1`
  points the OpenAI SDK at Groq; model `openai/gpt-oss-120b`. Note
  `llama-3.3-70b-versatile` was tried and **fails** on the assistant's
  multi-tool prompt (`400 Failed to call a function`) despite passing simpler
  single-tool tests — don't switch to it without re-testing the real payloads.
  Every agent still has a graceful fallback; "real model or fallback" is
  visible in `AgentDecisionLog.modelUsed` (`"fallback-*"`) or the assistant's
  `aiPowered` field.
- **Stripe is live in test mode** and the webhook is configured against the
  Render API URL — verified end-to-end (real test-card payment →
  webhook → booking flipped to `CONFIRMED` with no manual step).
- **AI image generation has been removed.** The Gemini / "Nano Banana"
  integration was blocked by a hard $0 free-tier quota (`limit: 0` on
  `gemini-2.5-flash-preview-image`) and was dropped rather than left as dead
  config. The `image-agent` module, `geminiClient`, `GEMINI_*` env vars and the
  generate button are all gone. Listing photos are static files in
  `packages/web/public/listings/` or a pasted URL.
  - `Room.imageIsAiGenerated` survives as a **manual supplier declaration**
    (browse/search still label it), so a host using an outside tool can be
    honest about it.
  - `AgentType.IMAGE` remains in the Prisma enum on purpose: six historical
    `AgentDecisionLog` rows reference it. Postgres cannot drop an in-use enum
    value, and deleting audit history to tidy a schema would be the wrong
    trade. Expect `IMAGE` to appear in the ERP agent-ops table as a closed
    chapter with no new rows.
- Contact email/company footer is live (`admin@softwareequality.com`,
  Equality Software Ltd, Co. No. 15006381) — pulled from
  `www.softwareequality.com` verbatim, not fabricated.
- **Time-credit economy is live** (`modules/credits`, `/wallet`). Buy hours with
  money, redeem them against a booking, gift them to another account, or
  exchange them across categories at an AI-quoted rate. The 10%-buyer/10%-seller
  commission now covers credit trades as well as bookings, via
  `computeTradeFee`. See `ARCHITECTURE.md` § Time-credit economy for the three
  design decisions that carry the weight, and `OPERATIONS.md` for the ledger
  reconciliation queries — especially the "negative balance" integrity check,
  which should always return zero rows.
- **ERP console** at `/admin/erp` is restricted to a single hardcoded address
  (`ERP_ADMIN_EMAIL` in `packages/shared/src/enums.ts`), enforced server-side
  by the `requireEmail` guard — *not* the broader `ADMIN` role. Email lookups
  in this app are case-sensitive with no normalisation anywhere, so that
  constant must match the stored value's exact casing.

## Migration off Railway

Railway (project `good-hour`) hosted this app earlier and is no longer used.
Before decommissioning, Render's database was verified to be a strict
superset of Railway's — every model compared by row count *and* by row id,
with zero ids present on Railway that were missing on Render.

Two gotchas worth knowing if you ever need to read the old Railway data:
- `DATABASE_URL` on Railway services points at `postgres.railway.internal`,
  which only resolves **inside** Railway's network. From outside, use the
  Postgres service's `DATABASE_PUBLIC_URL` (TCP proxy on `*.proxy.rlwy.net`).
- A comparison script that treats a failed query as "no difference" will
  happily report "in sync" when it actually connected to nothing. Assert on
  successful counts, not on the absence of a reported gap.

## Known gaps (real, not hidden)

- `roomDistanceKm` in the negotiation agent's input is always `null` — no
  geocode-on-write step for `Property`. `supplierRatingAvg` **is** wired
  (real average from `Review`), fixed alongside this handoff.
- ESLint is a real, blocking CI gate (`eslint . --max-warnings=0`), but was
  historically the first thing to break on a disk-constrained dev box — if
  a future session hits `ENOSPC` installing deps, `node:test` (already in
  use, zero extra deps) is the fallback test runner, not vitest.
- The assistant can `search_listings`, `navigate`, and `propose_booking` —
  the last one only *pre-fills* a booking form the user must still confirm.
  It cannot complete a booking or spend money. That's a deliberate safety
  boundary, not an oversight; see
  `packages/api/src/modules/assistant/service.ts`'s system prompt.
- Twilio SMS is unconfigured (optional; degrades gracefully — see
  `featureFlags` in `packages/api/src/config.ts`). The Stripe webhook secret
  **is** configured on Render.
- Smoobu integration is real and HMAC-signed, but the connected Smoobu
  account contains only one placeholder property with no usable rate data —
  the code path is tested, there's just nothing meaningful to import yet.
- **Credit top-ups have no card UI yet.** `POST /credits/purchase` creates a
  real Stripe intent and returns a `clientSecret`, but `/wallet` doesn't mount
  Stripe Elements — so the page tells the user to complete payment rather than
  implying the hours have landed. Wiring Elements there is the obvious next
  step; the server side is finished and the webhook grant path is tested.
- **Peer-to-peer credit sale/auction isn't built.** Gifting (free) and
  cross-category exchange (10%) exist. Selling hours to another user *for money*
  is where the 10%-both-sides rule gets its fullest expression, and it's the
  natural next feature — `computeTradeFee` already returns both sides.
- Credit `unitValue` is a weighted average over inflows, rounded to 2dp. On
  very small balances that rounding shows up as a few pence of drift in the
  wallet's estimated value. It's cosmetic (the hours themselves are exact), but
  it's why the exchange fee measures as ~0.95% rather than exactly 1.00% on a
  4-hour test.

## If you're picking this up to keep building

1. Run the full gate first — `npm run lint && npm run typecheck && npm test
   && npm run test:integration` — to confirm your environment matches the
   last-known-green state before changing anything.
2. Check `git log --oneline -20` for the real, current story; this document
   will drift, commit messages won't.
3. Natural next features (not started): PDF-quality receipts (currently
   print-to-PDF HTML), listing photo upload by suppliers (images are
   seed-only right now), a public API docs page, rate-limiting the
   assistant endpoint specifically (currently shares the global 100/min).
