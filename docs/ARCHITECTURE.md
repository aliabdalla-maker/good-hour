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
- **Notifications are in-process**, subscribing directly to the `domainEvents` `EventEmitter` inside the `api` process, console-logging "sent" emails. The plan described notifications running in the `worker` process, but the domain event bus is same-process only (a plain `EventEmitter`) — wiring cross-process delivery would need routing these through Redis/BullMQ too, which isn't justified yet at this scale. Swap in a real provider (Resend) inside `modules/notifications/service.ts` without touching the event bus.
- **No rating/distance signals yet.** `negotiation-agent`'s input schema has `supplierRatingAvg` and `roomDistanceKm` as nullable specifically because neither a review system nor geocoding is implemented — both are always sent as `null` today. Add a reviews model and a geocode-on-write step for `Property` to light these up.

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
