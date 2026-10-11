import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Products & services",
  description: "Buy products or hire professional time by the hour, day or project on Good Hours.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
