import { NextRequest, NextResponse } from "next/server";
import { UserWalletsModel } from "@/lib/db";
import {
  buildLoanBrokerSet,
  buildLoanBrokerDelete,
  buildLoanBrokerCoverDeposit,
  buildLoanBrokerCoverWithdraw,
} from "@/lib/xrpl/broker";
import { submitTransaction } from "@/lib/xrpl/vault";
import { getLoanInfo } from "@/lib/xrpl/loan";
import {
  getRoleWallet,
  extractCreatedLedgerId,
  buildAmountField,
  hasIssuedToken,
  humanToMptUnits,
  unscaleLoanNodeForMPT,
  sanitizeLedgerError,
} from "@/lib/xrpl/helpers";
import { validateNumber, validateAssetAmount, validateDecimalAmount } from "@/lib/validation";
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
    const vaultId = typeof body.vaultId === "string" ? body.vaultId.trim() : null;
    if (!vaultId) {
      return NextResponse.json({ error: "vaultId is required" }, { status: 400 });
    }

    const brokerWallet = getRoleWallet(session, "broker");

    // XLS-66 rate fields are UINT16/UINT32 in 1/10 bps. Spec caps below.
    const brokerOptions: Record<string, number | string> = {};
    const opts = body.brokerOptions || {};
    // XLS-66 rate fields are integers (UINT16/UINT32 in 1/10 bps). Reject a
    // provided-but-out-of-range/non-integer value with a 400 rather than
    // silently dropping it.
    const assignNumber = (key: string, max: number): string | null => {
      if (opts[key] === undefined) return null;
      const v = validateNumber(opts[key], 0, max);
      if (v === null || !Number.isInteger(v)) {
        return `${key} must be an integer between 0 and ${max}`;
      }
      brokerOptions[key] = v;
      return null;
    };
    for (const [key, max] of [
      ["managementFeeRate", 10_000],
      ["coverRateMinimum", 100_000],
      ["coverRateLiquidation", 100_000],
    ] as const) {
      const err = assignNumber(key, max);
      if (err) return NextResponse.json({ error: err }, { status: 400 });
    }
    // XLS-66 §3.3.3.1 #7: CoverRateMinimum and CoverRateLiquidation must be
    // both zero or both non-zero (out-of-range values already 400'd above).
    const coverMin = Number(brokerOptions.coverRateMinimum || 0);
    const coverLiq = Number(brokerOptions.coverRateLiquidation || 0);
    if (coverMin > 0 !== coverLiq > 0) {
      return NextResponse.json(
        { error: "coverRateMinimum and coverRateLiquidation must both be set or both omitted" },
        { status: 400 }
      );
    }
    // DebtMaximum is a NUMBER (decimal) in the vault's asset units. Accept a
    // non-negative decimal; scale it for MPT like other MPT amounts.
    if (opts.debtMaximum !== undefined) {
      const isMPT =
        hasIssuedToken(session.issuedToken) && session.issuedToken?.type === "MPT";
      const v = validateDecimalAmount(opts.debtMaximum);
      if (v !== null) brokerOptions.debtMaximum = isMPT ? humanToMptUnits(v) : v;
    }

    const tx = buildLoanBrokerSet(brokerWallet.classicAddress, vaultId, brokerOptions);
    const result = await submitTransaction(brokerWallet, tx);
    const loanBrokerId = extractCreatedLedgerId(result, "LoanBroker");

    if (loanBrokerId) {
      await UserWalletsModel.findByIdAndUpdate(session._id, { loanBrokerId });

      // First-loss cover must be denominated in the vault's asset, otherwise
      // the ledger returns tecWRONG_ASSET.
      const isToken = hasIssuedToken(session.issuedToken);
      const coverRaw = validateAssetAmount(body.coverAmountDrops, isToken);
      if (coverRaw) {
        const coverAmount = isToken
          ? buildAmountField(session.issuedToken, coverRaw)
          : coverRaw;
        const coverTx = buildLoanBrokerCoverDeposit(
          brokerWallet.classicAddress,
          loanBrokerId,
          coverAmount
        );
        await submitTransaction(brokerWallet, coverTx);
      }
    }

    return NextResponse.json({ loanBrokerId, result: result.result });
  } catch (error) {
    console.error("Broker creation error:", error);
    return NextResponse.json(
      { error: sanitizeLedgerError(error, "Failed to create loan broker") },
      { status: 500 }
    );
  }
}

/**
 * Return the current session's LoanBroker ledger node (cover, debt, rates).
 * The `/api/loan/[id]` route can't serve this: it is scoped to LoanModel rows
 * and 404s for a LoanBroker id. MPT amounts are unscaled to human decimals.
 */
export async function GET() {
  try {
    const session = await getUserWallets();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    if (!session.loanBrokerId) {
      return NextResponse.json({ error: "No broker registered" }, { status: 404 });
    }
    const info = await getLoanInfo(session.loanBrokerId);
    const node =
      (info.result as { node?: Record<string, unknown> } | undefined)?.node ?? null;
    if (node) unscaleLoanNodeForMPT(node, session.issuedToken?.type === "MPT");
    return NextResponse.json({ node });
  } catch (error) {
    console.error("Broker info error:", error);
    return NextResponse.json({ error: "Failed to get broker info" }, { status: 500 });
  }
}

export async function DELETE() {
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

    const brokerWallet = getRoleWallet(session, "broker");

    // LoanBrokerDelete fails with tecHAS_OBLIGATIONS while any first-loss
    // cover remains. Withdraw it first when present so callers don't have
    // to chain a second request manually. Outstanding loans still block
    // delete — that requires LoanDelete and is handled by /api/vault/delete.
    try {
      const info = await getLoanInfo(session.loanBrokerId);
      const node = info.result?.node;
      const coverAvailable = Number(node?.CoverAvailable || 0);
      if (coverAvailable > 0) {
        const isToken = hasIssuedToken(session.issuedToken);
        const withdrawAmount = isToken
          ? buildAmountField(session.issuedToken, String(coverAvailable))
          : String(coverAvailable);
        const withdrawTx = buildLoanBrokerCoverWithdraw(
          brokerWallet.classicAddress,
          session.loanBrokerId,
          withdrawAmount
        );
        await submitTransaction(brokerWallet, withdrawTx);
      }
    } catch {
      // Cover withdraw is best-effort: if it fails, fall through and let the
      // broker-delete attempt surface the actual blocker.
    }

    const tx = buildLoanBrokerDelete(brokerWallet.classicAddress, session.loanBrokerId);
    const result = await submitTransaction(brokerWallet, tx);

    await UserWalletsModel.findByIdAndUpdate(session._id, {
      $unset: { loanBrokerId: 1 },
    });

    return NextResponse.json({ result: result.result });
  } catch (error) {
    console.error("Broker deletion error:", error);
    return NextResponse.json({ error: "Failed to delete loan broker" }, { status: 500 });
  }
}
