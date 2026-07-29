import test, { after } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "@gihtcx/db";
import { LATENCY_BUDGETS_MS, checkLatency, p95, type LatencyClass } from "@gihtcx/shared";
import { searchListings, getListing, placeOrder } from "../modules/marketplace";
import { getMoneyBalance } from "../modules/wallet";
import {
  disconnect,
  fundWallet,
  makeListing,
  makeUser,
  newFixture,
  teardown,
  type Fixture,
} from "./harness";

/**
 * Latency budgets, measured — NFR-006.
 *
 * The register said "never specified, never measured", and the second half followed
 * from the first: an unstated budget cannot be missed. These assertions are the
 * cheapest thing that makes the budgets real — they run against a real Postgres, so
 * a query that loses its index shows up here rather than in production.
 *
 * Deliberately NOT a benchmark. There is no attempt to characterise throughput or
 * compare runs. The only question is "is this operation in the right order of
 * magnitude", and the budgets are set loose enough that a passing run means the
 * shape is right, not that the machine was fast.
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
 * Times `fn` repeatedly and asserts the p95 is inside its class budget.
 *
 * The first call is discarded: it pays for connection setup and query planning, and
 * charging that to the budget would either fail honest code or force the budget up
 * to hide it.
 */
async function assertWithinBudget(
  operation: string,
  latencyClass: LatencyClass,
  fn: () => Promise<unknown>,
  samples = 12
) {
  await fn();

  const timings: number[] = [];
  for (let i = 0; i < samples; i += 1) {
    const started = performance.now();
    await fn();
    timings.push(performance.now() - started);
  }

  const observed = p95(timings);
  const result = checkLatency(operation, latencyClass, observed);
  assert.ok(
    result.withinBudget,
    `${operation}: p95 ${result.observedMs}ms exceeds the ${latencyClass} budget of ${result.budgetMs}ms`
  );
  return result;
}

test("point reads stay inside the point_read budget", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  const listingId = await makeListing(f, seller, { price: 25, stock: 10 });

  const r = await assertWithinBudget("getListing", "point_read", () => getListing(listingId));
  console.log(`  getListing p95 ${r.observedMs}ms / ${r.budgetMs}ms`);
});

test("balance reads stay inside the point_read budget even as the ledger grows", async () => {
  const f = track();
  const user = await makeUser(f);
  // A balance is SUM(entries) with no cached column, so its cost grows with history.
  // 60 entries is small, but it is the shape that matters: if this were unindexed,
  // the difference from a single row would already show.
  for (let i = 0; i < 60; i += 1) await fundWallet(user, 1);

  const r = await assertWithinBudget("getMoneyBalance", "point_read", () => getMoneyBalance(user));
  console.log(`  getMoneyBalance p95 ${r.observedMs}ms / ${r.budgetMs}ms (60 ledger entries)`);
});

test("filtered list reads stay inside the list_read budget", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  for (let i = 0; i < 20 - 1; i += 1) await makeListing(f, seller, { price: 10 + i, stock: 3 });

  const r = await assertWithinBudget("searchListings", "list_read", () =>
    searchListings({ q: "itest", sort: "newest" })
  );
  console.log(`  searchListings p95 ${r.observedMs}ms / ${r.budgetMs}ms`);
});

test("a transactional write stays inside the transactional_write budget", async () => {
  const f = track();
  const seller = await makeUser(f, "SUPPLIER");
  // Unlimited stock, so repeated orders measure the write path rather than
  // exhausting inventory and measuring the rejection path.
  const listingId = await makeListing(f, seller, { price: 1, stock: null });
  const buyer = await makeUser(f);
  await fundWallet(buyer, 1000);

  const r = await assertWithinBudget(
    "placeOrder",
    "transactional_write",
    () => placeOrder(buyer, { listingId, quantity: 1, paymentMethod: "WALLET" }),
    8
  );
  console.log(`  placeOrder p95 ${r.observedMs}ms / ${r.budgetMs}ms`);
});

test("the readiness dependency checks respond inside the point_read budget", async () => {
  // What /health/ready actually costs. A readiness probe slower than its own poll
  // interval is an outage detector that causes outages.
  const r = await assertWithinBudget(
    "readiness:database",
    "point_read",
    () => prisma.$queryRaw`SELECT 1`
  );
  console.log(`  readiness db p95 ${r.observedMs}ms / ${r.budgetMs}ms`);
});

test("the budget checker itself rejects an over-budget observation", async () => {
  // Meta-test: every other assertion here is worthless if checkLatency cannot say no.
  const over = checkLatency("synthetic", "point_read", LATENCY_BUDGETS_MS.point_read + 1);
  assert.equal(over.withinBudget, false);
  const under = checkLatency("synthetic", "point_read", LATENCY_BUDGETS_MS.point_read);
  assert.equal(under.withinBudget, true);
});
