import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AA_BODY, contrastRatio } from "@gihtcx/shared";
import {
  PALETTE_FAMILIES,
  auditPalette,
  findHoverEqualsBase,
  findRawDefaultFamilies,
  findUndersizedType,
  parsePalette,
  renderTokenTable,
} from "./designAudit";

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, "..");
const repoRoot = path.resolve(webRoot, "../..");

function sourceFiles(): { file: string; source: string }[] {
  const out: { file: string; source: string }[] = [];
  for (const dir of ["app", "components"]) {
    const walk = (d: string) => {
      for (const entry of readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, entry.name);
        if (entry.isDirectory()) walk(p);
        else if (/\.tsx?$/.test(entry.name))
          out.push({ file: path.relative(repoRoot, p), source: readFileSync(p, "utf8") });
      }
    };
    walk(path.join(webRoot, dir));
  }
  return out;
}

const tailwindConfig = readFileSync(path.join(webRoot, "tailwind.config.ts"), "utf8");

// --- the checkers must be able to fail --------------------------------------
// Every one of these fixtures is input the corresponding check MUST flag. Without
// them a green run proves only that the check ran, not that it can discriminate.

test("parsePalette throws rather than returning an empty palette", () => {
  assert.throws(() => parsePalette("export default {}"), /not found in the Tailwind config/);
  assert.throws(
    () => parsePalette(tailwindConfig, 99),
    /parsed 10 steps, expected 99/,
    "a short ramp must fail loudly, not silently audit fewer colours"
  );
});

test("auditPalette flags a banded ramp and an AA failure", () => {
  const good = parsePalette(tailwindConfig);
  const broken = structuredClone(good);
  broken.brand!["700"] = "#3aa79c"; // lighter than 600 — banding
  broken.info!["600"] = "#38bdf8"; // 1.9:1 — nowhere near AA
  const findings = auditPalette(broken).flatMap((a) => a.findings);
  assert.ok(findings.some((f) => /not monotonic/.test(f)), findings.join(" | "));
  assert.ok(findings.some((f) => /below AA/.test(f)), findings.join(" | "));
});

test("findHoverEqualsBase flags the substring bug and spares a real hover", () => {
  const bug = `<button className="bg-brand-600 hover:bg-brand-600">x</button>`;
  assert.equal(findHoverEqualsBase("fixture.tsx", bug).length, 1);

  const fine = `<button className="bg-brand-600 hover:bg-brand-700">x</button>`;
  assert.equal(findHoverEqualsBase("fixture.tsx", fine).length, 0);

  // Different property, same shade, is not a hover bug.
  const unrelated = `<a className="text-brand-600 hover:bg-brand-600">x</a>`;
  assert.equal(findHoverEqualsBase("fixture.tsx", unrelated).length, 0);
});

test("findRawDefaultFamilies flags defaults and spares tokens", () => {
  assert.equal(findRawDefaultFamilies("f.tsx", `className="text-emerald-700"`).length, 1);
  assert.equal(findRawDefaultFamilies("f.tsx", `className="from-violet-500"`).length, 1);
  assert.equal(findRawDefaultFamilies("f.tsx", `className="text-success-700"`).length, 0);
  // slate is the deliberate neutral and stays allowed.
  assert.equal(findRawDefaultFamilies("f.tsx", `className="text-slate-500"`).length, 0);
});

// --- and now the real repo --------------------------------------------------

test("every palette ramp is monotonic and clears AA at 600", () => {
  const audits = auditPalette(parsePalette(tailwindConfig));
  const findings = audits.flatMap((a) => a.findings);
  assert.deepEqual(findings, []);
  assert.equal(audits.length, PALETTE_FAMILIES.length);
});

test("600 clears AA and 700 is measurably darker in every family", () => {
  const palette = parsePalette(tailwindConfig);
  for (const family of PALETTE_FAMILIES) {
    const ramp = palette[family]!;
    const six = contrastRatio(ramp["600"]!, "#ffffff");
    const seven = contrastRatio(ramp["700"]!, "#ffffff");
    assert.ok(six >= AA_BODY, `${family}-600 is ${six.toFixed(2)}:1, below AA`);
    // A hover that isn't perceptibly different is not a hover. 1.2x of ratio is
    // a coarse proxy, deliberately loose — it catches "identical", not taste.
    assert.ok(seven > six * 1.2, `${family}-700 is not clearly darker than ${family}-600`);
  }
});

