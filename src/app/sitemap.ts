import type { MetadataRoute } from "next";

/**
 * Minimal sitemap covering the two public pages. The dashboard is auth-gated
 * and API routes are excluded via robots.ts.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const lastModified = new Date();
  return [
    { url: `${base}/`, lastModified, changeFrequency: "monthly", priority: 1.0 },
    { url: `${base}/api/docs`, lastModified, changeFrequency: "monthly", priority: 0.5 },
  ];
}
