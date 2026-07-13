/**
 * XLS-66 Loan transaction builders.
 * Spec: https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0066-lending-protocol
 *
 * Unit conventions on the ledger:
 *   - Currency amounts (principal, fees): drops for XRP, asset units for IOU/MPT.
 *   - Rate fields (InterestRate and variants, OverpaymentFee): 1/10 bps.
 */
import * as xrpl from "xrpl";
import { type Wallet, LoanManageFlags, LoanPayFlags, LoanSetFlags } from "xrpl";
import { getXrplClient } from "./client";
import { assertTxSuccess } from "./helpers";
import { bpsToTenthBps, withSourceTag } from "@/lib/constants";

export interface LoanSetParams {
  brokerAddress: string;
  borrowerAddress: string;
  loanBrokerId: string;
  /** Principal in drops (XRP) or asset units (IOU/MPT). */
  principalRequested: string;
  /** Annualized rate in basis points. Converted to 1/10 bps on-chain. */
  interestRate: number;
  paymentTotal: number;
  /** Seconds between installments (min 60). */
  paymentInterval: number;
  /** Seconds after a due date before the loan can be defaulted (>= 60, <= PaymentInterval). */
  gracePeriod: number;
  originationFee: string;
  serviceFee: string;
  latePaymentFee?: string;
  closePaymentFee?: string;
  /** 1/10 bps. Passed through raw (already in ledger units). */
  overpaymentFee?: number;
  lateInterestRate?: number;
  closeInterestRate?: number;
  overpaymentInterestRate?: number;
  /** Hex-encoded metadata BLOB (<= 256 bytes). */
  data?: string;
  /**
   * Enable overpayment on the loan (sets tfLoanOverpayment → lsfLoanOverpayment).
   * Required for the borrower to later submit LoanPay with tfLoanOverpayment.
   */
  allowOverpayment?: boolean;
}

/**
 * LoanSet — origination transaction. Requires two signatures: broker (Account)
 * and borrower (Counterparty). Use `signAndSubmitLoanSet` to handle the dual
 * signing flow.
 */
export function buildLoanSet(params: LoanSetParams) {
  const tx: Record<string, unknown> = {
    TransactionType: "LoanSet",
    Account: params.brokerAddress,
    Counterparty: params.borrowerAddress,
    LoanBrokerID: params.loanBrokerId,
    PrincipalRequested: params.principalRequested,
    InterestRate: bpsToTenthBps(params.interestRate),
    PaymentTotal: params.paymentTotal,
    PaymentInterval: params.paymentInterval,
    GracePeriod: params.gracePeriod,
    LoanOriginationFee: params.originationFee,
    LoanServiceFee: params.serviceFee,
    SigningPubKey: "",
  };

  if (params.latePaymentFee) tx.LatePaymentFee = params.latePaymentFee;
  if (params.closePaymentFee) tx.ClosePaymentFee = params.closePaymentFee;
  if (params.overpaymentFee !== undefined) tx.OverpaymentFee = params.overpaymentFee;
  if (params.lateInterestRate !== undefined) tx.LateInterestRate = params.lateInterestRate;
  if (params.closeInterestRate !== undefined) tx.CloseInterestRate = params.closeInterestRate;
  if (params.overpaymentInterestRate !== undefined) tx.OverpaymentInterestRate = params.overpaymentInterestRate;
  if (params.data) tx.Data = params.data;
  if (params.allowOverpayment) tx.Flags = LoanSetFlags.tfLoanOverpayment;

  return tx;
}

export { LoanSetFlags };

// `Loan` ledger-object flags live in lib/constants (client-safe single source);
// re-exported here for server modules that read a Loan entry's `Flags`.
export { LSF_LOAN_DEFAULT, LSF_LOAN_IMPAIRED, LSF_LOAN_OVERPAYMENT } from "@/lib/constants";

/**
 * Submit a LoanSet with broker + borrower signatures. The broker signs first
 * (producing a tx_blob) and the borrower counter-signs via the xrpl.js helper
 * `signLoanSetByCounterparty`.
 */
export async function signAndSubmitLoanSet(
  brokerWallet: Wallet,
  borrowerWallet: Wallet,
  loanSetTx: Record<string, unknown>
) {
  const client = await getXrplClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prepared = await client.autofill(withSourceTag(loanSetTx) as any);

  const brokerSigned = brokerWallet.sign(prepared);
  const fullySigned = (
    xrpl as unknown as {
      signLoanSetByCounterparty: (wallet: Wallet, blob: string) => { tx_blob: string };
    }
  ).signLoanSetByCounterparty(borrowerWallet, brokerSigned.tx_blob);

  const result = await client.submitAndWait(fullySigned.tx_blob);
  assertTxSuccess(result, "LoanSet");
  return result;
}

/**
 * LoanPay — installment, early full repayment, or overpayment. The ledger
 * caps the charged amount at what is actually owed.
 *
 * Flags are mutually exclusive:
 *   - `tfLoanFullPayment` (XLS-66 §A-3.2.4) triggers early-close charges
 *     (ClosePaymentFee + CloseInterestRate penalty). Without it, a large
 *     payment is applied as sequential regular payments instead.
 *   - `tfLoanLatePayment` must be set when paying after the due date.
 *   - `tfLoanOverpayment` applies overpayment interest/fee and re-amortizes.
 */
export function buildLoanPay(
  borrowerAddress: string,
  loanId: string,
  amount: string | Record<string, string>,
  flags?: number
) {
  const tx: Record<string, unknown> = {
    TransactionType: "LoanPay",
    Account: borrowerAddress,
    LoanID: loanId,
    Amount: amount,
  };
  if (flags) tx.Flags = flags;
  return tx;
}

export { LoanPayFlags };

/** LoanDelete — only succeeds on fully repaid or defaulted loans. */
export function buildLoanDelete(accountAddress: string, loanId: string) {
  return {
    TransactionType: "LoanDelete",
    Account: accountAddress,
    LoanID: loanId,
  };
}

export { LoanManageFlags };

/**
 * LoanManage — broker-only admin action. Flags are mutually exclusive:
 * `tfLoanDefault` (after grace), `tfLoanImpair`, `tfLoanUnimpair`.
 */
export function buildLoanManage(
  brokerAddress: string,
  loanId: string,
  flag: number
) {
  return {
    TransactionType: "LoanManage",
    Account: brokerAddress,
    LoanID: loanId,
    Flags: flag,
  };
}

/** Read a Loan ledger entry by its index. */
export async function getLoanInfo(loanId: string) {
  const client = await getXrplClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (client as any).request({
    command: "ledger_entry",
    index: loanId,
    ledger_index: "validated",
  });
  return result;
}
