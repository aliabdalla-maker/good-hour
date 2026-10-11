import type { MetadataRoute } from "next";

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.goodhour.shop";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/admin", "/dashboard", "/wallet", "/notifications", "/booking", "/sourcing", "/login",
        "/auctions/mine", "/auctions/new", "/market/new", "/market/orders", "/requests/*/offers",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
