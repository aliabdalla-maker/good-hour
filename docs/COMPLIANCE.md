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

## CR-002 — KYC / AML on user-to-user transfer · **Not started**

`transferCredits(fromUserId, { toEmail, category, hours })` moves value between
two accounts on the strength of an email address. There is no identity
verification, no transfer limit, no velocity check, and no suspicious-activity
path. Person-to-person value transfer without those controls is the pattern
regulators look for first.

**Cheapest meaningful mitigation, ahead of any legal answer:** a per-account
daily transfer cap and a hard block above a threshold pending verification. That
is a small change to one function, and it bounds the exposure while the question
is being answered. It is not implemented — flagging rather than shipping it,
because picking the threshold is a business and legal decision, not mine.

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

## CR-005 — GDPR · **Partially met**

Implemented: marketing consent logging, honoured unsubscribe, masked seller
handles instead of raw emails in public payloads.

Missing: a stated lawful basis per processing purpose, a subject-access path, and
an erasure path. Erasure is the hard one and worth stating plainly: **the ledgers
are append-only by design.** Right-to-erasure against an immutable financial
ledger is a genuine architectural tension, not an oversight — it usually resolves
as pseudonymisation of the person while retaining the transaction. Nothing
implements that today.

## CR-006 — PCI scope · **Met**

Card data never reaches our servers. Stripe Elements collects it in an iframe on
Stripe's origin; we handle a client secret and a PaymentIntent id. Live payments
have run through this path.

## Ranking, by what stops the business first

1. **CR-002 (KYC/AML)** — the control gap is live right now, in a function anyone
   with two accounts can call. Cheapest to bound, worst to be caught on.
2. **CR-001 (e-money)** — determines whether the wallet is lawful at all. Cannot
   be fixed later without re-architecting fund custody.
3. **CR-005 (GDPR erasure)** — architectural tension with append-only ledgers;
   the longer the ledger grows, the more expensive the resolution.
4. **CR-004 (agent liability)** — exposure scales with autonomous usage, which is
   currently zero. Time to fix it, and the audit trail is already there.
5. **CR-003 (auction terms)** — a drafting task, not an engineering one.

Nothing here is a reason not to keep building. It is a reason not to take a real
customer's money until items 1 and 2 have an answer.
