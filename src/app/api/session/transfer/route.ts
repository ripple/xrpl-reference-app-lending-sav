import { NextRequest, NextResponse } from "next/server";
import { validateAmount } from "@/lib/validation";
import { getUserWallets } from "@/lib/user-wallets";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { submitTransaction } from "@/lib/xrpl/vault";
import { getRoleWallet, buildAmountField, hasIssuedToken } from "@/lib/xrpl/helpers";
import { DROPS_PER_XRP } from "@/lib/constants";
import type { WalletInfo } from "@/types/session";

export async function POST(request: NextRequest) {
  try {
    const session = await getUserWallets();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rl = await checkRateLimit(`tx:${session._id}`, 30, 60);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
    const body = await request.json();
    const from = body.from as WalletInfo["role"];
    const to = body.to as WalletInfo["role"];
    const amount = validateAmount(body.amount);
    const asset = body.asset as "XRP" | "TUSD" | undefined;

    if (!from || !to || !amount) {
      return NextResponse.json(
        { error: "from, to, and amount are required" },
        { status: 400 }
      );
    }
    if (from === to) {
      return NextResponse.json(
        { error: "Cannot transfer to the same wallet" },
        { status: 400 }
      );
    }

    const toWallet = session.wallets.find((w: WalletInfo) => w.role === to);
    if (!toWallet) {
      return NextResponse.json({ error: "Destination wallet not found" }, { status: 400 });
    }
    const senderWallet = getRoleWallet(session, from);

    const paymentAmount =
      asset === "TUSD" && hasIssuedToken(session.issuedToken)
        ? buildAmountField(session.issuedToken, amount)
        : String(Math.round(parseFloat(amount) * DROPS_PER_XRP));

    const tx = {
      TransactionType: "Payment",
      Account: senderWallet.classicAddress,
      Destination: toWallet.address,
      Amount: paymentAmount,
    };

    const result = await submitTransaction(senderWallet, tx);
    return NextResponse.json({ result: result.result });
  } catch (error) {
    console.error("Transfer error:", error);
    return NextResponse.json({ error: "Failed to complete transfer" }, { status: 500 });
  }
}
