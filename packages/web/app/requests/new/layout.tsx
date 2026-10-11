import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Request a match \u2014 AI reverse auction",
  description: "Tell hosts what you need and let them and their AI agents bid for your booking.",
  alternates: { canonical: "/requests/new" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
