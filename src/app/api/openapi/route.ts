import { readFile } from "fs/promises";
import path from "path";
import { NextResponse } from "next/server";

/**
 * Serves `docs/openapi.yaml` so external consumers (Postman, Stoplight,
 * auto-generated clients) can ingest the API description without cloning
 * the repo. Public — no auth required.
 *
 * Supports `Accept: application/json` conversion on demand for JSON-only
 * tools. YAML is the canonical source.
 */
export async function GET(request: Request) {
  const filePath = path.join(process.cwd(), "docs", "openapi.yaml");
  const yaml = await readFile(filePath, "utf8");

  const wantsJson = request.headers.get("accept")?.includes("application/json");
  if (wantsJson) {
    // Lazy-load the YAML parser — only needed on JSON requests and avoids
    // adding a mandatory client-bundle dependency.
    const { parse } = await import("yaml");
    return NextResponse.json(parse(yaml));
  }

  return new NextResponse(yaml, {
    status: 200,
    headers: {
      "Content-Type": "application/yaml; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
