import { auditRamp, contrastRatio, formatRatio, type RampAudit } from "@gihtcx/shared";

/**
 * Repo-scanning design checks, as pure functions over source text.
 *
 * These started life as throwaway scripts, which is precisely why they were
 * unreliable: one grepped page HTML for a value that Next.js inlines into a JS
 * chunk, another validated only the first line of a diagram. Both reported green
 * on input they had never actually examined, and both were believed.
 *
 * Pure functions over strings means the checks can be fed known-bad fixtures in
 * designAudit.test.ts and proven to go red. A checker that has never failed is
 * not a passing checker — it is an unmeasured one.
 */

export const PALETTE_FAMILIES = ["brand", "ai", "success", "warning", "danger", "info"] as const;
export type PaletteFamily = (typeof PALETTE_FAMILIES)[number];

/** Tailwind default families that must not appear directly in app code. */
const DEFAULT_FAMILIES = [
  "emerald",
  "amber",
  "red",
  "sky",
  "teal",
  "violet",
  "purple",
  "green",
  "yellow",
  "blue",
  "indigo",
  "rose",
  "orange",
  "cyan",
  "lime",
  "fuchsia",
  "pink",
] as const;

export type Palette = Record<string, Record<string, string>>;

/**
 * Extracts the palette from the Tailwind config source.
 *
 * Throws when the shape isn't what's expected. A parser that returns `{}` on a
 * config it failed to understand hands every downstream check a free pass — the
 * exact failure this module exists to prevent.
 */
export function parsePalette(configSource: string, expectedSteps = 10): Palette {
  const palette: Palette = {};
  for (const family of PALETTE_FAMILIES) {
    const block = new RegExp(`\\b${family}:\\s*\\{([^}]*)\\}`).exec(configSource);
    if (!block) throw new Error(`palette family "${family}" not found in the Tailwind config`);
    const ramp: Record<string, string> = {};
    for (const m of block[1]!.matchAll(/(\d{2,3}):\s*"(#[0-9a-fA-F]{6})"/g)) {
      ramp[m[1]!] = m[2]!;
    }
    const count = Object.keys(ramp).length;
    if (count !== expectedSteps) {
      throw new Error(`family "${family}" parsed ${count} steps, expected ${expectedSteps}`);
    }
    palette[family] = ramp;
  }
  return palette;
}

export function auditPalette(palette: Palette): RampAudit[] {
  return Object.entries(palette).map(([family, ramp]) => auditRamp(family, ramp));
}

export interface ClassFinding {
  file: string;
  detail: string;
}

const CLASS_ATTR = /class(?:Name)?=(?:"([^"]*)"|\{`([^`]*)`\})/g;

/**
 * Finds elements whose hover colour equals their base colour.
 *
 * This is here because of a self-inflicted bug: an ordered string substitution
 * rewrote `bg-brand-700` without noticing it is a substring of
 * `hover:bg-brand-700`, so thirteen files ended up with no hover feedback at all.
 * Word boundaries fixed it; this check is what stops it recurring silently.
 */
export function findHoverEqualsBase(file: string, source: string): ClassFinding[] {
  const findings: ClassFinding[] = [];
  for (const attr of source.matchAll(CLASS_ATTR)) {
    const classes = attr[1] ?? attr[2] ?? "";
    for (const base of classes.matchAll(/(?<![\w:-])(bg|text|border)-([a-z]+)-(\d{2,3})\b/g)) {
      const [, prop, family, step] = base;
      if (new RegExp(`hover:${prop}-${family}-${step}\\b`).test(classes)) {
        findings.push({ file, detail: `${base[0]} has hover:${base[0]} — no visible hover state` });
      }
    }
  }
  return findings;
}

/** Finds raw Tailwind default families that should be semantic tokens. */
export function findRawDefaultFamilies(file: string, source: string): ClassFinding[] {
  const pattern = new RegExp(
    `\\b(?:bg|text|border|from|to|via|ring|divide|outline|shadow)-(${DEFAULT_FAMILIES.join("|")})-\\d{2,3}\\b`,
    "g"
  );
  return [...source.matchAll(pattern)].map((m) => ({
    file,
    detail: `${m[0]} is a raw default family — use a semantic token`,
  }));
}

/**
 * Renders the published contrast table.
 *
 * Generated, never typed. The hand-typed version had nine of twelve figures
 * wrong in the second decimal, because it was computed with the 0.03928 sRGB
 * erratum instead of 0.04045 — wrong by too little to change any verdict, and so
 * wrong in a way review could not catch.
 */
export function renderTokenTable(palette: Palette, background = "#ffffff"): string {
  const rows = PALETTE_FAMILIES.map((family) => {
    const ramp = palette[family]!;
    const six = formatRatio(contrastRatio(ramp["600"]!, background));
    const seven = formatRatio(contrastRatio(ramp["700"]!, background));
    return `| \`${family}\` | \`${ramp["600"]}\` | ${six} | \`${ramp["700"]}\` | ${seven} |`;
  });
  return [
    "| Token | 600 (default interactive) | on white | 700 (hover) | on white |",
    "| --- | --- | --- | --- | --- |",
    ...rows,
  ].join("\n");
}
