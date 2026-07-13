/**
 * Allowed values for the MPT Token Metadata schema, shared between the
 * vault-creation form (client) and the API route (server) so the UI and the
 * server-side validation can't drift.
 *
 * Spec: https://xrpl.org/docs/concepts/tokens/fungible-tokens/multi-purpose-tokens#metadata-schema
 */

/** `asset_class` (ac) — REQUIRED. */
export const MPT_ASSET_CLASSES = [
  "rwa",
  "memes",
  "wrapped",
  "gaming",
  "defi",
  "other",
] as const;
export type MptAssetClass = (typeof MPT_ASSET_CLASSES)[number];

/** `asset_subclass` (as) — only applicable, and REQUIRED, when ac is "rwa". */
export const MPT_ASSET_SUBCLASSES = [
  "stablecoin",
  "commodity",
  "real_estate",
  "private_credit",
  "equity",
  "treasury",
  "other",
] as const;
export type MptAssetSubclass = (typeof MPT_ASSET_SUBCLASSES)[number];

/** Ticker (t): uppercase A–Z and digits, 1–6 characters. */
export const MPT_TICKER_RE = /^[A-Z0-9]{1,6}$/;
