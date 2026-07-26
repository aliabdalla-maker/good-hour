# Diagrams

All diagrams are Mermaid — they render natively on GitHub. Grounded directly
in the current code (module names, routes, Prisma models); update them
alongside the code they describe, not after the fact.

## 1. Use-case diagram

Mermaid has no native UML use-case shape, so this is a flowchart styled as one
(actors on the left/right, use cases in the middle).

```mermaid
flowchart LR
    Traveller((Traveller))
    Supplier((Supplier / Host))
    Admin((Admin))
    Pricing[["🤖 Pricing Agent"]]
    Negotiation[["🤖 Negotiation Agent"]]
    Assistant[["🤖 Assistant Agent"]]
    Stripe{{Stripe}}
    OpenAI{{OpenAI}}

    Traveller --> UC1[Browse / search listings]
    Traveller --> UC2[Book instantly & pay]
    Traveller --> UC3[Post reverse-auction request]
    Traveller --> UC4[Accept a supplier offer]
    Traveller --> UC5[Message a host]
    Traveller --> UC6[Leave a review]
    Traveller --> UC7[Cancel a booking / get refund]
    Traveller --> UC8[Chat with AI assistant]
    Traveller --> UC9[View / print receipt]

    Supplier --> UC10[List a property & room]
    Supplier --> UC11[Submit verification]
    Supplier --> UC12[Submit an offer]
    Supplier --> UC13["Enable auto-offer (B2A)"]
    Supplier --> UC14[View earnings]
    Supplier --> UC5

    Admin --> UC15[Approve / reject verification]
    Admin --> UC16[Send marketing campaigns]
    Admin --> UC17[Manage CRM: stage, tags, notes]
    Admin --> UC18[Audit agent decisions]

    UC2 --> Stripe
    UC4 --> Stripe
    Pricing -.suggests rate.-> UC2
    Pricing --> OpenAI
    Negotiation -.ranks offers.-> UC3
    Negotiation --> OpenAI
    Assistant -.answers / navigates.-> UC8
    Assistant --> OpenAI
```

## 2. Sequence: instant booking + payment

```mermaid
sequenceDiagram
    actor T as Traveller
    participant Web as Next.js Web
    participant API as Fastify API
    participant Pricing as Pricing Agent
    participant DB as Postgres
    participant Stripe
    participant Worker as BullMQ Worker

    T->>Web: Search city + time
    Web->>API: GET /search
    API->>DB: find ACTIVE rooms, check AvailabilitySlot
    opt includeAiPrice
        API->>Pricing: getSuggestedRateForRoom(room)
        Pricing->>Pricing: cached AI_DYNAMIC rate (refreshed every 30m)
    end
    API-->>Web: SearchResult[] (base + AI rate)
    T->>Web: Book room
    Web->>API: POST /bookings
    API->>DB: hold AvailabilitySlot(s), create Booking(PENDING_PAYMENT)
    API->>Stripe: create PaymentIntent
    API->>Worker: enqueue booking-expiry job (reservationExpiresAt)
    API-->>Web: booking + clientSecret
    Web->>Stripe: confirm payment (Stripe Elements)
    Stripe-->>API: POST /payments/webhook (payment_intent.succeeded)
    API->>DB: Payment CONFIRMED, Booking CONFIRMED, slots BOOKED
    API->>DB: write OutboxEvent(booking.confirmed)
    Worker->>DB: outbox relay drains event
    Worker->>T: notify (in-app / email / SMS)
    Note over Worker: if payment never completes,<br/>booking-expiry job releases the held slots
```

## 3. Sequence: reverse-auction (B2A auto-offer → Negotiation Agent → A2B auto-accept)

