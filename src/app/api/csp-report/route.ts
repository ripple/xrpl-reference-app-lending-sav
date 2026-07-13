import { NextRequest, NextResponse } from "next/server";

/**
 * Collector for `report-uri` violation reports emitted by the CSP set in
 * middleware. Browsers POST a JSON body (content-type
 * `application/csp-report`) describing each blocked resource. We log it so
 * the policy can be tightened or loosened from real traffic. Public — no auth
 * (the browser sends these without credentials) and exempt from the CSRF
 * check via PUBLIC_API_PATHS.
 */
export async function POST(request: NextRequest) {
  try {
    const report = await request.json();
    // The interesting payload lives under "csp-report".
    console.warn("[csp-report]", JSON.stringify(report["csp-report"] ?? report));
  } catch {
    // Malformed or empty body — nothing actionable to log.
  }
  return new NextResponse(null, { status: 204 });
}
