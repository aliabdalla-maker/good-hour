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

### Time-credit economy: reconciling the ledger

The wallet has no balance column — every balance is a `SUM` over
`credit_ledger_entries`. That makes these queries authoritative, not a cache.

```sql
-- Per-user, per-category balances (the same thing /credits/wallet returns)
select "userId", category, sum(hours) as balance
from credit_ledger_entries
group by "userId", category
having sum(hours) <> 0
order by balance desc;

-- Total outstanding liability: hours sold but not yet redeemed
select sum(hours) as outstanding_hours,
       sum(hours * "unitValue") as outstanding_value
from credit_ledger_entries;

-- Any negative balance is a BUG, not a business state. Should always be empty.
select "userId", category, sum(hours) as balance
from credit_ledger_entries
group by "userId", category
having sum(hours) < 0;
```

That last query is the single most useful integrity check in the system. The
ledger's `Serializable` debit path exists specifically to keep it empty; if it
ever returns a row, stop and investigate before touching anything else.

**Correction — this is true of the CREDIT ledger, but not unconditionally of the
MONEY ledger.** A refund or chargeback claws back proceeds a seller may already
have spent, and a negative money balance is then the *correct* record of a debt
they owe. Refusing that write would leave the platform out of pocket with no
trace. So for `wallet_ledger_entries`, distinguish the two cases:

```sql
-- Negative money balances. Legitimate ONLY if explained by a clawback.
select w."userId", sum(w.amount) as balance,
       sum(case when w.kind = 'SALE_CLAWBACK' then w.amount else 0 end) as clawed_back
from wallet_ledger_entries w
group by w."userId"
having sum(w.amount) < 0;
```

If `balance` is negative and `clawed_back` accounts for it, that's a receivable,
not a bug. A negative balance with no clawback means a spend path bypassed
`applyWalletWrites` — that *is* a bug, and the write should have been refused.

```sql
-- Both halves of a transfer/exchange share a correlationId. Each pair should
-- net to ~0 hours for a transfer, and to the fee for an exchange.
select "correlationId", array_agg(kind), sum(hours)
from credit_ledger_entries
where "correlationId" is not null
group by "correlationId";

-- Purchases that took money but never granted hours (should be empty;
-- pending ones are just abandoned checkouts).
select id, "userId", hours, status, "createdAt"
from credit_purchases
where status = 'SUCCEEDED' and "grantedAt" is null;
```

### Checking whether an AI agent is really calling the model or on fallback

```sql
select "agentType", "modelUsed", "createdAt"
from agent_decision_logs
order by "createdAt" desc limit 20;
```

`modelUsed` starting with `fallback-` (`fallback-static-rate`,
`fallback-lowest-price`, `fallback-market-rate`) means the provider errored,
timed out, or has no key configured for that call. The assistant's
`/assistant/chat` response also carries `aiPowered: boolean` for the same
purpose.

Expect a large historical block of `fallback-static-rate` rows: they predate
the switch from the (quota-exhausted) OpenAI account to Groq. Judge health by
the *recent* rows, not the lifetime split:

```sql
select "modelUsed", count(*), max("createdAt") as last_seen
from agent_decision_logs
group by "modelUsed" order by last_seen desc;
```

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

### A user says they paid for time credits but their wallet is empty

Credits are granted by the **webhook**, not by the request that started
checkout — so the gap is almost always webhook delivery, not the ledger.

1. Did the payment actually succeed? Find it in Stripe by amount/customer and
   check the intent has `metadata.creditPurchaseId`. No metadata means the
   intent was created by the *booking* path, not a credit top-up.
2. Is the purchase row still `PENDING`?
   `select id, status, "grantedAt" from credit_purchases where "userId" = '…';`
   `PENDING` + a succeeded Stripe intent = the webhook never landed. Replay it
   from the Stripe dashboard ("Resend") — granting is idempotent on
   `grantedAt`, so a replay cannot double-credit.
3. `SUCCEEDED` with a null `grantedAt` should be impossible (they're written
   together). If you see it, the ledger insert threw after the status update —
   investigate before hand-fixing.
4. Never insert a ledger row by hand to "fix" a balance without a matching
   `creditPurchaseId` or `note`. The ledger is the audit trail; an
   unattributed row makes the liability figure unexplainable.

### A wallet shows a negative balance

This should be unreachable — the debit path runs in a `Serializable`
transaction that asserts a non-negative balance *after* insert, so a debit that
would overdraw is rolled back. If the integrity query in "reconciling the
ledger" returns a row:

