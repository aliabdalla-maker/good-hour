import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@gihtcx/db";
import {
  MIN_PAYOUT_AMOUNT,
  cancelPayout,
  getMoneyBalance,
  getPayoutLiability,
  listPendingPayouts,
  markPayoutFailed,
  markPayoutPaid,
  requestPayout,
} from "../modules/wallet";
import { disconnect, fundWallet, makeUser, newFixture, teardown, type Fixture } from "./harness";

/**
 * Seller payouts — the hole that made it impossible to honestly recruit a seller.
 *
 * The property worth testing hardest is the one the design turns on: **the wallet is
 * debited when a payout is REQUESTED, not when it is paid.** Debiting at payment time
 * would let a seller request a payout and then spend the same balance before the
 * operator sent it — the platform out of pocket, every individual ledger row correct.
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

const operator = "itest-operator";

test("requesting a payout reserves the money immediately", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  await fundWallet(seller, 100);

  const payout = await requestPayout(seller, { amount: 40, destinationNote: "Test Bank 12-34-56" });

  assert.equal(payout.status, "REQUESTED");
  assert.equal(payout.method, "MANUAL");
  // The whole point: it has already left the spendable balance.
  assert.equal(await getMoneyBalance(seller), 60);
});

test("reserved money cannot be spent while the payout is pending", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  await fundWallet(seller, 100);
  await requestPayout(seller, { amount: 100 });

  // Everything is reserved, so a second request has nothing to draw on. Were the
  // debit deferred to payment time, this would succeed and the platform would owe
  // £200 against £100.
  await assert.rejects(() => requestPayout(seller, { amount: 50 }), /withdraw up to £0.00|awaiting/i);
  assert.equal(await getMoneyBalance(seller), 0);
});

test("a payout larger than the balance is refused, and nothing is reserved", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  await fundWallet(seller, 30);

  await assert.rejects(() => requestPayout(seller, { amount: 50 }), /withdraw up to £30\.00/);
  assert.equal(await getMoneyBalance(seller), 30);
  assert.equal(await prisma.payout.count({ where: { userId: seller } }), 0);
});

test("the minimum withdrawal is enforced", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  await fundWallet(seller, 100);

  await assert.rejects(
    () => requestPayout(seller, { amount: MIN_PAYOUT_AMOUNT - 0.01 }),
    /minimum withdrawal/i
  );
  const ok = await requestPayout(seller, { amount: MIN_PAYOUT_AMOUNT });
  assert.equal(ok.amount, MIN_PAYOUT_AMOUNT);
});

test("only one payout may be in flight at a time", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  await fundWallet(seller, 500);
  await requestPayout(seller, { amount: 50 });

  // Two pending rows for the same seller is a way to confuse an operator into
  // paying twice.
  await assert.rejects(() => requestPayout(seller, { amount: 50 }), /awaiting processing/i);
});

test("concurrent payout requests cannot both reserve the same money", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  await fundWallet(seller, 100);

  const results = await Promise.allSettled([
    requestPayout(seller, { amount: 100 }),
    requestPayout(seller, { amount: 100 }),
  ]);
  const ok = results.filter((r) => r.status === "fulfilled").length;

  assert.equal(ok, 1, "both concurrent payout requests reserved the same £100");
  assert.equal(await getMoneyBalance(seller), 0);
  assert.equal(await prisma.payout.count({ where: { userId: seller, status: "REQUESTED" } }), 1);
});

test("cancelling returns the money and cannot be repeated", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  await fundWallet(seller, 100);
  const payout = await requestPayout(seller, { amount: 40 });

  const cancelled = await cancelPayout(seller, payout.id);
  assert.equal(cancelled.status, "CANCELLED");
  assert.equal(await getMoneyBalance(seller), 100);

  // A double-click must not refund twice.
  await assert.rejects(() => cancelPayout(seller, payout.id), /already been processed/i);
  assert.equal(await getMoneyBalance(seller), 100);
});

test("one seller cannot cancel another seller's payout", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const stranger = await makeUser(f, "SUPPLIER");
  await fundWallet(seller, 100);
  const payout = await requestPayout(seller, { amount: 40 });

  await assert.rejects(() => cancelPayout(stranger, payout.id), /not found/i);
  assert.equal(await getMoneyBalance(seller), 60);
});

test("marking paid moves no money and is idempotent", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  await fundWallet(seller, 100);
  const payout = await requestPayout(seller, { amount: 40 });

  const paid = await markPayoutPaid(payout.id, operator, "Sent by bank transfer");
  assert.equal(paid.status, "PAID");
  // The money left at request time; marking paid only records that it happened.
  assert.equal(await getMoneyBalance(seller), 60);

  const again = await markPayoutPaid(payout.id, operator);
  assert.equal(again.status, "PAID");
  assert.equal(await getMoneyBalance(seller), 60);

  const receipt = await prisma.notification.findFirstOrThrow({
    where: { userId: seller, type: "payout.paid" },
  });
  assert.match(receipt.body, /40\.00/);
});

test("a paid payout can no longer be cancelled by the seller", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  await fundWallet(seller, 100);
  const payout = await requestPayout(seller, { amount: 40 });
  await markPayoutPaid(payout.id, operator);

  // Otherwise a seller could be paid and then have the reservation returned.
  await assert.rejects(() => cancelPayout(seller, payout.id), /already been processed/i);
  assert.equal(await getMoneyBalance(seller), 60);
});

test("marking failed returns the money and tells the seller why", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  await fundWallet(seller, 100);
  const payout = await requestPayout(seller, { amount: 40 });

  const failed = await markPayoutFailed(payout.id, operator, "Account details were rejected");
  assert.equal(failed.status, "FAILED");
  assert.equal(await getMoneyBalance(seller), 100);

  const notice = await prisma.notification.findFirstOrThrow({
    where: { userId: seller, type: "payout.failed" },
  });
  assert.match(notice.body, /Account details were rejected/);
});

test("the operator queue is oldest-first and reports the liability", async () => {
  const f = track();
  const a = await makeUser(f, "SUPPLIER");
  const b = await makeUser(f, "SUPPLIER");
  await fundWallet(a, 100);
  await fundWallet(b, 100);

  const first = await requestPayout(a, { amount: 25 });
  await requestPayout(b, { amount: 30 });

  const mine = (await listPendingPayouts()).filter((p) => p.sellerEmail.startsWith("itest-"));
  assert.ok(mine.length >= 2, `expected at least 2 queued payouts, saw ${mine.length}`);
  // Oldest first, because that is the fair order to pay.
  const times = mine.map((p) => new Date(p.requestedAt).getTime());
  assert.deepEqual(times, [...times].sort((x, y) => x - y), "the queue is not oldest-first");
  assert.ok(mine.some((p) => p.id === first.id));

  const liability = await getPayoutLiability();
  // Money that has left sellers' spendable balances but not yet the platform.
  assert.ok(liability.pendingTotal >= 55, `liability ${liability.pendingTotal} < 55`);
  assert.ok(liability.pendingCount >= 2);
});

test("every payout movement is traceable from the payout id", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  await fundWallet(seller, 100);
  const payout = await requestPayout(seller, { amount: 40 });
  await markPayoutFailed(payout.id, operator, "Bank rejected it");

  // Debit and reversal both carry payoutId, so a reconciliation can pair them
  // without parsing a note string.
  const entries = await prisma.walletLedgerEntry.findMany({
    where: { payoutId: payout.id },
    orderBy: { createdAt: "asc" },
  });
  assert.equal(entries.length, 2);
  assert.equal(Number(entries[0]!.amount), -40);
  assert.equal(entries[0]!.kind, "PAYOUT");
  assert.equal(Number(entries[1]!.amount), 40);
  assert.equal(entries[1]!.kind, "REFUND");
});
