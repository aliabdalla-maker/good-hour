import test from "node:test";
import assert from "node:assert/strict";
import {
  AA_BODY,
  SRGB_LINEAR_THRESHOLD,
  auditRamp,
  contrastRatio,
  parseHex,
  relativeLuminance,
} from "./contrast";

// --- the maths, pinned to values that don't depend on my arithmetic -----------

test("black on white is 21:1 and a colour on itself is 1:1", () => {
  assert.equal(Math.round(contrastRatio("#000000", "#ffffff") * 100) / 100, 21);
  assert.equal(contrastRatio("#7d3bef", "#7d3bef"), 1);
});

test("contrast is symmetric", () => {
  assert.equal(contrastRatio("#008277", "#ffffff"), contrastRatio("#ffffff", "#008277"));
});

test("the sRGB threshold is the normative 0.04045, not the 0.03928 erratum", () => {
  // Pinned deliberately. Using 0.03928 shifted a dozen published figures by up
  // to 0.04 — never enough to flip a verdict, so never enough to get noticed.
  assert.equal(SRGB_LINEAR_THRESHOLD, 0.04045);
});

test("#767676 is the AA boundary grey on white and #777777 falls short", () => {
  // The canonical worked example: these two greys sit either side of 4.5:1, so
  // they catch a linearisation error that a black/white check cannot.
  assert.ok(contrastRatio("#767676", "#ffffff") >= AA_BODY);
  assert.ok(contrastRatio("#777777", "#ffffff") < AA_BODY);
});

test("luminance is ordered and bounded", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(Math.round(relativeLuminance("#ffffff") * 1e6) / 1e6, 1);
  assert.ok(relativeLuminance("#00665e") < relativeLuminance("#008277"));
});

test("a malformed colour throws instead of degrading to a default", () => {
  // An audit that tolerates bad input reports "no problems" on data it never read.
  for (const bad of ["", "#fff", "008277", "#gggggg", "#0082777"]) {
    assert.throws(() => parseHex(bad), /not a 6-digit hex colour/);
  }
});

// --- the auditor, tested against input it MUST reject ------------------------
// This is the part that was missing before. Every verifier in this repo had been
// trusted on the strength of its green result, without once being shown a known
// bad input to prove it could go red at all. Three of them couldn't.

const GOOD_RAMP = {
  "50": "#f0f9f7",
  "100": "#d9f0ec",
  "600": "#008277",
  "700": "#00665e",
  "900": "#00332f",
};

test("a sound ramp produces no findings", () => {
  assert.deepEqual(auditRamp("brand", GOOD_RAMP).findings, []);
});

test("the auditor catches a non-monotonic ramp", () => {
  // 700 lighter than 600 — the banding an HSL-generated ramp produced.
  const banded = { ...GOOD_RAMP, "700": "#3aa79c" };
  const findings = auditRamp("brand", banded).findings;
  assert.equal(findings.length, 1);
  assert.match(findings[0]!, /not monotonic/);
});

test("the auditor catches a 600 that misses AA", () => {
  // #14b8a6 is the shade that was actually shipped at 3.74:1 before the rework.
  const failing = { ...GOOD_RAMP, "600": "#14b8a6" };
  const findings = auditRamp("brand", failing).findings;
  assert.ok(findings.some((f) => /below AA 4.5/.test(f)), findings.join(" | "));
});

test("an empty ramp is a finding, not a pass", () => {
  // The silent-empty failure: a parser that matches nothing must not read as
  // "audited, all clear". This exact shape let a doc validator pass on syntax
  // it had never looked at.
  const findings = auditRamp("brand", {}).findings;
  assert.equal(findings.length, 1);
  assert.match(findings[0]!, /nothing was audited/);
});

test("a missing aaStep is a finding, not a pass", () => {
  const { "600": _omitted, ...noSix } = GOOD_RAMP;
  const findings = auditRamp("brand", noSix).findings;
  assert.ok(findings.some((f) => /unverifiable/.test(f)), findings.join(" | "));
});

test("findings accumulate rather than short-circuiting on the first", () => {
  // 700 lighter than 600 (non-monotonic) AND 600 below AA — two distinct faults.
  const bad = { "600": "#14b8a6", "700": "#5ecfc4" };
  assert.ok(auditRamp("brand", bad).findings.length >= 2);
});
