import { NextRequest, NextResponse } from "next/server";
import { LoanModel } from "@/lib/db";
import { buildLoanDelete, buildLoanManage, LoanManageFlags } from "@/lib/xrpl/loan";
import { submitTransaction } from "@/lib/xrpl/vault";
import { getRoleWallet, sanitizeLedgerError } from "@/lib/xrpl/helpers";
import { getUserWallets } from "@/lib/user-wallets";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

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
    const action = body.action || "default"; // "default" | "close"
    if (!loanId) {
      return NextResponse.json({ error: "loanId is required" }, { status: 400 });
    }

    const brokerWallet = getRoleWallet(session, "broker");

    if (action === "close") {
      const tx = buildLoanDelete(brokerWallet.classicAddress, loanId);
      const result = await submitTransaction(brokerWallet, tx);
      await LoanModel.findOneAndUpdate({ loanId }, { status: "closed" });
      return NextResponse.json({ result: result.result });
    }

    // LoanManage with tfLoanDefault defaults an unpaid loan past its grace period.
    const tx = buildLoanManage(brokerWallet.classicAddress, loanId, LoanManageFlags.tfLoanDefault);
    const result = await submitTransaction(brokerWallet, tx);
    await LoanModel.findOneAndUpdate({ loanId }, { status: "defaulted" });
    return NextResponse.json({ result: result.result });
  } catch (error) {
    console.error("Loan manage error:", error);
    return NextResponse.json(
      { error: sanitizeLedgerError(error, "Failed to process loan action") },
      { status: 500 }
    );
  }
}