```mermaid
sequenceDiagram
    actor T as Traveller
    actor S as Supplier
    participant API as Fastify API
    participant DB as Postgres
    participant Q as Redis / BullMQ
    participant Worker
    participant Neg as Negotiation Agent

    T->>API: POST /bidding/requests (maxBudget, autoAcceptEnabled?)
    API->>DB: create BookingRequest(OPEN)

    par Manual offer
        S->>API: POST /bidding/offers
        API->>DB: create SupplierOffer(PENDING)
    and B2A auto-offer
        API->>DB: find rooms with autoOfferEnabled=true, matching request
        API->>DB: create SupplierOffer(isAgentSubmitted=true)
    end

    API->>Q: enqueue offer-evaluation job
    Q->>Worker: consume job
    Worker->>DB: load BookingRequest + all PENDING/RECOMMENDED offers
    Worker->>DB: getSupplierRatingAvg() per offer (real Review data)
    Worker->>Neg: evaluateOffers(input)
    Neg->>Neg: rank by price, amenities, rating, budget fit
    Neg-->>Worker: MatchDecision (recommendedOfferId, reasoning)
    Worker->>DB: write AgentDecisionLog
    Worker->>DB: mark winning offer RECOMMENDED

    alt A2B autoAcceptEnabled AND within maxBudget
        Worker->>API: acceptOffer() on traveller's behalf
        API->>DB: Booking(isAgentAccepted=true), slots HELD
        API->>DB: AgentDecisionLog.outcomeAccepted = true
    else manual accept
        T->>API: POST /bidding/offers/:id/accept
        API->>DB: Booking created, slots HELD
    end
```

## 4. Sequence: agentic assistant (tool-calling concierge)

```mermaid
sequenceDiagram
    actor U as User (any page)
    participant Widget as AssistantWidget
    participant API as POST /assistant/chat
    participant LLM as OpenAI (tool-calling loop)
    participant DB as Postgres

    U->>Widget: "Any cars in London under £15/hr?"
    Widget->>API: {messages, pageContext}
    API->>LLM: chat.completions.create(tools=[search_listings, navigate])
    LLM-->>API: tool_call: search_listings({city, category, maxHourlyRate})
    API->>DB: query Property + Room matching filters
    API-->>LLM: tool result (real listings)
    LLM-->>API: tool_call: navigate({path:"/room/<id>", label})
    API->>API: collect action, no side effect (safe)
    LLM-->>API: final reply text
    API-->>Widget: {reply, actions[], aiPowered:true}
    Widget-->>U: renders reply + action button
    Note over API: On any LLM error (quota, timeout),<br/>falls back to a keyword-matched reply<br/>with aiPowered:false — never a hard failure
```

## 5. Sequence: transactional outbox (durable event delivery)

```mermaid
sequenceDiagram
    participant API as Fastify API (publisher)
    participant DB as Postgres (outbox_events)
    participant Relay as Outbox Relay (in Worker)
    participant Handler as Notification handlers

    API->>DB: business write (e.g. Booking CONFIRMED)
    API->>DB: INSERT OutboxEvent(status=PENDING)
    Note over API: API's job ends here — it never calls<br/>handlers directly (durable, at-least-once)

    loop every 2s
        Relay->>DB: SELECT ... WHERE status=PENDING LIMIT 20
        Relay->>DB: UPDATE SET status=PROCESSING (atomic claim)
        Relay->>Handler: dispatchEvent(type, payload)
        alt success
            Relay->>DB: status=PROCESSED
        else handler throws
            Relay->>DB: status=PENDING (retry, up to 5x) or FAILED
        end
        Relay->>DB: reclaim any PROCESSING row stuck >60s (crash recovery)
    end
```

## 6. Class diagram — core domain model

