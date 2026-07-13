import { NextRequest, NextResponse } from "next/server";
import { validateDrops } from "@/lib/validation";
import { getUserWallets } from "@/lib/user-wallets";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { VaultModel, DepositHistoryModel } from "@/lib/db";
import { buildVaultWithdraw, submitTransaction, getVaultInfo } from "@/lib/xrpl/vault";
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

    // "Redeem all" (XLS-65 §3.2.2, asset-denominated path): take the vault's
    // current AssetsAvailable as a raw on-chain integer and pass it through
    // unchanged. rippled computes the matching share burn via the Withdraw
    // formula (§2.1.7.2.3). No client-side math → no precision drift, no
    // dependence on share-denominated edge cases.
    //
    // Known rippled limitation (XRPLF/rippled#6955): on the pre-fix build
    // running on devnet, the vault invariant rounds IOU/MPT balance deltas
    // inconsistently with the operation itself. Any VaultWithdraw whose
    // delta lands on a non-canonical IOU mantissa can fail with
    // tecINVARIANT_FAILED — full redemption is the most reliable trigger
    // but partial withdraws of "ordinary" amounts (e.g. 50% of an IOU
    // vault) also hit it. The error is surfaced as-is; the fix is in
    // rippled and lands once devnet picks up the post-#6955 release.
    //
    // The demo uses a single depositor per session so AssetsAvailable maps
    // 1:1 to their share; for a multi-depositor fork this helper should
    // instead compute shares × (AssetsAvailable / OutstandingAmount).
    const redeemAll = body.redeemAll === true;

    let amount: string | Record<string, string>;
    let ledgerAmount: string;
    let preAssetsTotal: number | null = null;

    /** Builds the Amount for an asset-denominated VaultWithdraw. */
    const buildAssetAmount = (value: string): string | Record<string, string> => {
      if (issuedToken?.type === "MPT" && issuedToken.mptIssuanceId) {
        return { mpt_issuance_id: issuedToken.mptIssuanceId, value };
      }
      if (issuedToken?.type === "IOU" && issuedToken.currency && issuedToken.issuer) {
        return { currency: issuedToken.currency, issuer: issuedToken.issuer, value };
      }
      return value; // XRP drops
    };

    if (redeemAll) {
      const vaultInfo = await getVaultInfo(vaultId);
      const vaultNode = vaultInfo.result?.vault;
      const rawAvailable = String(vaultNode?.AssetsAvailable ?? "0");
      if (rawAvailable === "0") {
        return NextResponse.json(
          { error: "No assets available to withdraw" },
          { status: 400 }
        );
      }
      preAssetsTotal = Number(vaultNode?.AssetsTotal ?? "0");
      amount = buildAssetAmount(rawAvailable);
      ledgerAmount = rawAvailable;
    } else if (isToken && body.tokenAmount) {
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

    const tx = buildVaultWithdraw(depositorWallet.classicAddress, vaultId, amount);
    const result = await submitTransaction(depositorWallet, tx);

    const snapshot = await fetchVaultSnapshot(vaultId);

    // For redeemAll, the submitted AssetsAvailable may have shifted by the
    // time the tx landed (other vault activity). Prefer the pre/post delta
    // as the authoritative history amount when we have both values.
    if (redeemAll && preAssetsTotal !== null) {
      const postAssetsTotal = snapshot ? Number(snapshot.assetsTotal) : 0;
      ledgerAmount = String(Math.max(0, preAssetsTotal - postAssetsTotal));
    }

    const txHash = (result.result as unknown as Record<string, unknown>).hash as string;
    await DepositHistoryModel.create({
      sessionId: session._id,
      vaultId,
      type: "withdraw",
      amountDrops: ledgerAmount,
      txHash,
    });

    if (snapshot) {
      await VaultModel.findOneAndUpdate(
        { vaultId, sessionId: session._id },
        { totalDeposited: snapshot.assetsTotal, sharesMinted: snapshot.sharesMinted }
      );
    }

    return NextResponse.json({ result: result.result });
  } catch (error) {
    console.error("Vault withdraw error:", error);
    return NextResponse.json({ error: "Failed to withdraw from vault" }, { status: 500 });
  }
}
