export interface LoanState {
  sessionId: string;
  loanId: string;
  loanBrokerId: string;
  borrowerAddress: string;
  principalRequested: string;
  interestRate: number;
  paymentTotal: number;
  paymentInterval: number;
  gracePeriod: number;
  originationFee: string;
  serviceFee: string;
  status: "pending" | "active" | "repaid" | "closed" | "defaulted";
  paymentsRemaining: number;
  principalOutstanding: string;
  /** On-chain NextPaymentDueDate (Ripple epoch seconds), attached transiently
   *  by the loan-list sync. Absent until synced. */
  nextPaymentDueDate?: number;
  createdAt: Date;
  updatedAt: Date;
}
