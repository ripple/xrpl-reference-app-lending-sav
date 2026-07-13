import { NextRequest, NextResponse } from "next/server";
import {
  buildLoanBrokerCoverDeposit,
  buildLoanBrokerCoverWithdraw,
} from "@/lib/xrpl/broker";
import { submitTransaction } from "@/lib/xrpl/vault";
import {
  getRoleWallet,
  buildAmountField,
  hasIssuedToken,
  sanitizeLedgerError,
} from "@/lib/xrpl/helpers";
import { validateAssetAmount } from "@/lib/validation";
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
    if (!session.loanBrokerId) {
      return NextResponse.json({ error: "No broker registered" }, { status: 404 });
    }

    const body = await request.json();
    const action = body.action;
    if (action !== "deposit" && action !== "withdraw") {
      return NextResponse.json(
        { error: "action must be 'deposit' or 'withdraw'" },
        { status: 400 }
      );
    }

    const isToken = hasIssuedToken(session.issuedToken);
    const raw = validateAssetAmount(body.amount, isToken);
    if (!raw) {
      return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
    }
    // Token amounts go through buildAmountField (scales MPT); XRP stays as drops.
    const amount = isToken ? buildAmountField(session.issuedToken, raw) : raw;

    const brokerWallet = getRoleWallet(session, "broker");
    const tx =
      action === "deposit"
        ? buildLoanBrokerCoverDeposit(brokerWallet.classicAddress, session.loanBrokerId, amount)
        : buildLoanBrokerCoverWithdraw(brokerWallet.classicAddress, session.loanBrokerId, amount);

    const result = await submitTransaction(brokerWallet, tx);
    return NextResponse.json({ result: result.result });
  } catch (error) {
    console.error("Cover management error:", error);
    return NextResponse.json(
      { error: sanitizeLedgerError(error, "Failed to update first-loss capital") },
      { status: 500 }
    );
  }
}
