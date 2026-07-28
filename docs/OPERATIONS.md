# Operations Runbook

Day-2 operations: routine tasks and incident playbooks. For first-time setup
see `ARCHITECTURE.md` § Local setup; for platform-specific deploy steps see
`DEPLOY.md`; for what's currently live see `HANDOFF.md`.

## Routine operations

### Run the full gate before trusting any change

```bash
npm run lint            # eslint . --max-warnings=0 (blocking)
npm run typecheck       # turbo run typecheck, all 5 packages
npm test                # node:test, unit (fast, no DB)
npm run test:integration  # node:test, needs DATABASE_URL set (real DB)
npm run db:drift        # fails if schema.prisma changed without a migration
```

All four also run in CI on every push to `main` (`.github/workflows/ci.yml`),
plus a 3-image Docker build matrix. CD (`cd.yml`) publishes images to GHCR on
every push to `main`/tags.

### Database

```bash
npm run db:generate     # regenerate Prisma client after a schema change
npm run db:migrate      # dev: create + apply a new migration (prompts for a name)
npm run db:deploy       # prod: apply pending migrations, no new ones created
npm run db:seed         # idempotent demo data (3 properties across all 3 categories)
npm run db:drift        # CI gate: schema.prisma vs applied migrations, exit 0 = clean
```

Point `DATABASE_URL` at whichever database you mean before running these —
there is no environment-name safety net. Running `db:seed` twice is safe
(upserts + existence checks); running it against production is not
recommended (it creates real demo listings visible to real users).

### Deploying a code change

**Render** (the live deploy — see `HANDOFF.md`): just push to `main`. Render's
Blueprint auto-sync rebuilds `goodhour-api`, `goodhour-worker`, and
`goodhour-web` from `render.yaml`. CI also runs on the same push, and CD
publishes images to GHCR (not what Render deploys from — Render builds the
Dockerfiles itself).

There is no CLI step. To force a rebuild without a code change, use "Manual
Deploy" on the service in the Render dashboard.

**`goodhour-web` is special: every `NEXT_PUBLIC_*` var is inlined into the JS
bundle at build time.** Changing one is not a runtime config change — the
service must be *rebuilt* for it to take effect, and the value that matters is
whatever was set when the build ran. This has bitten this project hard once
already: `NEXT_PUBLIC_API_URL` pointed at a hostname with no DNS record, and
every browser API call in production failed while the API itself was perfectly
healthy. When debugging "the site can't reach the API", check the value baked
into the served chunk, not just the dashboard:

```bash
# find the chunk, then grep it — the URL is NOT in the page HTML
curl -s https://www.goodhour.shop/search | grep -o '/_next/static/chunks/[^"]*\.js'
curl -s https://www.goodhour.shop/_next/static/chunks/<chunk>.js | grep -o 'https://[a-z.-]*onrender.com'
```

### Rotating a secret

Render dashboard → the service → Environment → edit the value. Runtime vars
(`STRIPE_SECRET_KEY`, `OPENAI_API_KEY`, …) restart the service; no rebuild.
A `NEXT_PUBLIC_*` var on `goodhour-web` additionally needs a Manual Deploy.

Secrets marked `sync: false` in `render.yaml` are dashboard-managed on
purpose — the Blueprint declares them but never carries their values.

Note `packages/api/src/config.ts` trims every credential on load. Dashboard
forms make it easy to paste a trailing newline, and Stripe rejects a
whitespace-contaminated webhook secret outright with an error that is
otherwise indistinguishable from a wrong secret.

### Checking whether an AI agent is really calling the model or on fallback

```sql
select "agentType", "modelUsed", "createdAt"
from agent_decision_logs
order by "createdAt" desc limit 20;
```

`modelUsed` starting with `fallback-` (e.g. `fallback-static-rate`,
`fallback-lowest-price`) means OpenAI errored, timed out, or has no key
configured for that call — check billing/quota. The assistant's `/assistant/chat`
response also carries `aiPowered: boolean` for the same purpose.

## Incident playbooks

### A traveller's booking is stuck in `PENDING_PAYMENT` past its hold window

Expected behaviour: the `booking-expiry` BullMQ job (per-booking, scheduled at
creation for `reservationExpiresAt`) releases the held `AvailabilitySlot`s and
flips the booking to `EXPIRED`. If it hasn't:

