"use client";

import { useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Loader2, Plus, Minus } from "lucide-react";
import { DROPS_PER_XRP } from "@/lib/constants";

interface FirstLossCapitalProps {
  coverAvailable?: string;
  coverRateMinimum?: string;
  token?: string;
  onUpdate: () => void;
  onStatus: (type: "success" | "error" | "pending", message: string, txHash?: string) => void;
}

export function FirstLossCapital({
  coverAvailable,
  coverRateMinimum,
  token,
  onUpdate,
  onStatus,
}: FirstLossCapitalProps) {
  const unit = token || "XRP";
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);

  const coverPct =
    coverRateMinimum !== undefined
      ? (Number(coverRateMinimum) / 1000).toFixed(2)
      : null;

  async function submit(action: "deposit" | "withdraw") {
    if (!amount || Number(amount) <= 0) {
      onStatus("error", "Enter a positive amount");
      return;
    }
    setLoading(true);
    onStatus("pending", `${action === "deposit" ? "Depositing" : "Withdrawing"} first-loss capital...`);
    try {
      const payloadAmount = token
        ? amount
        : String(Math.round(parseFloat(amount) * DROPS_PER_XRP));
      const res = await fetch("/api/broker/cover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, amount: payloadAmount }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onStatus("success", `First-loss capital ${action === "deposit" ? "deposited" : "withdrawn"}`, data.result?.hash);
      setAmount("");
      onUpdate();
    } catch (err) {
      onStatus("error", err instanceof Error ? err.message : "Cover update failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>First-Loss Capital</CardTitle>
        <CardDescription>
          Broker cover that absorbs loan defaults. Loans can only be issued while
          cover ≥ the required minimum{coverPct ? ` (${coverPct}% of debt)` : ""}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="text-sm">
          <span className="text-muted-foreground">Current cover: </span>
          <span className="font-mono font-medium">
            {coverAvailable !== undefined
              ? `${Number((token ? parseFloat(coverAvailable) : parseFloat(coverAvailable) / DROPS_PER_XRP).toFixed(6))} ${unit}`
              : "—"}
          </span>
        </div>
        <div className="space-y-2">
          <Label htmlFor="cover-amount">Amount ({unit})</Label>
          <Input
            id="cover-amount"
            type="number"
            min="0"
            step="0.1"
            placeholder={`e.g. 10`}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
          />
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading}
            onClick={() => submit("deposit")}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Deposit
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5"
            disabled={loading}
            onClick={() => submit("withdraw")}
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Minus className="h-3.5 w-3.5" />}
            Withdraw
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
