"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { LoanStatusBadge } from "@/components/loan-status-badge";
import { AmountDisplay } from "@/components/amount-display";
import { Button } from "@/components/ui/button";
import { ExternalLink, Trash2, CheckCircle } from "lucide-react";
import { explorerVaultUrl } from "@/lib/explorer";
import { DROPS_PER_XRP, nowRippleSeconds } from "@/lib/constants";
import type { LoanState } from "@/types/loan";

interface ManageLoansProps {
  loans: LoanState[];
  token?: string;
  vaultId: string;
  onUpdate: () => void;
  onStatus: (type: "success" | "error" | "pending", message: string, txHash?: string) => void;
}

export function ManageLoans({ loans, token, vaultId, onUpdate, onStatus }: ManageLoansProps) {
  const unit = token || "XRP";
  const isToken = !!token;
  // One "now" (Ripple epoch seconds) for the whole list render.
  const nowRipple = nowRippleSeconds();
  async function handleDefault(loanId: string) {
    if (!confirm("Are you sure you want to default this loan?")) return;
    onStatus("pending", "Defaulting loan on ledger...");
    try {
      const res = await fetch("/api/loan/default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId, action: "default" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onStatus("success", "Loan defaulted via LoanManage", data.result?.hash);
      onUpdate();
    } catch (err) {
      onStatus("error", err instanceof Error ? err.message : "Failed to default loan");
    }
  }

  async function handleClose(loanId: string) {
    onStatus("pending", "Closing loan on ledger...");
    try {
      const res = await fetch("/api/loan/default", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loanId, action: "close" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      onStatus("success", "Loan closed and removed from ledger", data.result?.hash);
      onUpdate();
    } catch (err) {
      onStatus("error", err instanceof Error ? err.message : "Failed to close loan");
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Loans</CardTitle>
        <CardDescription>
          {loans.length === 0
            ? "No loans issued yet."
            : `${loans.length} loan${loans.length > 1 ? "s" : ""} issued`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loans.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            Issue your first loan using the form.
          </p>
        ) : (
          <div className="space-y-3">
            {loans.map((loan) => {
              const paid = loan.paymentTotal - loan.paymentsRemaining;
              const isFullyRepaid =
                loan.paymentsRemaining === 0 &&
                paid > 0 &&
                (loan.status === "active" || loan.status === "repaid");
              const isClosed = loan.status === "closed";
              // XLS-66: a loan can only be defaulted once its due date + grace
              // period has elapsed (else the ledger returns tecTOO_SOON). Fail
              // OPEN when the transient on-chain due date is missing (sync gap)
              // — let the ledger enforce timing rather than block the broker.
              const canDefault =
                loan.status === "active" &&
                loan.paymentsRemaining > 0 &&
                (loan.nextPaymentDueDate == null ||
                  nowRipple > loan.nextPaymentDueDate + (loan.gracePeriod ?? 0));

              return (
                <div
                  key={loan.loanId}
                  className={`rounded-lg border p-4 space-y-3 ${isFullyRepaid || isClosed ? "border-success/30 bg-success/5" : ""}`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <AmountDisplay
                        drops={loan.principalRequested}
                        className="text-sm font-semibold"
                        token={token}
                      />
                      {isFullyRepaid ? (
                        <LoanStatusBadge status="repaid" />
                      ) : (
                        <LoanStatusBadge status={loan.status} />
                      )}
                      <a
                        href={explorerVaultUrl(vaultId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-muted-foreground hover:text-primary transition-colors"
                      >
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    {isClosed ? null : isFullyRepaid || loan.status === "defaulted" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5 border-success/30 text-success hover:bg-success/10"
                        onClick={() => handleClose(loan.loanId)}
                      >
                        <CheckCircle className="h-3.5 w-3.5" />
                        {loan.status === "defaulted" ? "Remove from ledger" : "Close Loan"}
                      </Button>
                    ) : loan.status === "active" ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={!canDefault}
                        title={
                          canDefault
                            ? undefined
                            : "Available only once the payment due date plus grace period has passed"
                        }
                        className="gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                        onClick={() => handleDefault(loan.loanId)}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Default
                      </Button>
                    ) : null}
                  </div>

                  {/* Status message */}
                  {isClosed && (
                    <p className="text-xs text-success">
                      Loan fully repaid and removed from the ledger.
                    </p>
                  )}
                  {isFullyRepaid && !isClosed && (
                    <p className="text-xs text-success">
                      All payments received. Close the loan to remove it from the ledger.
                    </p>
                  )}
                  {loan.status === "defaulted" && (
                    <p className="text-xs text-destructive">
                      Loan defaulted. Remove it from the ledger to free the reserve.
                    </p>
                  )}
                  {loan.status === "active" && !canDefault && (
                    <p className="text-xs text-muted-foreground">
                      Default available only after the payment due date plus grace period.
                    </p>
                  )}

                  {/* Loan terms grid */}
                  <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-xs">
                    <Term label="Interest" value={`${(loan.interestRate / 100).toFixed(1)}%`} />
                    <Term label="Paid" value={`${paid}/${loan.paymentTotal}`} />
                    <Term label="Interval" value={`${loan.paymentInterval / 86400}d`} />
                    <Term label="Grace" value={`${loan.gracePeriod / 86400}d`} />
                    <Term label="Origination" value={`${isToken ? parseFloat(loan.originationFee).toFixed(1) : (parseInt(loan.originationFee) / DROPS_PER_XRP).toFixed(1)} ${unit}`} />
                    <Term label="Service fee" value={`${isToken ? parseFloat(loan.serviceFee).toFixed(1) : (parseInt(loan.serviceFee) / DROPS_PER_XRP).toFixed(1)} ${unit}`} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between sm:flex-col sm:gap-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-mono font-medium">{value}</span>
    </div>
  );
}
