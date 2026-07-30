"use client";

import { useState } from "react";
import { LOCALES } from "@gihtcx/shared";
import { useLocale } from "../lib/useLocale";
import { cn } from "../lib/cn";

/**
 * Language picker.
 *
 * Three decisions that matter more than they look:
 *
 * **Every language is named in its own script.** A list reading "Arabic", "Hindi",
 * "Japanese" in English is useless to the one person it exists for — someone who
 * cannot read English. The English name is kept alongside, for anyone using the site
 * in English to help somebody else.
 *
 * **Untranslated languages are shown, and labelled.** Hiding them would be tidier and
 * less honest: a Bengali speaker is better served by seeing Bengali listed with
 * "English for now" than by concluding the site has never heard of it. Selecting one
 * still sets `lang`/`dir` correctly, which fixes hyphenation, screen-reader
 * pronunciation and quotation marks even while the words stay English.
 *
 * **Reviewed status is disclosed, in the target language.** A translation nobody has
 * checked is a liability on a page about money, and the notice is worthless if the
 * reader can't read it.
 */

const STATUS_CHIP: Record<string, { label: string; className: string }> = {
  source: { label: "", className: "" },
  unreviewed: { label: "unreviewed", className: "bg-warning-50 text-warning-800" },
  pending: { label: "English for now", className: "bg-slate-100 text-slate-600" },
};

export function LanguagePicker({ compact = false }: { compact?: boolean }) {
  const { locale, definition, setLocale, t } = useLocale();
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={t("locale.picker")}
        className={cn(
          "inline-flex min-h-6 items-center gap-1.5 rounded-lg text-slate-600 transition hover:text-slate-900",
          compact ? "px-2 py-2" : "px-2 py-1.5"
        )}
      >
        <span aria-hidden="true">🌐</span>
        <span className="text-sm">{definition.endonym}</span>
      </button>

      {open && (
        <>
          {/* Click-away. Focusable siblings stay reachable because this sits behind. */}
          <button
            type="button"
            aria-hidden="true"
            tabIndex={-1}
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div
            role="listbox"
            aria-label={t("locale.picker")}
            // start/end rather than left/right: in an RTL layout a hard-coded `end-0`
            // puts the menu off the wrong edge of the screen.
            className="absolute end-0 z-50 mt-1 max-h-96 w-72 animate-fade-in overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg"
          >
            {LOCALES.map((l) => {
              const chip = STATUS_CHIP[l.translation]!;
              const selected = l.code === locale;
              return (
                <button
                  key={l.code}
                  role="option"
                  aria-selected={selected}
                  lang={l.code}
                  dir={l.dir}
                  onClick={() => {
                    setLocale(l.code);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-start text-sm transition",
                    selected ? "bg-brand-50 text-brand-800" : "text-slate-700 hover:bg-slate-50"
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{l.endonym}</span>
                    {/* Latin name too, so an English speaker can help someone find theirs. */}
                    <span className="block truncate text-xs text-slate-500" lang="en" dir="ltr">
                      {l.englishName}
                    </span>
                  </span>
                  {chip.label && (
                    <span
                      className={cn("shrink-0 rounded-md px-1.5 py-0.5 text-xs", chip.className)}
                      lang="en"
                      dir="ltr"
                    >
                      {chip.label}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

/** The disclosure banner, shown once per page when the translation is unreviewed. */
export function TranslationNotice() {
  const { definition, t } = useLocale();
  if (definition.translation !== "unreviewed") return null;
  return (
    <p className="border-b border-warning-200 bg-warning-50 px-6 py-2 text-center text-xs text-warning-800">
      {t("locale.unreviewed")}
    </p>
  );
}
