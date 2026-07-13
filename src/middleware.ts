import { NextRequest, NextResponse } from "next/server";
import { auth0 } from "@/lib/auth0";
import { buildCsp } from "@/lib/csp";

/**
 * Public API endpoints reachable without an Auth0 session. Exact-match only.
 * The `/auth/*` namespace is implicitly public — those routes ARE the auth
 * flow (handled by `auth0.middleware`).
 */
const PUBLIC_API_PATHS = new Set([
  "/api/openapi",
  "/api/docs",
  "/api/csp-report",
]);

const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export async function middleware(request: NextRequest) {
  // Per-request CSP nonce. Forwarded to the render via the `x-nonce` and
  // `Content-Security-Policy` request headers (Next.js reads the latter to
  // tag every inline script it emits) and echoed on the response for the
  // browser. See src/lib/csp.ts for the policy.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = buildCsp(nonce);

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const withCsp = (res: NextResponse) => {
    res.headers.set("Content-Security-Policy", csp);
    return res;
  };

  // 1. Auth0 middleware runs first. It auto-mounts /auth/* routes and
  //    refreshes the session cookie. Its response carries Set-Cookie headers
  //    that we must propagate downstream.
  const authRes = await auth0.middleware(request);

  // 2. Auth0-owned routes: return immediately. The OAuth callback uses PKCE
  //    + state, so we don't apply the same-origin CSRF check to them.
  if (request.nextUrl.pathname.startsWith("/auth")) {
    return withCsp(authRes);
  }

  // 3. CSRF: same-origin enforcement on mutating requests. Browsers always
  //    send `Origin` on cross-site fetches and on same-origin POSTs; if it's
  //    present and the host doesn't match, the request is cross-origin.
  //    Server-side tools (curl, Postman) typically don't send `Origin`, so
  //    they pass — they'd still need a valid Auth0 session cookie.
  if (UNSAFE_METHODS.has(request.method)) {
    const origin = request.headers.get("origin");
    if (origin) {
      try {
        if (new URL(origin).host !== request.nextUrl.host) {
          return withCsp(
            NextResponse.json(
              { error: "Cross-origin request blocked" },
              { status: 403 }
            )
          );
        }
      } catch {
        return withCsp(
          NextResponse.json({ error: "Invalid Origin" }, { status: 403 })
        );
      }
    }
  }

  // 4. Session gate. Public endpoints bypass it. Per-route handlers also call
  //    `getUserWallets()` for defense in depth, but blocking here
  //    short-circuits before any DB work.
  if (!PUBLIC_API_PATHS.has(request.nextUrl.pathname)) {
    const session = await auth0.getSession(request);
    if (!session) {
      if (request.nextUrl.pathname.startsWith("/api/")) {
        return withCsp(
          NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        );
      }
      if (request.nextUrl.pathname.startsWith("/dashboard")) {
        return withCsp(NextResponse.redirect(new URL("/", request.url)));
      }
    }
  }

  // 5. Pass-through: forward the nonce-bearing request headers to the render
  //    and carry over the session cookies Auth0 just refreshed.
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  authRes.cookies.getAll().forEach((cookie) => res.cookies.set(cookie));
  return withCsp(res);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, sitemap.xml, robots.txt (metadata)
     * - public files with file extensions
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt|.*\\.).*)",
  ],
};
