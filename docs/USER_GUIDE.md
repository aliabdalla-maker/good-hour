# User Guide

How to use Good Hours, by role. Every feature listed here is implemented and
was verified working during development — this isn't a roadmap, it's a
description of the running app.

## Everyone

- **`/browse`** — every listing across all three categories (🏨 Rooms, 🚗 Cars,
  🧭 Travel services), with a category filter and star ratings from real
  reviews. No login required.
- **AI concierge** — the ✦ button, bottom-right, on every page. Ask it things
  like "cars in London under £15/hr" or "how do I list my room" — it can
  search real listings and hand you a button straight to the result. It
  degrades gracefully to simple keyword matching if the AI backend is
  unavailable (still useful, just less flexible).
- **Footer** — contact email and the operating company's registration
  details, on every page.

## Traveller

1. **Register / log in** at `/register` / `/login`.
2. **Two ways to book**, from `/browse` or the homepage:
   - **⚡ Book instantly** (`/search`) — pick a city and time window, see
     real availability and price (optionally the AI-suggested dynamic rate),
     book, and pay immediately via Stripe.
   - **✦ Request a match** (`/requests/new`) — post what you need (location,
     time, budget, required amenities) and let suppliers — and their
     auto-offer agents — bid. Optionally enable **"auto-accept"** so your
     own agent accepts the AI-recommended best offer automatically if it's
     within your budget, without you clicking anything.
3. **`/requests/:id/offers`** — review submitted offers manually if you
   didn't enable auto-accept; the AI's top recommendation is flagged.
4. **`/dashboard/traveller`** — "My bookings": every booking, its status,
   and per-booking:
   - **Message host** — a chat thread with the supplier for that booking.
   - **Cancel booking** — for a pending or confirmed booking; a paid
     booking is refunded automatically.
   - **View receipt** — an itemized, printable receipt (line items, the 1%
     platform fee, total) once confirmed.
   - **Leave a review** — 1–5 stars + a comment, once the booking is
     confirmed or completed. One review per booking.
5. **`/notifications`** — in-app notifications for booking updates, new
   offers, and AI match recommendations.

## Supplier (Host)

1. **Register** with role Supplier, log in.
2. **`/dashboard/supplier`**:
   - **Host verification** — submit your business name (and optionally a
     registration ID / phone) for admin review. Once approved, your
     listings show a **"✓ Verified"** badge to travellers.
   - **Add a property** — name, address, city, country, coordinates. A
     property's category (Room / Car / Travel service) is set at creation.
   - **Add a room/unit** to a property — name, capacity, amenities, hourly
     rate, min/max booking hours. Toggle **"auto-offer (B2A)"** to have this
     unit automatically bid on matching reverse-auction requests without
     you doing anything.
   - **Earnings** — total earned (confirmed + completed bookings), active
     booking count, and a per-booking payout list.
3. **`/sourcing`** — import a listing draft from a URL or feed, review it,
   then publish it as a real bookable property + room. (Accommodation
   listings only, currently.)
4. Respond to **traveller messages** and **reviews** the same way a
   traveller does, from the perspective of the other party on a shared
   booking.

## Admin

1. **`/admin/verification`** — the host verification queue: approve or
   reject pending supplier submissions. Approving flips their listings'
   badge to Verified immediately.
2. **`/admin/campaigns`** — send a marketing campaign (email/SMS/in-app) to
   all users, travellers, or suppliers. Respects each user's marketing
   opt-in; every send/skip is logged.
3. **`/admin/crm`** — every customer (traveller or host) in one console:
   - Lifecycle **stage** (Lead / Active / VIP / Dormant) — click a stage
     chip to change it.
   - Free-form **tags**.
   - **Notes** — a running log of anything you want to remember about them.
   - **Activity timeline** — auto-built from their real bookings, reviews,
     and marketing consent changes; no manual data entry.
   - Summary stat cards: total contacts, and a live count per stage.
4. Every AI agent decision (pricing suggestions, offer rankings) is logged
   to `AgentDecisionLog` with full reasoning — ask an engineer to query it
   directly if you need to audit a specific decision (no admin UI for this
   yet).

## The 1% fee, plainly

Every booking splits a 2% platform fee in half: the traveller pays subtotal
+ 1%, the supplier receives subtotal − 1%. It's shown on the booking screen,
the receipt, and the browse page footer before you commit to anything.
