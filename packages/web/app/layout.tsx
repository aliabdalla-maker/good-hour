import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { NavBar } from "../components/NavBar";
import { SiteFooter } from "../components/SiteFooter";
import { AssistantWidget } from "../components/AssistantWidget";
import { TranslationNotice } from "../components/LanguagePicker";

export const metadata: Metadata = {
  title: "Good Hours — Hourly Hotel Room Booking",
  description: "Agentic AI hourly hotel room marketplace",
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
