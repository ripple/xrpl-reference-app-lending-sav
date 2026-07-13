import { Wallet } from "xrpl";
import { walletFromSeed } from "./wallet";
import { decryptSecret } from "@/lib/crypto";
import { getXrplClient } from "./client";
import { getVaultInfo } from "./vault";
import { getLoanInfo } from "./loan";
import { MPT_ASSET_SCALE, MPT_SCALE_MULTIPLIER } from "@/lib/constants";
import { earlyFullPayment, latePayment } from "@/lib/loan-math";
import type { IssuedToken, WalletInfo } from "@/types/session";

type SessionLike = { wallets: WalletInfo[] };

/**
 * Resolve the wallet for a role from a session document. Throws if missing,
 * so route handlers can treat the result as non-null.
 */
export function getRoleWallet(session: SessionLike, role: WalletInfo["role"]): Wallet {
  const data = session.wallets.find((w) => w.role === role);
  if (!data) throw new Error(`${role} wallet not found in session`);
  return walletFromSeed(decryptSecret(data.seed));
}

/**
 * True when the session's issuedToken is fully populated (not just a residual
 * empty Mongoose subdocument). Use this rather than `!!session.issuedToken`.
 */
export function hasIssuedToken(issuedToken: IssuedToken | null | undefined): boolean {
  if (!issuedToken) return false;
  if (issuedToken.type === "IOU") return !!(issuedToken.currency && issuedToken.issuer);
  if (issuedToken.type === "MPT") return !!issuedToken.mptIssuanceId;
  return false;
}

/**
 * Convert a human decimal amount to an MPT integer string scaled by
 * `AssetScale`. Centralizes the rounding rule used at every tx boundary so
 * a future scale change only needs editing here.
 */
export function humanToMptUnits(humanAmount: string): string {
  return String(Math.round(parseFloat(humanAmount) * MPT_SCALE_MULTIPLIER));
}

/**
 * True when an xrpl.js error came back with `entryNotFound` / `objectNotFound`,
 * i.e. the ledger genuinely doesn't have that ledger entry. Use this to
 * distinguish "loan/vault was deleted on chain" from "RPC connection blip"
 * before mutating DB state.
 */
export function isLedgerEntryNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const data = (err as { data?: { error?: string } }).data;
  const code = data?.error;
  return code === "entryNotFound" || code === "objectNotFound";
}

/**
 * Build the Amount field of a transaction from a human-readable value.
 * Returns drops string for XRP, IOU object for issued currency, or MPT amount
 * with the configured AssetScale applied.
 */
export function buildAmountField(
  issuedToken: IssuedToken | null | undefined,
  humanAmount: string
): string | Record<string, string> {
  if (!hasIssuedToken(issuedToken)) return humanAmount;
  if (issuedToken!.type === "IOU") {
    return {
      currency: issuedToken!.currency!,
      issuer: issuedToken!.issuer!,
      value: humanAmount,
    };
  }
  return {
    mpt_issuance_id: issuedToken!.mptIssuanceId!,
    value: humanToMptUnits(humanAmount),
  };
}

/**
 * Scan transaction metadata for a CreatedNode of a given LedgerEntryType
 * and return its LedgerIndex (the new object's ID).
 */
export function extractCreatedLedgerId(
  result: { result: { meta?: unknown } },
  entryType: string
): string | null {
  const meta = result.result.meta as Record<string, unknown> | undefined;
  const nodes = (meta?.AffectedNodes as Array<Record<string, unknown>>) || [];
  for (const node of nodes) {
    const created = node.CreatedNode as Record<string, unknown> | undefined;
    if (created?.LedgerEntryType === entryType) {
      return created.LedgerIndex as string;
    }
  }
  return null;
}

/**
 * Verify a submitted transaction landed with tesSUCCESS. Throws with the
 * engine result code otherwise so callers don't silently mark DB state.
 */
