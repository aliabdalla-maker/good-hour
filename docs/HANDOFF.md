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
- **Deploy config, three ways** (pick the one actually in use — check the
  next section):
  - `render.yaml` — Render Blueprint (managed Postgres/Redis, one-click).
  - Railway — no committed IaC file; deployed via direct CLI commands
    (`railway up --service <name>`) using a **local, gitignored-but-untracked**
    `railway.json` that gets its `build.dockerfilePath` swapped per service
    before each deploy. **This file must stay untracked, not gitignored** —
    `railway up` respects `.gitignore` by default, so gitignoring it breaks
    the upload (this bit us once; see git history "un-ignore railway.json").
  - `docker-compose.prod.yml` + `deploy/Caddyfile` — self-hosted VPS path,
    auto-HTTPS, no apex domain (CNAME-only: `www` + `api` subdomains).

## Current live state (as of this handoff)

- **Deployed on Railway**, project `good-hour` (id
  `53564066-69b5-473a-91f3-b3192657aac1`), three services (`api`, `worker`,
  `web`) plus managed Postgres + Redis. All migrated and seeded.
  - Temporary URLs (until custom domain is attached):
    `https://api-production-e6a5b.up.railway.app`,
    `https://web-production-9d926.up.railway.app`.
- **Domain `goodhour.shop` is registered at GoDaddy but NOT yet pointed at
  the app.** GoDaddy's own "Website Builder"/Airo placeholder is still what
  resolves at the apex and `www`. **Blocker:** `railway domain <custom-domain>`
  fails with a bare `Unauthorized` via the CLI, even though `whoami`,
  `status`, and generating Railway-provided subdomains all work fine on the
  same session — this looks like an account-level restriction on custom
  domains specifically (not a code or DNS issue). Try attaching the domain
  from **Railway's dashboard** (Settings → Networking → Custom Domain) on
  both `web` (→ `www.goodhour.shop`) and `api` (→ `api.goodhour.shop`); if
  that also fails, it's a Railway support ticket, not an engineering task.
  Once Railway shows a CNAME target, update GoDaddy DNS (two CNAMEs, no
  apex — see `DEPLOY.md`) and flip `WEB_ORIGIN` / `API_PUBLIC_URL` /
  `NEXT_PUBLIC_API_URL` from the temporary Railway URLs to the real domain,
  then redeploy `web` (build-time var) and restart `api`/`worker` (runtime var).
- **OpenAI key intermittently hits `429 quota exceeded`** on the configured
  account — every agent (pricing, negotiation, assistant) has a graceful
  fallback for this (static rate / lowest-price ranking / keyword reply), so
  the app never hard-fails, but "is the AI actually running or on fallback"
  is only visible in `AgentDecisionLog.modelUsed` (`"fallback-*"` vs a real
  model name) or the assistant reply's `aiPowered` field. Check OpenAI
  billing if agent quality looks degraded.
- Contact email/company footer is live (`admin@softwareequality.com`,
  Equality Software Ltd, Co. No. 15006381) — pulled from
  `www.softwareequality.com` verbatim, not fabricated.

## Known gaps (real, not hidden)

- `roomDistanceKm` in the negotiation agent's input is always `null` — no
  geocode-on-write step for `Property`. `supplierRatingAvg` **is** wired
  (real average from `Review`), fixed alongside this handoff.
- ESLint is a real, blocking CI gate (`eslint . --max-warnings=0`), but was
  historically the first thing to break on a disk-constrained dev box — if
  a future session hits `ENOSPC` installing deps, `node:test` (already in
  use, zero extra deps) is the fallback test runner, not vitest.
- The assistant's tool set is read-only (`search_listings`, `navigate`) —
  it cannot create bookings, submit reviews, or spend money. That's a
  deliberate safety boundary, not an oversight; see
  `packages/api/src/modules/assistant/service.ts`'s system prompt.
- Twilio SMS and the Stripe webhook secret are unconfigured in most
  environments (optional; features degrade gracefully — see
  `featureFlags` in `packages/api/src/config.ts`).

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
