import js from "@eslint/js";
import tseslint from "typescript-eslint";

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
  }
);
