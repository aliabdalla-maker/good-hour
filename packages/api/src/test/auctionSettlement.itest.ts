import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@gihtcx/db";
import { computeTradeFee } from "@gihtcx/shared";
import { closeAuction, placeBid, settleAuction } from "../modules/auctions";
import { getMoneyBalance } from "../modules/wallet";
import {
  disconnect,
  fundWallet,
  makeAuction,
  makeUser,
  newFixture,
  teardown,
  type Fixture,
} from "./harness";

/**
 * Auction close and settlement — FR-013, FR-015.
 *
 * This was the largest money path in the codebase with no test of any kind. It is
 * unreachable from a unit test for the same reason the proxy contest was: the
 * decisions are interleaved with Prisma transactions, and the guarantees that
 * matter are transactional — a winner is marked WON in the same transaction that
 * marks everyone else LOST, and settlement moves two ledger entries or neither.
 *
 * Bids here deliberately carry no `maxPerHour`, so no proxy mandates exist and
 * `runAgentResponses` returns before reaching the model. These tests are therefore
 * offline and deterministic; the agent's own decision logic is covered by
 * proxyContest.test.ts.
 *
 * Run with: npm run test:integration
 */

const fixtures: Fixture[] = [];
after(async () => {
  for (const f of fixtures) await teardown(f);
  await disconnect();
  setTimeout(() => process.exit(process.exitCode ?? 0), 250);
});

function track(): Fixture {
  const f = newFixture();
  fixtures.push(f);
  return f;
}

/**
 * `autoSettle` is required on the parsed input (the Zod default applies at the
 * route boundary, not here), and it must stay explicit: defaulting it to true
 * anywhere would hand full autonomy to bidders who never asked for it.
 */
function bid(amountPerHour: number, autoSettle = false) {
  return { amountPerHour, autoSettle };
}

async function auctionRow(id: string) {
  return prisma.marketplaceAuction.findUniqueOrThrow({ where: { id } });
}

async function bidStatuses(auctionId: string) {
  const bids = await prisma.auctionBid.findMany({
    where: { auctionId },
    select: { amountPerHour: true, status: true },
    orderBy: { amountPerHour: "asc" },
  });
  return bids.map((b) => `${Number(b.amountPerHour)}:${b.status}`);
}

test("a FORWARD auction closes to the highest bid and marks every other bid LOST", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { kind: "FORWARD", hours: 2, reservePerHour: 50 });

  const low = await makeUser(f);
  const mid = await makeUser(f);
  const high = await makeUser(f);
  await placeBid(low, auctionId, bid(50));
  await placeBid(mid, auctionId, bid(55));
  await placeBid(high, auctionId, bid(62));

  await closeAuction(auctionId);

  const auction = await auctionRow(auctionId);
  assert.equal(auction.status, "CLOSED");
  assert.ok(auction.winningBidId, "no winning bid recorded");

  const winner = await prisma.auctionBid.findUniqueOrThrow({ where: { id: auction.winningBidId } });
  assert.equal(winner.bidderId, high, "the highest bid did not win");
  assert.equal(Number(winner.amountPerHour), 62);
  // Exactly one WON, and no bid left dangling in ACTIVE.
  assert.deepEqual(await bidStatuses(auctionId), ["50:LOST", "55:LOST", "62:WON"]);
});

test("a bid below reserve cannot be placed at all, so the reserve holds", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { kind: "FORWARD", reservePerHour: 50 });
  const bidder = await makeUser(f);

  // Asserting the number, not my guess at the wording: the rejection must name
  // the reserve it is enforcing, so a silently-lowered reserve fails here too.
  await assert.rejects(() => placeBid(bidder, auctionId, bid(40)), /at least 50/i);
  assert.equal(await prisma.auctionBid.count({ where: { auctionId } }), 0);
  assert.equal((await auctionRow(auctionId)).status, "OPEN");
});

test("an auction that attracts no bids closes UNMET, not CLOSED", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { kind: "FORWARD", reservePerHour: 50 });

  await closeAuction(auctionId);

  const auction = await auctionRow(auctionId);
  assert.equal(auction.status, "UNMET");
  assert.equal(auction.winningBidId, null);
});

test("closeAuction is idempotent — a retried job cannot re-close or re-settle", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { kind: "FORWARD", reservePerHour: 50 });
  const bidder = await makeUser(f);
  await placeBid(bidder, auctionId, bid(55));

  await closeAuction(auctionId);
  const first = await auctionRow(auctionId);

  // BullMQ retries. The second and third calls must be no-ops.
  await closeAuction(auctionId);
  await closeAuction(auctionId);
  const after = await auctionRow(auctionId);

  assert.equal(after.status, first.status);
  assert.equal(after.winningBidId, first.winningBidId);
  assert.equal(await prisma.auctionBid.count({ where: { auctionId, status: "WON" } }), 1);
});

