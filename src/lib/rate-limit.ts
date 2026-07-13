import { NextResponse } from "next/server";
import { connectDB, RateLimitModel } from "./db";

/** Thrown by deeper layers (e.g. wallet provisioning) so the route handler
 *  can map it to a 429. Carries the suggested Retry-After in seconds. */
export class RateLimitError extends Error {
  constructor(public readonly retryAfterSec: number) {
    super("Rate limit exceeded");
    this.name = "RateLimitError";
  }
}

export interface RateLimitResult {
  ok: boolean;
  retryAfterSec: number;
}

/**
 * Fixed-window counter backed by MongoDB. The window is bucketed into the
 * key (`base:<bucket>`), so each window is its own document — incrementing is
 * a single atomic upsert and there is no in-place reset to race on. Expired
 * buckets are purged by the TTL index on the model.
 *
 * @param base       logical key, e.g. `tx:<userId>` or `provision:<ip>`
 * @param limit      max requests allowed within the window
 * @param windowSec  window length in seconds
 */
export async function checkRateLimit(
  base: string,
  limit: number,
  windowSec: number
): Promise<RateLimitResult> {
  await connectDB();

  const now = Date.now();
  const windowMs = windowSec * 1000;
  const bucket = Math.floor(now / windowMs);
  const windowEndMs = (bucket + 1) * windowMs;
  const key = `${base}:${bucket}`;
  // Grace past the window end so the TTL sweep never races an active counter.
  const expiresAt = new Date(windowEndMs + 60_000);

  let count: number;
  try {
    const doc = await RateLimitModel.findOneAndUpdate(
      { key },
      { $inc: { count: 1 }, $setOnInsert: { expiresAt } },
      { new: true, upsert: true }
    );
    count = doc.count;
  } catch (err) {
    // Two concurrent upserts can race on the unique key; the loser retries
    // and finds the now-existing doc.
    if (isDuplicateKeyError(err)) {
      const doc = await RateLimitModel.findOneAndUpdate(
        { key },
        { $inc: { count: 1 } },
        { new: true }
      );
      count = doc?.count ?? limit + 1;
    } else {
      throw err;
    }
  }

  const ok = count <= limit;
  return {
    ok,
    retryAfterSec: ok ? 0 : Math.ceil((windowEndMs - now) / 1000),
  };
}

/** Standard 429 response with a fixed message and a Retry-After header. */
export function tooManyRequests(retryAfterSec: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please slow down and try again shortly." },
    { status: 429, headers: { "Retry-After": String(retryAfterSec) } }
  );
}

/** Best-effort client IP from the proxy headers Vercel sets. */
export function getClientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip")?.trim() || "unknown";
}

function isDuplicateKeyError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code: number }).code === 11000
  );
}
