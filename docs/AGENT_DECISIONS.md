# Agent Decisions

Every agent call writes exactly one `AgentDecisionLog` row (`packages/api/src/modules/agent-log`). This is enforced structurally: each agent module exposes exactly one function that calls the model, and all of them log — on success *and* on fallback.

**Provider note:** the SDK is the OpenAI client, but it points at **Groq** via `OPENAI_BASE_URL=https://api.groq.com/openai/v1`, model `openai/gpt-oss-120b`. The original OpenAI account is out of quota. `llama-3.3-70b-versatile` was tried and **fails** on the assistant's multi-tool prompt (`400 Failed to call a function`) despite passing simpler single-tool tests — re-test against the real payloads before switching models.

## Pricing agent (`pricing-agent.v1`, `packages/api/src/modules/pricing-agent`)

- Input built by `signals.ts#buildPricingInputForRoom` from live occupancy/demand/time-context data.
- Model called with a forced tool call (`recommend_rate`); output validated against `pricingDecisionSchema` (`@gihtcx/shared`).
- `recommendedHourlyRate` is clamped to `constraints.minRate/maxRate` server-side regardless of what the model returned — the model is told the bounds but never trusted to respect them unchecked.
- On timeout (default 3s) or any error (including no `OPENAI_API_KEY` configured), falls back to the static base rate and logs `modelUsed: "fallback-static-rate"` so fallback vs. real-model decisions are distinguishable in the log.
- A repeatable BullMQ job (`pricing-refresh`, every 30 min per room, scheduled when the room is created) keeps a cached `RoomRateRule(kind: AI_DYNAMIC)` fresh so the synchronous room-detail/search path isn't always waiting on a live LLM call.

## Negotiation agent (`negotiation-agent.v1`, `packages/api/src/modules/negotiation-agent`)

- Triggered by the `offer-evaluation` BullMQ job whenever a `SupplierOffer` is submitted (human or auto-submitted).
- Input: the `BookingRequest` plus every non-terminal offer against it (rate, amenities, distance*, supplier rating, completed-booking count). *`roomDistanceKm` is always `null` (no geocoding yet) — see `docs/ARCHITECTURE.md`. `supplierRatingAvg` is real, computed from the `Review` model.
- Output validated against `matchDecisionSchema`; `sanitizeDecision` (in `service.ts`) discards any `recommendedOfferId`/`rankedOfferIds` entries that don't correspond to a real submitted offer, and backfills any missing offer into the ranking — defense against the model inventing or dropping an ID.
- On timeout (default 8s) or error, falls back to ranking by lowest total price and logs `modelUsed: "fallback-lowest-price"`.
- Does **not** auto-accept by default — it marks the top pick `RECOMMENDED` and a human clicks accept, *unless* the traveller opted into `autoAcceptEnabled` (A2B), in which case `maybeAutoAccept` accepts automatically if the total is within `maxBudget`.

## Exchange agent (`exchange-v1`, `packages/api/src/modules/credits/exchangeAgent.ts`)

Quotes how many hours of one listing category a number of hours of another is
worth, for the time-credit wallet.

- **The rate is anchored on real money, not on the model.** `getMarketRates()`
  averages `baseHourlyRate` across ACTIVE rooms per category; the base rate is
  `fromAvg / toAvg`. An hour of a £40/hr suite is therefore worth more than an
  hour of a £10/hr van regardless of what the model says.
- The model is given those signals and returns only an `adjustmentFactor`,
  **clamped server-side to ±25%** (`MAX_ADJUSTMENT`). The clamp is not advisory:
  an unclamped hallucination would destroy real value in a user's wallet.
- Timeout is 4s. On timeout, error, or no key it returns the pure market rate
  and logs `modelUsed: "fallback-market-rate"`, with `confidence: "low"`.
- If either category has **no active inventory**, it refuses to quote
  (`hoursOut: 0`, `quotedBy: "unavailable"`) rather than defaulting to 1:1 —
  a par swap between unpriced categories would hand someone a windfall or rob
  them.
- The 1% commission is taken in hours of the destination category
  (`feeHours`). The exchange itself re-fetches the quote server-side rather
  than trusting one supplied by the client, so a stale or hand-edited
  favourable rate can't be replayed.
- Has no `outcomeAccepted` signal (an exchange is either done or not), so that
  column stays `null` for EXCHANGE rows — unlike PRICING/NEGOTIATION.

## Reading the audit trail

`AgentDecisionLog.outcomeAccepted` is `null` until a human (or auto-accept agent) acts on the recommendation, then flipped to `true`/`false`. Query `AgentDecisionLog` by `agentType` + `subjectId` (`Room.id` or `BookingRequest.id`) to see the full history of what the agent recommended, why (`reasoning`), and what actually happened.