test("settling a FORWARD auction moves exactly the advertised money", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { kind: "FORWARD", hours: 2, reservePerHour: 50 });
  const buyer = await makeUser(f);

  await placeBid(buyer, auctionId, bid(60));
  await closeAuction(auctionId);

  // 2 hours × £60 = £120 subtotal; the fee split is the same one every trade uses.
  const fee = computeTradeFee(120);
  await fundWallet(buyer, fee.buyerTotal);

  await settleAuction(auctionId, buyer);

  assert.equal((await auctionRow(auctionId)).status, "SETTLED");
  assert.equal(await getMoneyBalance(buyer), 0, "buyer was not charged exactly the buyer total");
  assert.equal(
    await getMoneyBalance(seller),
    fee.sellerProceeds,
    "seller did not receive proceeds net of the seller fee"
  );

  // Both halves of the movement must share one correlationId, or a reversal
  // cannot find its counterpart.
  const entries = await prisma.walletLedgerEntry.findMany({
    where: { userId: { in: [buyer, seller] }, kind: { in: ["PURCHASE", "SALE_PROCEEDS"] } },
    select: { correlationId: true },
  });
  assert.equal(entries.length, 2);
  assert.ok(entries[0]!.correlationId);
  assert.equal(entries[0]!.correlationId, entries[1]!.correlationId);
});

test("a REVERSE auction settles with the creator as buyer and the bidder as seller", async () => {
  const f = track();
  // In a reverse auction the creator is buying: they post what they need and
  // sellers bid the price down. Getting this backwards would pay the wrong party.
  const buyer = await makeUser(f);
  const auctionId = await makeAuction(f, buyer, { kind: "REVERSE", hours: 3, reservePerHour: 90 });
  const seller = await makeUser(f, "SUPPLIER");

  await placeBid(seller, auctionId, bid(80));
  await closeAuction(auctionId);

  const fee = computeTradeFee(240); // 3h × £80
  await fundWallet(buyer, fee.buyerTotal);
  await settleAuction(auctionId, buyer);

  assert.equal((await auctionRow(auctionId)).status, "SETTLED");
  assert.equal(await getMoneyBalance(buyer), 0);
  assert.equal(await getMoneyBalance(seller), fee.sellerProceeds);
});

test("settlement is refused when the buyer cannot pay, and the auction stays CLOSED", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { kind: "FORWARD", hours: 2, reservePerHour: 50 });
  const buyer = await makeUser(f);
  await placeBid(buyer, auctionId, bid(60));
  await closeAuction(auctionId);

  await assert.rejects(() => settleAuction(auctionId, buyer), /top up|wallet holds/i);

  // Settleable later, once funded — the auction must not be left in a dead state.
  assert.equal((await auctionRow(auctionId)).status, "CLOSED");
  assert.equal(await getMoneyBalance(seller), 0, "seller was paid without the buyer paying");
});

test("a broke auto-settle winner does not throw out of closeAuction", async () => {
  const f = track();
  // This is the BullMQ retry-loop bug: an unaffordable auto-settle threw out of
  // the close job, so the job retried, re-closed, threw again, indefinitely.
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { kind: "FORWARD", hours: 2, reservePerHour: 50 });
  const buyer = await makeUser(f);
  await placeBid(buyer, auctionId, bid(60, true));

  // Must resolve, not reject, even though the winner cannot pay.
  await closeAuction(auctionId);

  assert.equal((await auctionRow(auctionId)).status, "CLOSED");
  assert.equal(await getMoneyBalance(seller), 0);
});

test("a funded auto-settle winner settles without a human touching it", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { kind: "FORWARD", hours: 2, reservePerHour: 50 });
  const buyer = await makeUser(f);

  const fee = computeTradeFee(120);
  await fundWallet(buyer, fee.buyerTotal);
  await placeBid(buyer, auctionId, bid(60, true));

  await closeAuction(auctionId);

  // Full autonomy: chosen explicitly per bid, and it really does move money.
  assert.equal((await auctionRow(auctionId)).status, "SETTLED");
  assert.equal(await getMoneyBalance(seller), fee.sellerProceeds);
});

test("only the buyer may settle, and settling twice moves money once", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { kind: "FORWARD", hours: 2, reservePerHour: 50 });
  const buyer = await makeUser(f);
  const stranger = await makeUser(f);

  await placeBid(buyer, auctionId, bid(60));
  await closeAuction(auctionId);
  const fee = computeTradeFee(120);
  await fundWallet(buyer, fee.buyerTotal);

  await assert.rejects(() => settleAuction(auctionId, stranger), /Only the buyer/i);

  await settleAuction(auctionId, buyer);
  // Idempotent: a double-clicked button must not pay the seller twice.
  await settleAuction(auctionId, buyer);

  assert.equal(await getMoneyBalance(seller), fee.sellerProceeds);
  assert.equal(await getMoneyBalance(buyer), 0);
});

test("an auction cannot be settled before it closes", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { kind: "FORWARD", reservePerHour: 50 });
  const buyer = await makeUser(f);
  await placeBid(buyer, auctionId, bid(60));
  await fundWallet(buyer, 1000);

  await assert.rejects(() => settleAuction(auctionId, buyer), /isn't ready to settle/i);
  assert.equal(await getMoneyBalance(seller), 0);
});

test("a creator cannot bid on their own auction", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { kind: "FORWARD", reservePerHour: 50 });

  await assert.rejects(() => placeBid(seller, auctionId, bid(60)), /your own auction/i);
});
