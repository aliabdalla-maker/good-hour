import js from "@eslint/js";
import tseslint from "typescript-eslint";

/**
 * The API's modules, listed so the boundary rule below can name them.
 *
 * Keep in sync with packages/api/src/modules/ — a module missing from here is
 * simply unenforced, which is the known limit of the approach.
 */
const API_MODULES = [
  "agent-log",
  "assistant",
  "auctions",
  "auth",
  "bidding",
  "booking",
  "credits",
  "crm",
  "erp",
  "listings",
  "marketplace",
  "messages",
  "negotiation-agent",
  "notifications",
  "payments",
  "pricing-agent",
  "reviews",
  "search",
  "sourcing",
  "verification",
  "wallet",
];

// Flat config. Type-checking (tsc) is the strict gate; ESLint catches the class
// of issues types don't — unused code, empty blocks, footguns — without a
// type-aware pass (kept off for speed and to avoid false positives in CI).
export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.turbo/**",
      "packages/db/generated/**",
      "**/*.config.{js,cjs,mjs,ts}",
      "**/next-env.d.ts",
    ],
  },
  {
    files: ["**/*.{ts,tsx}"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    rules: {
      // TypeScript itself resolves identifiers, so no-undef only false-positives here.
      "no-undef": "off",
      "no-empty": ["warn", { allowEmptyCatch: true }],
      "prefer-const": "warn",
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrors: "none" },
      ],
    },
  },
  {
    // Module boundary enforcement for the API's modular monolith.
    //
    // ARCHITECTURE.md asserted this rule existed for months while it did not —
    // the original plan called for it, and the plan got restated in the
    // indicative mood. Adding it makes the document true rather than aspirational.
    //
    // WHAT IT CATCHES, precisely: a named sibling module's internals reached past
    // its index barrel, at one or two levels up — `../listings/service` and
    // `../../listings/service`. Correct cross-module access is `../listings`,
    // which resolves to index.ts and is untouched, as are intra-module imports
    // (`./service`) and shared infrastructure (`../../config`, `../../plugins/*`).
    //
    // WHAT IT DOES NOT CATCH: a module added to src/modules/ but not to the list
    // below, and anything reached through a path alias or a re-export chain. It is
    // enumeration, not proof.
    //
    // A note on why it is enumerated rather than glob-shaped: the obvious pattern
    // `../*/*` also matches `../../config`, because ESLint's `*` matches a literal
    // `..` segment. That version reported 40+ violations of which 9 were real —
    // a checker whose noise would have got it deleted within a week.
    //
    // Those 9 were real, and are now fixed: auth/session, wallet/ledger,
    // payments/stripeClient and listings/service were all being deep-imported.
    files: ["packages/api/src/modules/**/*.ts"],
    ignores: ["**/*.test.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: API_MODULES.flatMap((m) => [`../${m}/*`, `../../${m}/*`]),
              message:
                "Cross-module deep import. Import the module's barrel instead (e.g. '../listings', not '../listings/service'), and add the export to its index.ts if it isn't there yet.",
            },
          ],
        },
      ],
    },
  }
);
