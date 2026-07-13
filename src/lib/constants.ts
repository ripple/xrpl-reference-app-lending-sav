import { APP_ISSUER_NAME } from "@/lib/branding";

export const XRPL_NETWORK_URL =
  process.env.XRPL_NETWORK_URL || "wss://s.devnet.rippletest.net:51233/";

export const XRPL_FAUCET_URL =
  process.env.XRPL_FAUCET_URL ||
  "https://faucet.devnet.rippletest.net/accounts";

/**
 * App identifier stamped as `SourceTag` on every transaction we submit, so
 * this app's on-chain activity can be filtered/analyzed later. Read from
 * `XRPL_SOURCE_TAG`; unset means transactions carry no SourceTag.
 * Must be a 32-bit unsigned integer (0 – 4,294,967,295).
 */
export const SOURCE_TAG: number | undefined = (() => {
  const raw = process.env.XRPL_SOURCE_TAG;
  if (!raw) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 4_294_967_295) {
    throw new Error(
      `XRPL_SOURCE_TAG must be an integer in [0, 4294967295] (got "${raw}")`
    );
  }
  return n;
})();

/**
 * Stamp the configured `SOURCE_TAG` onto a transaction before autofill.
 * No-op (returns the tx unchanged) when `XRPL_SOURCE_TAG` is unset.
 */
export function withSourceTag<T extends Record<string, unknown>>(tx: T): T {
  if (SOURCE_TAG !== undefined) (tx as Record<string, unknown>).SourceTag = SOURCE_TAG;
  return tx;
}

export const DROPS_PER_XRP = 1_000_000;
export const SECONDS_PER_DAY = 86_400;
// XLS-66 §A-2.1: amortization uses a fixed 365-day year.
export const SECONDS_PER_YEAR = 365 * SECONDS_PER_DAY;
// Ripple epoch = 2000-01-01 UTC; Unix-seconds offset for converting on-chain timestamps.
export const RIPPLE_EPOCH_OFFSET = 946_684_800;

/** Current time in seconds since the Ripple epoch (client wall clock). */
export function nowRippleSeconds(): number {
  return Math.floor(Date.now() / 1000) - RIPPLE_EPOCH_OFFSET;
}

/**
 * `Loan` ledger-OBJECT flags (XLS-66 §3.2.3). These differ from the LoanSet /
 * LoanManage *transaction*-flag enums — e.g. the tx flag tfLoanOverpayment is
 * 0x00010000, but on the Loan object lsfLoanOverpayment is 0x00040000
 * (0x00010000 on the object is lsfLoanDefault). Defined in this client-safe
 * module so server (xrpl/loan.ts) and client (dashboards) share one source.
 */
export const LSF_LOAN_DEFAULT = 0x00010000;
export const LSF_LOAN_IMPAIRED = 0x00020000;
export const LSF_LOAN_OVERPAYMENT = 0x00040000;

// XLS-66 fee rates are expressed in 1/10th basis points: 1 unit = 0.001%.
// Percent × 1000 → 1/10 bps. Basis points × 10 → 1/10 bps.
export const percentToTenthBps = (percent: number) => Math.round(percent * 1000);
export const bpsToTenthBps = (bps: number) => bps * 10;
export const tenthBpsToPercent = (tenthBps: number) => tenthBps / 1000;

// Demo token used when the vault asset is IOU or MPT. Rename these when
// rebranding the template for a different issuer / asset.
export const DEMO_TOKEN_TICKER = "TUSD";
export const DEMO_TOKEN_NAME = "Test USD";
export const DEMO_TOKEN_DESCRIPTION = "Test stablecoin for demo";
/** Fallback MPT `issuer_name` when none is supplied (auto-issued demo token,
 *  or a vault share whose issuer name is somehow missing). */
export const DEFAULT_ISSUER_NAME = APP_ISSUER_NAME;
/** Fallback MPT `icon` (i) — REQUIRED by the metadata schema, so we always
 *  populate it. Self-hosted app icon; rebrand via NEXT_PUBLIC_SITE_URL. */
export const DEFAULT_TOKEN_ICON = `${(
  process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"
).replace(/\/$/, "")}/favicon.svg`;
/** Human units seeded to each role on IOU/MPT vault setup. */
export const DEMO_TOKEN_DISTRIBUTION = "10000";
/** IOU trust-line ceiling set on broker/depositor/borrower wallets. */
export const DEMO_IOU_TRUST_LIMIT = "1000000";
/** MPT issuance MaximumAmount (in ledger-scaled integer units). */
export const DEMO_MPT_MAXIMUM_AMOUNT = "100000000000";

// XLS-33 MPT AssetScale — each ledger unit = 10^-scale of a human unit.
export const MPT_ASSET_SCALE = 2;
export const MPT_SCALE_MULTIPLIER = 10 ** MPT_ASSET_SCALE;

// XLS-66 loan defaults. Principal values are expressed in drops for XRP and
// human units for IOU/MPT.
export const DEFAULT_INTEREST_RATE_BPS = 500; // 5%
export const DEFAULT_PAYMENT_TOTAL = 3;
export const DEFAULT_PAYMENT_INTERVAL = 30 * SECONDS_PER_DAY;
export const DEFAULT_GRACE_PERIOD = 7 * SECONDS_PER_DAY;
export const DEFAULT_ORIGINATION_FEE_DROPS = "1000000";
export const DEFAULT_SERVICE_FEE_DROPS = "500000";
export const DEFAULT_ORIGINATION_FEE_TOKEN = "1";
export const DEFAULT_SERVICE_FEE_TOKEN = "0.5";
export const DEFAULT_PRINCIPAL_DROPS = "20000000";
export const DEFAULT_PRINCIPAL_TOKEN = "20";
