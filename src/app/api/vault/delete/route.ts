import { NextResponse } from "next/server";
import { UserWalletsModel, VaultModel, LoanModel } from "@/lib/db";
import { buildVaultDelete, submitTransaction, getVaultInfo } from "@/lib/xrpl/vault";
import { buildLoanBrokerDelete, buildLoanBrokerCoverWithdraw } from "@/lib/xrpl/broker";
import {
  buildLoanDelete,
  buildLoanManage,
  LoanManageFlags,
  getLoanInfo,
} from "@/lib/xrpl/loan";
import { getRoleWallet, buildAmountField, hasIssuedToken } from "@/lib/xrpl/helpers";
import { getUserWallets } from "@/lib/user-wallets";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * Full teardown sequence required by XLS-66 / XLS-65:
 * 1. Default active loans → LoanDelete each loan
 * 2. LoanBrokerCoverWithdraw first-loss capital → LoanBrokerDelete
 * 3. VaultDelete (requires AssetsTotal == 0 and OutstandingAmount == 0)
 */
export async function POST() {
  try {
    const session = await getUserWallets();
    if (!session || !session.vaultId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rl = await checkRateLimit(`tx:${session._id}`, 30, 60);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

    const brokerWallet = getRoleWallet(session, "broker");
    const borrowerWallet = (() => {
      try {
        return getRoleWallet(session, "borrower");
      } catch {
        return null;
      }
    })();

    // Precondition: vault must be empty.
    try {
      const info = await getVaultInfo(session.vaultId);
      const assetsTotal = Number(info.result?.vault?.AssetsTotal || "0");
      if (assetsTotal > 0) {
        return NextResponse.json(
          {
            error: `Cannot delete vault: assets still deposited (${assetsTotal}). Withdraw all funds from the Depositor tab first.`,
          },
          { status: 400 }
        );
      }
    } catch {
      // vault_info failed — proceed, VaultDelete will fail later if truly blocked.
    }

    const allLoans = await LoanModel.find({ sessionId: session._id, status: { $ne: "closed" } });
    for (const loan of allLoans) {
      try {
        const info = await getLoanInfo(loan.loanId);
        const node = info.result?.node;
        if (!node) continue;

        if (node.PaymentRemaining > 0) {
          try {
            const defaultTx = buildLoanManage(
              brokerWallet.classicAddress,
              loan.loanId,
              LoanManageFlags.tfLoanDefault
            );
            await submitTransaction(brokerWallet, defaultTx);
          } catch {
            // Grace period may not be expired — fall through to delete attempt.
          }
        }

        const wallet = borrowerWallet || brokerWallet;
        await submitTransaction(wallet, buildLoanDelete(wallet.classicAddress, loan.loanId));
      } catch {
        // Loan not on ledger or delete failed — continue cleanup.
      }
    }

    if (session.loanBrokerId) {
      try {
        const brokerInfo = await getLoanInfo(session.loanBrokerId);
        const brokerNode = brokerInfo.result?.node;
        if (brokerNode) {
          const coverAvailable = Number(brokerNode.CoverAvailable || 0);
          if (coverAvailable > 0) {
            try {
              // Match the vault's asset type — the ledger rejects mismatches
              // with tecWRONG_ASSET.
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
            } catch {
              // Cover withdraw may fail — proceed, broker delete will surface the real error.
            }
          }

          const deleteTx = buildLoanBrokerDelete(
            brokerWallet.classicAddress,
            session.loanBrokerId
          );
          await submitTransaction(brokerWallet, deleteTx);
        }
      } catch {
        // Broker not on ledger — skip.
      }
    }

    const tx = buildVaultDelete(brokerWallet.classicAddress, session.vaultId);
    const result = await submitTransaction(brokerWallet, tx);

    for (const loan of allLoans) {
      const newStatus = loan.paymentsRemaining === 0 ? "closed" : "defaulted";
      await LoanModel.findByIdAndUpdate(loan._id, { status: newStatus });
    }
    await VaultModel.findOneAndUpdate(
      { vaultId: session.vaultId },
      { status: "deleted" }
    );
    // Clear issuedToken along with vaultId — the IOU/MPT context belongs to the
    // deleted vault and would be stale for any replacement XRP vault.
    await UserWalletsModel.findByIdAndUpdate(session._id, {
      $unset: { vaultId: 1, loanBrokerId: 1, issuedToken: 1 },
    });

    return NextResponse.json({ result: result.result });
  } catch (error) {
    console.error("Vault delete error:", error);
    return NextResponse.json({ error: "Failed to delete vault" }, { status: 500 });
  }
}
