"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { AmountDisplay } from "@/components/amount-display";
import { LoanStatusBadge } from "@/components/loan-status-badge";
import { Loader2, ExternalLink, Calendar, Clock, CheckCircle, Trash2, AlertTriangle, XCircle } from "lucide-react";
import { explorerVaultUrl } from "@/lib/explorer";
import { DROPS_PER_XRP, RIPPLE_EPOCH_OFFSET, nowRippleSeconds, LSF_LOAN_DEFAULT, LSF_LOAN_OVERPAYMENT } from "@/lib/constants";
import { earlyFullPayment, latePayment } from "@/lib/loan-math";
import type { LoanState } from "@/types/loan";

interface RepaymentFormProps {
  loan: LoanState;
  token?: string;
  vaultId: string;
  onSuccess: (message: string, txHash?: string) => void;
  onError: (message: string) => void;
  onPending: (message: string) => void;
}

type PaymentMode = "installment" | "full" | "custom" | "overpayment";

/** Human-readable overdue duration — minutes, then hours, then days. */
function formatOverdue(seconds: number): string {
  if (seconds >= 86400) return `${Math.ceil(seconds / 86400)} day(s)`;
  if (seconds >= 3600) return `${Math.ceil(seconds / 3600)} hour(s)`;
  return `${Math.max(1, Math.ceil(seconds / 60))} minute(s)`;
}

interface OnChainLoan {
  TotalValueOutstanding?: string;
  PaymentRemaining?: number;
  PaymentTotal?: number;
  PeriodicPayment?: string;
  NextPaymentDueDate?: number;
  PreviousPaymentDueDate?: number;
  PrincipalOutstanding?: string;
  PrincipalRequested?: string;
  InterestRate?: number;
  CloseInterestRate?: number;
  ClosePaymentFee?: string;
  LateInterestRate?: number;
  LatePaymentFee?: string;
  OverpaymentInterestRate?: number;
  OverpaymentFee?: number;
  StartDate?: number;
  LoanServiceFee?: string;
  LoanOriginationFee?: string;
  GracePeriod?: number;
  PaymentInterval?: number;
  Flags?: number;
}

