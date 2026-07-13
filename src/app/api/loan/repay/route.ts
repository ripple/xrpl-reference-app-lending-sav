import { NextRequest, NextResponse } from "next/server";
import { validateAssetAmount } from "@/lib/validation";
import { getUserWallets } from "@/lib/user-wallets";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { LoanModel } from "@/lib/db";
import { buildLoanPay, getLoanInfo, LoanPayFlags } from "@/lib/xrpl/loan";
import { submitTransaction } from "@/lib/xrpl/vault";
import {
  getRoleWallet,
  buildAmountField,
  hasIssuedToken,
  computeFullPaymentAmount,
  computeLatePaymentAmount,
  isLedgerEntryNotFound,
} from "@/lib/xrpl/helpers";
import { MPT_SCALE_MULTIPLIER } from "@/lib/constants";

type PayMode = "full" | "late" | "overpayment" | "regular";

export async function POST(request: NextRequest) {
  try {
    const session = await getUserWallets();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rl = await checkRateLimit(`tx:${session._id}`, 30, 60);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
    const body = await request.json();
    const loanId = typeof body.loanId === "string" ? body.loanId.trim() : null;
    if (!loanId) {
      return NextResponse.json({ error: "Valid loanId is required" }, { status: 400 });
    }

    const isToken = hasIssuedToken(session.issuedToken);
    const isMPT = isToken && session.issuedToken?.type === "MPT";
    const mode = body.mode as PayMode | undefined;

    // For full/late modes, derive the amount server-side using the latest
    // validated close time as the temporal reference. This removes client
    // clock drift and the risk of missing a tecINSUFFICIENT_PAYMENT threshold.
    let amount: string | null;
    if (mode === "full") {
      amount = (await computeFullPaymentAmount(loanId, isToken, isMPT)).amount;
    } else if (mode === "late") {
      amount = (await computeLatePaymentAmount(loanId, isToken, isMPT)).amount;
    } else {
      amount = validateAssetAmount(body.amountDrops, isToken);
    }
    if (!amount) {
      return NextResponse.json(
        { error: "Valid positive amount is required" },
        { status: 400 }
      );
    }

    const borrowerWallet = getRoleWallet(session, "borrower");
    const payAmount = isToken ? buildAmountField(session.issuedToken, amount) : amount;

    // Map intent → XLS-66 LoanPay flag. No flag → regular path.
    const flag =
      mode === "full"
        ? LoanPayFlags.tfLoanFullPayment
        : mode === "late"
        ? LoanPayFlags.tfLoanLatePayment
        : mode === "overpayment"
        ? LoanPayFlags.tfLoanOverpayment
        : undefined;

    const tx = buildLoanPay(borrowerWallet.classicAddress, loanId, payAmount, flag);
    const result = await submitTransaction(borrowerWallet, tx);

    try {
      const info = await getLoanInfo(loanId);
      const node = info.result?.node;
      if (node) {
        const remaining = node.PaymentRemaining ?? 0;
        const rawOutstanding = Number(node.TotalValueOutstanding ?? "0");
        const outstanding = isMPT
          ? (rawOutstanding / MPT_SCALE_MULTIPLIER).toString()
          : String(rawOutstanding);
        const status = remaining === 0 || rawOutstanding === 0 ? "repaid" : "active";
        await LoanModel.findOneAndUpdate(
          { loanId, sessionId: session._id },
          { paymentsRemaining: remaining, principalOutstanding: outstanding, status }
        );
      } else {
        // Successful response with no node → loan was deleted.
        await LoanModel.findOneAndUpdate(
          { loanId, sessionId: session._id },
          { paymentsRemaining: 0, principalOutstanding: "0", status: "repaid" }
        );
      }
    } catch (err) {
      // Only treat the loan as gone if the ledger explicitly says so.
      // Transient RPC errors must not flip the loan to "repaid".
      if (isLedgerEntryNotFound(err)) {
        await LoanModel.findOneAndUpdate(
          { loanId, sessionId: session._id },
          { paymentsRemaining: 0, principalOutstanding: "0", status: "repaid" }
        );
      }
    }

    // Echo the server-computed amount so the client can display the real debit.
    return NextResponse.json({ result: result.result, amount });
  } catch (error) {
    console.error("Loan repay error:", error);
    return NextResponse.json({ error: "Failed to repay loan" }, { status: 500 });
  }
}
