import type { MetadataRoute } from "next";

/**
 * robots.txt served at /robots.txt. Disallows the `/api/*` surface
 * (everything behind `src/middleware.ts` auth) and the `/dashboard/*` routes;
 * the landing page and the public OpenAPI docs stay indexable.
 */
export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/terms", "/api/openapi", "/api/docs"],
        disallow: ["/dashboard/", "/api/session", "/api/vault", "/api/loan", "/api/broker"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
  };
}
