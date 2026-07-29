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

test("compliance requirements are present and none are silently Met", () => {
  const compliance = rows.filter((r) => r.id.startsWith("CR-"));
  assert.ok(compliance.length >= 6, `only ${compliance.length} compliance requirements`);
  for (const r of compliance) {
    // PCI scope minimisation is genuinely met by not touching card data. Any other
    // compliance row claiming Met needs a named external determination, not code.
    if (r.verdict === "Met") {
      assert.equal(r.id, "CR-006", `${r.id} claims Met — compliance needs a written determination`);
    }
  }
});