export function RepaymentForm({
  loan,
  token,
  vaultId,
  onSuccess,
  onError,
  onPending,
}: RepaymentFormProps) {
  const unit = token || "XRP";
  const isToken = !!token;
  const [mode, setMode] = useState<PaymentMode>("installment");
  const [customAmount, setCustomAmount] = useState("10");
  const [loading, setLoading] = useState(false);
  const [onChain, setOnChain] = useState<OnChainLoan | null>(null);

  const fetchLoanInfo = useCallback(async () => {
    try {
      const res = await fetch(`/api/loan/${loan.loanId}`);
      if (res.ok) {
        const data = await res.json();
        if (data.onLedger?.node) {
          setOnChain(data.onLedger.node);
        }
      }
    } catch { /* ignore */ }
  }, [loan.loanId]);

  useEffect(() => {
    fetchLoanInfo();
  }, [fetchLoanInfo]);

  // Always prefer on-chain values over DB
  const paymentsRemaining = onChain?.PaymentRemaining ?? loan.paymentsRemaining;
  const paymentTotal = onChain?.PaymentTotal ?? loan.paymentTotal;
  const totalOutstanding = onChain?.TotalValueOutstanding || loan.principalOutstanding;
  const principalRequested = onChain?.PrincipalRequested || loan.principalRequested;
  const interestRateDisplay = onChain?.InterestRate
    ? (onChain.InterestRate / 1000).toFixed(1)
    : (loan.interestRate / 100).toFixed(1);
  const serviceFee = onChain?.LoanServiceFee || loan.serviceFee || "0";
  const paid = paymentTotal - paymentsRemaining;
  const progress = paymentTotal > 0 ? (paid / paymentTotal) * 100 : 0;
  // A defaulted loan also has PaymentRemaining == 0, so it must be excluded
  // before treating "no payments remaining" as a successful full repayment.
  const isDefaulted =
    !!onChain?.Flags && (Number(onChain.Flags) & LSF_LOAN_DEFAULT) !== 0;
  const isFullyRepaid =
    !isDefaulted &&
    (paymentsRemaining === 0 || (Number(totalOutstanding) === 0 && paid > 0));

  // Lateness detection against on-ledger timestamps.
  const nowRipple = nowRippleSeconds();
  const nextDue = onChain?.NextPaymentDueDate ?? 0;
  const secondsOverdue = nextDue > 0 ? Math.max(0, nowRipple - nextDue) : 0;
  const isLate = secondsOverdue > 0;
  const supportsOverpayment =
    !!onChain?.Flags && (onChain.Flags & LSF_LOAN_OVERPAYMENT) !== 0;

  // For XRP (drops), round up to nearest integer. For tokens, round to 6 decimals max (XRPL IOU limit).
  const ceil = isToken ? (n: number) => n : Math.ceil;
  const roundAmt = isToken
    ? (n: number) => parseFloat(n.toFixed(6))
    : (n: number) => Math.ceil(n);

  // Small buffer applied only to the submitted amount (not the displayed one)
  // to absorb interest drift between fetch and submission (ledger close time
  // vs client). Must stay tiny: for tfLoanFullPayment the ledger debits the
  // full Amount (§A-3.3 Step 2 does not cap), so any buffer is actually paid.
  //   XRP   → +1000 drops (= 0.001 XRP)
  //   Token → +0.01 units  (= 1 integer unit at MPT AssetScale 2)
  function addBuffer(n: number): number {
    return isToken ? n + 0.01 : n + 1000;
  }

  /** XLS-66 §A-3.2.2 late payment breakdown. No buffer. */
  function computeLate(): {
    periodicPayment: number;
    serviceFee: number;
    lateFee: number;
    lateInterest: number;
    total: number;
  } {
    const principal = Number(onChain?.PrincipalOutstanding || totalOutstanding || "0");
    const periodicPayment = ceil(Number(onChain?.PeriodicPayment || "0"));
    const svcFee = Number(serviceFee);
    const lateFee = Number(onChain?.LatePaymentFee || "0");
    const { lateInterest, totalDue } = latePayment({
      principalOutstanding: principal,
      periodicPayment,
      serviceFee: svcFee,
      latePaymentFee: lateFee,
      lateInterestRateTenthBps: onChain?.LateInterestRate ?? 0,
      secondsOverdue,
    });
    return {
      periodicPayment,
      serviceFee: svcFee,
      lateFee,
      lateInterest,
      total: totalDue,
    };
  }

  /** XLS-66 §A-3.2.4 early full repayment breakdown. No buffer. */
  function computeEarlyFull(): {
    principal: number;
    accruedInterest: number;
    prepaymentPenalty: number;
    closePaymentFee: number;
    total: number;
  } {
    const principal = Number(onChain?.PrincipalOutstanding || totalOutstanding || "0");
    const lastTs = Math.max(
      onChain?.PreviousPaymentDueDate ?? 0,
      onChain?.StartDate ?? 0
    );
    const { accruedInterest, prepaymentPenalty } = earlyFullPayment({
      principalOutstanding: principal,
      interestRateTenthBps: onChain?.InterestRate ?? 0,
      closeInterestRateTenthBps: onChain?.CloseInterestRate ?? 0,
      closePaymentFee: 0, // added separately below (onChain field is the raw value)
      paymentInterval: onChain?.PaymentInterval ?? 0,
      secondsSinceLastPayment: Math.max(0, nowRippleSeconds() - lastTs),
    });
    const closePaymentFee = Number(onChain?.ClosePaymentFee || "0");
    const total = principal + accruedInterest + prepaymentPenalty + closePaymentFee;
    return { principal, accruedInterest, prepaymentPenalty, closePaymentFee, total };
  }

  /** Clean math used in the UI breakdown — no buffer. */
  function getDisplayTotal(): string {
    if (mode === "full") return String(roundAmt(computeEarlyFull().total));
    if (mode === "installment") {
      if (isLate) return String(roundAmt(computeLate().total));
      const periodicPayment = ceil(Number(onChain?.PeriodicPayment || "0"));
      const svcFee = Number(serviceFee);
      if (periodicPayment > 0) return String(roundAmt(periodicPayment + svcFee));
      const remaining = paymentsRemaining || 1;
      return String(roundAmt(Number(totalOutstanding || "0") / remaining + svcFee));
    }
    if (mode === "overpayment") {
      // One installment + the extra entered by the user. The ledger splits the
      // extra into overpayment interest / fee / principal reduction.
      const periodicPayment = ceil(Number(onChain?.PeriodicPayment || "0"));
      const svcFee = Number(serviceFee);
      const extra = isToken
        ? parseFloat(customAmount || "0")
        : Math.round(parseFloat(customAmount || "0") * DROPS_PER_XRP);
      return String(roundAmt(periodicPayment + svcFee + extra));
    }
    if (isToken) return String(parseFloat(customAmount || "0"));
    return String(Math.round(parseFloat(customAmount || "0") * DROPS_PER_XRP));
  }

  /**
   * Amount to submit. For full/late modes the server re-computes with
   * validated ledger close time — we send nothing and trust the server.
   * For the other modes the ledger caps at the actually-due value, so a
   * small client-side buffer is safe.
   */
  function getPaymentAmount(): string {
    const clean = Number(getDisplayTotal());
    if (mode === "custom") return String(clean);
    return String(roundAmt(addBuffer(clean)));
  }

  function formatVal(drops: string): string {
    return isToken ? parseFloat(drops).toFixed(2) : (parseInt(drops) / DROPS_PER_XRP).toFixed(2);
  }

  function formatDate(rippleTimestamp: number): string {
    const unixMs = (rippleTimestamp + RIPPLE_EPOCH_OFFSET) * 1000;
    return new Date(unixMs).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    // Refresh on-chain state first to get accurate numbers
    await fetchLoanInfo();
    const amountDrops = getPaymentAmount();
    const amountDisplay = formatVal(amountDrops);
    onPending(`Making payment of ${amountDisplay} ${unit}...`);

    try {
      const finalAmountDrops = amountDrops;
      const finalDisplay = formatVal(finalAmountDrops);
      onPending(`Making payment of ${finalDisplay} ${unit}...`);

      // Map UI mode to the LoanPay flag the ledger requires.
      //   late → tfLoanLatePayment (auto-detected from isLate, even in "installment" mode)
      //   full → tfLoanFullPayment  (server computes exact amount)
      //   overpayment → tfLoanOverpayment
      //   regular installment / custom → no flag
      const serverMode =
        isLate && (mode === "installment" || mode === "custom")
          ? "late"
          : mode === "full"
          ? "full"
          : mode === "overpayment"
          ? "overpayment"
          : undefined;

      // For full/late, omit amountDrops — the server derives it from the
      // validated ledger close time (precise to ~1 ledger close, ~0.001 unit).
      const body: Record<string, unknown> = {
        loanId: loan.loanId,
        mode: serverMode,
      };
      if (serverMode !== "full" && serverMode !== "late") {
        body.amountDrops = finalAmountDrops;
      }

      const res = await fetch("/api/loan/repay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      // Refresh on-chain state after payment
      await fetchLoanInfo();
      const debitedDisplay = data.amount ? formatVal(data.amount) : finalDisplay;
      onSuccess(`Payment of ${debitedDisplay} ${unit} submitted`, data.result?.hash);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Payment failed");
    } finally {
      setLoading(false);
    }
  }


  if (isFullyRepaid) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Loan Fully Repaid</CardTitle>
            <div className="flex items-center gap-2">
              <LoanStatusBadge status="repaid" />
              <a
                href={explorerVaultUrl(vaultId)}
                target="_blank"
                rel="noopener noreferrer"
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Principal</p>
              <AmountDisplay drops={principalRequested} className="font-medium" token={token} />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Payments made</p>
              <p className="font-mono font-medium">{paid}/{paymentTotal}</p>
            </div>
          </div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div className="h-full rounded-full bg-primary w-full" />
          </div>
          <div className="rounded-lg border border-success/50 bg-success/5 px-3 py-2.5 text-sm text-success flex items-center gap-2">
            <CheckCircle className="h-4 w-4 shrink-0" />
            All payments completed. This loan is fully settled.
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            disabled={loading}
            onClick={async () => {
              setLoading(true);
              onPending("Removing loan from ledger...");
              try {
                const res = await fetch("/api/loan/default", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ loanId: loan.loanId, action: "close" }),
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error);
                onSuccess("Loan removed from ledger", data.result?.hash);
              } catch (err) {
                onError(err instanceof Error ? err.message : "Failed to close loan");
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="h-3.5 w-3.5" />
            )}
            Remove from ledger
          </Button>
          <p className="text-xs text-muted-foreground">
            Optional — removes the loan object from the ledger and frees the borrower&apos;s owner reserve. Required before deleting the vault.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Make a Payment</CardTitle>
          <div className="flex items-center gap-2">
            <LoanStatusBadge status={loan.status} />
            <a
              href={explorerVaultUrl(vaultId)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary transition-colors"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Summary stats */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground text-xs">Principal</p>
            <AmountDisplay drops={principalRequested} className="font-medium" token={token} />
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Outstanding</p>
            <AmountDisplay drops={totalOutstanding} className="font-medium" token={token} />
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Interest rate</p>
            <p className="font-mono font-medium">
              {interestRateDisplay}%
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Payments</p>
            <p className="font-mono font-medium">
              {paid}/{paymentTotal}
            </p>
          </div>
        </div>

        {/* Next payment due */}
        {onChain?.NextPaymentDueDate && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <Calendar className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Next payment due:</span>
            <span className="font-medium">
              {formatDate(onChain.NextPaymentDueDate)}
            </span>
          </div>
        )}

        {onChain?.PeriodicPayment && (
          <div className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Periodic payment:</span>
            <AmountDisplay drops={onChain.PeriodicPayment} className="font-medium" token={token} />
          </div>
        )}

        {/* Progress */}
        <div className="space-y-1.5">
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-right">
            {paymentsRemaining} payment{paymentsRemaining !== 1 ? "s" : ""} remaining
          </p>
        </div>

        <Separator />

        {/* Lateness banners — defaulted is terminal; late (until default) is a warning. */}
        {isDefaulted && (
          <div className="flex items-start gap-2.5 rounded-lg border border-destructive/50 bg-destructive/5 px-3 py-2.5 text-sm text-destructive">
            <XCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">Loan defaulted</p>
              <p className="text-xs mt-0.5">
                This loan has been defaulted on the ledger and can no longer be repaid.
              </p>
            </div>
          </div>
        )}
        {isLate && !isDefaulted && (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/50 bg-warning/5 px-3 py-2.5 text-sm">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
            <div>
              <p className="font-medium text-warning-foreground">Payment overdue</p>
              <p className="text-xs mt-0.5 text-muted-foreground">
                Past due by {formatOverdue(secondsOverdue)}. The ledger requires
                tfLoanLatePayment with late fees on this installment.
              </p>
            </div>
          </div>
        )}

        {/* Payment mode selection */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label className="text-sm">Payment type</Label>
            <div className={`grid gap-2 ${supportsOverpayment && !isLate ? "grid-cols-4" : "grid-cols-3"}`}>
              {(
                [
                  { key: "installment", label: isLate ? "Late installment" : "Next installment", disabled: false },
                  { key: "full", label: "Pay in full", disabled: isLate || paymentsRemaining <= 1 },
                  ...(supportsOverpayment
                    ? [{ key: "overpayment" as PaymentMode, label: "Overpayment", disabled: isLate }]
                    : []),
                  { key: "custom", label: "Custom", disabled: false },
                ] as { key: PaymentMode; label: string; disabled: boolean }[]
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => !opt.disabled && setMode(opt.key)}
                  disabled={opt.disabled || isDefaulted}
                  className={`rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    mode === opt.key
                      ? "border-primary bg-primary/5 text-primary"
                      : "text-muted-foreground hover:bg-muted/50"
                  } disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {mode === "installment" && !isLate && (() => {
            const periodicPayment = ceil(Number(onChain?.PeriodicPayment || "0"));
            const svcFee = Number(serviceFee);
            return (
              <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Periodic payment (principal + interest)</span>
                  <AmountDisplay drops={String(periodicPayment)} token={token} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service fee (1 × {formatVal(String(svcFee))} {unit})</span>
                  <AmountDisplay drops={String(svcFee)} token={token} />
                </div>
                <div className="flex justify-between border-t pt-1.5 font-semibold">
                  <span>Total</span>
                  <AmountDisplay drops={getDisplayTotal()} token={token} />
                </div>
              </div>
            );
          })()}

          {mode === "installment" && isLate && (() => {
            const l = computeLate();
            const hasLateFee = l.lateFee > 0;
            return (
              <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Periodic payment (principal + interest)</span>
                  <AmountDisplay drops={String(l.periodicPayment)} token={token} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Service fee</span>
                  <AmountDisplay drops={String(l.serviceFee)} token={token} />
                </div>
                {hasLateFee && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Late payment fee</span>
                    <AmountDisplay drops={String(ceil(l.lateFee))} token={token} />
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Late interest ({((onChain?.LateInterestRate ?? 0) / 1000).toFixed(2)}% × {Math.ceil(secondsOverdue / 86400)}d)
                  </span>
                  <AmountDisplay drops={String(ceil(l.lateInterest))} token={token} />
                </div>
                <div className="flex justify-between border-t pt-1.5 font-semibold">
                  <span>Total</span>
                  <AmountDisplay drops={getDisplayTotal()} token={token} />
                </div>
              </div>
            );
          })()}

          {mode === "overpayment" && (() => {
            const periodicPayment = ceil(Number(onChain?.PeriodicPayment || "0"));
            const svcFee = Number(serviceFee);
            const overpaymentInterestPct = ((onChain?.OverpaymentInterestRate ?? 0) / 1000).toFixed(2);
            const overpaymentFeePct = ((onChain?.OverpaymentFee ?? 0) / 1000).toFixed(2);
            return (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label htmlFor="overpay-extra">Extra principal payment ({unit})</Label>
                  <Input
                    id="overpay-extra"
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={customAmount}
                    onChange={(e) => setCustomAmount(e.target.value)}
                    required
                  />
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm space-y-1.5">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Regular installment</span>
                    <AmountDisplay drops={String(periodicPayment + svcFee)} token={token} />
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Extra (applied to principal)</span>
                    <span className="font-mono">
                      {customAmount || "0"} {unit}
                    </span>
                  </div>
                  <div className="flex justify-between border-t pt-1.5 font-semibold">
                    <span>Total</span>
                    <AmountDisplay drops={getDisplayTotal()} token={token} />
                  </div>
                  <p className="text-xs text-muted-foreground pt-1">
                    The ledger will deduct overpayment interest ({overpaymentInterestPct}%) and fee ({overpaymentFeePct}%) from the extra, re-amortize the loan, then reduce the remaining principal.
                  </p>
                </div>
              </div>
            );
          })()}

          {mode === "full" && (() => {
            const f = computeEarlyFull();
            const hasPenalty = f.prepaymentPenalty > 0;
            const hasCloseFee = f.closePaymentFee > 0;
            return (
              <div className="rounded-lg bg-muted/50 px-3 py-2.5 text-sm space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Principal outstanding</span>
                  <AmountDisplay drops={String(ceil(f.principal))} token={token} />
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Accrued interest (pro rata)</span>
                  <AmountDisplay drops={String(ceil(f.accruedInterest))} token={token} />
                </div>
                {hasPenalty && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Prepayment penalty ({((onChain?.CloseInterestRate ?? 0) / 1000).toFixed(2)}%)
                    </span>
                    <AmountDisplay drops={String(ceil(f.prepaymentPenalty))} token={token} />
                  </div>
                )}
                {hasCloseFee && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Close payment fee</span>
                    <AmountDisplay drops={String(ceil(f.closePaymentFee))} token={token} />
                  </div>
                )}
                <div className="flex justify-between border-t pt-1.5 font-semibold">
                  <span>Total</span>
                  <AmountDisplay drops={getDisplayTotal()} token={token} />
                </div>
                {paymentsRemaining <= 1 && (
                  <p className="text-xs text-warning pt-1">
                    Only one payment remains — use &quot;Next installment&quot; instead; the ledger rejects tfLoanFullPayment on the final payment.
                  </p>
                )}
              </div>
            );
          })()}

          {mode === "custom" && (
            <div className="space-y-2">
              <Label htmlFor="custom-amount">Amount ({unit})</Label>
              <Input
                id="custom-amount"
                type="number"
                min="0.1"
                step="0.1"
                value={customAmount}
                onChange={(e) => setCustomAmount(e.target.value)}
                required
              />
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading || isDefaulted}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : isDefaulted ? (
              "Loan in default — cannot pay"
            ) : (
              `Pay ${formatVal(getDisplayTotal())} ${unit}`
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
