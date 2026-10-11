import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Join Good Hours to book by the hour, or list your rooms, cars and travel services.",
  alternates: { canonical: "/register" },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
