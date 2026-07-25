# Deploying Good Hours to goodhours.shop

The simplest reliable path: **one small Linux VPS running the Docker Compose
stack behind Caddy** (automatic HTTPS). ~$5–6/month. Everything below reuses
the images and compose files already in this repo.

The stack that will run:

```
Internet ──▶ Caddy (:80/:443, auto-TLS)
                ├── goodhours.shop      ──▶ web  (Next.js  :3000)
                └── api.goodhours.shop  ──▶ api  (Fastify  :4000)
            web/api ──▶ postgres, redis   (internal only)
            worker  ──▶ background jobs (reservation expiry, pricing, notifications)
            migrate ──▶ one-shot: applies DB migrations on every deploy
```

---

## 1. Get a server

Create an Ubuntu 22.04+ VPS (DigitalOcean, Hetzner, Vultr, Linode, AWS
Lightsail…). 1 vCPU / 2 GB RAM is enough to start. Note its public IP.

## 2. Point DNS at it

At your domain registrar for **goodhours.shop**, create records → the VPS IP:

| Type | Name  | Value        |
|------|-------|--------------|
| A    | `@`   | `<server-ip>`|
| A    | `www` | `<server-ip>`|
| A    | `api` | `<server-ip>`|

Wait for propagation (`dig goodhours.shop +short` should return the IP).

## 3. Install Docker on the server

```bash
curl -fsSL https://get.docker.com | sh
```

## 4. Get the code onto the server

```bash
git clone <your-repo-url> goodhours && cd goodhours
```

## 5. Configure secrets

```bash
cp .env.production.example .env
nano .env        # fill in every CHANGE_ME + all API keys
```

Generate strong values:

```bash
openssl rand -hex 32   # -> JWT_SECRET
openssl rand -hex 24   # -> POSTGRES_PASSWORD (also update it inside DATABASE_URL)
```

Key rules (these bite in production):
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` must be a **publishable** key (`pk_live_…`), never `sk_`/`rk_`.
- `STRIPE_WEBHOOK_SECRET` is a **`whsec_…`** — create it in step 8, not the same as your secret key.
- `EMAIL_FROM` must use a **domain you've verified in Resend** (e.g. `no-reply@goodhours.shop`).
- `WEB_ORIGIN` must list every browser origin exactly (`https://goodhours.shop,https://www.goodhours.shop`).

Also set the ACME email in `deploy/Caddyfile` (currently `admin@goodhours.shop`).

## 6. Launch

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

First run builds the images, applies migrations (the `migrate` service), and
Caddy fetches TLS certs. Watch it come up:

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs -f caddy api
```

Visit **https://goodhours.shop** — it should load over HTTPS.

## 7. Seed demo data (optional)

```bash
docker compose -f docker-compose.prod.yml run --rm api npm run db:seed
```

## 8. Stripe webhook

In the Stripe Dashboard → Developers → Webhooks → add endpoint:

- URL: `https://api.goodhours.shop/payments/webhook`
- Copy the signing secret (`whsec_…`) into `.env` as `STRIPE_WEBHOOK_SECRET`, then:

```bash
docker compose -f docker-compose.prod.yml up -d api worker
```

## Updating after a code change

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

Migrations apply automatically on each deploy via the `migrate` service.

---

## Alternative: managed platform (Render / Railway / Fly.io)

If you'd rather not run a server, these can build the three Dockerfiles,
provide managed Postgres + Redis, and bind the custom domain with automatic
HTTPS. Trade-off: a bit more per month and per-service config instead of one
compose file. Ask and I'll generate the platform-specific config.

## Firewall

Only Caddy needs to be public. Restrict the server firewall to inbound
**22 (SSH), 80, 443** — Postgres/Redis are on the internal Docker network and
must not be exposed.
