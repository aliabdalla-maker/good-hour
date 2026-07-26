# Agent Decisions

Every call to either AI agent writes exactly one `AgentDecisionLog` row (`packages/api/src/modules/agent-log`). This is enforced structurally: `pricing-agent` and `negotiation-agent` each expose exactly one function that calls OpenAI (`recommendRate`, `evaluateOffers`), and both always log — on success and on fallback.

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

## Reading the audit trail

`AgentDecisionLog.outcomeAccepted` is `null` until a human (or auto-accept agent) acts on the recommendation, then flipped to `true`/`false`. Query `AgentDecisionLog` by `agentType` + `subjectId` (`Room.id` or `BookingRequest.id`) to see the full history of what the agent recommended, why (`reasoning`), and what actually happened.
