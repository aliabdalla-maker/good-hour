import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/**
 * Keeps docs/REQUIREMENTS.md honest.
 *
 * A requirements register that nothing checks decays into the same thing the
 * register replaced: prose asserting a state of affairs. ARCHITECTURE.md claimed
 * an ESLint rule existed for months on exactly that basis.
 *
 * The rule with teeth is the last one below: a verdict of `Met` must cite a
 * test, a manual check or production traffic. A `Met` backed only by `code:` is
 * the conflation of "written" with "working", and it fails here.
 */

/**
 * Walks up from the working directory to find the repo root.
 *
 * Not `import.meta.url`: this package compiles under a `module` setting that
 * forbids it (TS1343), and the typecheck gate catches that even though the test
 * runner would not. Not a bare `process.cwd()` either — that silently reads the
 * wrong file, or no file, when the suite is invoked from a subdirectory.
 */
function findRepoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(path.join(dir, "docs/REQUIREMENTS.md"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(`could not locate docs/REQUIREMENTS.md above ${process.cwd()}`);
}

const repoRoot = findRepoRoot();
const doc = readFileSync(path.join(repoRoot, "docs/REQUIREMENTS.md"), "utf8");

const VERDICTS = ["Met", "Partially met", "Not met", "Not started"];
const PRIORITIES = ["Must", "Should", "Could", "Won't"];

interface Row {
  id: string;
  requirement: string;
  priority: string;
  criterion: string;
  verdict: string;
  evidence: string;
}

function parseRows(): Row[] {
  const rows: Row[] = [];
  for (const line of doc.split(/\r?\n/)) {
    if (!line.startsWith("|")) continue;
    const cells = line
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim().replace(/^\*\*|\*\*$/g, ""));
    if (cells.length !== 6) continue;
    if (!/^(FR|NFR|CR)-\d{3}$/.test(cells[0]!)) continue;
    rows.push({
      id: cells[0]!,
      requirement: cells[1]!,
      priority: cells[2]!,
      criterion: cells[3]!,
      verdict: cells[4]!,
      evidence: cells[5]!,
    });
  }
  return rows;
}

const rows = parseRows();

test("the register parses, and parses a plausible number of requirements", () => {
  // Guards the silent-empty pass: a parser that matches nothing would make every
  // assertion below vacuously true.
  assert.ok(rows.length >= 45, `only parsed ${rows.length} requirements`);
});

test("every requirement has a unique, well-formed ID", () => {
  const seen = new Set<string>();
  for (const r of rows) {
    assert.match(r.id, /^(FR|NFR|CR)-\d{3}$/);
    assert.ok(!seen.has(r.id), `duplicate requirement ID ${r.id}`);
    seen.add(r.id);
  }
});

test("every requirement has a MoSCoW priority", () => {
  for (const r of rows) {
    assert.ok(
      PRIORITIES.includes(r.priority),
      `${r.id} has priority ${JSON.stringify(r.priority)}`
    );
  }
});

test("every requirement has a verdict from the fixed vocabulary", () => {
  for (const r of rows) {
    assert.ok(VERDICTS.includes(r.verdict), `${r.id} has verdict ${JSON.stringify(r.verdict)}`);
  }
});

test("every in-scope requirement states a testable acceptance criterion", () => {
  for (const r of rows) {
    // Won't-have rows are allowed the em-dash placeholder; nothing else is.
    if (r.priority === "Won't") continue;
    assert.ok(
      r.criterion.length > 20 && r.criterion !== "—",
      `${r.id} has no usable acceptance criterion: ${JSON.stringify(r.criterion)}`
    );
  }
});

test("every file path cited as evidence actually exists", () => {
  const missing: string[] = [];
  for (const r of rows) {
    for (const m of r.evidence.matchAll(/`(?:test|code):([^`]+)`/g)) {
      const p = m[1]!.trim();
      if (!existsSync(path.join(repoRoot, p))) missing.push(`${r.id} -> ${p}`);
    }
  }
  assert.deepEqual(missing, []);
});

test("a verdict of Met is never backed by code alone", () => {
  // The whole point. "The code exists" is not evidence that a requirement is met;
  // it is evidence that it was written. Anything claiming Met must name an
  // automated test, a human check, or real production traffic.
  const unsupported = rows
    .filter((r) => r.verdict === "Met")
    .filter((r) => !/`(?:test|manual|prod):/.test(r.evidence))
    .map((r) => r.id);
  assert.deepEqual(
    unsupported,
    [],
    `these claim Met with only code: evidence — downgrade them to Partially met: ${unsupported.join(", ")}`
  );
});

