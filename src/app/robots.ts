import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

/** Crawl the public research pages; keep APIs and per-account pages out of the index. */
export default function robots(): MetadataRoute.Robots {
  const base = env().APP_URL.replace(/\/$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin", "/settings", "/profile", "/billing", "/welcome", "/signin"],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
