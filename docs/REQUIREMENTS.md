# Requirements register

Every requirement stated across this project, given an ID, a priority, a
**testable** acceptance criterion, and a verdict against the current
implementation.

It exists because none of these requirements arrived with an acceptance
criterion. "Make it fully agentic", "make it ready to live" and "show all in the
GUI" have no observable state that separates done from not-done, so the criteria
below were written after the fact — by the implementer, which is the weakest
possible source. They are offered as a proposal to be corrected, not as a record
of what was agreed.

## How to read this

**Priority** is MoSCoW. `Won't` means consciously out of scope, not forgotten.

**Verdict** is one of:

| Verdict | Means |
|---|---|
| `Met` | The acceptance criterion is satisfied, with evidence |
| `Partially met` | Some of the criterion holds; the gap is named |
| `Not met` | Implemented or attempted, criterion not satisfied |
| `Not started` | No implementation |

**Evidence** uses explicit tokens so the *kind* of assurance is never ambiguous:

- `test:<path>` — an automated assertion fails if this breaks
- `code:<path>` — the code exists; nothing guards it
- `manual:<note>` — a human checked it once
- `prod:<note>` — real traffic has exercised it

`Met` requires at least one `test:`, `manual:` or `prod:` token. A `Met` backed
only by `code:` is the exact conflation this register exists to prevent, and
`requirements.test.ts` rejects it.

---

## Functional requirements