test("liquidity is tracked as a Must, and its verdict is not overstated", () => {
  // FR-030 is the requirement whose absence explains a working marketplace with
  // no listings, no bids and no orders. It is pinned here so it cannot quietly
  // be marked Met, or dropped from the register, without this test failing.
  const liquidity = rows.find((r) => r.id === "FR-030");
  assert.ok(liquidity, "FR-030 (supply liquidity) is missing from the register");
  assert.equal(liquidity.priority, "Must");
  assert.ok(
    liquidity.verdict === "Not met" || liquidity.verdict === "Partially met",
    "FR-030 cannot be Met while production shows 0 listings and 0 bids — verify before changing this"
  );
});

test("a compliance requirement is only Met when the control is proven, not merely written", () => {
  const compliance = rows.filter((r) => r.id.startsWith("CR-"));
  assert.ok(compliance.length >= 6, `only ${compliance.length} compliance requirements`);

  // This rule started as "only CR-006 may be Met", on the reasoning that
  // compliance needs an external determination. Too broad: some of these rows are
  // *technical controls* with testable criteria — a verification gate, a transfer
  // cap, an erasure path — and those are met when the control is enforced and
  // proven. Narrowed rather than dropped, because the distinction is the point.
  for (const r of compliance) {
    if (r.verdict !== "Met") continue;
    assert.ok(
      /`(?:test|prod):/.test(r.evidence),
      `${r.id} claims Met on a manual check or on code alone — a compliance control needs a test or production evidence`
    );
  }

  // CR-001 is the exception that must stay honest. Its criterion is a *written
  // determination* about whether custodial balances plus transferable credits
  // constitute e-money. No amount of code discharges it, and marking it Met would
  // be the single most dangerous false claim in this register.
  const eMoney = compliance.find((r) => r.id === "CR-001");
  assert.ok(eMoney, "CR-001 (e-money determination) is missing from the register");
  assert.notEqual(
    eMoney.verdict,
    "Met",
    "CR-001 needs a determination from someone qualified, not an implementation"
  );
});

test("the summary table matches the rows it summarises", () => {
  // The first hand-typed version of that table said 19 functional requirements
  // were Met where the rows said 22 — the register's own defect, committed inside
  // the register. Counts are asserted now rather than transcribed.
  const families: Record<string, string> = {
    Functional: "FR",
    "Non-functional": "NFR",
    Compliance: "CR",
  };
  for (const [label, prefix] of Object.entries(families)) {
    const sub = rows.filter((r) => r.id.startsWith(`${prefix}-`));
    const counts = VERDICTS.map((v) => sub.filter((r) => r.verdict === v).length);
    const expected = `| ${label} | ${sub.length} | ${counts.join(" | ")} |`;
    assert.ok(
      doc.includes(expected),
      `summary row for ${label} is stale — should read: ${expected}`
    );
  }
  const all = VERDICTS.map((v) => rows.filter((r) => r.verdict === v).length);
  assert.ok(
    doc.includes(`| **All** | **${rows.length}** | ${all.map((n) => `**${n}**`).join(" | ")} |`),
    `the All row is stale — should total ${rows.length}: ${all.join("/")}`
  );
});

test("the generated UI data matches the register", () => {
  // The Readiness page renders a generated module rather than parsing markdown at
  // runtime, because the API container does not ship docs/ and a page that
  // silently rendered an empty register would be the same silent-empty failure
  // this project keeps re-learning. Drift is a test failure instead.
  const generated = readFileSync(
    path.join(repoRoot, "packages/web/lib/requirementsData.ts"),
    "utf8"
  );
  for (const r of rows) {
    assert.ok(
      generated.includes(`"id": "${r.id}"`),
      `${r.id} missing from requirementsData.ts — run \`npm run docs:requirements\``
    );
    assert.ok(
      generated.includes(`"verdict": "${r.verdict}"`) ,
      `no row carries verdict ${r.verdict} in requirementsData.ts — regenerate it`
    );
  }
  const idCount = (generated.match(/"id": "(?:FR|NFR|CR)-\d{3}"/g) ?? []).length;
  assert.equal(idCount, rows.length, "requirementsData.ts is stale — regenerate it");
});
