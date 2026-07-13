"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { DROPS_PER_XRP } from "@/lib/constants";
import type { IssuedToken } from "@/types/session";

interface WithdrawFormProps {
  vaultId: string;
  issuedToken?: IssuedToken;
  vaultAssetsTotal?: string;
  vaultAssetsAvailable?: string;
  onSuccess: (message: string, txHash?: string) => void;
  onError: (message: string) => void;
  onPending: (message: string) => void;
}

export function WithdrawForm({
  vaultId,
  issuedToken,
  vaultAssetsTotal,
  vaultAssetsAvailable,
  onSuccess,
  onError,
  onPending,
}: WithdrawFormProps) {
  const isToken = !!issuedToken;
  const unit = isToken ? "TUSD" : "XRP";
  const [amount, setAmount] = useState(isToken ? "100" : "10");
  const [loading, setLoading] = useState(false);

  /** Convert a ledger amount (drops for XRP, token units for IOU/MPT) to a human "X.XX" string. */
  function toDisplay(ledgerValue: string): string {
    if (isToken) return parseFloat(ledgerValue || "0").toFixed(2);
    return (parseInt(ledgerValue || "0") / DROPS_PER_XRP).toFixed(2);
  }

  /**
   * amountValue is always in the server/ledger representation:
   *   - drops string for XRP
   *   - decimal string for IOU/MPT (the API rescales MPT internally)
   */
  async function handleWithdraw(amountValue: string) {
    setLoading(true);
    const display = toDisplay(amountValue);
    onPending(`Withdrawing ${display} ${unit} from vault...`);

    try {
      const body: Record<string, unknown> = { vaultId };
      if (isToken) body.tokenAmount = amountValue;
      else body.amountDrops = amountValue;

      const res = await fetch("/api/vault/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSuccess(`Redeemed ${display} ${unit} from vault`, data.result?.hash);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isToken) {
      await handleWithdraw(amount);
    } else {
      const amountDrops = String(Math.round(parseFloat(amount) * DROPS_PER_XRP));
      await handleWithdraw(amountDrops);
    }
  }

  /**
   * Redeem max: server submits an asset-denominated VaultWithdraw for the
   * vault's current AssetsAvailable (XLS-65 §3.2.2). rippled prior to
   * XRPLF/rippled#6955 rejects 100% redemption on IOU/MPT vaults with
   * tecINVARIANT_FAILED — that error surfaces here until devnet upgrades.
   */
  async function handleWithdrawAll() {
    const latest = vaultAssetsAvailable || vaultAssetsTotal || "0";
    if (Number(latest) === 0) {
      onError("No available assets to withdraw. Some may be locked in active loans.");
      return;
    }

    setLoading(true);
    const display = toDisplay(latest);
    onPending(`Withdrawing ${display} ${unit} from vault...`);

    try {
      const res = await fetch("/api/vault/withdraw", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ vaultId, redeemAll: true }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSuccess(`Withdrew all available (${display} ${unit})`, data.result?.hash);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Withdrawal failed");
    } finally {
      setLoading(false);
    }
  }

  // AssetsAvailable (not Total) — some assets may be locked in active loans.
  const withdrawable = vaultAssetsAvailable || vaultAssetsTotal;
  const hasAssets = withdrawable && Number(withdrawable) > 0;
  const availableDisplay = hasAssets ? toDisplay(withdrawable) : null;

  return (
    <div className="space-y-4">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="withdraw-amount">Amount to withdraw ({unit})</Label>
            {availableDisplay && (
              <span className="text-xs text-muted-foreground">
                Available: {availableDisplay} {unit}
              </span>
            )}
          </div>
          <Input
            id="withdraw-amount"
            type="number"
            min="0.01"
            step={isToken ? "0.01" : "0.1"}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>
        <Button type="submit" variant="outline" className="w-full" disabled={loading || !hasAssets}>
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Withdrawing...
            </>
          ) : !hasAssets ? (
            "No assets to withdraw"
          ) : (
            `Withdraw ${unit}`
          )}
        </Button>
      </form>

      {availableDisplay && Number(availableDisplay) > 0 && (
        <Button
          variant="secondary"
          className="w-full"
          disabled={loading}
          onClick={handleWithdrawAll}
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Redeeming...
            </>
          ) : (
            `Redeem max available (${availableDisplay} ${unit})`
          )}
        </Button>
      )}
    </div>
  );
}
