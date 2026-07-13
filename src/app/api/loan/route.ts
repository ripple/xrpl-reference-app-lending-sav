import { NextRequest, NextResponse } from "next/server";
import { validateAssetAmount, validateNumber } from "@/lib/validation";
import { getUserWallets } from "@/lib/user-wallets";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { LoanModel } from "@/lib/db";
import { buildLoanSet, signAndSubmitLoanSet, getLoanInfo, LSF_LOAN_DEFAULT } from "@/lib/xrpl/loan";
import {
  getRoleWallet,
  extractCreatedLedgerId,
  hasIssuedToken,
  isLedgerEntryNotFound,
  humanToMptUnits,
  sanitizeLedgerError,
} from "@/lib/xrpl/helpers";
import {
  DEFAULT_INTEREST_RATE_BPS,
  DEFAULT_PAYMENT_TOTAL,
  DEFAULT_PAYMENT_INTERVAL,
  DEFAULT_GRACE_PERIOD,
  DEFAULT_ORIGINATION_FEE_DROPS,
  DEFAULT_SERVICE_FEE_DROPS,
  DEFAULT_ORIGINATION_FEE_TOKEN,
  DEFAULT_SERVICE_FEE_TOKEN,
  DEFAULT_PRINCIPAL_DROPS,
  DEFAULT_PRINCIPAL_TOKEN,
  SECONDS_PER_DAY,
  MPT_SCALE_MULTIPLIER,
} from "@/lib/constants";

const MAX_INTERVAL_SECONDS = 365 * SECONDS_PER_DAY;

export async function POST(request: NextRequest) {
  try {
    const session = await getUserWallets();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rl = await checkRateLimit(`tx:${session._id}`, 30, 60);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
    if (!session.loanBrokerId) {
      return NextResponse.json({ error: "No broker registered" }, { status: 404 });
    }
    const body = await request.json();

    const brokerWallet = getRoleWallet(session, "broker");
    const borrowerWallet = getRoleWallet(session, "borrower");

    const isToken = hasIssuedToken(session.issuedToken);
    const isMPT = isToken && session.issuedToken?.type === "MPT";
    const valAmt = (v: unknown) => validateAssetAmount(v, isToken);
    const defaultPrincipal = isToken ? DEFAULT_PRINCIPAL_TOKEN : DEFAULT_PRINCIPAL_DROPS;
    const defaultOrigFee = isToken ? DEFAULT_ORIGINATION_FEE_TOKEN : DEFAULT_ORIGINATION_FEE_DROPS;
    const defaultSvcFee = isToken ? DEFAULT_SERVICE_FEE_TOKEN : DEFAULT_SERVICE_FEE_DROPS;

    // DB/UI convention: human decimals for tokens, drops for XRP.
    // MPT ledger convention: integer units scaled by AssetScale (else tecPRECISION_LOSS
    // fires because the on-chain amortization rounds a sub-scale value to zero).
    // So we keep "human" values for persistence and only scale at the tx boundary.
    const toLedger = (human: string): string => (isMPT ? humanToMptUnits(human) : human);

    const principalRequested = valAmt(body.principalRequested) || defaultPrincipal;
    // XLS-66: InterestRate max is 100% (10000 bps → 100000 1/10 bps). Reject a
    // provided-but-out-of-range value rather than silently defaulting it.
    const interestRateRaw = validateNumber(body.interestRate, 0, 10000);
    if (body.interestRate !== undefined && interestRateRaw === null) {
      return NextResponse.json(
        { error: "interestRate must be between 0 and 10000 bps (0–100%)" },
        { status: 400 }
      );
    }
    const interestRate = interestRateRaw ?? DEFAULT_INTEREST_RATE_BPS;
    const paymentTotal = validateNumber(body.paymentTotal, 1, 120) ?? DEFAULT_PAYMENT_TOTAL;
    const paymentInterval =
      validateNumber(body.paymentInterval, 60, MAX_INTERVAL_SECONDS) ?? DEFAULT_PAYMENT_INTERVAL;
    // XLS-66 §3.8.5.1 #16: GracePeriod must be >= 60s and <= PaymentInterval.
    const gracePeriodRaw = validateNumber(body.gracePeriod, 60, MAX_INTERVAL_SECONDS);
    if (body.gracePeriod !== undefined && gracePeriodRaw === null) {
      return NextResponse.json(
        { error: "gracePeriod must be at least 60 seconds" },
        { status: 400 }
      );
    }
    const gracePeriod = gracePeriodRaw ?? DEFAULT_GRACE_PERIOD;
    // Surface a 400 here rather than a generic ledger error. Equality is valid.
    if (gracePeriod > paymentInterval) {
      return NextResponse.json(
        { error: "gracePeriod must not exceed paymentInterval" },
        { status: 400 }
      );
    }
    const originationFee = valAmt(body.originationFee) || defaultOrigFee;
    const serviceFee = valAmt(body.serviceFee) || defaultSvcFee;
    // XLS-66 §3.8.5.1 #8: LoanOriginationFee must not exceed PrincipalRequested.
    if (Number(originationFee) > Number(principalRequested)) {
      return NextResponse.json(
        { error: "originationFee must not exceed principalRequested" },
        { status: 400 }
      );
    }

    // Advanced fields — ledger rejects 0 values, so we only include when > 0.
    const latePaymentFee = valAmt(body.latePaymentFee) || undefined;
    const closePaymentFee = valAmt(body.closePaymentFee) || undefined;
    const overpaymentFee = validateNumber(body.overpaymentFee, 1, 100_000) ?? undefined;
    const lateInterestRate = validateNumber(body.lateInterestRate, 1, 100_000) ?? undefined;
    const closeInterestRate = validateNumber(body.closeInterestRate, 1, 100_000) ?? undefined;
    const overpaymentInterestRate = validateNumber(body.overpaymentInterestRate, 1, 100_000) ?? undefined;

    let loanData: string | undefined;
    if (body.loanName && typeof body.loanName === "string") {
      const name = body.loanName.trim().slice(0, 64).replace(/[\x00-\x1F\x7F]/g, "");
      if (name) loanData = Buffer.from(JSON.stringify({ n: name })).toString("hex").toUpperCase();
    }

    const loanSetTx = buildLoanSet({
      brokerAddress: brokerWallet.classicAddress,
      borrowerAddress: borrowerWallet.classicAddress,
      loanBrokerId: session.loanBrokerId,
      principalRequested: toLedger(principalRequested),
      interestRate,
      paymentTotal,
      paymentInterval,
      gracePeriod,
      originationFee: toLedger(originationFee),
      serviceFee: toLedger(serviceFee),
      latePaymentFee: latePaymentFee ? toLedger(latePaymentFee) : undefined,
      closePaymentFee: closePaymentFee ? toLedger(closePaymentFee) : undefined,
      overpaymentFee,
      lateInterestRate,
      closeInterestRate,
      overpaymentInterestRate,
      data: loanData,
      allowOverpayment: body.allowOverpayment === true,
    });

    const result = await signAndSubmitLoanSet(brokerWallet, borrowerWallet, loanSetTx);
    const loanId = extractCreatedLedgerId(result, "Loan");

    if (loanId) {
      await LoanModel.create({
        sessionId: session._id,
        loanId,
        loanBrokerId: session.loanBrokerId,
        borrowerAddress: borrowerWallet.classicAddress,
        principalRequested,
        interestRate,
        paymentTotal,
        paymentInterval,
        gracePeriod,
        originationFee,
        serviceFee,
        status: "active",
        paymentsRemaining: paymentTotal,
        principalOutstanding: principalRequested,
      });
    }

    return NextResponse.json({ loanId, result: result.result }, { status: 201 });
  } catch (error) {
    console.error("Loan creation error:", error);
    return NextResponse.json(
      { error: sanitizeLedgerError(error, "Failed to create loan") },
      { status: 500 }
    );
  }
}