export function assertTxSuccess(
  result: { result: { meta?: unknown; engine_result?: string; hash?: string } },
  txType: string
): void {
  const meta = result.result.meta as Record<string, unknown> | undefined;
  const engineResult =
    (meta?.TransactionResult as string) ||
    result.result.engine_result ||
    "";
  if (engineResult && engineResult !== "tesSUCCESS") {
    throw new Error(`${txType} failed: ${engineResult} (tx: ${result.result.hash || ""})`);
  }
}

/**
 * Surface only the ledger engine result (e.g. "... failed: tecINSUFFICIENT_FUNDS")
 * from a thrown error; return `fallback` for anything without an XRPL result code
 * so raw internal error text never reaches the client.
 */
export function sanitizeLedgerError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : "";
  return /\b(tec|tem|tef|ter|tel)[A-Z_]+/.test(raw) ? raw : fallback;
}

/**
 * Fetch vault_info and return the ledger view, or null on failure.
 * Intended for post-tx DB synchronization in API routes.
 */
export async function fetchVaultSnapshot(vaultId: string): Promise<{
  assetsTotal: string;
  sharesMinted: string;
} | null> {
  try {
    const info = await getVaultInfo(vaultId);
    const vault = info.result?.vault;
    if (!vault) return null;
    return {
      assetsTotal: vault.AssetsTotal || "0",
      sharesMinted: vault.shares?.OutstandingAmount || "0",
    };
  } catch {
    return null;
  }
}

/**
 * Ripple-epoch close time of the latest validated ledger.
 * Used as the reference "now" for time-sensitive loan calculations so the
 * client's wall clock never leaks into amount computations.
 */
export async function getValidatedCloseTime(): Promise<number> {
  const client = await getXrplClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const res = await (client as any).request({
    command: "ledger",
    ledger_index: "validated",
  });
  return res.result?.ledger?.close_time ?? 0;
}

/**
 * Residual buffer for the ~1 ledger close drift between calculation and tx
 * processing. Far smaller than any asset denomination so overpay is negligible.
 */
function residualBuffer(isToken: boolean): number {
  return isToken ? 0.001 : 100;
}

function roundUp(value: number, isToken: boolean, isMPT: boolean = false): string {
  // MPT amounts are discrete units of 10^-AssetScale; round UP to that scale so
  // a full/late payment is never a sub-unit short (which the ledger rejects).
  if (isMPT) return String(Math.ceil(value * MPT_SCALE_MULTIPLIER) / MPT_SCALE_MULTIPLIER);
  if (isToken) return String(parseFloat(value.toFixed(6)));
  return String(Math.ceil(value));
}

/**
 * Unscale on-chain MPT amounts to human decimals. IOU values are already
 * human-decimal on-chain; XRP stays in drops.
 */
function unscaleForMPT(value: string | number, isMPT: boolean): number {
  const n = Number(value || 0);
  return isMPT ? n / 10 ** MPT_ASSET_SCALE : n;
}

/**
 * Convert a scaled MPT integer string to human decimal (string-preserving).
 * No-op for non-MPT assets.
 */
function unscaleStr(value: unknown, isMPT: boolean): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  if (!isMPT) return String(value);
  const n = Number(value) / MPT_SCALE_MULTIPLIER;
  return n.toString();
}

/**
 * In-place unscaling of the amount-typed fields returned by `vault_info` for
 * an MPT-asset vault. Leaves non-MPT vaults untouched so the same helper can
 * be called unconditionally from API routes.
 */
export function unscaleVaultNodeForMPT(
  vault: Record<string, unknown> | null | undefined,
  isMPT: boolean
): void {
  if (!vault || !isMPT) return;
  for (const field of ["AssetsTotal", "AssetsAvailable", "AssetsMaximum", "LossUnrealized"]) {
    const v = unscaleStr(vault[field], isMPT);
    if (v !== undefined) vault[field] = v;
  }
}

/**
 * In-place unscaling for a Loan ledger entry or LoanBroker entry. Applies to
 * every amount-typed field defined by XLS-66. Rates and timestamps are left
 * alone because they are not asset-scaled.
 */
