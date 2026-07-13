"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { AmountDisplay } from "@/components/amount-display";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ExternalLink,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { explorerTransactionUrl } from "@/lib/explorer";
import { DROPS_PER_XRP } from "@/lib/constants";

interface HistoryEntry {
  _id: string;
  type: "deposit" | "withdraw";
  amountDrops: string;
  txHash?: string;
  createdAt: string;
}

interface Summary {
  totalDeposited: string;
  totalWithdrawn: string;
  netInvested: string;
}

interface DepositHistoryProps {
  vaultId: string;
  vaultAssetsTotal?: string;
  token?: string;
}

export function DepositHistory({
  vaultId,
  vaultAssetsTotal,
  token,
}: DepositHistoryProps) {
  const unit = token || "XRP";
  const isToken = !!token;
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);

  const fetchHistory = useCallback(async () => {
    const res = await fetch(`/api/vault/history?vaultId=${vaultId}`);
    if (res.ok) {
      const data = await res.json();
      setHistory(data.history);
      setSummary(data.summary);
    }
  }, [vaultId]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  // Calculate PNL: total withdrawn + current position - total deposited
  const parse = token ? parseFloat : parseInt;
  const totalDeposited = parse(summary?.totalDeposited || "0");
  const totalWithdrawn = parse(summary?.totalWithdrawn || "0");
  const currentPosition = parse(vaultAssetsTotal || "0");
  const pnl = totalWithdrawn + currentPosition - totalDeposited;
  const pnlPercent =
    totalDeposited > 0 ? ((pnl / totalDeposited) * 100).toFixed(2) : "0.00";
  const pnlPositive = pnl >= 0;

  if (history.length === 0 && !summary) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Activity & PNL</CardTitle>
        <CardDescription>
          Deposit and withdrawal history for this vault.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* PNL summary */}
        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">
                Total Deposited
              </p>
              <AmountDisplay
                drops={summary.totalDeposited}
                className="text-sm font-semibold"
                token={token}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">
                Total Withdrawn
              </p>
              <AmountDisplay
                drops={summary.totalWithdrawn}
                className="text-sm font-semibold"
                token={token}
              />
            </div>
            <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
              <p className="text-[11px] font-medium text-muted-foreground">
                Vault Position
              </p>
              <AmountDisplay
                drops={vaultAssetsTotal || "0"}
                className="text-sm font-semibold"
                token={token}
              />
            </div>
            <div
              className={`rounded-lg border p-3 space-y-1 ${
                pnlPositive
                  ? "border-success/30 bg-success/5"
                  : "border-destructive/30 bg-destructive/5"
              }`}
            >
              <p className="text-[11px] font-medium text-muted-foreground">
                PNL
              </p>
              <div className="flex items-center gap-1.5">
                {pnlPositive ? (
                  <TrendingUp className="h-3.5 w-3.5 text-success" />
                ) : (
                  <TrendingDown className="h-3.5 w-3.5 text-destructive" />
                )}
                <span
                  className={`text-sm font-mono font-semibold ${
                    pnlPositive ? "text-success" : "text-destructive"
                  }`}
                >
                  {pnlPositive ? "+" : ""}
                  {isToken ? pnl.toFixed(2) : (pnl / DROPS_PER_XRP).toFixed(2)} {unit}
                </span>
                <span
                  className={`text-[11px] ${
                    pnlPositive ? "text-success" : "text-destructive"
                  }`}
                >
                  ({pnlPositive ? "+" : ""}
                  {pnlPercent}%)
                </span>
              </div>
            </div>
          </div>
        )}

        {history.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              {history.map((entry) => (
                <div
                  key={entry._id}
                  className="flex items-center justify-between rounded-lg border px-3 py-2.5"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md ${
                        entry.type === "deposit"
                          ? "bg-success/10 text-success"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {entry.type === "deposit" ? (
                        <ArrowDownToLine className="h-3.5 w-3.5" />
                      ) : (
                        <ArrowUpFromLine className="h-3.5 w-3.5" />
                      )}
                    </div>
                    <div>
                      <p className="text-xs font-medium capitalize">
                        {entry.type}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(entry.createdAt).toLocaleDateString(
                          undefined,
                          {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          }
                        )}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`text-sm font-mono font-medium ${
                        entry.type === "deposit"
                          ? "text-success"
                          : "text-muted-foreground"
                      }`}
                    >
                      {entry.type === "deposit" ? "+" : "-"}
                      {isToken
                        ? parseFloat(entry.amountDrops).toFixed(2)
                        : (parseInt(entry.amountDrops) / DROPS_PER_XRP).toFixed(2)}{" "}
                      {unit}
                    </span>
                    {entry.txHash && (
                      <a
                        href={explorerTransactionUrl(entry.txHash)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
