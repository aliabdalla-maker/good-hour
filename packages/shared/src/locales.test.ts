import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_CODES,
  getLocale,
  isRtl,
  resolveLocale,
} from "./locales";
import { MESSAGE_KEYS, hasCatalogue, t, translationCoverage } from "./messages";

test("there are exactly 40 locales, each with a unique BCP-47 tag", () => {
  assert.equal(LOCALES.length, 40);
  assert.equal(new Set(LOCALE_CODES).size, 40, "duplicate locale codes");
  for (const l of LOCALES) {
    // Language subtag, optionally a script subtag. Region tags are resolved to these.
    assert.match(l.code, /^[a-z]{2,3}(-[A-Z][a-z]{3})?$/, `bad tag: ${l.code}`);
  }
});

test("every locale names itself in its own script", () => {
  for (const l of LOCALES) {
    assert.ok(l.endonym.length > 0, `${l.code} has no endonym`);
    assert.ok(l.englishName.length > 0, `${l.code} has no English name`);
    // A picker listing "Arabic" in English is useless to someone who cannot read
    // English — which is exactly who the picker is for. So non-Latin-script
    // languages must carry a non-ASCII endonym.
    const nonLatinScript = ["zh-Hans", "zh-Hant", "hi", "ar", "bn", "ur", "ja", "mr", "te", "ta", "ko", "fa", "pa", "gu", "th", "am", "kn", "my", "ru", "uk", "el", "ne"];
    if (nonLatinScript.includes(l.code)) {
      // Code points rather than a character-class range: the range form of this
      // check was silently a control-character class, which ESLint caught and which
      // would have passed for every input.
      const hasNonAscii = [...l.endonym].some((ch) => ch.codePointAt(0)! > 127);
      assert.ok(hasNonAscii, `${l.code} endonym is ASCII: ${l.endonym}`);
    }
  }
});

test("right-to-left is set for exactly the RTL scripts present", () => {
  const rtl = LOCALES.filter((l) => l.dir === "rtl").map((l) => l.code).sort();
  // Arabic, Persian and Urdu. Getting this wrong mirrors the entire layout for
  // hundreds of millions of people, so it is asserted explicitly rather than trusted.
  assert.deepEqual(rtl, ["ar", "fa", "ur"]);
  assert.ok(isRtl("ar"));
  assert.ok(isRtl("ur"));
  assert.ok(!isRtl("en"));
  assert.ok(!isRtl("he"), "he is not in the registry and must not report RTL");
});

test("locales are ordered by approximate speaker count", () => {
  const counts = LOCALES.map((l) => l.approxSpeakersM);
  assert.deepEqual(counts, [...counts].sort((a, b) => b - a), "list is not in descending order");
});

test("English is the source locale and the only one", () => {
  const sources = LOCALES.filter((l) => l.translation === "source");
  assert.deepEqual(sources.map((l) => l.code), [DEFAULT_LOCALE]);
});

test("a locale claiming a translation actually has one, and vice versa", () => {
  // The claim this whole file exists to keep honest: listing forty languages is not
  // the same as having translated into forty languages.
  for (const l of LOCALES) {
    if (l.translation === "pending") {
      assert.ok(!hasCatalogue(l.code), `${l.code} is marked pending but has a catalogue`);
    } else {
      assert.ok(hasCatalogue(l.code), `${l.code} claims a translation but has no catalogue`);
      assert.equal(
        translationCoverage(l.code),
        1,
        `${l.code} claims a translation but covers only ${Math.round(translationCoverage(l.code) * 100)}% of keys`
      );
    }
  }
});

test("every translated locale discloses that it is unreviewed, in its own language", () => {
  for (const l of LOCALES) {
    if (l.translation !== "unreviewed") continue;
    const disclosure = t(l.code, "locale.unreviewed");
    assert.ok(disclosure.length > 10, `${l.code} has no unreviewed disclosure`);
    assert.notEqual(
      disclosure,
      t("en", "locale.unreviewed"),
      `${l.code} discloses in English — the person who needs this notice cannot read it`
    );
  }
});

test("a pending locale falls back to English per key, not to nothing", () => {
  assert.equal(t("bn", "nav.wallet"), "Wallet");
  assert.equal(t("sw", "common.search"), "Search");
  // And an unknown locale behaves like the default rather than throwing.
  assert.equal(t("xx-YY", "nav.browse"), "Browse");
});

test("fallback is per key, so a partial catalogue shows what it has", () => {
  // The property that lets the catalogue grow one string at a time.
  assert.equal(t("fr", "nav.wallet"), "Portefeuille");
  for (const key of MESSAGE_KEYS) {
    assert.ok(t("fr", key).length > 0, `fr:${key} resolved to empty`);
  }
});

test("Accept-Language honours q-weights rather than taking the first tag", () => {
  // A browser sending a weighted list is expressing a preference; ignoring it is the
  // difference between detection and guessing.
  assert.equal(resolveLocale("en;q=0.2, fr;q=0.9"), "fr");
  assert.equal(resolveLocale("de-AT,de;q=0.9,en;q=0.5"), "de");
  assert.equal(resolveLocale("pt-BR,pt;q=0.9"), "pt");
});

test("Chinese region tags resolve to the right script, not to a base tag", () => {
  // zh-TW is Traditional and zh-CN is Simplified. Falling back on bare `zh` lands a
  // Taiwanese user in Simplified characters.
  assert.equal(resolveLocale("zh-TW"), "zh-Hant");
  assert.equal(resolveLocale("zh-HK"), "zh-Hant");
  assert.equal(resolveLocale("zh-CN"), "zh-Hans");
  assert.equal(resolveLocale("zh"), "zh-Hans");
  assert.equal(getLocale("zh-SG").code, "zh-Hans");
});

test("an unsupported or absent Accept-Language falls back to English", () => {
  // Not to the first supported thing found: an unexpected language is more
  // disorienting than the default.
  assert.equal(resolveLocale(null), "en");
  assert.equal(resolveLocale(""), "en");
  assert.equal(resolveLocale("*"), "en");
  assert.equal(resolveLocale("kl,gv;q=0.8"), "en");
});

test("malformed Accept-Language headers do not throw", () => {
  for (const header of [";;;", "en;q=", "en;q=abc", ",,", "en;;q=0.5", "  "]) {
    assert.doesNotThrow(() => resolveLocale(header), `threw on ${JSON.stringify(header)}`);
    assert.ok(LOCALE_CODES.includes(resolveLocale(header)));
  }
});

test("speaker figures are plausible and clearly approximate", () => {
  for (const l of LOCALES) {
    assert.ok(l.approxSpeakersM > 0 && l.approxSpeakersM <= 2000, `${l.code}: ${l.approxSpeakersM}M`);
    // Rounded, because the underlying totals differ by tens of millions between
    // sources and false precision here would be a claim nobody can support.
    assert.equal(l.approxSpeakersM, Math.round(l.approxSpeakersM));
  }
});
