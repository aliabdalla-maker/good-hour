# Good Hours — Hourly Marketplace for Rooms, Cars & Travel (Agentic AI)

Book rooms, cars and travel services **by the hour** from verified hosts — pay
instantly or run an AI reverse auction. Multi-vertical listings, verified reviews,
per-booking messaging, receipts, an agentic on-page AI concierge, split 10%/10%
fees, and a durable event backbone. See `docs/ARCHITECTURE.md` and
`docs/AGENT_DECISIONS.md` for how it's built.

## 🚀 Deploy live (goodhour.shop)

Production runs on an **Oracle Cloud Always Free VM** (143.47.255.104) using
`docker-compose.prod.yml` (web, api, worker, Postgres, Redis, Caddy with automatic
HTTPS for `www.goodhour.shop` and `api.goodhour.shop`). Render is no longer used.

- **Deploys:** push to `main`. The server pulls `main` every 2 minutes
  (`~/autodeploy.sh`, read-only GitHub deploy key) and rebuilds. Log: `~/autodeploy.log`.
- **Secrets:** live only in `~/good-hour/.env` on the server — set them with
  `ssh -t ubuntu@143.47.255.104 ./set-keys.sh`. Never commit them.
- **DNS (GoDaddy):** `www` and `api` → A 143.47.255.104; `goodhour.shop` forwards to www.

More detail in **[docs/DEPLOY.md](docs/DEPLOY.md)** (VPS + Caddy section).

## Prerequisites

- Node.js 20+
- Docker Desktop (for Postgres + Redis, and optionally to run `api`/`worker` in containers)
- An OpenAI API key (required for the two AI agents to actually call an LLM)
- Stripe test-mode keys (optional — payments fall back to a "simulate payment" button in the UI if unset)

## Setup

```bash
npm install
cp .env.example .env                                  # fill in OPENAI_API_KEY, Stripe keys
cp packages/web/.env.example packages/web/.env.local

docker compose up -d postgres redis

npm run db:generate
npm run db:migrate
npm run db:seed        # creates supplier@example.com / traveller@example.com, password "password123"

npm run dev            # runs api, worker, and web together via Turborepo
```

Then open http://localhost:3000, log in with a seeded account (or register your own), and:

- As the supplier, add a property and a room from **Supplier dashboard**.
- As the traveller, search for a room, see the AI-suggested price alongside the host rate, and book it.
- Try **Request a match** to post a reverse-bid request; if you enabled "auto-offer" on a room, an offer appears instantly from the supplier's agent, and the negotiation agent will recommend a winner within a few seconds (via the `worker` process).

## Running api/worker in Docker instead

```bash
docker compose up
npm run dev --workspace=packages/web
```

## Scripts

- `npm run dev` — Turborepo dev (api + worker + web)
- `npm run build` / `npm run typecheck` — across all packages
- `npm run db:migrate`, `npm run db:seed`, `npm run db:generate` — Prisma

## What this is (and isn't)

This is a deliberately scoped slice of a much larger spec (hotel/travel/vehicle/workspace/professional-services/product marketplace, full ERP/CRM/HR back office, etc.). It's architected as a modular monolith with clean module boundaries so those other verticals can be added later without a rewrite — see the "extension seam" section of the plan and `docs/ARCHITECTURE.md`. It is not, and was never intended to be, the entire spec built out.
