import type { ReactNode } from "react";

export const LEGAL_CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "admin@softwareequality.com";
export const COMPANY_LINE =
  "Equality Software Ltd, a company registered in England and Wales (Company No. 15006381), London, United Kingdom";

/** Shared layout for the Privacy Policy and Terms pages: readable measure, clear headings. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <article className="mx-auto max-w-3xl">
      <h1 className="font-display text-3xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-slate-500">Last updated: {updated}</p>
      <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-slate-700">{children}</div>
    </article>
  );
}

export function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="scroll-mt-24">
      <h2 className="font-display mb-3 text-xl font-semibold text-slate-900">{title}</h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function List({ children }: { children: ReactNode }) {
  return <ul className="list-disc space-y-1.5 ps-5">{children}</ul>;
}
