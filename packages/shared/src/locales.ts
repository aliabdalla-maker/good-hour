/**
 * The 40 languages the platform is prepared to serve — FR-034 (language half).
 *
 * ## What this list is
 *
 * The most-spoken languages in the world **restricted to those with a standard
 * written form and a stable BCP-47 tag**, because a marketplace ships text.
 *
 * That restriction changes the list, and it is worth being explicit about which
 * languages it drops rather than quietly producing a different forty. Wu, Yue,
 * Hakka and Min Nan Chinese are all in the global top 25 by speakers, but written
 * Chinese in commercial use is Standard Chinese in Simplified or Traditional script,
 * so they are represented by `zh-Hans` / `zh-Hant` rather than by spoken-variety
 * tags. Nigerian Pidgin (~120M speakers) has no standardised orthography. Bhojpuri
 * has no established web locale in practice. Their places go to languages a user is
 * realistically going to want an interface in: Polish, Ukrainian, Dutch, Malay,
 * Romanian, Greek.
 *
 * ## What the speaker figures are
 *
 * **Approximate, rounded, and used only for ordering.** They are total speakers
 * (first plus second language), which is the figure that matters for "who could use
 * this interface" — and totals vary by tens of millions between sources. They are
 * here to justify the ordering, not to be quoted.
 *
 * ## What `translation` means
 *
 * The honest part. Listing a locale is not the same as having translated into it,
 * and conflating the two is how a product ends up claiming forty languages while
 * showing English to thirty-nine of them.
 *
 *  - `source`   — English. The strings are written here.
 *  - `unreviewed` — a translation exists but has not been checked by a speaker of
 *                   the language. The UI says so, because a confidently wrong
 *                   translation of "You pay" is worse than English.
 *  - `pending`  — no strings yet; falls back to English per key.
 *
 * Nothing in this file promises a translation it does not have.
 */

export type TextDirection = "ltr" | "rtl";
export type TranslationStatus = "source" | "unreviewed" | "pending";

export interface LocaleDefinition {
  /** BCP-47 tag. Used verbatim in `<html lang>` and for Intl formatting. */
  code: string;
  /** The language's name in the language itself. What goes in the picker. */
  endonym: string;
  /** English name, for operator tooling and accessibility labels. */
  englishName: string;
  dir: TextDirection;
  /** Approximate total speakers in millions. Ordering only — see above. */
  approxSpeakersM: number;
  translation: TranslationStatus;
}

export const DEFAULT_LOCALE = "en";

/**
 * Ordered by approximate speaker count.
 *
 * Endonyms are written in the language's own script deliberately: a picker listing
 * "Arabic" in English is useless to somebody who cannot read English, which is
 * precisely the person the picker is for.
 */
