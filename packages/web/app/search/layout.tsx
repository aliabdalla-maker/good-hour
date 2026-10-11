import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Book instantly by city & time",
  description: "Search hourly availability by city and time and book a guaranteed slot instantly.",
  alternates: { canonical: "/search" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
