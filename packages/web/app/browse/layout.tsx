import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Browse rooms, cars & travel by the hour",
  description: "Explore hourly rooms, cars and travel services from verified hosts on Good Hours.",
  alternates: { canonical: "/browse" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
