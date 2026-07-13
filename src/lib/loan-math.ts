import { SECONDS_PER_YEAR } from "./constants";

/**
 * Standard-amortization formulas from XLS-66 Appendix A-2 §2.1.
 * Matches what the ledger computes for `PeriodicPayment` and
 * `TotalValueOutstanding` at loan origination.
 *
 *   periodicRate   = (annualRate × paymentInterval) / secondsPerYear
 *   raisedRate     = (1 + periodicRate)^n
 *   factor         = periodicRate × raisedRate / (raisedRate − 1)
 *   periodicPayment = principal × factor
 *   totalOutstanding = periodicPayment × n
 *
 * Inputs use human units (not drops or 1/10 bps) so this helper is reusable
 * for any asset.
 */
export interface AmortizationInputs {
  /** Principal in human units (XRP, or token units). */
  principal: number;
  /** Annual interest rate in basis points (e.g. 500 = 5%). */
  interestRateBps: number;
  /** Number of scheduled payments. Must be >= 1. */
  paymentTotal: number;
  /** Seconds between payments. */
  paymentInterval: number;
}

export interface AmortizationResult {
  periodicPayment: number;
  totalOutstanding: number;
  totalInterest: number;
}

export interface EarlyFullPaymentInputs {
  /** Principal outstanding (drops for XRP, units for token). */
  principalOutstanding: number;
  /** Annual interest rate on-ledger (1/10 bps). */
  interestRateTenthBps: number;
  /** Annual close interest rate on-ledger (1/10 bps). */
  closeInterestRateTenthBps: number;
  /** ClosePaymentFee in drops or token units. */
  closePaymentFee: number;
  /** Seconds between payments (for accrual prorata). */
  paymentInterval: number;
  /** Seconds since the last payment (or loan start). */
  secondsSinceLastPayment: number;
}

export interface EarlyFullPaymentResult {
  /** Interest pro-rata from last payment: P × periodicRate × (elapsed / interval). */
  accruedInterest: number;
  /** Prepayment penalty: P × closeInterestRate (annual rate applied as a one-shot %). */
  prepaymentPenalty: number;
  /** Spec formula (§A-3.2.4): P + accrued + penalty + ClosePaymentFee. */
  totalDue: number;
}

/**
 * Early full repayment total (XLS-66 §A-3.2.4). This is what the ledger
 * requires when `tfLoanFullPayment` is set.
 *
 *   totalDue = principalOutstanding + accruedInterest + prepaymentPenalty + ClosePaymentFee
 *   accruedInterest = principalOutstanding × periodicRate × (secondsSinceLastPayment / paymentInterval)
 *   prepaymentPenalty = principalOutstanding × closeInterestRate
 */
export function earlyFullPayment({
  principalOutstanding,
  interestRateTenthBps,
  closeInterestRateTenthBps,
  closePaymentFee,
  paymentInterval,
  secondsSinceLastPayment,
}: EarlyFullPaymentInputs): EarlyFullPaymentResult {
  // 1/10 bps → decimal: 1 unit = 0.001% = 1e-5, so divide by 100_000.
  const annualRate = interestRateTenthBps / 100_000;
  const closeRate = closeInterestRateTenthBps / 100_000;
  const periodicRate = (annualRate * paymentInterval) / SECONDS_PER_YEAR;
  const elapsedRatio = paymentInterval > 0 ? secondsSinceLastPayment / paymentInterval : 0;

  const accruedInterest = principalOutstanding * periodicRate * Math.max(0, elapsedRatio);
  const prepaymentPenalty = principalOutstanding * closeRate;
  const totalDue = principalOutstanding + accruedInterest + prepaymentPenalty + closePaymentFee;
  return { accruedInterest, prepaymentPenalty, totalDue };
}

export interface LatePaymentInputs {
  /** Current P outstanding, drops/units. */
  principalOutstanding: number;
  /** On-ledger PeriodicPayment (drops/units). */
  periodicPayment: number;
  serviceFee: number;
  /** Fixed LatePaymentFee (drops/units). */
  latePaymentFee: number;
  /** Annual late interest rate (1/10 bps on-ledger). */
  lateInterestRateTenthBps: number;
  /** Seconds past NextPaymentDueDate. */
  secondsOverdue: number;
}

export interface LatePaymentResult {
  lateInterest: number;
  totalDue: number;
}

/**
 * Late payment amount (XLS-66 §A-3.2.2, formula 15 and pseudo-code line 2542):
 *
 *   latePeriodicRate = lateInterestRate × secondsOverdue / secondsPerYear
 *   lateInterest     = principalOutstanding × latePeriodicRate
 *   totalDue         = periodicPayment + serviceFee + latePaymentFee + lateInterest
 *
 * `lateInterest` is gross (management fee not netted out). This is safe — it
 * never underpays, and any overpayment beyond the exact due is ignored by the
 * ledger. Netting would require the broker's ManagementFeeRate (which lives on
 * the LoanBroker, not the Loan node) and only matters when it is non-zero.
 */
export function latePayment({
  principalOutstanding,
  periodicPayment,
  serviceFee,
  latePaymentFee,
  lateInterestRateTenthBps,
  secondsOverdue,
}: LatePaymentInputs): LatePaymentResult {
  const lateAnnualRate = lateInterestRateTenthBps / 100_000;
  const latePeriodicRate = (lateAnnualRate * Math.max(0, secondsOverdue)) / SECONDS_PER_YEAR;
  const lateInterest = principalOutstanding * latePeriodicRate;
  const totalDue = periodicPayment + serviceFee + latePaymentFee + lateInterest;
  return { lateInterest, totalDue };
}

export function amortize({
  principal,
  interestRateBps,
  paymentTotal,
  paymentInterval,
}: AmortizationInputs): AmortizationResult {
  if (paymentTotal < 1) {
    return { periodicPayment: principal, totalOutstanding: principal, totalInterest: 0 };
  }

  const annualRate = interestRateBps / 10_000;
  const periodicRate = (annualRate * paymentInterval) / SECONDS_PER_YEAR;

  let periodicPayment: number;
  if (periodicRate === 0) {
    periodicPayment = principal / paymentTotal;
  } else {
    const raised = Math.pow(1 + periodicRate, paymentTotal);
    const factor = (periodicRate * raised) / (raised - 1);
    periodicPayment = principal * factor;
  }

  const totalOutstanding = periodicPayment * paymentTotal;
  return {
    periodicPayment,
    totalOutstanding,
    totalInterest: totalOutstanding - principal,
  };
}
