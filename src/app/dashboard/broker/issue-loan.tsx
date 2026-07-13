"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { FeeBreakdown } from "@/components/fee-breakdown";
import { Loader2, AlertTriangle, Info, ChevronDown } from "lucide-react";
import {
  DROPS_PER_XRP,
  DEFAULT_INTEREST_RATE_BPS,
  DEFAULT_PAYMENT_TOTAL,
  DEFAULT_PAYMENT_INTERVAL,
  DEFAULT_GRACE_PERIOD,
  DEFAULT_ORIGINATION_FEE_DROPS,
  DEFAULT_SERVICE_FEE_DROPS,
  SECONDS_PER_YEAR,
} from "@/lib/constants";
import { issueLoan } from "./actions";

import type { IssuedToken } from "@/types/session";

interface IssueLoanProps {
  vaultAssetTotal?: string;
  vaultAssetsMaximum?: string;
  brokerDebtMaximum?: string;
  brokerDebtTotal?: string;
  brokerCoverAvailable?: string;
  brokerCoverRateMinimum?: string;
  issuedToken?: IssuedToken;
  onCreated: (txHash?: string) => void;
  onError: (message: string) => void;
  onPending: (message: string) => void;
}

function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip>
      <TooltipTrigger className="cursor-help">
        <Info className="h-3.5 w-3.5 text-muted-foreground" />
      </TooltipTrigger>
      <TooltipContent side="top" className="max-w-xs text-xs font-normal">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}

