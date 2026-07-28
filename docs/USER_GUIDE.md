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

## Time wallet — buying, gifting and exchanging hours

`/wallet`, once you're signed in. An hour you buy is yours to keep: it isn't
tied to one booking, one date, or one listing.

### Buying hours

1. Go to **`/wallet`** → **Buy hours**.
2. Pick a category (🏨 Room / 🚗 Car / 🧭 Travel) and how many hours (quarter-hour
   increments).
3. The price is the live *average* hourly rate for that category, plus the
   standard 1% buyer fee. You'll see the total before confirming.
4. Complete the card payment. **Hours appear in your wallet once the payment
   clears, not when you click buy** — if you abandon checkout, nothing is
   charged and nothing is credited.

Hours are held per category. Room hours book rooms; car hours book cars. To
move value between them, use Exchange (below).

### Spending hours on a booking

On any listing page, if you hold hours in that listing's category, a **Use time
credits** box appears above the booking button. Enter how many hours to apply:

- You can apply at most the number of hours you're booking — a credit buys an
  hour, it isn't a percentage discount.
- Only the remainder is charged to your card. If credits cover the whole
  booking, it's **confirmed immediately** with no payment step.
- **Cancel, or let an unpaid booking expire, and your hours come back.** You
  don't lose them by not completing payment.

### Gifting hours

**`/wallet` → Gift hours.** Enter the recipient's account email, the bucket, and
how many hours. Gifts are **free** — no platform fee on a transfer. Useful for
family, or for a business handing hours to employees.

The recipient's wallet values the gifted hours at what *you* paid for them, not
today's market price.

### Exchanging hours across categories

**`/wallet` → Exchange.** Choose a From and To bucket and the hours to convert,
then **Get quote**.

The rate is anchored on the real average prices of live listings, so dearer
hours buy more cheap ones — e.g. 4 hours of rooms (~£30/hr) converts to roughly
11 hours of cars (~£10.75/hr). An AI agent may adjust that anchor slightly for
demand, and it shows you its reasoning and confidence. A **1% commission** is
taken in hours of the destination bucket, so you give up about 1% of value on
an exchange.

If a category has no active listings, the exchange is refused rather than
quoted at a made-up rate.

### Reading your history

The **History** table at the bottom of `/wallet` is the complete record — every
purchase, redemption, gift, exchange and refund, with the counterparty where
relevant. Nothing is ever edited or deleted from it; corrections appear as new
rows.

## The 1% fee, plainly

Every booking splits a 2% platform fee in half: the traveller pays subtotal
+ 1%, the supplier receives subtotal − 1%. It's shown on the booking screen,
the receipt, and the browse page footer before you commit to anything.

The same 1%-each-side rule applies to trading, not just booking: buying time
credits carries a 1% buyer fee, and exchanging credits between categories
carries a 1% commission. **Gifting is free.**