| ID | Requirement | Priority | Acceptance criterion | Verdict | Evidence |
| --- | --- | --- | --- | --- | --- |
| FR-001 | Hourly room booking, search to paid confirmation | Must | A traveller searches, books an hourly slot, pays by card, and the booking reaches CONFIRMED | Met | `prod:` completed in browser against live Stripe |
| FR-002 | One booking engine across rooms, cars and travel services | Must | All three categories book through the same slot/state machine, discriminated by `Property.category` | Met | `test:packages/api/src/modules/booking/stateMachine.test.ts` |
| FR-003 | C2B reverse bidding: request, offers, accept to booking | Must | A posted request receives supplier offers and accepting one creates a real Booking + Payment | Met | `manual:` verified end to end |
| FR-004 | AI dynamic pricing, clamped to host guardrails | Must | Recommendation is clamped server-side to host min/max regardless of model output, and every call logs a decision row | Met | `code:packages/api/src/modules/pricing-agent` `manual:` clamp verified |
| FR-005 | Matching agent ranks offers but never auto-accepts | Must | The agent returns a ranking; the money-moving accept requires a human click | Met | `test:packages/api/src/modules/negotiation-agent/prompt.test.ts` |
| FR-006 | Stripe payments with idempotent webhook handling | Must | Replaying any webhook produces no second ledger effect, enforced by a unique index | Met | `prod:` live payments; `code:packages/api/src/modules/payments` |
| FR-007 | Refunds across cancel, chargeback and card-refund paths | Must | Each path reverses the money exactly once and cannot drive a balance wrong | Met | `code:packages/api/src/modules/marketplace/service.ts` `manual:` |
| FR-008 | Products and services marketplace | Must | A seller lists a product or service; a buyer orders it and pays by wallet or card | Partially met | `test:packages/api/src/test/concurrency.itest.ts` drives the real order path — **still never exercised by a real user: `GET /market` returns 0 listings** |
| FR-009 | Search across products and services | Must | Query, category and price filters return matching listings | Met | `test:packages/shared/src/marketplace.test.ts` |
| FR-010 | Money wallet on an append-only ledger | Must | Balance is always `SUM(entries)`; no balance column exists; no path yields a negative except a clawback | Met | `test:packages/api/src/test/concurrency.itest.ts` — balance vs ledger sum asserted after contention |
| FR-011 | Time credit economy: buy, redeem, transfer, exchange | Must | Credits are granted only on confirmed payment, and redemption value never exceeds acquisition value | Met | `test:packages/shared/src/redemption.test.ts` |
| FR-012 | 10% buyer + 10% seller fee on every trade | Must | One shared helper computes every fee; no screen can display a stale rate | Met | `test:packages/shared/src/money.test.ts` |
| FR-013 | Hourly auctions, forward and reverse | Must | A forward auction closes to the highest bid over reserve; a reverse auction to the lowest | Partially met | `test:packages/shared/src/auctions.test.ts` — **closing/settlement untested; every live auction has 0 bids** |
| FR-014 | Autonomous proxy bidding within a mandate ceiling | Must | The strongest mandate always ends in front, at one increment past the second-strongest, never above its own ceiling | Met | `test:packages/shared/src/proxyContest.test.ts` |
| FR-015 | Settlement both human-confirmed and fully autonomous | Must | `autoSettle` defaults off; full autonomy is opt-in per bid and a broke winner cannot loop the job | Met | `test:packages/shared/src/auctions.test.ts` |
| FR-016 | ERP: revenue, liability, agent performance, pipeline | Should | Every figure is derived from a query, with no hardcoded values | Partially met | `code:packages/api/src/modules/erp/service.ts` — figures are real but near-zero, so unvalidated at scale |
| FR-017 | CRM console for the operator | Should | Accounts, notes and timeline are visible and editable by an admin | Met | `manual:` |
| FR-018 | ERP connected to CRM and the bidding system | Should | Auction and bidding activity appears in ERP metrics and CRM records | Partially met | `code:packages/api/src/modules/erp/service.ts` — connected in code, no data flowing |
| FR-019 | E-marketing campaigns with consent and unsubscribe | Should | No marketing send without a logged consent; unsubscribe is honoured | Met | `code:packages/api/src/modules/notifications` `manual:` |
| FR-020 | Listing sourcing: import to draft to publish | Should | An imported URL/feed becomes a reviewable draft; nothing publishes without review | Met | `code:packages/api/src/modules/sourcing` `manual:` |
| FR-021 | Reviews and ratings | Should | Only a completed booking can leave a review; averages reflect stored reviews | Met | `manual:` |
| FR-022 | Supplier verification workflow | Should | A verified badge appears only for admin-verified suppliers | Met | `manual:` |
| FR-023 | Traveller to host messaging | Should | Both parties to a booking can exchange messages, and no third party can read them | Met | `manual:` |
| FR-024 | Printable booking receipts | Could | A confirmed booking renders a receipt showing subtotal, fee and total | Met | `manual:` |
| FR-025 | Agentic assistant on every page, able to propose a booking | Should | The assistant can pre-fill a booking, and the traveller must still submit it | Met | `code:packages/api/src/modules/assistant` `manual:` |
| FR-026 | AI-generated listing imagery | Could | Listings without a photo receive a generated one, labelled as generated | Not met | Withdrawn on instruction — Gemini blocked on Google Cloud billing. The disclosure UI remains |
| FR-027 | Smoobu PMS integration, HMAC-authenticated | Could | Signed Smoobu webhooks sync availability; unsigned ones are rejected | Met | `code:packages/api/src/modules/listings` `manual:` |
| FR-028 | Multi-channel notifications: in-app, email, SMS | Should | Each channel delivers, or degrades visibly when unconfigured | Partially met | In-app works; email/SMS depend on unset provider keys |
| FR-029 | B2B accounts and corporate rates | Should | A business account receives a corporate rate distinct from the consumer rate | Partially met | Flag and rate kind exist; no acquisition path or B2B UI |
| **FR-030** | **Supply liquidity: real sellers with real inventory** | **Must** | **At least N sellers have listed inventory, and one real order has completed** | **Not met** | **`prod:` 0 marketplace listings, 0 auction bids, 0 orders** |
| FR-031 | Motion design for UX polish ("flash animation") | Should | Entrances and state changes are animated, and respect `prefers-reduced-motion` | Partially met | `code:packages/web/tailwind.config.ts` — CSS animations exist; this was never pinned to a definition |
| FR-032 | Full ERP/HR/Finance back office | Won't | — | Not started | Deferred at plan time; a read-only ERP surface stands in |
| FR-033 | B2G procurement workflows | Won't | — | Not started | Deferred at plan time |
| FR-034 | Multi-currency and multi-language | Won't | — | Not started | Deferred at plan time; GBP only |

## Non-functional requirements

