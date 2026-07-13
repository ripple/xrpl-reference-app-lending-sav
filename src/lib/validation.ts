/**
 * Small value-validators used across API routes. All return `null` when the
 * input is invalid so callers can compose them into early-return guards
 * without try/catch.
 */

/** Positive-integer drops amount (XRP). Rejects decimals and negatives. */
export function validateDrops(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0 || !Number.isInteger(num)) return null;
  return value;
}

/** Positive numeric amount (IOU decimal or pre-scaled MPT integer). */
export function validateAmount(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return null;
  return value;
}

/** Coerce + range-check a numeric input. */
export function validateNumber(
  value: unknown,
  min: number,
  max: number
): number | null {
  const num = Number(value);
  if (!Number.isFinite(num) || num < min || num > max) return null;
  return num;
}

/** MongoDB ObjectId (24 hex chars). */
const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;
export function validateObjectId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!OBJECT_ID_REGEX.test(value.trim())) return null;
  return value.trim();
}

/**
 * Coerce a UINT64-shaped input (number or numeric string) to its canonical
 * decimal-string form. Rejects non-integers, negatives, and values > 2^64-1.
 * Use this for ledger amount fields (e.g. `DebtMaximum`) where JS Number
 * precision (53 bits) would silently truncate large values.
 */
// 2^64 - 1. Built via BigInt constructor (not a literal) to keep this file
// compatible with the ES2017 target in tsconfig.json.
const UINT64_MAX = BigInt("18446744073709551615");
export function validateUint64Like(value: unknown): string | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value < 0 || !Number.isInteger(value)) return null;
    return String(value);
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!/^\d+$/.test(s)) return null;
  try {
    if (BigInt(s) > UINT64_MAX) return null;
  } catch {
    return null;
  }
  return s;
}

/**
 * Non-negative decimal amount (number or numeric string) → canonical string.
 * For ledger `NUMBER` fields such as `DebtMaximum` where fractional token
 * values are valid. Rejects negatives and non-finite input.
 */
export function validateDecimalAmount(value: unknown): string | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  const s = String(value).trim();
  // Canonical non-negative decimal only — rejects "", whitespace, "1e5", "0x1F",
  // and negatives (Number() alone would coerce all of those to a passing value).
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return s;
}

/**
 * Pick the right numeric validator based on asset type. IOU/MPT accept
 * decimal strings; XRP is always integer drops.
 */
export function validateAssetAmount(value: unknown, isToken: boolean): string | null {
  return isToken ? validateAmount(value) : validateDrops(value);
}

/** Trim, cap length, strip control characters. For user-supplied metadata. */
export function sanitizeString(value: unknown, maxLength: number): string {
  if (typeof value !== "string") return "";
  return value
    .trim()
    .slice(0, maxLength)
    .replace(/[\x00-\x1F\x7F]/g, "");
}
