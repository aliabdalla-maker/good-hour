import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { NavBar } from "../components/NavBar";
import { SiteFooter } from "../components/SiteFooter";
import { AssistantWidget } from "../components/AssistantWidget";
import { TranslationNotice } from "../components/LanguagePicker";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.goodhour.shop";
const SITE_DESCRIPTION =
  "Book rooms, cars and travel services by the hour from verified hosts. Pay instantly, or let AI agents compete for your booking in a reverse auction.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Good Hours: Book rooms, cars & travel by the hour",
    template: "%s · Good Hours",
  },
  description: SITE_DESCRIPTION,
  applicationName: "Good Hours",
  openGraph: {
    type: "website",
    siteName: "Good Hours",
    url: SITE_URL,
    title: "Good Hours: Book rooms, cars & travel by the hour",
    description: SITE_DESCRIPTION,
    locale: "en_GB",
  },
  twitter: {
    card: "summary",
    title: "Good Hours: Book rooms, cars & travel by the hour",
    description: SITE_DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // lang and dir start at English and are corrected on hydration by useLocale.
    // Doing it before first paint needs middleware reading the cookie and
    // Accept-Language — noted in useLocale.ts rather than glossed over.
    <html lang="en" dir="ltr">
      <body>
        <Providers>
          <TranslationNotice />
          <NavBar />
          <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
          <SiteFooter />
          <AssistantWidget />
        </Providers>
      </body>
    </html>
  );
}