export function IssueLoan({
  vaultAssetTotal,
  vaultAssetsMaximum,
  brokerDebtMaximum,
  brokerDebtTotal,
  brokerCoverAvailable,
  brokerCoverRateMinimum,
  issuedToken,
  onCreated,
  onError,
  onPending,
}: IssueLoanProps) {
  const isToken = !!issuedToken;
  const unit = isToken ? "TUSD" : "XRP";
  const [loading, setLoading] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Core terms
  const [principalXrp, setPrincipalXrp] = useState("20");
  const [interestRate, setInterestRate] = useState(DEFAULT_INTEREST_RATE_BPS);
  const [paymentTotal, setPaymentTotal] = useState(DEFAULT_PAYMENT_TOTAL);
  const [paymentInterval, setPaymentInterval] = useState(DEFAULT_PAYMENT_INTERVAL);
  const [gracePeriod, setGracePeriod] = useState(DEFAULT_GRACE_PERIOD);
  const [originationFee, setOriginationFee] = useState(
    (parseInt(DEFAULT_ORIGINATION_FEE_DROPS) / DROPS_PER_XRP).toString()
  );
  const [serviceFee, setServiceFee] = useState(
    (parseInt(DEFAULT_SERVICE_FEE_DROPS) / DROPS_PER_XRP).toString()
  );

  // Soft pre-check for XLS-66 §3.8.5 #20 (insufficient first-loss capital).
  // The ledger is authoritative (see the surfaced error on submit); this only
  // warns early. InterestDue is approximated, so we never hard-block on the
  // estimate — only on the unambiguous "cover set but zero" case.
  const coverRateMin = Number(brokerCoverRateMinimum ?? 0); // 1/10 bps
  const coverAvailable = isToken
    ? Number(brokerCoverAvailable ?? 0)
    : Number(brokerCoverAvailable ?? 0) / DROPS_PER_XRP;
  const coverPrincipalNum = Number(principalXrp) || 0;
  const debtTotalNum = isToken
    ? Number(brokerDebtTotal ?? 0)
    : Number(brokerDebtTotal ?? 0) / DROPS_PER_XRP;
  const estInterest =
    coverPrincipalNum *
    (interestRate / 10000) *
    ((paymentTotal * paymentInterval) / SECONDS_PER_YEAR);
  const requiredCover =
    ((debtTotalNum + coverPrincipalNum + estInterest) * coverRateMin) / 100000;
  const coverShortfall = coverRateMin > 0 && coverAvailable < requiredCover;
  const coverIsZero =
    coverRateMin > 0 && coverAvailable === 0 && coverPrincipalNum > 0;

  // Advanced - fees
  const [latePaymentFee, setLatePaymentFee] = useState("");
  const [closePaymentFee, setClosePaymentFee] = useState("");
  const [overpaymentFee, setOverpaymentFee] = useState("");

  // Advanced - rates
  const [lateInterestRate, setLateInterestRate] = useState("");
  const [closeInterestRate, setCloseInterestRate] = useState("");
  const [overpaymentInterestRate, setOverpaymentInterestRate] = useState("");

  // Metadata
  const [loanName, setLoanName] = useState("");

  // Overpayment enablement — sets tfLoanOverpayment on LoanSet so the borrower
  // can later submit LoanPay with tfLoanOverpayment.
  const [allowOverpayment, setAllowOverpayment] = useState(false);

  const principalDrops = isToken
    ? String(parseFloat(principalXrp || "0"))
    : String(Math.round(parseFloat(principalXrp || "0") * DROPS_PER_XRP));
  const originationFeeDrops = isToken
    ? String(parseFloat(originationFee || "0"))
    : String(Math.round(parseFloat(originationFee || "0") * DROPS_PER_XRP));
  const serviceFeeDrops = isToken
    ? String(parseFloat(serviceFee || "0"))
    : String(Math.round(parseFloat(serviceFee || "0") * DROPS_PER_XRP));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    onPending("Issuing loan (multi-sign: broker + borrower)...");

    try {
      const { txHash } = await issueLoan({
        isToken,
        principal: principalXrp,
        interestRate,
        paymentTotal,
        paymentInterval,
        gracePeriod,
        originationFee,
        serviceFee,
        latePaymentFee,
        closePaymentFee,
        overpaymentFee,
        lateInterestRate,
        closeInterestRate,
        overpaymentInterestRate,
        loanName,
        allowOverpayment,
      });
      onCreated(txHash);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to issue loan");
    } finally {
      setLoading(false);
    }
  }

  // Pre-checks — compare in the same units
  // For XRP: principalDrops is in drops, on-chain values are in drops
  // For tokens: principalDrops is in native units, on-chain values are in native units
  const warnings: string[] = [];
  const principalNum = parseFloat(principalDrops);

  if (vaultAssetTotal !== undefined && principalNum > parseFloat(vaultAssetTotal || "0")) {
    const vaultDisplay = isToken
      ? parseFloat(vaultAssetTotal || "0").toFixed(2)
      : (parseInt(vaultAssetTotal || "0") / DROPS_PER_XRP).toFixed(2);
    warnings.push(
      `Insufficient vault liquidity: need ${parseFloat(principalXrp)} ${unit} but vault has ${vaultDisplay} ${unit} available. Deposit more via the Depositor tab.`
    );
  }

  if (vaultAssetsMaximum && vaultAssetsMaximum !== "0") {
    const cap = parseFloat(vaultAssetsMaximum);
    if (principalNum > cap) {
      const capDisplay = isToken ? cap.toLocaleString() : (cap / DROPS_PER_XRP).toLocaleString();
      warnings.push(
        `Vault deposit cap is ${capDisplay} ${unit}. The principal exceeds this limit.`
      );
    }
  }

  if (brokerDebtMaximum && Number(brokerDebtMaximum) > 0) {
    const maxDebt = Number(brokerDebtMaximum);
    const currentDebt = Number(brokerDebtTotal || "0");
    if (currentDebt + principalNum > maxDebt) {
      const maxDebtDisplay = isToken ? maxDebt.toLocaleString() : (maxDebt / DROPS_PER_XRP).toLocaleString();
      const currentDebtDisplay = isToken ? currentDebt.toFixed(2) : (currentDebt / DROPS_PER_XRP).toFixed(2);
      warnings.push(
        `Broker max debt is ${maxDebtDisplay} ${unit}. Current debt: ${currentDebtDisplay} ${unit}. This loan would exceed the limit.`
      );
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Issue a Loan</CardTitle>
        <CardDescription>
          Configure loan terms for the borrower wallet in this session.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Loan name */}
          <div className="space-y-2">
            <div className="flex items-center gap-1.5">
              <Label htmlFor="loan-name">Loan name</Label>
              <InfoTip text="Optional label stored on-chain as metadata. Helps identify the loan (max 64 chars)." />
            </div>
            <Input
              id="loan-name"
              placeholder="e.g. Working capital Q2"
              value={loanName}
              onChange={(e) => setLoanName(e.target.value)}
              maxLength={64}
            />
          </div>

          {/* Core terms */}
          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="principal">Principal ({unit})</Label>
                  <InfoTip text="The loan amount requested by the borrower. Must not exceed vault liquidity." />
                </div>
                <Input
                  id="principal"
                  type="number"
                  min="1"
                  step="1"
                  value={principalXrp}
                  onChange={(e) => setPrincipalXrp(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="payments">Number of payments</Label>
                  <InfoTip text="Total installments the borrower must make to repay the loan." />
                </div>
                <Input
                  id="payments"
                  type="number"
                  min="1"
                  max="120"
                  value={paymentTotal}
                  onChange={(e) =>
                    setPaymentTotal(parseInt(e.target.value) || 1)
                  }
                  required
                />
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Label>Interest rate</Label>
                  <InfoTip text="Annualized interest rate charged on the outstanding principal." />
                </div>
                <span className="text-sm font-mono font-medium">
                  {(interestRate / 100).toFixed(1)}%
                </span>
              </div>
              <Slider
                value={[interestRate]}
                onValueChange={(v) =>
                  setInterestRate(Array.isArray(v) ? v[0] : v)
                }
                min={100}
                max={5000}
                step={50}
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>1%</span>
                <span>50%</span>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="interval">Payment interval</Label>
                  <InfoTip text="Time between payments in seconds. 2592000 = 30 days, 604800 = 7 days." />
                </div>
                <Input
                  id="interval"
                  type="number"
                  min="60"
                  value={paymentInterval}
                  onChange={(e) =>
                    setPaymentInterval(parseInt(e.target.value) || DEFAULT_PAYMENT_INTERVAL)
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  {Math.round(paymentInterval / 86400)} days
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="grace">Grace period</Label>
                  <InfoTip text="Seconds after a missed payment before the loan can be defaulted by the broker." />
                </div>
                <Input
                  id="grace"
                  type="number"
                  min="60"
                  value={gracePeriod}
                  onChange={(e) =>
                    setGracePeriod(parseInt(e.target.value) || 0)
                  }
                />
                <p className="text-[11px] text-muted-foreground">
                  {Math.round(gracePeriod / 86400)} days
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="orig-fee">Origination fee ({unit})</Label>
                  <InfoTip text="One-time fee paid to the broker when the loan is created. Deducted from the principal." />
                </div>
                <Input
                  id="orig-fee"
                  type="number"
                  min="0"
                  step="0.1"
                  value={originationFee}
                  onChange={(e) => setOriginationFee(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="svc-fee">Service fee ({unit})</Label>
                  <InfoTip text="Fee paid to the broker on each payment the borrower makes. It is not charged for installments skipped by an early full repayment (a separate close payment fee applies then)." />
                </div>
                <Input
                  id="svc-fee"
                  type="number"
                  min="0"
                  step="0.1"
                  value={serviceFee}
                  onChange={(e) => setServiceFee(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Advanced toggle */}
          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ChevronDown
              className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`}
            />
            Advanced options
          </button>

          {showAdvanced && (
            <div className="space-y-4 rounded-lg border bg-muted/30 p-4">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Penalty Fees
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="late-fee" className="text-xs">Late payment fee ({unit})</Label>
                    <InfoTip text="Fixed fee added on top of any payment made after its due date. (The grace period only governs when the broker may default the loan, not a deadline for paying late.)" />
                  </div>
                  <Input
                    id="late-fee"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0"
                    value={latePaymentFee}
                    onChange={(e) => setLatePaymentFee(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="close-fee" className="text-xs">Early close fee ({unit})</Label>
                    <InfoTip text="Fee charged when the borrower repays the entire loan before all installments are due." />
                  </div>
                  <Input
                    id="close-fee"
                    type="number"
                    min="0"
                    step="0.1"
                    placeholder="0"
                    value={closePaymentFee}
                    onChange={(e) => setClosePaymentFee(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="over-fee" className="text-xs">Overpayment fee (%)</Label>
                    <InfoTip text="Percentage charged on any amount paid above the scheduled installment. 0-100%." />
                  </div>
                  <Input
                    id="over-fee"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0"
                    value={overpaymentFee}
                    onChange={(e) => setOverpaymentFee(e.target.value)}
                  />
                </div>
              </div>

              <Separator />

              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
                Penalty Interest Rates
              </p>
              <div className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="late-rate" className="text-xs">Late interest (%)</Label>
                    <InfoTip text="Additional interest rate applied on top of the base rate for late payments." />
                  </div>
                  <Input
                    id="late-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0"
                    value={lateInterestRate}
                    onChange={(e) => setLateInterestRate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="close-rate" className="text-xs">Early close interest (%)</Label>
                    <InfoTip text="Interest rate charged as compensation when the borrower closes the loan early." />
                  </div>
                  <Input
                    id="close-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0"
                    value={closeInterestRate}
                    onChange={(e) => setCloseInterestRate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5">
                    <Label htmlFor="over-rate" className="text-xs">Overpayment interest (%)</Label>
                    <InfoTip text="Interest rate charged on overpayment amounts above the scheduled installment." />
                  </div>
                  <Input
                    id="over-rate"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    placeholder="0"
                    value={overpaymentInterestRate}
                    onChange={(e) => setOverpaymentInterestRate(e.target.value)}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              id="allow-overpayment"
              type="checkbox"
              checked={allowOverpayment}
              onChange={(e) => setAllowOverpayment(e.target.checked)}
              className="h-4 w-4 rounded border-input"
            />
            <Label htmlFor="allow-overpayment" className="text-sm font-normal cursor-pointer flex items-center gap-1.5">
              Allow overpayment
              <InfoTip text="Sets tfLoanOverpayment on LoanSet. Required for the borrower to pay extra principal in a single LoanPay with tfLoanOverpayment — otherwise extra funds just fund sequential installments." />
            </Label>
          </div>

          <Separator />

          <FeeBreakdown
            principalRequested={principalDrops}
            interestRate={interestRate}
            paymentTotal={paymentTotal}
            paymentInterval={paymentInterval}
            originationFee={originationFeeDrops}
            serviceFee={serviceFeeDrops}
            token={isToken ? "TUSD" : undefined}
          />

          {warnings.length > 0 && (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/50 bg-warning/5 px-3 py-2.5 text-sm text-warning-foreground">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
              <div className="space-y-1">
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs">{w}</p>
                ))}
              </div>
            </div>
          )}

          {coverShortfall && (
            <div className="flex items-start gap-2.5 rounded-lg border border-warning/50 bg-warning/5 px-3 py-2.5 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-warning" />
              <div className="text-xs text-muted-foreground">
                <p className="font-medium text-warning-foreground">
                  First-loss capital may be insufficient
                </p>
                <p className="mt-0.5">
                  This loan needs about {requiredCover.toFixed(2)} {unit} of cover; the
                  broker has {coverAvailable.toFixed(2)} {unit}. Deposit more first-loss
                  capital below, or the ledger will reject the loan.
                </p>
              </div>
            </div>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={loading || warnings.length > 0 || coverIsZero}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Issuing loan...
              </>
            ) : (
              "Issue Loan"
            )}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
