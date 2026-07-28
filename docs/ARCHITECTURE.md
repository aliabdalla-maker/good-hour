# Architecture

See `C:\Users\User\.claude\plans\quiet-juggling-raccoon.md` for the full plan this was built from. This doc covers what actually got built and the pragmatic deviations made along the way.

## Topology

Modular monolith, two Node entrypoints sharing one codebase:

- `packages/api` — Fastify HTTP API. Modules under `src/modules/*`, each a Fastify plugin with a public `index.ts`. Cross-module calls are plain in-process function calls.
- `packages/worker` — BullMQ job consumers (`pricing-refresh`, `offer-evaluation`). Imports the relevant `api` module files by relative path (same codebase, second entrypoint) rather than through a published package boundary.
- `packages/db` — Prisma schema + generated client, imported by both.
- `packages/shared` — Zod schemas/types imported by `api` and `web`.
- `packages/web` — Next.js app.

Both `api` and `worker` run via `tsx` (not a `tsc` build) even in the Docker images, specifically so `@gihtcx/db` and `@gihtcx/shared` can stay "main": "src/index.ts" internal packages without a separate compile step. If this ever needs a real `tsc`-compiled production image, `db` and `shared` need their own build step with `main` pointed at `dist/`.

## Deviations from the original plan (and why)

- **Stripe webhooks are processed synchronously** in the `POST /payments/webhook` handler, not via the `webhookProcess` BullMQ queue the plan sketched out. Signature verification + a couple of DB writes is fast and idempotent; queuing it added a queue for no real benefit, so that queue was dropped.
- **Domain events go through a transactional outbox, not an in-process bus.** `domainEvents.publish()` writes an `OutboxEvent` row in the same transaction as the business change; a relay in the `worker` (`startOutboxRelay()`) picks rows up and dispatches to handlers with retries. This replaced an earlier fire-and-forget `EventEmitter` that lost events on restart. The `api` process only ever *publishes* — handlers (notifications) are registered and run in the `worker`. Swap in a real provider (Resend) inside `modules/notifications/service.ts` without touching the outbox.
- **`supplierRatingAvg` is now wired** from real `Review` data (`reviews/service.ts#getSupplierRatingAvg`, averaged across all of a supplier's rooms) — see `offerEvaluation.processor.ts`. `roomDistanceKm` is still always `null`; it needs a geocode-on-write step for `Property` that isn't implemented.

## Module map (`packages/api/src/modules/*`)

Each is a Fastify plugin exposing a public `index.ts`; cross-module access is
expected to go through that barrel rather than a deep import.

**This is a convention, not an enforced rule.** The original plan called for an
ESLint `no-restricted-imports` guard and it was never actually added — there is
no such rule in `eslint.config.mjs`. Nothing currently stops a deep import into
another module's internals, so the boundary holds only as long as reviewers
watch for it. Adding the rule is a genuine, small, unstarted improvement.

| Module | Owns | Route prefix |
|---|---|---|
| `auth` | Users, sessions, JWT cookie | `/auth` |
| `listings` | Property, Room, rate rules | `/listings` |
| `search` | Availability search + ranking | `/search` |
| `booking` | Slots, Booking lifecycle, expiry | `/bookings` |
| `bidding` | BookingRequest, SupplierOffer | `/requests`, `/offers` |
| `payments` | Stripe intents, webhook, refunds | `/payments` |
| `credits` | Time-credit ledger, wallet, exchange | `/credits` |
| `pricing-agent` | Dynamic rate recommendation | `/pricing` |
| `negotiation-agent` | Offer ranking (worker-invoked) | — |
| `assistant` | Tool-calling concierge | `/assistant` |
| `notifications` | In-app/email/SMS + campaigns | `/notifications` |
| `reviews` / `messages` / `verification` | Trust & comms | respective |
| `sourcing` | URL/feed/Smoobu listing import | `/sourcing` |
| `crm` | Admin customer console | `/crm` |
| `erp` | Owner-only financial/ops overview | `/erp` |
| `agent-log` | Shared AgentDecisionLog helper | — |

## Time-credit economy (`modules/credits`)

A purchased hour is a transferable asset, not a prepayment. Three design
decisions carry the weight:

**The wallet has no balance column.** A balance is always `SUM(hours)` over
the append-only `CreditLedgerEntry` table. The alternative — a stored balance —
turns a concurrency bug into permanently wrong state that no later correction
can explain. Here the only failure mode is contention, and it's solvable.

**Debits run in a `Serializable` transaction whose non-negative check happens
*after* the insert.** Checking first would reintroduce the read-then-write gap
the isolation level exists to close. Two concurrent spends of the same hours
therefore cannot both commit; the loser gets a retryable 409 (either
`INSUFFICIENT_CREDITS` from the post-write balance check, or `CREDIT_CONFLICT`
from a Postgres serialization abort — both are handled).

**Credits are category-scoped.** A hotel hour and a chauffeur hour are not
interchangeable at par; crossing categories goes through `exchangeAgent`, whose
rate is anchored on the ratio of real average listing prices. The model may
adjust that anchor by at most ±25%, clamped server-side — the same rule the
pricing agent follows for host min/max, and for the same reason: a hallucinated
number must not be able to destroy value in someone's wallet.

Two subtleties that are easy to get wrong and are load-bearing:

- Destination hours on an exchange are priced off the **gross** conversion, not
  the post-fee hours. Dividing by net inflates the unit value by exactly the
  commission and hands it back, making the fee cosmetic. (This shipped wrong
  once and was caught by testing the money, not the intent.)
- `Booking.totalAmount` stays **gross** with `creditValueApplied` recorded
  separately, so receipts, CRM lifetime spend and ERP revenue keep their
  meaning. Cash actually charged is `totalAmount − creditValueApplied`, on
  `Payment.amount`.

Gifts (`TRANSFER_IN`/`OUT`) are free; only priced trades carry the 10%/10%
commission, via `computeTradeFee` in `@gihtcx/shared` — which delegates to the
booking fee maths so there is one rounding rule everywhere.

## A2B / B2A autonomy

Two independent toggles let either side skip the human click:

- **B2A** — `Room.autoOfferEnabled`. When a `BookingRequest` is created, `bidding/service.ts#generateAutoOffers` immediately creates `SupplierOffer` rows (tagged `isAgentSubmitted: true`) for any matching room, using the room's static rate — no LLM call for offer *generation*, only for *ranking* (that's the negotiation agent's job).
- **A2B** — `BookingRequest.autoAcceptEnabled`. Once the negotiation agent recommends a winner, `bidding/service.ts#maybeAutoAccept` (called from the `offer-evaluation` worker job) accepts it on the traveller's behalf if the total is within `maxBudget`, via the exact same `acceptOffer` path a manual click uses, tagging the resulting `Booking.isAgentAccepted: true`.

Both are audit-visible: every accepted/rejected offer traces back to an `AgentDecisionLog` row from the negotiation agent that produced the recommendation.

## Local setup

1. `npm install`
2. Copy `.env.example` to `.env` (root) and `packages/web/.env.example` to `packages/web/.env.local`; fill in `OPENAI_API_KEY` and Stripe test keys.
3. `docker compose up -d postgres redis` (or all four services)
4. `npm run db:generate && npm run db:migrate && npm run db:seed`
5. `npm run dev` (Turborepo runs `api`, `worker`, `web` dev servers together) — or run `docker compose up` for `api`+`worker` and `npm run dev --workspace=packages/web` separately for fast frontend HMR.
