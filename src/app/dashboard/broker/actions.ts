import { DROPS_PER_XRP, percentToTenthBps } from "@/lib/constants";

/**
 * Convert a human-entered asset amount to the ledger representation.
 * XRP → drops (integer string); IOU/MPT → decimal string (left as-is for
 * the server to re-scale by AssetScale when needed).
 */
function toLedgerAmount(value: string, isToken: boolean): string {
  const num = parseFloat(value || "0");
  return isToken ? String(num) : String(Math.round(num * DROPS_PER_XRP));
}

export interface CreateVaultInputs {
  assetType: "XRP" | "IOU" | "MPT";
  vaultName: string;
  website: string;
  nonTransferable: boolean;
  hasMaxCap: boolean;
  maxCap: string;
  shareMetadata: {
    ticker: string;
    name: string;
    description: string;
    icon: string;
    issuerName: string;
    assetClass: string;
    assetSubclass: string;
  };
  managementFee: string;
  debtMaximum: string;
  coverRateMin: string;
  coverRateLiq: string;
  firstLossCapital: string;
}

export interface CreateVaultResult {
  vaultId: string;
  loanBrokerId: string;
  txHash?: string;
}

/**
 * Orchestrates VaultCreate + LoanBrokerSet (+ optional cover deposit) in the
 * two API calls the server expects. Rate fields are converted from % to
 * 1/10 bps at the boundary.
 */
export async function createVaultAndBroker(input: CreateVaultInputs): Promise<CreateVaultResult> {
  const vaultOptions: Record<string, unknown> = { asset: { type: input.assetType } };
  if (input.vaultName.trim()) vaultOptions.name = input.vaultName.trim();
  if (input.website.trim()) vaultOptions.website = input.website.trim();
  if (input.nonTransferable) vaultOptions.nonTransferableShares = true;
  if (input.hasMaxCap && input.maxCap) {
    vaultOptions.assetsMaximum =
      input.assetType === "XRP"
        ? String(Math.round(parseFloat(input.maxCap) * DROPS_PER_XRP))
        : input.maxCap;
  }
  const sm = input.shareMetadata;
  vaultOptions.shareMetadata = {
    ticker: sm.ticker.trim(),
    name: sm.name.trim(),
    issuerName: sm.issuerName.trim(),
    assetClass: sm.assetClass,
    ...(sm.assetClass === "rwa" && { assetSubclass: sm.assetSubclass }),
    ...(sm.description.trim() && { description: sm.description.trim() }),
    ...(sm.icon.trim() && { icon: sm.icon.trim() }),
  };

  const vaultRes = await fetch("/api/vault", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ vaultOptions }),
  });
  const vaultData = await vaultRes.json();
  if (!vaultRes.ok) throw new Error(vaultData.error);
  const vaultId = vaultData.vault.vaultId;

  const brokerOptions: Record<string, number> = {};
  if (input.managementFee) brokerOptions.managementFeeRate = percentToTenthBps(parseFloat(input.managementFee));
  if (input.debtMaximum) {
    brokerOptions.debtMaximum =
      input.assetType === "XRP"
        ? Math.round(parseFloat(input.debtMaximum) * DROPS_PER_XRP)
        : parseFloat(input.debtMaximum);
  }
  if (input.coverRateMin) brokerOptions.coverRateMinimum = percentToTenthBps(parseFloat(input.coverRateMin));
  if (input.coverRateLiq) brokerOptions.coverRateLiquidation = percentToTenthBps(parseFloat(input.coverRateLiq));

  const coverAmountDrops = input.firstLossCapital
    ? input.assetType === "XRP"
      ? String(Math.round(parseFloat(input.firstLossCapital) * DROPS_PER_XRP))
      : input.firstLossCapital
    : undefined;

  const brokerRes = await fetch("/api/broker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      vaultId,
      brokerOptions: Object.keys(brokerOptions).length > 0 ? brokerOptions : undefined,
      coverAmountDrops,
    }),
  });
  const brokerData = await brokerRes.json();
  if (!brokerRes.ok) throw new Error(brokerData.error);

  return { vaultId, loanBrokerId: brokerData.loanBrokerId, txHash: brokerData.result?.hash };
}

export interface IssueLoanInputs {
  isToken: boolean;
  principal: string;
  interestRate: number; // basis points (server converts to 1/10 bps)
  paymentTotal: number;
  paymentInterval: number;
  gracePeriod: number;
  originationFee: string;
  serviceFee: string;
  latePaymentFee?: string;
  closePaymentFee?: string;
  overpaymentFee?: string;
  lateInterestRate?: string;
  closeInterestRate?: string;
  overpaymentInterestRate?: string;
  loanName?: string;
  /** Sets tfLoanOverpayment on LoanSet, unlocking borrower overpayments. */
  allowOverpayment?: boolean;
}

/**
 * Issue a loan via LoanSet (multi-signed by broker + borrower on the server).
 * Currency amounts are converted to drops for XRP; rates are % → 1/10 bps.
 */
export async function issueLoan(input: IssueLoanInputs): Promise<{ txHash?: string; loanId?: string }> {
  const body: Record<string, unknown> = {
    principalRequested: toLedgerAmount(input.principal, input.isToken),
    interestRate: input.interestRate,
    paymentTotal: input.paymentTotal,
    paymentInterval: input.paymentInterval,
    gracePeriod: input.gracePeriod,
    originationFee: toLedgerAmount(input.originationFee, input.isToken),
    serviceFee: toLedgerAmount(input.serviceFee, input.isToken),
  };

  const withAmount = (key: string, value: string | undefined) => {
    if (value && parseFloat(value) > 0) body[key] = toLedgerAmount(value, input.isToken);
  };
  const withPercent = (key: string, value: string | undefined) => {
    if (value && parseFloat(value) > 0) body[key] = percentToTenthBps(parseFloat(value));
  };

  withAmount("latePaymentFee", input.latePaymentFee);
  withAmount("closePaymentFee", input.closePaymentFee);
  withPercent("overpaymentFee", input.overpaymentFee);
  withPercent("lateInterestRate", input.lateInterestRate);
  withPercent("closeInterestRate", input.closeInterestRate);
  withPercent("overpaymentInterestRate", input.overpaymentInterestRate);

  if (input.loanName?.trim()) body.loanName = input.loanName.trim();
  if (input.allowOverpayment) body.allowOverpayment = true;

  const res = await fetch("/api/loan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error);
  return { txHash: data.result?.hash, loanId: data.loanId };
}
