"use client";

import { useCallback, useEffect, useState } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, getLocale, resolveLocale, t, type MessageKey } from "@gihtcx/shared";

/**
 * The reader's language.
 *
 * Resolution order, and the reason for it:
 *
 *   1. **The cookie** — an explicit choice. It must win over everything, because a
 *      user who picked a language and got overridden by their browser settings will
 *      assume the picker is broken.
 *   2. **`navigator.languages`** — the browser's preference list, q-weights and all.
 *   3. **English.**
 *
 * Applied on the client rather than during SSR. That is a deliberate limitation
 * worth naming: the first paint is English, and the locale is applied on hydration,
 * so a non-English reader may see a flash of English navigation. Doing it properly
 * needs middleware reading the cookie and the Accept-Language header before render,
 * which is the next step here — not something this hook pretends to have done.
 */
export function useLocale() {
  const [locale, setLocaleState] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    const fromCookie = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${LOCALE_COOKIE}=`))
      ?.split("=")[1];

    const chosen = fromCookie
      ? getLocale(decodeURIComponent(fromCookie)).code
      : resolveLocale(navigator.languages?.join(",") ?? navigator.language);

    setLocaleState(chosen);
  }, []);

  // `dir` and `lang` live on <html>, which React does not own — so they are set
  // imperatively. Without the dir change, an Arabic or Urdu reader gets right-to-left
  // text in a left-to-right layout, which is worse than untranslated English.
  useEffect(() => {
    const def = getLocale(locale);
    document.documentElement.lang = def.code;
    document.documentElement.dir = def.dir;
  }, [locale]);

  const setLocale = useCallback((code: string) => {
    const def = getLocale(code);
    // A year, path-wide, Lax: a language preference is not sensitive and should
    // survive a return visit, but it has no business travelling cross-site.
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(def.code)}; path=/; max-age=31536000; samesite=lax`;
    setLocaleState(def.code);
  }, []);

  const translate = useCallback((key: MessageKey) => t(locale, key), [locale]);

  return { locale, definition: getLocale(locale), setLocale, t: translate };
}
