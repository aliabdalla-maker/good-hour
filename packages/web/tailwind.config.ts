import type { Config } from "tailwindcss";

export default {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Generated in OKLCH, not HSL. All six families share ONE perceptual
        // lightness ramp, so `600` means the same visual weight in every family
        // and a token can be swapped without re-checking contrast. Each family
        // keeps its own hue and chroma, read from the colours already in use, so
        // this is a structural fix rather than a rebrand.
        //
        // The invariant that matters: step 600 clears WCAG AA (4.5:1) for body
        // text on white, and 700 is a clearly darker hover. Reach for 600 by
        // default and the result is accessible without thinking about it.
        //
        // An earlier attempt generated these in HSL and had to be thrown away:
        // equal HSL lightness steps are not equal perceptual steps, so the dark
        // end collapsed (dL* 0.03) while the light end banded.
        brand: {
          50: "#f0f9f7", // 1.07:1
          100: "#daf1ed", // 1.18:1
          200: "#b7e4dd", // 1.39:1
          300: "#88d1c7", // 1.75:1
          400: "#4fb9ad", // 2.37:1
          500: "#059e92", // 3.32:1
          600: "#008277", // 4.71:1  <- default interactive, AA
          700: "#00665e", // 6.83:1  <- hover
          800: "#004c46", // 9.88:1
          900: "#00332f", // 13.81:1
        },
        // AI = violet, deliberately distinct from brand so autonomous
        // decisions read as "something intelligent happened here".
        ai: {
          50: "#f7f5ff", // 1.08:1
          100: "#ebe8ff", // 1.2:1
          200: "#dad2ff", // 1.43:1
          300: "#c3b4ff", // 1.86:1
          400: "#aa8eff", // 2.61:1
          500: "#9363ff", // 3.83:1
          600: "#7d3bef", // 5.61:1
          700: "#632bc0", // 7.95:1
          800: "#492090", // 11.09:1
          900: "#311562", // 14.81:1
        },
        // Semantic families. Previously these were raw Tailwind defaults
        // (emerald/amber/red/sky) across ~105 usages with no token at all,
        // which is why success and warning drifted between components.
        success: {
          50: "#f0f9f4", 100: "#daf2e5", 200: "#b7e6ce", 300: "#88d4b0", 400: "#50bc8f",
          500: "#09a271", 600: "#00855c", 700: "#006948", 800: "#004e34", 900: "#003522",
        },
        warning: {
          50: "#fef5ec", 100: "#fde7cf", 200: "#fad1a3", 300: "#f2b367", 400: "#e19000",
          500: "#bd7800", 600: "#9b6200", 700: "#7b4c00", 800: "#5c3800", 900: "#3f2500",
        },
        danger: {
          50: "#fff4f2", 100: "#ffe4e0", 200: "#ffcac3", 300: "#ffa59b", 400: "#ff7266",
          500: "#f43332", 600: "#d0121c", 700: "#a70511", 800: "#7d060c", 900: "#550708",
        },
        info: {
          50: "#f0f8ff", 100: "#d9eeff", 200: "#b6dfff", 300: "#85c9fc", 400: "#4dadf0",
          500: "#0a91da", 600: "#0077b4", 700: "#005d8f", 800: "#00456c", 900: "#002e4a",
        },
      },
      fontFamily: {
        /**
         * Display face for headings and the wordmark.
         *
         * The last remaining design weakness worth naming: everything was set in one
         * system sans, so a palette generated in OKLCH and enforced by tests still
         * read as well-executed default Tailwind. For a product asking strangers to
         * trust it with money, looking indistinguishable from a template is a
         * commercial problem, not a taste one.
         *
         * A system SERIF stack rather than a webfont, deliberately: it needs no
         * network request, cannot flash unstyled text, adds nothing to the bundle, and
         * cannot fail a build the way a font CDN can. It buys most of the identity for
         * none of the risk. A licensed display face is the upgrade path.
         */
        display: [
          "ui-serif",
          "Georgia",
          "Cambria",
          "Times New Roman",
          "Times",
          "serif",
        ],
        sans: [
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.25rem",
      },
      boxShadow: {
        card: "0 1px 3px rgba(15,23,42,0.08), 0 1px 2px rgba(15,23,42,0.04)",
        "card-hover": "0 8px 24px rgba(15,23,42,0.10)",
      },
      keyframes: {
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(4px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "toast-in": {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in-up": {
          from: { opacity: "0", transform: "translateY(16px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0)" },
          "50%": { transform: "translateY(-8px)" },
        },
        "gradient-pan": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
      },
      animation: {
        shimmer: "shimmer 1.5s infinite",
        "fade-in": "fade-in 0.2s ease-out",
        "toast-in": "toast-in 0.2s ease-out",
        "fade-in-up": "fade-in-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "scale-in": "scale-in 0.4s cubic-bezier(0.16,1,0.3,1) both",
        float: "float 6s ease-in-out infinite",
        "gradient-pan": "gradient-pan 12s ease infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
