import { NextRequest, NextResponse } from "next/server";
import { validateDrops } from "@/lib/validation";
import { getUserWallets } from "@/lib/user-wallets";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { VaultModel, DepositHistoryModel } from "@/lib/db";
import { buildVaultDeposit, submitTransaction } from "@/lib/xrpl/vault";
import {
  getRoleWallet,
  buildAmountField,
  hasIssuedToken,
  fetchVaultSnapshot,
  humanToMptUnits,
} from "@/lib/xrpl/helpers";

export async function POST(request: NextRequest) {
  try {
    const session = await getUserWallets();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rl = await checkRateLimit(`tx:${session._id}`, 30, 60);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
    const body = await request.json();
    const vaultId = typeof body.vaultId === "string" ? body.vaultId.trim() : null;
    if (!vaultId) {
      return NextResponse.json({ error: "vaultId is required" }, { status: 400 });
    }

    const depositorWallet = getRoleWallet(session, "depositor");
    const issuedToken = session.issuedToken;
    const isToken = hasIssuedToken(issuedToken);

    let amount: string | Record<string, string>;
    let ledgerAmount: string;
    if (isToken && body.tokenAmount) {
      amount = buildAmountField(issuedToken, body.tokenAmount);
      ledgerAmount =
        issuedToken.type === "IOU"
          ? body.tokenAmount
          : humanToMptUnits(body.tokenAmount);
    } else {
      const drops = validateDrops(body.amountDrops);
      if (!drops) {
        return NextResponse.json(
          { error: "Valid positive amount is required" },
          { status: 400 }
        );
      }
      amount = drops;
      ledgerAmount = drops;
    }

    const tx = buildVaultDeposit(depositorWallet.classicAddress, vaultId, amount);
    const result = await submitTransaction(depositorWallet, tx);

    const txHash = (result.result as unknown as Record<string, unknown>).hash as string;
    await DepositHistoryModel.create({
      sessionId: session._id,
      vaultId,
      type: "deposit",
      amountDrops: ledgerAmount,
      txHash,
    });

    const snapshot = await fetchVaultSnapshot(vaultId);
    if (snapshot) {
      await VaultModel.findOneAndUpdate(
        { vaultId, sessionId: session._id },
        { totalDeposited: snapshot.assetsTotal, sharesMinted: snapshot.sharesMinted }
      );
    }

    return NextResponse.json({ result: result.result });
  } catch (error) {
    console.error("Vault deposit error:", error);
    return NextResponse.json({ error: "Failed to deposit into vault" }, { status: 500 });
  }
}
