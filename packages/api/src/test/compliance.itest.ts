import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@gihtcx/db";
import {
  TRANSFER_DAILY_COUNT_LIMIT,
  TRANSFER_DAILY_LIMIT_HOURS,
  TRANSFER_VERIFICATION_THRESHOLD_HOURS,
} from "@gihtcx/shared";
import { transferCredits } from "../modules/credits";
import { ERASED_CRM_TAG, eraseUserAccount, exportUserData } from "../modules/auth";
import { disconnect, makeUser, newFixture, teardown, type Fixture } from "./harness";

/**
 * Compliance controls — CR-002 (transfer limits) and CR-005 (subject access,
 * erasure).
 *
 * The policy arithmetic is unit-tested in transferPolicy.test.ts; what needs a real
 * database is the *wiring*: that the service reads the sender's verification state
 * and measures the window off the ledger's own TRANSFER_OUT rows. A correct policy
 * wired to the wrong source is indistinguishable from no policy at all.
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

/** Credits a bucket directly — the grant path needs Stripe, which tests avoid. */
async function grantHours(userId: string, hours: number) {
  await prisma.creditLedgerEntry.create({
    data: {
      userId,
      category: "ROOM",
      hours,
      kind: "PURCHASE",
      unitValue: 30,
      currency: "GBP",
      note: "itest grant",
    },
  });
}

async function emailOf(userId: string) {
  return (await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true } }))
    .email;
}

async function setVerification(
  userId: string,
  status: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED"
) {
  await prisma.user.update({ where: { id: userId }, data: { verificationStatus: status } });
}

test("CR-002: an unverified sender cannot transfer above the threshold", async () => {
  const f = track();
  const sender = await makeUser(f);
  const recipient = await makeUser(f);
  await grantHours(sender, 200);
  await setVerification(sender, "UNVERIFIED");

  const over = TRANSFER_VERIFICATION_THRESHOLD_HOURS + 1;
  const to = await emailOf(recipient);
  await assert.rejects(
    () => transferCredits(sender, { toEmail: to, category: "ROOM", hours: over }),
    /verified account/i
  );

  // Nothing moved: the refusal happens before any ledger write.
  assert.equal(await prisma.creditLedgerEntry.count({ where: { userId: recipient } }), 0);
});

test("CR-002: PENDING verification is not VERIFIED", async () => {
  const f = track();
  const sender = await makeUser(f);
  const recipient = await makeUser(f);
  await grantHours(sender, 200);
  // "We're looking at it" must not clear the gate, or the control is decorative.
  await setVerification(sender, "PENDING");

  const to = await emailOf(recipient);
  await assert.rejects(
    () =>
      transferCredits(sender, {
        toEmail: to,
        category: "ROOM",
        hours: TRANSFER_VERIFICATION_THRESHOLD_HOURS + 1,
      }),
    /verified account/i
  );
});

test("CR-002: a verified sender clears the threshold and the credits move", async () => {
  const f = track();
  const sender = await makeUser(f);
  const recipient = await makeUser(f);
  await grantHours(sender, 200);
  await setVerification(sender, "VERIFIED");

  const hours = TRANSFER_VERIFICATION_THRESHOLD_HOURS + 1;
  await transferCredits(sender, { toEmail: await emailOf(recipient), category: "ROOM", hours });

  const received = await prisma.creditLedgerEntry.findFirstOrThrow({
    where: { userId: recipient, kind: "TRANSFER_IN" },
  });
  assert.equal(Number(received.hours), hours);
});

test("CR-002: the daily hour cap is measured off the ledger, not a counter", async () => {
  const f = track();
  const sender = await makeUser(f);
  const recipient = await makeUser(f);
  await grantHours(sender, 500);
  await setVerification(sender, "VERIFIED");
  const to = await emailOf(recipient);

  // Send right up to the cap in legal-sized chunks.
  const chunk = TRANSFER_DAILY_LIMIT_HOURS / 5;
  for (let i = 0; i < 5; i += 1) {
    await transferCredits(sender, { toEmail: to, category: "ROOM", hours: chunk });
  }

  // One more quarter-hour must be refused, and must name the limit.
  await assert.rejects(
    () => transferCredits(sender, { toEmail: to, category: "ROOM", hours: 0.25 }),
    /24 hours/i
  );

  const sent = await prisma.creditLedgerEntry.aggregate({
    where: { userId: sender, kind: "TRANSFER_OUT" },
    _sum: { hours: true },
  });
  assert.equal(Math.abs(Number(sent._sum.hours)), TRANSFER_DAILY_LIMIT_HOURS);
});

