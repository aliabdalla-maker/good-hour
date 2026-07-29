import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@gihtcx/db";
import { placeOrder, settleOrder } from "../modules/marketplace";
import { applyWalletWrites, getMoneyBalance } from "../modules/wallet";
import {
  disconnect,
  fundWallet,
  makeTopUp,
  makeListing,
  makeUser,
  newFixture,
  teardown,
  walletBalance,
  type Fixture,
} from "./harness";

/**
 * Money correctness under contention — NFR-007.
 *
 * These are the assertions that could not exist before. Every guarantee here is
 * enforced by Postgres, not by application code: a conditional `updateMany` for
 * stock, Serializable isolation plus a post-insert assertion for balances, and
 * unique indexes for idempotency. A unit test with a mocked Prisma would only
 * assert my beliefs about those semantics, and my beliefs are what produced the
 * oversell and double-refund bugs in the first place.
 *
 * Run with: npm run test:integration  (requires DATABASE_URL)
 */

const fixtures: Fixture[] = [];
after(async () => {
  for (const f of fixtures) await teardown(f);
  await disconnect();
  // Prisma's query-engine handle can outlive $disconnect on Windows, and
  // node:test waits for the event loop to drain — the suite finished in under a
  // second and then sat for four minutes before being killed. Exit explicitly,
  // preserving whatever exit code the assertions produced.
  setTimeout(() => process.exit(process.exitCode ?? 0), 250);
});

function track(): Fixture {
  const f = newFixture();
  fixtures.push(f);
  return f;
}

test("concurrent orders on one unit of stock: exactly one succeeds", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const listingId = await makeListing(f, seller, { price: 10, stock: 1 });

  // Eight buyers, each funded, all racing for a single unit.
  const buyers = await Promise.all(Array.from({ length: 8 }, () => makeUser(f)));
  await Promise.all(buyers.map((b) => fundWallet(b, 100)));

  const results = await Promise.allSettled(
    buyers.map((b) => placeOrder(b, { listingId, quantity: 1, paymentMethod: "WALLET" }))
  );
  const placed = results.filter((r) => r.status === "fulfilled");

  // Settlement is where stock actually decrements, so settle every placed order
  // concurrently too — that is the window the conditional update has to close.
  const settled = await Promise.allSettled(
    placed.map((r) => settleOrder((r as PromiseFulfilledResult<{ id: string }>).value.id))
  );

  const paid = await prisma.marketplaceOrder.count({ where: { listingId, status: "PAID" } });
  const listing = await prisma.marketplaceListing.findUniqueOrThrow({ where: { id: listingId } });

  assert.equal(paid, 1, `${paid} orders reached PAID against 1 unit of stock`);
  assert.ok(Number(listing.stock) >= 0, `stock went negative: ${listing.stock}`);
  assert.equal(
    settled.filter((s) => s.status === "fulfilled").length,
    1,
    "more than one settlement succeeded"
  );
});

test("concurrent spends cannot drive a wallet negative", async () => {
  const f = track();
  const user = await makeUser(f);
  await fundWallet(user, 100);

  // Ten simultaneous £20 spends against £100. Exactly five are affordable.
  //
  // Before the bounded retry in applyWalletWrites, only TWO of the five got
  // through — the rest died on a serialisation conflict, telling a user with
  // money in their wallet to try again. Safe but wrong, and invisible to every
  // unit test. This assertion is why the retry exists.
  const attempts = await Promise.allSettled(
    Array.from({ length: 10 }, (_, i) =>
      applyWalletWrites([
        {
          userId: user,
          amount: -20,
          kind: "PURCHASE",
          currency: "GBP",
          note: `itest concurrent spend ${i}`,
        },
      ])
    )
  );

  const succeeded = attempts.filter((a) => a.status === "fulfilled").length;
  const balance = await walletBalance(user);

  assert.ok(balance >= 0, `balance went negative: ${balance}`);
  // Safety first, and unconditionally: no arrangement of retries may overspend.
  assert.ok(succeeded * 20 <= 100, `${succeeded} × £20 spent from £100`);
  assert.equal(succeeded, 5, `${succeeded} of 5 affordable spends succeeded against £100`);
  assert.equal(balance, 0, `expected the balance fully spent, got ${balance}`);
});

test("the read-then-write gap is closed: no interleaving overspends", async () => {
  const f = track();
  const user = await makeUser(f);
  await fundWallet(user, 50);

  // Two spends that are individually affordable and jointly are not. Under
  // read-then-write both would read £50 and both would commit.
  const [a, b] = await Promise.allSettled([
    applyWalletWrites([
      { userId: user, amount: -30, kind: "PURCHASE", currency: "GBP", note: "itest A" },
    ]),
    applyWalletWrites([
      { userId: user, amount: -30, kind: "PURCHASE", currency: "GBP", note: "itest B" },
    ]),
  ]);

  const both = [a, b].filter((r) => r.status === "fulfilled").length;
  assert.equal(both, 1, "both £30 spends committed against a £50 balance");
  assert.equal(await walletBalance(user), 20);
});

test("idempotency is enforced by the database, not by a prior read", async () => {
  const f = track();
  const user = await makeUser(f);
  const topUpId = await makeTopUp(user, 25);

  // The same top-up credited twice — Stripe genuinely retries webhooks. A
  // check-then-write guard cannot survive a crash between the two commits, so the
  // unique index is the guarantee. Fire both at once to prove it.
  const results = await Promise.allSettled([
    applyWalletWrites([
      { userId: user, amount: 25, kind: "TOPUP", currency: "GBP", topUpId, note: "itest topup" },
    ]),
    applyWalletWrites([
      { userId: user, amount: 25, kind: "TOPUP", currency: "GBP", topUpId, note: "itest topup" },
    ]),
  ]);

  const applied = results.filter((r) => r.status === "fulfilled").length;
  assert.equal(applied, 1, "the same top-up was credited twice");
  assert.equal(await walletBalance(user), 25);
});

test("getMoneyBalance agrees with the ledger sum after contention", async () => {
  const f = track();
  const user = await makeUser(f);
  await fundWallet(user, 200);
  await Promise.allSettled(
    Array.from({ length: 6 }, (_, i) =>
      applyWalletWrites([
        { userId: user, amount: -15, kind: "PURCHASE", currency: "GBP", note: `itest mix ${i}` },
      ])
    )
  );
  // The service's view and the raw sum must never diverge — there is no balance
  // column to drift, and this asserts that stays true.
  assert.equal(await getMoneyBalance(user), await walletBalance(user));
});