export function unscaleLoanNodeForMPT(
  node: Record<string, unknown> | null | undefined,
  isMPT: boolean
): void {
  if (!node || !isMPT) return;
  const amountFields = [
    "PrincipalRequested",
    "PrincipalOutstanding",
    "TotalValueOutstanding",
    "PeriodicPayment",
    "LoanServiceFee",
    "LoanOriginationFee",
    "LatePaymentFee",
    "ClosePaymentFee",
    "ManagementFeeOutstanding",
    // LoanBroker fields:
    "CoverAvailable",
    "DebtTotal",
    "DebtMaximum",
  ];
  for (const field of amountFields) {
    const v = unscaleStr(node[field], isMPT);
    if (v !== undefined) node[field] = v;
  }
}

/**
 * Compute the exact fullPaymentAmount for LoanPay + tfLoanFullPayment
 * (XLS-66 §A-3.2.4). Returns a HUMAN value (drops for XRP, decimal for
 * tokens) so the caller can feed it through `buildAmountField` uniformly.
 */
export async function computeFullPaymentAmount(
  loanId: string,
  isToken: boolean,
  isMPT: boolean = false
): Promise<{ amount: string; node: Record<string, unknown> }> {
  const [info, closeTime] = await Promise.all([getLoanInfo(loanId), getValidatedCloseTime()]);
  const node = info.result?.node as Record<string, unknown> | undefined;
  if (!node) throw new Error("Loan not found on ledger");

  const principal = unscaleForMPT(node.PrincipalOutstanding as string, isMPT);
  const closePaymentFee = unscaleForMPT(node.ClosePaymentFee as string, isMPT);
  const lastTs = Math.max(
    Number(node.PreviousPaymentDueDate ?? 0),
    Number(node.StartDate ?? 0)
  );
  const { totalDue } = earlyFullPayment({
    principalOutstanding: principal,
    interestRateTenthBps: Number(node.InterestRate ?? 0),
    closeInterestRateTenthBps: Number(node.CloseInterestRate ?? 0),
    closePaymentFee,
    paymentInterval: Number(node.PaymentInterval ?? 0),
    secondsSinceLastPayment: Math.max(0, closeTime - lastTs),
  });

  return { amount: roundUp(totalDue + residualBuffer(isToken), isToken, isMPT), node };
}

/**
 * Exact late-payment totalDue (XLS-66 §A-3.2.2). Returns HUMAN value; see
 * `computeFullPaymentAmount` for rationale.
 */
export async function computeLatePaymentAmount(
  loanId: string,
  isToken: boolean,
  isMPT: boolean = false
): Promise<{ amount: string }> {
  const [info, closeTime] = await Promise.all([getLoanInfo(loanId), getValidatedCloseTime()]);
  const node = info.result?.node as Record<string, unknown> | undefined;
  if (!node) throw new Error("Loan not found on ledger");

  const principal = unscaleForMPT(node.PrincipalOutstanding as string, isMPT);
  const rawPeriodic = unscaleForMPT(node.PeriodicPayment as string, isMPT);
  const periodicPayment = isToken ? rawPeriodic : Math.ceil(rawPeriodic);
  const serviceFee = unscaleForMPT(node.LoanServiceFee as string, isMPT);
  const latePaymentFee = unscaleForMPT(node.LatePaymentFee as string, isMPT);
  const nextDue = Number(node.NextPaymentDueDate ?? 0);
  const { totalDue } = latePayment({
    principalOutstanding: principal,
    periodicPayment,
    serviceFee,
    latePaymentFee,
    lateInterestRateTenthBps: Number(node.LateInterestRate ?? 0),
    secondsOverdue: Math.max(0, closeTime - nextDue),
  });

  return { amount: roundUp(totalDue + residualBuffer(isToken), isToken, isMPT) };
}

/**
 * Resolve the XRPL client once per request and expose it for callers that
 * need to issue raw `request`s. Thin re-export for convenience.
 */
export { getXrplClient };