test("CR-002: structuring into many tiny sends hits the count cap", async () => {
  const f = track();
  const sender = await makeUser(f);
  const recipient = await makeUser(f);
  await grantHours(sender, 500);
  await setVerification(sender, "VERIFIED");
  const to = await emailOf(recipient);

  // Well under the hour cap, but splitting a transfer to evade scrutiny is the
  // behaviour the count limit exists to catch.
  for (let i = 0; i < TRANSFER_DAILY_COUNT_LIMIT; i += 1) {
    await transferCredits(sender, { toEmail: to, category: "ROOM", hours: 0.25 });
  }
  await assert.rejects(
    () => transferCredits(sender, { toEmail: to, category: "ROOM", hours: 0.25 }),
    /limit of \d+ transfers/i
  );
});

test("CR-002: transfers older than the window stop counting against the cap", async () => {
  const f = track();
  const sender = await makeUser(f);
  const recipient = await makeUser(f);
  await grantHours(sender, 500);
  await setVerification(sender, "VERIFIED");

  // A 25-hour-old TRANSFER_OUT at the full cap. A limit that never forgets would
  // ban the account permanently after one busy day.
  await prisma.creditLedgerEntry.create({
    data: {
      userId: sender,
      category: "ROOM",
      hours: -TRANSFER_DAILY_LIMIT_HOURS,
      kind: "TRANSFER_OUT",
      unitValue: 30,
      currency: "GBP",
      note: "itest stale transfer",
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
    },
  });

  await transferCredits(sender, {
    toEmail: await emailOf(recipient),
    category: "ROOM",
    hours: 1,
  });
  assert.equal(await prisma.creditLedgerEntry.count({ where: { userId: recipient } }), 1);
});

test("CR-005: an export contains the user's own records and never their password hash", async () => {
  const f = track();
  const user = await makeUser(f);
  await grantHours(user, 3);

  const data = await exportUserData(user);

  assert.equal((data.account as { id: string }).id, user);
  assert.equal(data.creditLedger.length, 1);
  assert.ok(data.exportedAt);
  // A subject-access request is a right to one's own data, not an instruction to
  // hand a credential hash to whoever holds the session.
  assert.doesNotMatch(JSON.stringify(data), /passwordHash/);
});

test("CR-005: erasure pseudonymises the person and keeps the financial record", async () => {
  const f = track();
  const user = await makeUser(f);
  await grantHours(user, 4);
  await prisma.user.update({ where: { id: user }, data: { phone: "+447700900000" } });

  const result = await eraseUserAccount(user);
  assert.equal(result.retained.creditLedgerEntries, 1);

  const after = await prisma.user.findUniqueOrThrow({ where: { id: user } });
  assert.match(after.email, /@erased\.invalid$/);
  assert.equal(after.phone, null);
  assert.equal(after.marketingOptIn, false);
  assert.deepEqual(after.crmTags, [ERASED_CRM_TAG]);
  // Not a valid hash for any password, so the account cannot be logged into.
  assert.equal(after.passwordHash, "erased");

  // The ledger survives: a balance is the sum of its entries, and deleting one
  // would break the invariant every money test depends on.
  assert.equal(await prisma.creditLedgerEntry.count({ where: { userId: user } }), 1);
});

test("CR-005: erasure is refused while an obligation is outstanding, and is not repeatable", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const buyer = await makeUser(f);
  const listing = await prisma.marketplaceListing.create({
    data: {
      sellerId: seller,
      kind: "PRODUCT",
      title: `itest obligation ${f.suffix}`,
      description: "Integration-test listing.",
      category: "itest",
      price: 10,
      pricingUnit: "FIXED",
      stock: 5,
      status: "ACTIVE",
    },
  });
  f.listingIds.push(listing.id);
  await prisma.marketplaceOrder.create({
    data: {
      listingId: listing.id,
      buyerId: buyer,
      sellerId: seller,
      quantity: 1,
      unitPrice: 10,
      subtotal: 10,
      buyerFee: 1,
      sellerFee: 1,
      platformFee: 2,
      buyerTotal: 11,
      sellerProceeds: 9,
      status: "PENDING_PAYMENT",
    },
  });

  await assert.rejects(() => eraseUserAccount(buyer), /outstanding bookings and orders/i);

  // Settle the obligation, then erasure proceeds — and cannot be repeated.
  await prisma.marketplaceOrder.updateMany({ where: { buyerId: buyer }, data: { status: "PAID" } });
  await eraseUserAccount(buyer);
  await assert.rejects(() => eraseUserAccount(buyer), /already been erased/i);
});