test("no element in app/ or components/ has a hover colour equal to its base", () => {
  const findings = sourceFiles().flatMap(({ file, source }) => findHoverEqualsBase(file, source));
  assert.deepEqual(
    findings.map((f) => `${f.file}: ${f.detail}`),
    []
  );
});

test("no raw Tailwind default families are used in app/ or components/", () => {
  const findings = sourceFiles().flatMap(({ file, source }) =>
    findRawDefaultFamilies(file, source)
  );
  assert.deepEqual(
    findings.map((f) => `${f.file}: ${f.detail}`),
    []
  );
});

test("findUndersizedType flags below-floor sizes and spares the floor itself", () => {
  assert.equal(findUndersizedType("f.tsx", `className="text-[11px]"`).length, 1);
  assert.equal(findUndersizedType("f.tsx", `className="text-[10px]"`).length, 1);
  assert.equal(findUndersizedType("f.tsx", `className="text-[12px]"`).length, 0);
  assert.equal(findUndersizedType("f.tsx", `className="text-xs"`).length, 0);
});

test("no type in app/ or components/ falls below the 12px floor", () => {
  const findings = sourceFiles().flatMap(({ file, source }) => findUndersizedType(file, source));
  assert.deepEqual(
    findings.map((f) => `${f.file}: ${f.detail}`),
    []
  );
});

test("the published token table in docs matches the measured palette", () => {
  // Docs drift is a test failure, not a discovery months later. The two false
  // claims found in ARCHITECTURE.md were both of the "true when written" kind.
  const doc = readFileSync(path.join(repoRoot, "docs/DESIGN_TOKENS.md"), "utf8");
  const table = renderTokenTable(parsePalette(tailwindConfig));
  assert.ok(
    doc.includes(table),
    "docs/DESIGN_TOKENS.md is stale — regenerate it with `npm run docs:tokens`"
  );
});

test("the scanner actually reads files (guards the silent-empty pass)", () => {
  // If the walk found nothing, the two "no findings" tests above would pass
  // vacuously — which is how a broken verifier reports green.
  const files = sourceFiles();
  assert.ok(files.length > 40, `only scanned ${files.length} files — the walk is broken`);
  assert.ok(files.some((f) => /NavBar/.test(f.file)), "expected NavBar in the scan");
});

test("FR-031: entrances are animated and reduced-motion is honoured globally", () => {
  // "Flash animation" was never pinned to a definition, so this asserts the
  // criterion as written: state changes are animated, and a user who asks for less
  // motion gets it. The reduced-motion rule has to be GLOBAL — a per-component
  // opt-in is the version that gets forgotten on the next component.
  const css = readFileSync(path.join(webRoot, "app/globals.css"), "utf8");
  const reduced = /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{([\s\S]*?)\n\}/.exec(css);
  assert.ok(reduced, "no prefers-reduced-motion block in globals.css");
  assert.match(reduced[1]!, /\*,/, "the reduced-motion rule is not applied globally");
  assert.match(reduced[1]!, /animation-duration/);
  assert.match(reduced[1]!, /transition-duration/);

  // Every animation the app actually uses must be declared in the theme, so a
  // class name typo degrades to "no animation" rather than silently doing nothing
  // while looking intentional.
  const declared = new Set(
    [...tailwindConfig.matchAll(/^\s{8}"?([a-z-]+)"?:\s*"[^"]*\d+m?s/gm)].map((m) => m[1]!)
  );
  const used = new Set(
    sourceFiles()
      .flatMap(({ source }) => [...source.matchAll(/\banimate-([a-z-]+)\b/g)])
      .map((m) => m[1]!)
      // Tailwind ships these; they need no theme entry.
      .filter((name) => !["pulse", "spin", "ping", "bounce", "none"].includes(name))
  );
  const undeclared = [...used].filter((name) => !declared.has(name));
  assert.deepEqual(undeclared, [], `animate-* classes with no theme entry: ${undeclared.join(", ")}`);
  assert.ok(used.size >= 3, `only ${used.size} animations in use — entrances are not animated`);
});
