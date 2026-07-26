import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "./providers";
import { NavBar } from "../components/NavBar";
import { AssistantWidget } from "../components/AssistantWidget";

export const metadata: Metadata = {
  title: "Good Hours — Hourly Hotel Room Booking",
  description: "Agentic AI hourly hotel room marketplace",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>
          <NavBar />
          <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
          <AssistantWidget />
        </Providers>
      </body>
    </html>
  );
}
