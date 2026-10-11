import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.goodhour.shop";

// Public, indexable pages. Listing pages (/room/[id], /market/[id]) can be added
// here later by fetching the catalogue from the API.
const ROUTES: { path: string; priority: number; changeFrequency: "daily" | "weekly" | "monthly" }[] = [
  { path: "/browse", priority: 1, changeFrequency: "daily" },
  { path: "/search", priority: 0.9, changeFrequency: "daily" },
  { path: "/requests/new", priority: 0.8, changeFrequency: "weekly" },
  { path: "/market", priority: 0.7, changeFrequency: "daily" },
  { path: "/auctions", priority: 0.6, changeFrequency: "daily" },
  { path: "/guides", priority: 0.6, changeFrequency: "monthly" },
  { path: "/register", priority: 0.5, changeFrequency: "monthly" },
  { path: "/terms", priority: 0.2, changeFrequency: "monthly" },
  { path: "/privacy", priority: 0.2, changeFrequency: "monthly" },
];

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return ROUTES.map((r) => ({
    url: `${SITE_URL}${r.path}`,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
