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

**GitHub Actions / Render**: push to `main`. CD publishes new images; Render
auto-redeploys from the GHCR image if configured to track it, or redeploy
manually from the Render dashboard.

**Railway** (current live deploy, see `HANDOFF.md`): no GitHub-linked
auto-deploy is configured — deploys are pushed from a local checkout via the
CLI:

```bash
railway login              # or --browserless on a headless box (device code)
# railway.json must exist, untracked, pointing at the right service's Dockerfile:
#   { "build": { "builder": "DOCKERFILE", "dockerfilePath": "packages/api/Dockerfile" }, ... }
railway up --service api --detach --json
railway deployment list --service api --json   # poll for status: BUILDING -> DEPLOYING -> SUCCESS/FAILED
railway logs <deploymentId> --service api -d   # -d = deployment/build logs (omit -d for runtime logs)
```

Repeat with `packages/worker/Dockerfile` / `packages/web/Dockerfile` for the
other two services. **`web` additionally needs its `NEXT_PUBLIC_*` vars set
on the service *before* deploying** — they're inlined into the JS bundle at
build time, so changing them requires a rebuild (`railway up` again), not
just a variable update.

### Rotating a secret

```bash
railway variable set KEY=newvalue --service api      # runtime var: restarts, no rebuild
railway variable set KEY=newvalue --service worker
# For a NEXT_PUBLIC_* var on web, you must also rebuild:
railway up --service web --detach --json
```

Never `--json` a command that touches secret values in a place the output
gets logged/shared — the CLI itself warns raw values are echoed.

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

1. Confirm the `worker` process/service is actually running (`railway status`
   / check the service is Live, not crashed).
2. Check Redis is reachable from the worker (`REDIS_URL` correct, private
   network intact on Railway).
3. Manually run `releaseExpiredReservation(bookingId)`
   (`packages/api/src/modules/booking/service.ts`) via a one-off script if a
   backlog needs clearing immediately.

### Stripe webhook isn't confirming payments

1. Check `STRIPE_WEBHOOK_SECRET` on the `api` service matches the webhook
   endpoint's signing secret in the Stripe dashboard (Developers → Webhooks
   → the `https://<api-domain>/payments/webhook` endpoint) — a mismatch
   fails signature verification silently from the payer's point of view.
2. Confirm the endpoint URL in Stripe matches the *current* API domain —
   this breaks silently after any domain/URL change (e.g. moving off the
   temporary Railway URL onto the real domain) until you update it.
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

### A Railway deploy fails immediately after a `.gitignore` change

If `railway up` starts using the default builder (Railpack) instead of the
Dockerfile you configured, check `railway.json` isn't newly gitignored —
`railway up` respects `.gitignore` for what it uploads. This exact regression
happened once (see git history) from an overly broad `git add -A` re-adding
`railway.json` to `.gitignore` during cleanup. `railway.json` must stay
**untracked but not ignored**.