export const LOCALES: LocaleDefinition[] = [
  { code: "en", endonym: "English", englishName: "English", dir: "ltr", approxSpeakersM: 1500, translation: "source" },
  { code: "zh-Hans", endonym: "简体中文", englishName: "Chinese (Simplified)", dir: "ltr", approxSpeakersM: 1100, translation: "unreviewed" },
  { code: "hi", endonym: "हिन्दी", englishName: "Hindi", dir: "ltr", approxSpeakersM: 610, translation: "unreviewed" },
  { code: "es", endonym: "Español", englishName: "Spanish", dir: "ltr", approxSpeakersM: 560, translation: "unreviewed" },
  { code: "ar", endonym: "العربية", englishName: "Arabic", dir: "rtl", approxSpeakersM: 370, translation: "unreviewed" },
  { code: "fr", endonym: "Français", englishName: "French", dir: "ltr", approxSpeakersM: 310, translation: "unreviewed" },
  { code: "bn", endonym: "বাংলা", englishName: "Bengali", dir: "ltr", approxSpeakersM: 270, translation: "pending" },
  { code: "pt", endonym: "Português", englishName: "Portuguese", dir: "ltr", approxSpeakersM: 265, translation: "unreviewed" },
  { code: "ru", endonym: "Русский", englishName: "Russian", dir: "ltr", approxSpeakersM: 255, translation: "unreviewed" },
  { code: "ur", endonym: "اردو", englishName: "Urdu", dir: "rtl", approxSpeakersM: 230, translation: "pending" },
  { code: "id", endonym: "Bahasa Indonesia", englishName: "Indonesian", dir: "ltr", approxSpeakersM: 200, translation: "pending" },
  { code: "de", endonym: "Deutsch", englishName: "German", dir: "ltr", approxSpeakersM: 135, translation: "unreviewed" },
  { code: "ja", endonym: "日本語", englishName: "Japanese", dir: "ltr", approxSpeakersM: 125, translation: "unreviewed" },
  { code: "zh-Hant", endonym: "繁體中文", englishName: "Chinese (Traditional)", dir: "ltr", approxSpeakersM: 100, translation: "pending" },
  { code: "mr", endonym: "मराठी", englishName: "Marathi", dir: "ltr", approxSpeakersM: 99, translation: "pending" },
  { code: "te", endonym: "తెలుగు", englishName: "Telugu", dir: "ltr", approxSpeakersM: 96, translation: "pending" },
  { code: "tr", endonym: "Türkçe", englishName: "Turkish", dir: "ltr", approxSpeakersM: 90, translation: "unreviewed" },
  { code: "ta", endonym: "தமிழ்", englishName: "Tamil", dir: "ltr", approxSpeakersM: 87, translation: "pending" },
  { code: "vi", endonym: "Tiếng Việt", englishName: "Vietnamese", dir: "ltr", approxSpeakersM: 86, translation: "pending" },
  { code: "tl", endonym: "Filipino", englishName: "Filipino (Tagalog)", dir: "ltr", approxSpeakersM: 83, translation: "pending" },
  { code: "ko", endonym: "한국어", englishName: "Korean", dir: "ltr", approxSpeakersM: 82, translation: "unreviewed" },
  { code: "fa", endonym: "فارسی", englishName: "Persian", dir: "rtl", approxSpeakersM: 79, translation: "pending" },
  { code: "ha", endonym: "Hausa", englishName: "Hausa", dir: "ltr", approxSpeakersM: 79, translation: "pending" },
  { code: "sw", endonym: "Kiswahili", englishName: "Swahili", dir: "ltr", approxSpeakersM: 72, translation: "pending" },
  { code: "jv", endonym: "Basa Jawa", englishName: "Javanese", dir: "ltr", approxSpeakersM: 68, translation: "pending" },
  { code: "pa", endonym: "ਪੰਜਾਬੀ", englishName: "Punjabi (Gurmukhi)", dir: "ltr", approxSpeakersM: 67, translation: "pending" },
  { code: "it", endonym: "Italiano", englishName: "Italian", dir: "ltr", approxSpeakersM: 65, translation: "unreviewed" },
  { code: "gu", endonym: "ગુજરાતી", englishName: "Gujarati", dir: "ltr", approxSpeakersM: 62, translation: "pending" },
  { code: "th", endonym: "ไทย", englishName: "Thai", dir: "ltr", approxSpeakersM: 61, translation: "pending" },
  { code: "am", endonym: "አማርኛ", englishName: "Amharic", dir: "ltr", approxSpeakersM: 60, translation: "pending" },
  { code: "kn", endonym: "ಕನ್ನಡ", englishName: "Kannada", dir: "ltr", approxSpeakersM: 59, translation: "pending" },
  { code: "yo", endonym: "Yorùbá", englishName: "Yoruba", dir: "ltr", approxSpeakersM: 46, translation: "pending" },
  { code: "my", endonym: "မြန်မာ", englishName: "Burmese", dir: "ltr", approxSpeakersM: 43, translation: "pending" },
  { code: "pl", endonym: "Polski", englishName: "Polish", dir: "ltr", approxSpeakersM: 41, translation: "unreviewed" },
  { code: "uk", endonym: "Українська", englishName: "Ukrainian", dir: "ltr", approxSpeakersM: 40, translation: "unreviewed" },
  { code: "ms", endonym: "Bahasa Melayu", englishName: "Malay", dir: "ltr", approxSpeakersM: 33, translation: "pending" },
  { code: "ro", endonym: "Română", englishName: "Romanian", dir: "ltr", approxSpeakersM: 25, translation: "pending" },
  { code: "nl", endonym: "Nederlands", englishName: "Dutch", dir: "ltr", approxSpeakersM: 25, translation: "unreviewed" },
  { code: "ne", endonym: "नेपाली", englishName: "Nepali", dir: "ltr", approxSpeakersM: 25, translation: "pending" },
  { code: "el", endonym: "Ελληνικά", englishName: "Greek", dir: "ltr", approxSpeakersM: 13, translation: "pending" },
];

