import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Hourly auctions",
  description: "Bid on products and services by the hour \u2014 set a ceiling and let your AI agent bid for you.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