1. Don't paper over it with a correcting credit yet — find the debit first:
   `select * from credit_ledger_entries where "userId" = '…' and category = '…' order by "createdAt";`
2. Check whether the writes went through `applyLedgerWrites` at all. A direct
   `prisma.creditLedgerEntry.create` somewhere would bypass the balance
   assertion entirely; that's the bug, not the data.
3. Only then write a correcting entry, with a `note` explaining it.

### The exchange commission is earning nothing

Symptom: `credit_ledger_entries` shows `EXCHANGE_IN`/`EXCHANGE_OUT` pairs, but
a wallet's total estimated value is unchanged across the swap.

This was a real bug once. The destination hours must be priced off the **gross**
conversion (`hoursOut + feeHours`); dividing the surrendered value by the *net*
`hoursOut` inflates the unit value by exactly the fee and refunds it, making the
commission cosmetic. Check `exchangeCredits` in
`packages/api/src/modules/credits/service.ts`. A correct exchange loses ~10% of
value; a 0% loss means the regression is back.

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

## Verifying a security fix has reached production

**Never probe a vulnerability to check whether its fix has deployed.**

This rule was written after breaking it. To confirm the ADMIN self-registration
fix was live, a loop polled `POST /auth/register` with `role: "ADMIN"` and watched
for the 201 to become a 400. Four polls landed before the deploy did, creating
**four real ADMIN accounts with a known password on the production database**,
live for roughly eight minutes. They were found by noticing a user count of 8
against an expected 4 — no check had been designed to catch it.

The probe worked. That was the problem: a successful probe *is* the exploit.

### Do this instead

`GET /health` returns the commit the running process was built from:

```bash
curl -s https://goodhour-api.onrender.com/health
# {"status":"ok","commit":"efd9f63…","startedAt":"2026-07-29T…"}
```

1. Note the commit containing the fix: `git rev-parse HEAD`.
2. Poll `/health` until `commit` matches (or is a descendant of) it.
3. Only then, if a behavioural check is genuinely needed, use a payload for which
   the *successful* outcome is impossible — e.g. `role: "ADMIN"` together with a
   deliberately invalid password, so validation must reject the request whatever
   the role enum does, and read the shape of the 400 rather than the status alone.

Step 3 is optional; steps 1–2 answer the deployment question completely.

### The general form

Before any verification loop that writes, ask: *if this request succeeds, what
exists afterwards that did not exist before?* If the answer is "an account, an
order, a payment, a listing", the loop is not a check. Read state, compare
versions, or exercise a path where success is provably unreachable.

See `docs/VERIFICATION.md` for the other rules this class of failure produced.

## Paying a seller (manual payouts)

Payouts are made by hand. There is no Stripe Connect integration — `STRIPE_CONNECT`
is a named enum value with no code path behind it, deliberately, because an
integration that cannot be exercised should not be claimed.

**The money has already left the seller's spendable balance** when the request
appears. The queue at `/admin/payouts` is therefore a list of what the platform owes
right now, not a list of proposals.

1. Open `/admin/payouts` (owner-operator account only). Oldest first is the fair
   order to pay.
2. Make the bank transfer for the amount shown, to the destination the seller gave.
   If no destination was given, contact them — the screen says so rather than letting
   you send money nowhere.
3. **Mark as sent.** This records the transfer; it does not make one. It is
   idempotent, so a double-click cannot pay twice.
4. If the transfer bounces, use **Couldn't send** and give a reason. The reason is
   required because the seller sees it, and their money returns to their balance
   either way — an unexplained reversal is worse than the failure.

### Reconciliation

Both halves of a payout carry `payoutId` on the wallet ledger, so a debit and its
reversal pair up without parsing note text:

```sql
SELECT kind, amount, note, "createdAt" FROM wallet_ledger_entries WHERE "payoutId" = '<id>' ORDER BY "createdAt";
```

Outstanding liability — money reserved but not yet sent — is on the ERP page and in
`getPayoutLiability()`.

## Switching off the wallet float

`WALLET_FLOAT_ENABLED=false` blocks wallet top-ups and time-credit purchases while
leaving direct card payment for bookings working. It exists so that going live does
not have to wait on the e-money determination in `docs/COMPLIANCE.md` (CR-001): the
float and the transferable credits are what make that question hard.

It defaults to **enabled**, because flipping it by default would silently remove
working features from a live site. Set it explicitly in Render when you decide to.
Existing balances are unaffected — they remain spendable and withdrawable; only new
money entering the float is blocked.