export async function GET() {
  try {
    const session = await getUserWallets();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isMPT = session?.issuedToken?.type === "MPT";
    // On-ledger MPT values are integer units scaled by AssetScale; the DB/UI
    // convention is human decimals, so unscale on read-back.
    const fromLedger = (v: string | number): string =>
      isMPT ? (Number(v || 0) / MPT_SCALE_MULTIPLIER).toString() : String(v ?? "0");

    const loans = await LoanModel.find({ sessionId: session._id });

    const synced = await Promise.all(
      loans.map(async (loan) => {
        const doc = loan.toObject();
        if (doc.status === "defaulted" || doc.status === "closed") return doc;

        try {
          const info = await getLoanInfo(doc.loanId);
          const node = info.result?.node;
          if (node) {
            doc.paymentsRemaining = node.PaymentRemaining ?? doc.paymentsRemaining;
            doc.principalOutstanding = node.TotalValueOutstanding
              ? fromLedger(node.TotalValueOutstanding)
              : doc.principalOutstanding;
            // Transient (not persisted) — lets the UI gate the Default button
            // on grace expiry without an extra per-loan fetch.
            doc.nextPaymentDueDate = node.NextPaymentDueDate;
            // A defaulted loan also reports PaymentRemaining == 0; the
            // lsfLoanDefault flag distinguishes it from a genuine full repayment.
            if ((Number(node.Flags) & LSF_LOAN_DEFAULT) !== 0) {
              doc.status = "defaulted";
            } else if (doc.paymentsRemaining === 0 || Number(doc.principalOutstanding) === 0) {
              doc.status = "repaid";
            }
            await LoanModel.findByIdAndUpdate(doc._id, {
              paymentsRemaining: doc.paymentsRemaining,
              principalOutstanding: doc.principalOutstanding,
              status: doc.status,
            });
          }
        } catch (err) {
          // Only flip absorbing state when the ledger genuinely confirms the
          // loan entry is gone. Transient RPC blips (timeouts, disconnects)
          // would otherwise corrupt healthy loans into "defaulted".
          if (isLedgerEntryNotFound(err)) {
            doc.status = doc.status === "repaid" || doc.paymentsRemaining === 0 ? "closed" : "defaulted";
            doc.paymentsRemaining = 0;
            doc.principalOutstanding = "0";
            await LoanModel.findByIdAndUpdate(doc._id, {
              status: doc.status,
              paymentsRemaining: 0,
              principalOutstanding: "0",
            });
          }
        }
        return doc;
      })
    );

    return NextResponse.json({ loans: synced });
  } catch (error) {
    console.error("Loan list error:", error);
    return NextResponse.json({ error: "Failed to list loans" }, { status: 500 });
  }
}
