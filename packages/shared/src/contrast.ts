/**
 * WCAG 2.2 contrast maths — the ONE implementation in this repo.
 *
 * It exists because a published design-token contrast table was computed with an
 * sRGB linearisation threshold of 0.03928 instead of 0.04045. (0.03928 comes from
 * an early WCAG erratum and still circulates widely.) Nine of twelve figures were
 * wrong in the second decimal. No pass/fail verdict changed — which is exactly
 * why nobody would have caught it by reading: a number that is *nearly* right
 * survives review indefinitely.
 *
 * The fix is not "be more careful". It is having one exported function, pinned by
 * tests to WCAG's own boundary examples, and generating every published figure
 * from it instead of typing figures by hand.
 */

/** sRGB → linear crossover. WCAG 2.x normative value; NOT 0.03928. */
export const SRGB_LINEAR_THRESHOLD = 0.04045;

/** SC 1.4.3 — normal-size body text. */
export const AA_BODY = 4.5;
/** SC 1.4.3 large text / SC 1.4.11 non-text (borders, icons, focus rings). */
export const AA_LARGE = 3;

/**
 * Throws rather than returning a fallback colour. A silently-tolerated bad hex
 * is how an audit ends up reporting "0 problems" on input it never parsed.
 */
export function parseHex(hex: string): [number, number, number] {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) throw new Error(`not a 6-digit hex colour: ${JSON.stringify(hex)}`);
  const n = parseInt(m[1]!, 16);
  return [(n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = parseHex(hex).map((v) => {
    const c = v / 255;
    return c <= SRGB_LINEAR_THRESHOLD ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Symmetric, as WCAG defines it: lighter and darker are sorted internally. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

/** Two decimals, for display only — never feed this back into a comparison. */
export function formatRatio(ratio: number): string {
  return `${ratio.toFixed(2)}:1`;
}

export function meetsAA(a: string, b: string, large = false): boolean {
  return contrastRatio(a, b) >= (large ? AA_LARGE : AA_BODY);
}

export interface RampStep {
  step: string;
  hex: string;
  onWhite: number;
}

export interface RampAudit {
  family: string;
  steps: RampStep[];
  /** Human-readable problems. Empty means the ramp is sound. */
  findings: string[];
}

export interface AuditRampOptions {
  /** The step that must clear AA for body text on `background`. */
  aaStep?: string;
  background?: string;
}

/**
 * Audits one colour family.
 *
 * Two invariants, both learned the hard way:
 *
 *  1. **Monotonic.** Contrast against the page background must increase with the
 *     step number. An HSL-generated ramp broke this and banded visibly; equal HSL
 *     lightness steps are not equal perceptual steps, so the dark end collapsed.
 *  2. **`aaStep` clears AA.** So that reaching for the default interactive shade
 *     is accessible without re-checking, and a token swap can't quietly drop
 *     below 4.5:1.
 */
export function auditRamp(
  family: string,
  ramp: Record<string, string>,
  opts: AuditRampOptions = {}
): RampAudit {
  const { aaStep = "600", background = "#ffffff" } = opts;
  const findings: string[] = [];

  const steps: RampStep[] = Object.keys(ramp)
    .sort((a, b) => Number(a) - Number(b))
    .map((step) => ({ step, hex: ramp[step]!, onWhite: contrastRatio(ramp[step]!, background) }));

  if (steps.length === 0) {
    // An empty ramp must be a finding, not a pass. A parser that silently
    // matched nothing is the failure mode this whole module guards against.
    findings.push(`${family}: no steps found — nothing was audited`);
    return { family, steps, findings };
  }

  for (let i = 1; i < steps.length; i += 1) {
    const prev = steps[i - 1]!;
    const cur = steps[i]!;
    if (cur.onWhite < prev.onWhite) {
      findings.push(
        `${family}: not monotonic — ${cur.step} (${formatRatio(cur.onWhite)}) has less contrast than ${prev.step} (${formatRatio(prev.onWhite)})`
      );
    }
  }

  const aa = steps.find((s) => s.step === aaStep);
  if (!aa) {
    findings.push(`${family}: no ${aaStep} step, so the AA-by-default guarantee is unverifiable`);
  } else if (aa.onWhite < AA_BODY) {
    findings.push(
      `${family}: ${aaStep} ${aa.hex} is ${formatRatio(aa.onWhite)} on ${background} — below AA ${AA_BODY}`
    );
  }

  return { family, steps, findings };
}
