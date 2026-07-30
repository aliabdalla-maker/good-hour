import test from "node:test";
import assert from "node:assert/strict";
import {
  CLUSTERS,
  DOMAINS,
  TRADING_MODELS,
  TRADING_MODEL_HINTS,
  TRADING_MODEL_LABELS,
  computeFacets,
  domainsByCluster,
  inferDomain,
  tradingModelsFor,
} from "./taxonomy";

test("a bookable unit offers hourly booking first and reverse auction", () => {
  const models = tradingModelsFor({ kind: "BOOKABLE_UNIT" });
  // Primary way to transact comes first, so a card reads left to right from "what
  // most people will do" to "what is also possible".
  assert.equal(models[0], "HOURLY_BOOKING");
  assert.ok(models.includes("REVERSE_AUCTION"));
  assert.ok(!models.includes("FIXED_PRICE"));
});

test("a marketplace listing offers fixed price, not hourly booking", () => {
  const models = tradingModelsFor({ kind: "MARKETPLACE_LISTING" });
  assert.deepEqual(models, ["FIXED_PRICE"]);
});

test("agent negotiation is only offered where there is a live contest", () => {
  // Advertising it on a fixed-price item with no auction promises a mechanic that has
  // nothing to negotiate against — the badge would be a lie.
  assert.ok(!tradingModelsFor({ kind: "MARKETPLACE_LISTING" }).includes("AGENT_NEGOTIATION"));
  assert.ok(!tradingModelsFor({ kind: "BOOKABLE_UNIT" }).includes("AGENT_NEGOTIATION"));

  const contested = tradingModelsFor({ kind: "MARKETPLACE_LISTING", hasOpenAuction: true });
  assert.ok(contested.includes("FORWARD_AUCTION"));
  assert.ok(contested.includes("AGENT_NEGOTIATION"));
});

test("time credits are only offered where the category has liquidity", () => {
  assert.ok(!tradingModelsFor({ kind: "BOOKABLE_UNIT" }).includes("TIME_CREDIT"));
  assert.ok(
    tradingModelsFor({ kind: "BOOKABLE_UNIT", timeCreditEligible: true }).includes("TIME_CREDIT")
  );
});

test("every trading model has a label and a plain-language hint", () => {
  for (const m of TRADING_MODELS) {
    assert.ok(TRADING_MODEL_LABELS[m]?.length > 3, `${m} has no label`);
    // A badge nobody understands is decoration. The hint has to be a sentence.
    assert.ok(TRADING_MODEL_HINTS[m]?.length > 20, `${m} has no usable hint`);
    assert.match(TRADING_MODEL_HINTS[m]!, /\.$/, `${m} hint is not a sentence`);
  }
});

test("every domain belongs to a declared cluster and has a label", () => {
  assert.equal(DOMAINS.length, 8);
  assert.equal(new Set(DOMAINS.map((d) => d.id)).size, 8, "duplicate domain ids");
  for (const d of DOMAINS) {
    assert.ok(CLUSTERS.includes(d.cluster), `${d.id} has unknown cluster ${d.cluster}`);
    assert.ok(d.label.length > 3, `${d.id} has no label`);
    assert.match(d.id, /^[a-z]+$/, `${d.id} is not a clean slug`);
  }
});

test("domains map onto real categories or admit they map onto none", () => {
  // The honest seam: three categories exist in the database, eight domains are shown.
  // A domain claiming a category that does not exist would filter to nothing forever —
  // and the typechecker caught exactly that here, where I had guessed "TRAVEL".
  const valid = ["ROOM", "CAR", "TRAVEL_SERVICE", null];
  for (const d of DOMAINS) {
    assert.ok(valid.includes(d.category), `${d.id} maps to ${d.category}`);
  }
  // And at least some domains must reach real inventory, or the taxonomy is decorative.
  assert.ok(DOMAINS.filter((d) => d.category !== null).length >= 4);
});

test("grouping by cluster covers every domain exactly once", () => {
  const grouped = domainsByCluster();
  const flat = grouped.flatMap((g) => g.domains.map((d) => d.id)).sort();
  assert.deepEqual(flat, DOMAINS.map((d) => d.id).sort());
  // No empty groups: a cluster heading with nothing under it is a dead end.
  for (const g of grouped) assert.ok(g.domains.length > 0, `${g.cluster} is empty`);
});