export const LOCALE_CODES = LOCALES.map((l) => l.code);

const BY_CODE = new Map(LOCALES.map((l) => [l.code.toLowerCase(), l]));

export function getLocale(code: string | null | undefined): LocaleDefinition {
  if (!code) return BY_CODE.get(DEFAULT_LOCALE)!;
  const lower = code.toLowerCase();

  const exact = BY_CODE.get(lower);
  if (exact) return exact;

  // Aliases before base-tag truncation: `zh-SG` must reach zh-Hans, and truncating
  // it to `zh` first finds nothing.
  //
  // BY_CODE is keyed on LOWERCASED tags, so the alias value has to be lowercased on
  // the way in. It wasn't, and `getLocale("zh-SG")` silently returned English — a
  // Singaporean user getting an English interface with no error anywhere. Caught by
  // the test, not by reading.
  const aliased = REGION_ALIASES[lower];
  if (aliased) return BY_CODE.get(aliased.toLowerCase())!;

  const base = lower.split("-")[0]!;
  const byBase = BY_CODE.get(base);
  if (byBase) return byBase;

  const aliasedBase = REGION_ALIASES[base];
  if (aliasedBase) return BY_CODE.get(aliasedBase.toLowerCase())!;

  return BY_CODE.get(DEFAULT_LOCALE)!;
}

/**
 * Region tags real browsers send that need mapping to a script-based locale.
 *
 * `zh-CN` is Simplified and `zh-TW` is Traditional; falling back on the base tag
 * `zh` would land on neither, which is how a Taiwanese user ends up reading
 * Simplified characters.
 */
const REGION_ALIASES: Record<string, string> = {
  "zh-cn": "zh-Hans",
  "zh-sg": "zh-Hans",
  "zh-hans-cn": "zh-Hans",
  "zh-tw": "zh-Hant",
  "zh-hk": "zh-Hant",
  "zh-mo": "zh-Hant",
  zh: "zh-Hans",
};

export function isRtl(code: string): boolean {
  return getLocale(code).dir === "rtl";
}

/**
 * Picks the best supported locale from an `Accept-Language` header.
 *
 * Honours q-weights, because a browser sending `fr;q=0.9, en;q=0.8` is expressing a
 * preference and ignoring it is the difference between detection and guessing. Falls
 * back to English rather than to the first supported thing found, since an unexpected
 * language is more disorienting than the default.
 */
export function resolveLocale(acceptLanguage: string | null | undefined): string {
  if (!acceptLanguage) return DEFAULT_LOCALE;

  const ranked = acceptLanguage
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => /^\s*q\s*=\s*([\d.]+)\s*$/.exec(p))
        .find(Boolean);
      return { tag: (tag ?? "").trim(), q: q ? Number(q[1]) : 1 };
    })
    .filter((x) => x.tag.length > 0 && !Number.isNaN(x.q))
    .sort((a, b) => b.q - a.q);

  for (const { tag } of ranked) {
    if (tag === "*") break;
    const lower = tag.toLowerCase();
    if (BY_CODE.has(lower)) return BY_CODE.get(lower)!.code;
    if (REGION_ALIASES[lower]) return REGION_ALIASES[lower];
    const base = lower.split("-")[0]!;
    if (BY_CODE.has(base)) return BY_CODE.get(base)!.code;
    if (REGION_ALIASES[base]) return REGION_ALIASES[base];
  }
  return DEFAULT_LOCALE;
}

/** Cookie the chosen locale is remembered in. Readable by the server on SSR. */
export const LOCALE_COOKIE = "gh_locale";
