import Link from "next/link";
import { BUYER_FEE_LABEL } from "@gihtcx/shared";

// Public contact address for the site. Override at build time with
// NEXT_PUBLIC_CONTACT_EMAIL; defaults to the company contact.
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "admin@softwareequality.com";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 py-10 sm:grid-cols-4">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm text-white">◷</span>
            Good Hours
          </div>
          <p className="mt-2 max-w-xs text-sm text-slate-500">
            Book{" "}
            <Link href="/browse?category=ROOM" className="text-brand-600 hover:text-brand-700 hover:underline">rooms</Link>,{" "}
            <Link href="/browse?category=CAR" className="text-brand-600 hover:text-brand-700 hover:underline">cars</Link> &amp;{" "}
            <Link href="/browse?category=TRAVEL_SERVICE" className="text-brand-600 hover:text-brand-700 hover:underline">travel</Link>{" "}
            <Link href="/search" className="text-brand-600 hover:text-brand-700 hover:underline">by the hour</Link> from{" "}
            <Link href="/register" className="text-brand-600 hover:text-brand-700 hover:underline">verified hosts</Link>.
          </p>
        </div>

        <div className="text-sm">
          <p className="mb-2 font-medium text-slate-700">Explore</p>
          <ul className="space-y-1 text-slate-500">
            <li><Link href="/browse" className="inline-flex min-h-6 items-center hover:text-slate-900">Browse listings</Link></li>
            <li><Link href="/search" className="inline-flex min-h-6 items-center hover:text-slate-900">Book instantly</Link></li>
            <li><Link href="/requests/new" className="inline-flex min-h-6 items-center hover:text-slate-900">Request a match</Link></li>
            <li><Link href="/guides" className="inline-flex min-h-6 items-center hover:text-slate-900">City guides</Link></li>
          </ul>
        </div>

        <div className="text-sm">
          <p className="mb-2 font-medium text-slate-700">Legal</p>
          <ul className="space-y-1 text-slate-500">
            <li><Link href="/terms" className="inline-flex min-h-6 items-center hover:text-slate-900">Terms of Service</Link></li>
            <li><Link href="/privacy" className="inline-flex min-h-6 items-center hover:text-slate-900">Privacy Policy</Link></li>
            <li><Link href="/privacy#cookies" className="inline-flex min-h-6 items-center hover:text-slate-900">Cookies</Link></li>
          </ul>
        </div>

        <div className="text-sm">
          <p className="mb-2 font-medium text-slate-700">Contact</p>
          <ul className="space-y-1 text-slate-500">
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="inline-flex min-h-6 items-center text-brand-600 hover:text-brand-700">
                {CONTACT_EMAIL}
              </a>
            </li>
            <li>
              <a href={`mailto:${CONTACT_EMAIL}?subject=Support%20request`} className="inline-flex min-h-6 items-center hover:text-slate-900">
                Get support
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-100">
        <div className="mx-auto max-w-5xl px-6 py-4 text-xs text-slate-500">
          <p>© {year} Good Hours. A {BUYER_FEE_LABEL} platform fee applies to travellers and hosts on every booking.</p>
          <p className="mt-1">
            Good Hours is operated by{" "}
            <a href="https://www.softwareequality.com" className="inline-flex min-h-6 items-center hover:text-slate-600" target="_blank" rel="noopener noreferrer">
              Equality Software Ltd
            </a>{" "}
            (Company No. 15006381), registered in England (London, United Kingdom).
          </p>
        </div>
      </div>
    </footer>
  );
}
