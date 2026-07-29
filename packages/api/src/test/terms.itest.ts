import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@gihtcx/db";
import {
  AGENT_MANDATE_CHANNEL,
  AGENT_MANDATE_TERMS,
  AGENT_MANDATE_TERMS_VERSION,
  AUCTION_TERMS,
  AUCTION_TERMS_CHANNEL,
  AUCTION_TERMS_VERSION,
  LOGGED_ONLY_REF,
} from "@gihtcx/shared";
import { closeAuction, placeBid } from "../modules/auctions";
import { raiseAuctionDispute, termsAcceptance } from "../modules/auctions/compliance";
import { createListing, placeOrder, settleOrder } from "../modules/marketplace";
import { createDirectBooking } from "../modules/booking";
import { notify } from "../modules/notifications";
import {
  disconnect,
  fundWallet,
  makeAuction,
  makeRoomWithSlots,
  makeUser,
  newFixture,
  teardown,
  type Fixture,
} from "./harness";

/**
 * Terms, disputes, seller-side listing, corporate rate and channel degradation —
 * CR-003, CR-004, FR-008, FR-028, FR-029.
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

const bid = (amountPerHour: number, extra: Record<string, unknown> = {}) => ({
  amountPerHour,
  autoSettle: false,
  ...extra,
});

test("CR-003: placing a bid records acceptance of the versioned auction terms", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { reservePerHour: 50 });
  const bidder = await makeUser(f);

  await placeBid(bidder, auctionId, bid(55));

  const accepted = await termsAcceptance(bidder);
  assert.ok(accepted.auctionTerms, "no auction-terms acceptance recorded");
  // The VERSION is the point. "Agreed to whatever it said that day" is worthless in
  // exactly the dispute this record exists to settle.
  assert.equal(accepted.auctionTerms.version, AUCTION_TERMS_VERSION);
  // A plain bid is not a mandate, so it must not record mandate consent.
  assert.equal(accepted.agentMandate, null);
});

test("CR-004: a bid carrying a proxy ceiling records mandate consent as well", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { reservePerHour: 50 });
  const bidder = await makeUser(f);

  // A ceiling authorises something a bare bid does not: spending on the user's
  // behalf while they are not watching.
  await placeBid(bidder, auctionId, bid(55, { maxPerHour: 70 }));

  const accepted = await termsAcceptance(bidder);
  assert.equal(accepted.auctionTerms?.version, AUCTION_TERMS_VERSION);
  assert.equal(accepted.agentMandate?.version, AGENT_MANDATE_TERMS_VERSION);
});

test("CR-003: a rejected bid leaves no acceptance behind", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { reservePerHour: 50 });
  const bidder = await makeUser(f);

  // Below reserve — refused. Terms that never bound anything must not be on record
  // as accepted.
  await assert.rejects(() => placeBid(bidder, auctionId, bid(10)));
  const rows = await prisma.consentEvent.count({
    where: { userId: bidder, channel: { in: [AUCTION_TERMS_CHANNEL, AGENT_MANDATE_CHANNEL] } },
  });
  assert.equal(rows, 0);
});

test("CR-003/CR-004: the terms documents are versioned and say the binding things", () => {
  for (const doc of [AUCTION_TERMS, AGENT_MANDATE_TERMS]) {
    assert.match(doc.version, /^\S+-\d{4}-\d{2}$/, `${doc.title} has no dated version`);
    assert.ok(doc.summary.length > 40, `${doc.title} has no readable summary`);
    assert.ok(doc.clauses.length >= 5, `${doc.title} has too few clauses to be useful`);
  }
  // The two claims that make the platform's obligations legible at all.
  assert.match(AUCTION_TERMS.clauses.join(" "), /binding offer/i);
  assert.match(AGENT_MANDATE_TERMS.clauses.join(" "), /bind you/i);
  // And the dispute route both documents promise must be described.
  assert.match(AUCTION_TERMS.clauses.join(" "), /dispute/i);
  assert.match(AGENT_MANDATE_TERMS.clauses.join(" "), /dispute/i);
});

test("CR-004: a participant can dispute a closed auction and gets a receipt", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { reservePerHour: 50 });
  const bidder = await makeUser(f);
  await placeBid(bidder, auctionId, bid(60));
  await closeAuction(auctionId);

  const dispute = await raiseAuctionDispute(bidder, {
    auctionId,
    reason: "AGENT_EXCEEDED_MANDATE",
    detail: "My agent bid above the ceiling I set for this auction.",
  });

  assert.ok(dispute.disputeId);
  assert.equal(dispute.reason, "AGENT_EXCEEDED_MANDATE");

  // Durable on the operator's queue, attributed to the person who raised it.
  const note = await prisma.crmNote.findUniqueOrThrow({ where: { id: dispute.disputeId } });
  assert.equal(note.authorId, bidder);
  assert.match(note.body, /AGENT_EXCEEDED_MANDATE/);
  assert.match(note.body, new RegExp(auctionId));

  // And a receipt, so the user knows it landed rather than hoping.
  const receipt = await prisma.notification.findFirstOrThrow({
    where: { userId: bidder, type: "dispute.raised" },
  });
  assert.match(receipt.body, /recorded bid history/i);
});

test("CR-004: only a participant may dispute, and not while the auction is open", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const auctionId = await makeAuction(f, seller, { reservePerHour: 50 });
  const bidder = await makeUser(f);
  const stranger = await makeUser(f);
  await placeBid(bidder, auctionId, bid(60));

  // Open: nothing to dispute yet.
  await assert.rejects(
    () => raiseAuctionDispute(bidder, { auctionId, reason: "OTHER", detail: "x".repeat(25) }),
    /still open/i
  );

  await closeAuction(auctionId);

  // Otherwise the dispute queue is an unauthenticated channel into the operator's inbox.
  await assert.rejects(
    () => raiseAuctionDispute(stranger, { auctionId, reason: "OTHER", detail: "x".repeat(25) }),
    /took part/i
  );
});

test("FR-008: a seller lists through the real path and a buyer's order settles", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  // The half of FR-008 that was never covered: the listing is created through
  // createListing, not inserted by the fixture.
  const listing = await createListing(seller, {
    kind: "PRODUCT",
    title: `itest seller-listed ${f.suffix}`,
    description: "Listed through the real service path for FR-008.",
    category: "itest",
    price: 20,
    pricingUnit: "FIXED",
    stock: 2,
  });
  f.listingIds.push(listing.id);

  const buyer = await makeUser(f);
  await fundWallet(buyer, 100);

  const order = await placeOrder(buyer, {
    listingId: listing.id,
    quantity: 1,
    paymentMethod: "WALLET",
  });
  await settleOrder(order.id);

  const settled = await prisma.marketplaceOrder.findUniqueOrThrow({ where: { id: order.id } });
  assert.equal(settled.status, "PAID");
  // 10% + 10% on a £20 line.
  assert.equal(Number(settled.buyerTotal), 22);
  assert.equal(Number(settled.sellerProceeds), 18);
  // Stock decremented exactly once.
  const after = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listing.id } });
  assert.equal(after.stock, 1);
});

test("FR-029: the corporate rate follows the account, not the request", async () => {
  const f = track();
  const supplier = await makeUser(f, "SUPPLIER");
  const consumer = await makeUser(f);
  const business = await makeUser(f);
  await prisma.user.update({ where: { id: business }, data: { isBusinessAccount: true } });

  // Self-contained inventory: a test that depends on whatever the seed left behind
  // passes or fails on the database's state rather than on the code.
  const startsAt = new Date(Date.now() + 3 * 60 * 60 * 1000);
  startsAt.setMinutes(0, 0, 0);
  const roomId = await makeRoomWithSlots(f, supplier, { startsAt, hours: 6, hourlyRate: 40 });

  const window = {
    roomId,
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 2 * 3_600_000).toISOString(),
    useAiSuggestedRate: false,
    redeemCreditHours: 0,
  };

  // A consumer ASKING for the corporate rate must not get it. Before this was
  // derived server-side, isCorporateRate was a client-supplied boolean and any
  // traveller could claim a business rate they were not entitled to.
  const { booking: asConsumer } = await createDirectBooking(consumer, {
    ...window,
    isCorporateRate: true,
  });
  assert.equal(asConsumer.isCorporateRate, false, "a consumer claimed the corporate rate");

  // And a business account gets it without asking, because entitlement is a
  // property of the account.
  const later = new Date(startsAt.getTime() + 2 * 3_600_000);
  const { booking: asBusiness } = await createDirectBooking(business, {
    ...window,
    startsAt: later.toISOString(),
    endsAt: new Date(later.getTime() + 2 * 3_600_000).toISOString(),
    isCorporateRate: false,
  });
  assert.equal(asBusiness.isCorporateRate, true, "a business account did not get the corporate rate");
});

test("FR-028: an unconfigured channel records that it only logged, not that it sent", async () => {
  const f = track();
  const user = await makeUser(f);

  await notify({
    userId: user,
    type: "itest.degradation",
    subject: "itest",
    body: "Checking that degradation is visible in the record.",
    channels: ["IN_APP", "EMAIL"],
  });

  const email = await prisma.notification.findFirstOrThrow({
    where: { userId: user, channel: "EMAIL" },
  });
  // With no RESEND_API_KEY the message was console-logged. The row used to say SENT
  // with no provider reference, which reads identically to a real delivery.
  assert.equal(email.providerRef, LOGGED_ONLY_REF);

  // In-app delivery is real regardless of provider configuration.
  const inApp = await prisma.notification.findFirstOrThrow({
    where: { userId: user, channel: "IN_APP" },
  });
  assert.equal(inApp.status, "SENT");
  assert.equal(inApp.providerRef, null);
});