test("facet counts cover the whole set, so an empty facet still reports zero", () => {
  const facets = computeFacets([
    { domain: "hospitality", models: ["HOURLY_BOOKING", "TIME_CREDIT"] },
    { domain: "hospitality", models: ["HOURLY_BOOKING"] },
    { domain: "tech", models: ["FIXED_PRICE"] },
  ]);

  assert.equal(facets.total, 3);
  assert.equal(facets.domains.find((d) => d.id === "hospitality")!.count, 2);
  assert.equal(facets.domains.find((d) => d.id === "tech")!.count, 1);
  // A zero is information: it says "nothing here", which stops someone clicking
  // hopefully through an empty category.
  assert.equal(facets.domains.find((d) => d.id === "aviation")!.count, 0);
  assert.equal(facets.domains.length, DOMAINS.length);
  assert.equal(facets.models.length, TRADING_MODELS.length);
});

test("cluster counts roll up from their domains", () => {
  const facets = computeFacets([
    { domain: "hospitality", models: [] },
    { domain: "workspace", models: [] },
    { domain: "chauffeur", models: [] },
  ]);
  // hospitality -> HOSPITALITY, workspace -> SPACE, chauffeur -> TRANSPORT
  assert.equal(facets.clusters.find((c) => c.id === "HOSPITALITY")!.count, 1);
  assert.equal(facets.clusters.find((c) => c.id === "SPACE")!.count, 1);
  assert.equal(facets.clusters.find((c) => c.id === "TRANSPORT")!.count, 1);
  assert.equal(facets.clusters.find((c) => c.id === "TECHNOLOGY")!.count, 0);
});

test("a listing with no domain is counted in totals but under no domain", () => {
  const facets = computeFacets([{ domain: null, models: ["FIXED_PRICE"] }]);
  assert.equal(facets.total, 1);
  assert.equal(
    facets.domains.reduce((sum, d) => sum + d.count, 0),
    0,
    "an unclassified listing was filed under a domain anyway"
  );
  // It still counts toward its trading model, because that much is known about it.
  assert.equal(facets.models.find((m) => m.id === "FIXED_PRICE")!.count, 1);
});

test("the matching count is reported separately from the total", () => {
  const listings = [
    { domain: "tech", models: [] },
    { domain: "legal", models: [] },
  ];
  const facets = computeFacets(listings, 1);
  assert.equal(facets.total, 2);
  assert.equal(facets.matching, 1);
  // Defaults to the total when no filter is applied.
  assert.equal(computeFacets(listings).matching, 2);
});

test("an empty catalogue produces zeroes, not an empty facet list", () => {
  // Otherwise the filter UI vanishes exactly when a new user first arrives, which is
  // the moment it is most needed to explain what the site sells.
  const facets = computeFacets([]);
  assert.equal(facets.total, 0);
  assert.equal(facets.domains.length, DOMAINS.length);
  assert.ok(facets.domains.every((d) => d.count === 0));
});

test("domain inference matches obvious categories and refuses to guess", () => {
  assert.equal(inferDomain("Hotel suite"), "hospitality");
  assert.equal(inferDomain("coworking desk"), "workspace");
  assert.equal(inferDomain("Chauffeur service"), "chauffeur");
  assert.equal(inferDomain("private jet charter"), "aviation");
  assert.equal(inferDomain("GPU cluster time"), "compute");
  assert.equal(inferDomain("Legal counsel"), "legal");

  // Refuses rather than guessing: a listing under no domain is better than one filed
  // where its owner will never find it.
  assert.equal(inferDomain("miscellaneous"), null);
  assert.equal(inferDomain(""), null);
  assert.equal(inferDomain(null), null);
  assert.equal(inferDomain(undefined), null);
});

test("inference never returns a domain that is not in the registry", () => {
  const ids = new Set(DOMAINS.map((d) => d.id));
  for (const input of ["hotel", "van hire", "tax advice", "ai agent", "temple tour", "nonsense qqq"]) {
    const got = inferDomain(input);
    if (got !== null) assert.ok(ids.has(got), `${input} -> unknown domain ${got}`);
  }
});
