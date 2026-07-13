/**
 * Content-Security-Policy builder. A fresh nonce is minted per request in
 * `src/middleware.ts` and threaded into `script-src` so Next.js can tag every
 * inline bootstrap/RSC script with it — `'strict-dynamic'` then lets those
 * trusted scripts load the rest of the bundle while blocking any injected
 * (XSS) script that lacks the nonce.
 *
 * `style-src` keeps `'unsafe-inline'`: React inline `style={{}}` attributes
 * (used by the Magic UI components) cannot carry a nonce. This is a far lower
 * risk than inline scripts and is the standard trade-off for React/Tailwind.
 */
export function buildCsp(nonce: string): string {
  const isDev = process.env.NODE_ENV === "development";
  const reportUri = process.env.CSP_REPORT_URI || "/api/csp-report";

  const directives = [
    "default-src 'self'",
    // 'unsafe-eval' is only needed by the dev HMR runtime; never in prod.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
      isDev ? " 'unsafe-eval'" : ""
    }`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' blob: data:",
    "font-src 'self'",
    // 'ws:' lets the dev HMR websocket connect; prod talks same-origin only.
    `connect-src 'self'${isDev ? " ws:" : ""}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `report-uri ${reportUri}`,
  ];

  // Upgrading to https on localhost http breaks local dev, so prod-only.
  if (!isDev) directives.push("upgrade-insecure-requests");

  return directives.join("; ");
}