```mermaid
classDiagram
    class User {
        +String id
        +Role role
        +VerificationStatus verificationStatus
        +CrmStage crmStage
        +String[] crmTags
    }
    class Property {
        +ListingCategory category
        +String city
        +Float lat, lng
    }
    class Room {
        +String name
        +Decimal baseHourlyRate
        +Boolean autoOfferEnabled
        +String imageUrl
    }
    class RoomRateRule {
        +RateRuleKind kind
        +Decimal multiplier
    }
    class AvailabilitySlot {
        +DateTime startsAt, endsAt
        +SlotStatus status
    }
    class BookingRequest {
        +Decimal maxBudget
        +Boolean autoAcceptEnabled
        +BookingRequestStatus status
    }
    class SupplierOffer {
        +Decimal offeredTotal
        +Boolean isAgentSubmitted
        +SupplierOfferStatus status
    }
    class Booking {
        +Decimal subtotalAmount, platformFee, totalAmount
        +BookingSource source
        +Boolean isAgentAccepted
        +BookingStatus status
    }
    class Payment {
        +String stripePaymentIntentId
        +String status
    }
    class Review {
        +Int rating
        +String comment
    }
    class Message {
        +String body
    }
    class AgentDecisionLog {
        +AgentType agentType
        +Json inputSnapshot, parsedDecision
        +Boolean outcomeAccepted
    }
    class OutboxEvent {
        +String type
        +OutboxStatus status
        +Int attempts
    }
    class CrmNote {
        +String body
    }

    User "1" --> "*" Property : supplierId
    Property "1" --> "*" Room
    Room "1" --> "*" RoomRateRule
    Room "1" --> "*" AvailabilitySlot
    Room "1" --> "*" SupplierOffer
    Room "1" --> "*" Review
    User "1" --> "*" BookingRequest : travellerId
    BookingRequest "1" --> "*" SupplierOffer
    SupplierOffer "0..1" --> "1" Booking : sourceOffer
    User "1" --> "*" Booking : travellerId
    Booking "1" --> "1" Payment
    Booking "1" --> "0..1" Review
    Booking "1" --> "*" Message
    Booking "1" --> "*" AvailabilitySlot
    User "1" --> "*" CrmNote
    User "1" --> "*" AgentDecisionLog : (via subjectId, loose ref)
```

## 7. Software architecture (container view)

```mermaid
flowchart TB
    subgraph Client
        Browser["Browser<br/>Next.js web (App Router)<br/>+ AssistantWidget"]
    end

    subgraph "Good Hours platform (monorepo, 2 runtime entrypoints)"
        API["packages/api<br/>Fastify HTTP API<br/>(auth, listings, search, booking,<br/>bidding, payments, reviews,<br/>verification, messages, CRM,<br/>assistant, pricing/negotiation agents)"]
        Worker["packages/worker<br/>BullMQ consumers:<br/>pricing-refresh · offer-evaluation ·<br/>booking-expiry · outbox relay ·<br/>notification handlers"]
        Shared["packages/shared<br/>Zod schemas / types"]
        DBPkg["packages/db<br/>Prisma schema + client"]
    end

    subgraph Data
        PG[(Postgres)]
        Redis[(Redis)]
    end

    subgraph External
        OpenAI{{OpenAI<br/>gpt-4o-mini}}
        StripeE{{Stripe}}
        Resend{{Resend<br/>email}}
        Twilio{{Twilio<br/>SMS}}
    end

    subgraph "CI/CD"
        GitHub[GitHub main]
        Actions[GitHub Actions<br/>lint·typecheck·test·build]
        GHCR[(GHCR images)]
        Jenkins[Jenkinsfile<br/>mirrors CI/CD]
    end

    subgraph "Deploy targets (pick one)"
        Render[Render Blueprint<br/>render.yaml]
        RailwayT[Railway<br/>services + Postgres + Redis]
        VPS[VPS + Docker Compose<br/>+ Caddy auto-HTTPS]
    end

    Browser -- HTTPS/JSON --> API
    API --> Shared
    Worker --> Shared
    API --> DBPkg
    Worker --> DBPkg
    DBPkg --> PG
    API --> Redis
    Worker --> Redis
    API -. LLM calls .-> OpenAI
    API -- PaymentIntents/webhooks --> StripeE
    Worker -- transactional email --> Resend
    Worker -- SMS --> Twilio

    GitHub --> Actions
    Actions --> GHCR
    GitHub -.-> Jenkins
    GHCR -.-> Render
    GHCR -.-> RailwayT
    GHCR -.-> VPS
```

## Notes on accuracy

- The worker imports several `api` module files by relative path (same
  codebase, second entrypoint) rather than a published package boundary —
  see `docs/ARCHITECTURE.md`.
- The assistant's tool set today is `search_listings` and `navigate` only —
  it never mutates data (no booking/payment tool), by design (see
  `docs/AGENT_DECISIONS.md` and the security note in
  `packages/api/src/modules/assistant/service.ts`).
- Diagram 5 (outbox) replaced a plain in-process `EventEmitter`; see
  `packages/api/src/events/relay.ts`.
