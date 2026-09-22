"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { DROPS_PER_XRP } from "@/lib/constants";
import { canDeposit, type VaultPhase } from "@/lib/vault-phase";
import type { IssuedToken } from "@/types/session";

interface DepositFormProps {
  vaultId: string;
  issuedToken?: IssuedToken;
  /** Current lifecycle phase; deposits are only open during subscription. */
  phase?: VaultPhase;
  onSuccess: (message: string, txHash?: string) => void;
  onError: (message: string) => void;
  onPending: (message: string) => void;
}

export function DepositForm({
  vaultId,
  issuedToken,
  phase,
  onSuccess,
  onError,
  onPending,
}: DepositFormProps) {
  const isToken = !!issuedToken;
  const unit = isToken ? "TUSD" : "XRP";
  const [amount, setAmount] = useState(isToken ? "5000" : "50");
  const [loading, setLoading] = useState(false);
  const locked = phase !== undefined && !canDeposit(phase);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    onPending(`Depositing ${amount} ${unit} into vault...`);

    try {
      const body: Record<string, unknown> = { vaultId };

      if (isToken) {
        body.tokenAmount = amount;
      } else {
        body.amountDrops = String(Math.round(parseFloat(amount) * DROPS_PER_XRP));
      }

      const res = await fetch("/api/vault/deposit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onSuccess(`Deposited ${amount} ${unit} into vault`, data.result?.hash);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Deposit failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="deposit-amount">Amount ({unit})</Label>
        <Input
          id="deposit-amount"
          type="number"
          min="0.000001"
          step="any"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      {locked && (
        <p className="text-xs text-muted-foreground">
          Deposits are only accepted during the subscription window. The vault
          is now in its {phase} phase.
        </p>
      )}
      <Button type="submit" className="w-full" disabled={loading || locked}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Depositing...
          </>
        ) : locked ? (
          "Deposits closed"
        ) : (
          `Deposit ${unit}`
        )}
      </Button>
    </form>
  );
}
