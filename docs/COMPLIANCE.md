# Compliance register

**None of this was requested.** It is inferred from what the platform actually
does, and it is the highest-severity gap in the project after liquidity — the one
class of requirement that can stop the business rather than slow it.

I am not a lawyer and this is not legal advice. It is an engineer's inventory of
which regulated activities the code performs, so that someone qualified can be
asked the right questions. Every item names the code that creates the exposure.

## What the platform does that attracts regulation

| Activity | Where | Why it matters |
|---|---|---|
| Holds customer money in a balance | `packages/api/src/modules/wallet` | Custodial funds, not payment pass-through |
| Issues hour-denominated credits for cash | `packages/api/src/modules/credits` | Stored value redeemable later |
| **Transfers credits between users** | `transferCredits` in `credits/service.ts` | Value moves person-to-person with no identity check |
| Autonomous agents commit users to spend | `packages/api/src/modules/auctions/agent.ts` | A machine forms a binding obligation |
| Binding auctions with a reserve | `packages/api/src/modules/auctions` | Distance-selling and auction consumer rules interact |
| Marketing sends to a contact list | `packages/api/src/modules/notifications` | Direct-marketing consent |

## CR-001 — Stored value / e-money determination · **Not started**

The wallet holds a cash balance the user has topped up but not spent, and time
credits are purchased for money and redeemed later for services. Credits are also
**transferable between accounts**. That combination looks materially different
from marketplace escrow, where funds pass through against a specific transaction.

The question for counsel: *do the wallet balance and the time-credit float
constitute stored value or e-money, and if so does safeguarding apply?* If the
answer is yes, funds must be segregated, and the current single-account model is
non-compliant regardless of how correct the ledger is.

The ledger is genuinely well built — append-only, no balance column, Serializable
writes. Accounting rigour is not the same as regulatory permission.

## CR-002 — KYC / AML on user-to-user transfer · **Controls implemented**

`transferCredits` used to move value between two accounts on the strength of an
email address: no identity verification, no transfer limit, no velocity check.
Person-to-person value transfer without those controls is the pattern regulators
look for first, and it was live.

Now enforced, in `packages/shared/src/transferPolicy.ts` and proven by
`packages/api/src/test/compliance.itest.ts`:

- transfers above **20h** require a `VERIFIED` sender (`PENDING` does not count —
  treating "we're looking at it" as cleared would make the control decorative)
- a rolling 24-hour cap of **50h** sent per account
- a rolling 24-hour cap of **10 transfers**, so structuring one large transfer
  into many small ones does not evade the first two
- the window is measured off the ledger's own `TRANSFER_OUT` rows, not a counter
  that could drift or be bypassed by another code path
- identity is checked *before* volume, so a refusal names the real blocker

**The thresholds are engineering defaults, not a determination.** Picking the real
numbers is a business and legal decision. What code could do is make the controls
exist, bound the exposure meanwhile, and put the numbers in one testable place
instead of nowhere. There is still no suspicious-activity reporting path.

## CR-003 — Consumer rights on auctions · **Partially met**

Implemented and disclosed: free cancellation while a booking is unpaid.

Missing: any stated terms for auction finality. A winning bid currently creates a
binding obligation with no cooling-off period and no stated cancellation rule.
Public auctions are often treated differently from ordinary distance selling, but
"often" is not a basis to ship on.

## CR-004 — Autonomous agent mandate and liability · **Partially met**

Genuinely good, and deliberate:

- `autoSettle` defaults to **off**; full autonomy is opt-in per bid, asserted by
  `test:packages/shared/src/auctions.test.ts`
- every agent decision is written to `AgentDecisionLog` with the input snapshot,
  prompt version, model and latency — a real audit trail
- no model output can bid past the mandate or pay more than the minimum needed,
  asserted by `test:packages/shared/src/proxyContest.test.ts`

Missing: terms that state the user is bound by their agent's bid, and a dispute
route when an agent bids in a way the user disputes. The audit trail means such a
dispute is *answerable* — but nothing says who wins it.

## CR-005 — GDPR · **Implemented**

Already in place: marketing consent logging, honoured unsubscribe, masked seller
handles instead of raw emails in public payloads.

Added, in `packages/api/src/modules/auth/privacy.ts`:

- `GET /auth/me/export` — everything held about the caller, as one JSON document,
  always scoped to their own id. It deliberately omits `passwordHash`: a
  subject-access request is a right to one's own data, not an instruction to hand a
  credential hash to whoever currently holds the session.
- `POST /auth/me/erase` — irreversible pseudonymisation. POST rather than DELETE
  because it cannot be undone and must not be reachable by a prefetch or a crawler.

Erasure is worth stating plainly, because it is a genuine architectural tension
rather than an oversight: **the ledgers are append-only by design.** A credit or
wallet entry is a financial record, and deleting one would break the invariant that
a balance equals the sum of its entries — the property every money test here relies
on, and the one that makes double-spends detectable.

So erasure pseudonymises the *person* and retains the *transactions*: email
replaced with a `@erased.invalid` address, phone cleared, password made unusable,
message bodies and review comments cleared, notifications deleted, ledger rows kept
against an id that no longer identifies anyone. It refuses while a booking or order
is still `PENDING_PAYMENT`, so erasing mid-transaction cannot strand a
counterparty.

Still missing: a stated lawful basis per processing purpose. That is a drafting
task, and the pseudonymisation approach should be confirmed by someone qualified.

## CR-006 — PCI scope · **Met**

Card data never reaches our servers. Stripe Elements collects it in an iframe on
Stripe's origin; we handle a client secret and a PaymentIntent id. Live payments
have run through this path.

## Ranking, by what stops the business first

1. **CR-001 (e-money)** — determines whether the wallet is lawful at all, and
   cannot be fixed later without re-architecting fund custody. **This is now the
   only compliance item that no amount of engineering can close.** It needs a
   written determination from someone qualified.
2. **CR-004 (agent liability)** — exposure scales with autonomous usage, which is
   currently zero. Time to fix it, and the audit trail is already there.
3. **CR-003 (auction terms)** — a drafting task, not an engineering one.
4. **CR-002 (KYC/AML)** — controls now enforced and tested. What remains is
   confirming the thresholds and adding a suspicious-activity path.
5. **CR-005 (GDPR)** — export and erasure implemented. What remains is a stated
   lawful basis per purpose.

Nothing here is a reason not to keep building. It is a reason not to take a real
customer's money until CR-001 has an answer.
