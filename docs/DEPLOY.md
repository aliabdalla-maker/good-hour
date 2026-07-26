# Deploying Good Hours to goodhour.shop

The simplest reliable path: **one small Linux VPS running the Docker Compose
stack behind Caddy** (automatic HTTPS). ~$5–6/month. Everything below reuses
the images and compose files already in this repo.

The stack that will run:

```
Internet ──▶ Caddy (:80/:443, auto-TLS)
                ├── www.goodhour.shop  ──▶ web  (Next.js  :3000)
                └── api.goodhour.shop  ──▶ api  (Fastify  :4000)
            web/api ──▶ postgres, redis   (internal only)
            worker  ──▶ background jobs (reservation expiry, pricing, notifications)
            migrate ──▶ one-shot: applies DB migrations on every deploy
```

---

## 1. Get a server

Create an Ubuntu 22.04+ VPS (DigitalOcean, Hetzner, Vultr, Linode, AWS
Lightsail…). 1 vCPU / 2 GB RAM is enough to start. Note its public IP.

## 2. Point DNS at it

At your domain registrar for **goodhour.shop**, create records → the VPS IP.
The apex is intentionally **not** used — only the `www` and `api` subdomains:

| Type | Name  | Value        |
|------|-------|--------------|
| A    | `www` | `<server-ip>`|
| A    | `api` | `<server-ip>`|

Wait for propagation (`dig www.goodhour.shop +short` should return the IP).
The site lives at **https://www.goodhour.shop**.

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
- `EMAIL_FROM` must use a **domain you've verified in Resend** (e.g. `no-reply@goodhour.shop`).
- `WEB_ORIGIN` must list every browser origin exactly (`https://goodhour.shop,https://www.goodhour.shop`).

Also set the ACME email in `deploy/Caddyfile` (currently `admin@goodhour.shop`).

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

Visit **https://www.goodhour.shop** — it should load over HTTPS.

## 7. Seed demo data (optional)

```bash
docker compose -f docker-compose.prod.yml run --rm api npm run db:seed
```

## 8. Stripe webhook

In the Stripe Dashboard → Developers → Webhooks → add endpoint:

- URL: `https://api.goodhour.shop/payments/webhook`
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

## Managed deploy — Render (no server to run) — RECOMMENDED to go live fastest

`render.yaml` in the repo root is a Blueprint that provisions the entire stack
(web + api + worker + managed Postgres + Redis) from GitHub. No VPS, automatic
HTTPS.

1. **Deploy the Blueprint**
   - [render.com](https://render.com) → **New → Blueprint** → connect the
     GitHub repo **aliabdalla-maker/good-hour** → **Apply**.
   - Render reads `render.yaml` and creates all five resources.

2. **Fill the secrets** (Render prompts for every `sync: false` var):
   `OPENAI_API_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`,
   `RESEND_API_KEY`, and on the **web** service
   `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (a `pk_live_…`).
   > The web bundle inlines `NEXT_PUBLIC_*` at build time — after changing it,
   > trigger **Manual Deploy → Clear build cache & deploy** on the web service.

3. **Add custom domains** (each service → Settings → Custom Domains). We use the
   `www` and `api` subdomains only — **no apex** (keeps DNS to CNAMEs):
   - `goodhour-web`  → add `www.goodhour.shop`
   - `goodhour-api`  → add `api.goodhour.shop`
   Render shows a CNAME target for each.

4. **Point GoDaddy DNS** (GoDaddy → your domain → **DNS → Manage Zones**).
   Delete any existing "connected website"/parking records first, then add the
   two CNAMEs Render shows you:

   | Type  | Name  | Value (use the exact target Render displays)         |
   |-------|-------|------------------------------------------------------|
   | CNAME | `www` | `goodhour-web.onrender.com`                          |
   | CNAME | `api` | `goodhour-api.onrender.com`                          |

   Wait for Render to show "Verified" (a few minutes to an hour). HTTPS is
   automatic. Visit **https://www.goodhour.shop**.

   *(Optional — the bare `goodhour.shop` is unused. If you want it to redirect to
   www, use GoDaddy's **Forwarding** feature: forward `goodhour.shop` →
   `https://www.goodhour.shop`. This is optional and needs no A record.)*

5. **Stripe webhook**: Dashboard → Webhooks → add
   `https://api.goodhour.shop/payments/webhook`, copy the `whsec_…` into the
   api service's `STRIPE_WEBHOOK_SECRET`, and redeploy the api.

**Cost**: the `free` DB/Redis and `starter` services (~$7/mo each) are fine to
start; upgrade the database plan before real traffic (free Postgres expires).

## Alternative: Railway / Fly.io

Both can also build the three Dockerfiles and provide managed Postgres + Redis.
Same shape as Render; the `render.yaml` maps directly to their configs.

## Firewall

Only Caddy needs to be public. Restrict the server firewall to inbound
**22 (SSH), 80, 443** — Postgres/Redis are on the internal Docker network and
must not be exposed.