1. Confirm `goodhour-worker` is actually Live in the Render dashboard, not
   crashed or suspended. Fastest proof it's alive without opening the
   dashboard: `select status, count(*) from outbox_events group by status` —
   a healthy worker leaves ~zero `PENDING` and a recent `processedAt`.
2. Check Redis is reachable from the worker (`REDIS_URL` correct; the
   `goodhour-redis` keyvalue service has `ipAllowList: []`, i.e. reachable
   only from other Render services — that's intentional, not a fault).
3. Manually run `releaseExpiredReservation(bookingId)`
   (`packages/api/src/modules/booking/service.ts`) via a one-off script if a
   backlog needs clearing immediately.

### Stripe webhook isn't confirming payments

1. Check `STRIPE_WEBHOOK_SECRET` on the `api` service matches the webhook
   endpoint's signing secret in the Stripe dashboard (Developers → Webhooks
   → the `https://<api-domain>/payments/webhook` endpoint) — a mismatch
   fails signature verification silently from the payer's point of view.
2. Confirm the endpoint URL in Stripe matches the *current* API domain
   (`https://goodhour-api.onrender.com/payments/webhook`) — this breaks
   silently after any domain/host change until you update it in Stripe.
   Note a signature failure surfaces as a bare **500**, not a 400: Fastify's
   default handler returns 500 for any uncaught error without a 4xx
   `statusCode`, so "500" tells you nothing about whether the secret is
   right. Read the actual Render logs for the `StripeSignatureVerificationError`
   message — it names the real cause, including whitespace in the secret.
3. Payment/webhook handling is idempotent — replaying the same event from
   the Stripe dashboard ("Resend") is safe.

### Outbox events backing up (notifications not arriving)

```sql
select status, count(*) from outbox_events group by status;
```

- Large `PENDING` count with old `createdAt`: the relay isn't running —
  confirm it's started (`startOutboxRelay()` is called from
  `packages/worker/src/worker.ts`, not from `api`).
- Non-zero `FAILED`: a handler threw on all 5 attempts —
  `select "lastError" from outbox_events where status='FAILED'` to see why,
  then fix the handler and manually reset `status='PENDING'` for those rows
  to retry.
- Rows stuck in `PROCESSING`: the relay auto-reclaims anything untouched
  for >60s on its next tick — if it's been longer than that and still
  stuck, the worker process likely crashed mid-dispatch; restart it.

### Migration drift caught in CI

`npm run db:drift` failing means someone edited `schema.prisma` without
running `npm run db:migrate` to generate the matching SQL. Fix: run
`db:migrate` locally against a dev database, commit the generated
`packages/db/prisma/migrations/<timestamp>_<name>/migration.sql`, push again.
Never hand-edit a migration that's already been applied anywhere.

### Disk space exhausted mid-`npm install` (Windows dev boxes especially)

Seen repeatedly on this project. `node_modules` usually survives a failed
install; before retrying, reclaim space first:
`docker builder prune -f`, clear `.next`/`.turbo` caches, `npm cache clean
--force`. If ESLint/ts-node-adjacent deps won't fit, the test suite runs on
Node's built-in `node:test` + `tsx` already — no vitest dependency to fight.

### The site loads but every API call fails

Almost always the build-time API URL, not the API. Check in this order:

1. Is the API itself up? `curl https://goodhour-api.onrender.com/health`.
2. Does the hostname the *bundle* points at actually resolve?
   `curl -s "https://dns.google/resolve?name=<host>&type=A"` — a `Status: 3`
   means NXDOMAIN, i.e. the build is calling a hostname that doesn't exist.
3. Does CORS allow the site's origin? `curl -i -X OPTIONS <api>/search -H
   "Origin: https://www.goodhour.shop" -H "Access-Control-Request-Method: GET"`
   should return `access-control-allow-origin` for that exact origin.

Symptom tell: a *network*-level failure (bad hostname, CORS block) surfaces in
the UI as the generic fallback copy, because the thrown error isn't an
`ApiError` with a real HTTP status. A bare "Registration failed" or "couldn't
complete that search" therefore means the request never got an HTTP response —
whereas a genuine 4xx renders the API's own message. That distinction is the
fastest way to tell "API is broken" from "API is unreachable".
