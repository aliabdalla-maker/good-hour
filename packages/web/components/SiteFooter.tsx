import Link from "next/link";

// Public contact address for the site. Override at build time with
// NEXT_PUBLIC_CONTACT_EMAIL; defaults to the domain contact.
const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL ?? "contact@goodhour.shop";

export function SiteFooter() {
  const year = new Date().getFullYear();
  return (
    <footer className="mt-16 border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-6 py-10 sm:grid-cols-3">
        <div>
          <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-brand-600 text-sm text-white">◷</span>
            Good Hours
          </div>
          <p className="mt-2 max-w-xs text-sm text-slate-500">
            Book rooms, cars &amp; travel by the hour from verified hosts.
          </p>
        </div>

        <div className="text-sm">
          <p className="mb-2 font-medium text-slate-700">Explore</p>
          <ul className="space-y-1 text-slate-500">
            <li><Link href="/browse" className="hover:text-slate-900">Browse listings</Link></li>
            <li><Link href="/search" className="hover:text-slate-900">Book instantly</Link></li>
            <li><Link href="/requests/new" className="hover:text-slate-900">Request a match</Link></li>
          </ul>
        </div>

        <div className="text-sm">
          <p className="mb-2 font-medium text-slate-700">Contact</p>
          <ul className="space-y-1 text-slate-500">
            <li>
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:text-brand-700">
                {CONTACT_EMAIL}
              </a>
            </li>
            <li>
              <a href={`mailto:${CONTACT_EMAIL}?subject=Support%20request`} className="hover:text-slate-900">
                Get support
              </a>
            </li>
          </ul>
        </div>
      </div>

      <div className="border-t border-slate-100">
        <div className="mx-auto max-w-5xl px-6 py-4 text-xs text-slate-400">
          © {year} Good Hours. A 1% platform fee applies to travellers and hosts on every booking.
        </div>
      </div>
    </footer>
  );
}
