"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { DROPS_PER_XRP } from "@/lib/constants";
import type { IssuedToken } from "@/types/session";

interface DepositFormProps {
  vaultId: string;
  issuedToken?: IssuedToken;
  onSuccess: (message: string, txHash?: string) => void;
  onError: (message: string) => void;
  onPending: (message: string) => void;
}

export function DepositForm({
  vaultId,
  issuedToken,
  onSuccess,
  onError,
  onPending,
}: DepositFormProps) {
  const isToken = !!issuedToken;
  const unit = isToken ? "TUSD" : "XRP";
  const [amount, setAmount] = useState(isToken ? "5000" : "50");
  const [loading, setLoading] = useState(false);

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
          min={isToken ? "0.01" : "1"}
          step={isToken ? "0.01" : "1"}
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          required
        />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Depositing...
          </>
        ) : (
          `Deposit ${unit}`
        )}
      </Button>
    </form>
  );
}