| ID | Requirement | Priority | Acceptance criterion | Verdict | Evidence |
| --- | --- | --- | --- | --- | --- |
| NFR-001 | WCAG 2.2 AA for colour and target size | Must | Every default interactive shade clears 4.5:1; no ramp is non-monotonic; no target under 24px | Met | `test:packages/web/lib/designAudit.test.ts` |
| NFR-002 | Agent calls are bounded, and no model output can spend beyond mandate or need | Must | Every agent call has a timeout and a deterministic fallback; no model output can bid past the mandate, nor pay more than the minimum needed to lead | Met | `test:packages/shared/src/proxyContest.test.ts` |
| NFR-003 | Money correctness: no negative balances, no double-apply | Must | Ledger writes run at Serializable with the assertion after the insert; idempotency is enforced by unique index, not by a check; a serialisation conflict is retried rather than shown to the user | Met | `test:packages/api/src/test/concurrency.itest.ts` |
| NFR-004 | No privilege escalation, IDOR or PII leak | Must | Self-registration cannot mint an ADMIN; booking reads are ownership-checked; seller emails are masked | Met | `code:packages/shared/src/schemas/auth.ts` `manual:` |
| NFR-005 | Availability target with alerting | Must | A stated SLO, monitored, alerting a human on breach | Not met | No SLO stated, no monitoring, no alerting. Outages are found by looking |
| NFR-006 | Latency budgets for pages and API | Should | Stated p95 targets, measured continuously | Not started | Never specified, never measured |
| NFR-007 | Correctness under concurrency | Must | Simultaneous orders and spends cannot oversell or double-spend, proven against a real Postgres | Met | `test:packages/api/src/test/concurrency.itest.ts` — 8 buyers / 1 unit, 10 concurrent spends, duplicate top-up |
| NFR-008 | Observability: structured logs and error tracking | Should | Errors are aggregated somewhere a human sees them | Partially met | Fastify logs to stdout; no aggregation or error tracker |
| NFR-009 | Backup and tested restore | Must | A restore has been performed and verified within the retention window | Not met | Managed Postgres snapshots are assumed; **no restore has ever been tested** |
| NFR-010 | Module boundaries enforced, not conventional | Should | A cross-module deep import fails the lint gate | Met | `test:eslint.config.mjs` |
| NFR-011 | Type legibility floor of 12px | Should | No text below 12px in app or component code | Met | `test:packages/web/lib/designAudit.test.ts` |
| NFR-012 | Verification claims distinguish tested from written | Must | Every area states whether it is tested, exercised or merely written | Met | `test:packages/shared/src/requirements.test.ts` |

## Compliance requirements

None of these were stated by the stakeholder. They are inferred from what the
platform actually does — hold customer money, issue transferable value, and let
autonomous agents commit users to spend. They are listed as `Must` because the
law does not care that they were never in the brief.

| ID | Requirement | Priority | Acceptance criterion | Verdict | Evidence |
| --- | --- | --- | --- | --- | --- |
| CR-001 | E-money / safeguarding assessment | Must | A written determination of whether custodial wallet balances plus transferable credits constitute stored value or e-money, with safeguarding if so | Not started | Wallet holds balances and credits transfer between users; no assessment exists |
| CR-002 | KYC / AML on user-to-user value transfer | Must | Identity verification and transfer limits before value moves between accounts | Not started | `transferCredits` moves value between users with no identity check and no cap |
| CR-003 | Consumer rights on auctions and cancellations | Must | Cancellation and cooling-off terms stated, and consistent with auction finality | Partially met | Free cancellation while unpaid is implemented and disclosed; auction finality has no stated terms |
| CR-004 | Autonomous agent mandate and liability | Must | Recorded consent per mandate, a stated binding rule, and a dispute path when an agent bids | Partially met | `autoSettle` is explicit opt-in and decisions are logged; no terms bind the outcome and no dispute route exists |
| CR-005 | GDPR: lawful basis, DSAR, erasure | Must | Marketing consent logged, and a working subject-access and deletion path | Partially met | Consent logging and unsubscribe exist; no DSAR or erasure path |
| CR-006 | PCI scope minimisation | Must | Card data never reaches our servers | Met | `prod:` live card payments completed through Stripe Elements; `code:packages/web/components/StripePaymentForm.tsx` — no PAN in our stack |

---

## Summary

<!-- COUNTS: asserted against the rows above by requirements.test.ts.
     The first version of this table was typed by hand and was wrong — 19 where
     the rows said 22. Exactly the defect the register exists to catch, committed
     inside the register itself. -->

| Family | Total | Met | Partially met | Not met | Not started |
| --- | --- | --- | --- | --- | --- |
| Functional | 34 | 22 | 7 | 2 | 3 |
| Non-functional | 12 | 8 | 1 | 2 | 1 |
| Compliance | 6 | 1 | 3 | 0 | 2 |
| **All** | **52** | **31** | **11** | **4** | **6** |

**The one that matters most is FR-030**, and it is `Not met`. Every other row
describes capability. That row describes whether anyone is using it.
