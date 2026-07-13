import { Separator } from "@/components/ui/separator";
import { AmountDisplay } from "@/components/amount-display";
import { DROPS_PER_XRP } from "@/lib/constants";
import { amortize } from "@/lib/loan-math";

interface FeeBreakdownProps {
  /** Drops for XRP, human units for tokens. */
  principalRequested: string;
  /** Basis points (e.g. 500 = 5%). */
  interestRate: number;
  paymentTotal: number;
  /** Seconds between payments. */
  paymentInterval: number;
  /** Drops for XRP, human units for tokens. */
  originationFee: string;
  /** Per-installment service fee in drops/units. */
  serviceFee: string;
  token?: string;
}

export function FeeBreakdown({
  principalRequested,
  interestRate,
  paymentTotal,
  paymentInterval,
  originationFee,
  serviceFee,
  token,
}: FeeBreakdownProps) {
  const unit = token || "XRP";
  const parse = token ? parseFloat : parseInt;
  const principal = parse(principalRequested);

  // Mirror the ledger's XLS-66 amortization so the preview matches on-chain values.
  const { periodicPayment, totalOutstanding, totalInterest } = amortize({
    principal,
    interestRateBps: interestRate,
    paymentTotal,
    paymentInterval,
  });
  const totalServiceFees = parse(serviceFee) * paymentTotal;
  const totalToRepay = totalOutstanding + totalServiceFees;

  const formatAmount = (value: number) =>
    token ? value.toFixed(2) : (value / DROPS_PER_XRP).toFixed(2);

  // Rates are annualized: over a very short payment interval the accrued
  // interest rounds to ~0. Flag it so a 0.00 interest line doesn't look broken.
  const shownInterest = token ? totalInterest : totalInterest / DROPS_PER_XRP;
  const interestNegligible = interestRate > 0 && shownInterest < 0.005;

  return (
    <div className="rounded-lg bg-muted/50 p-4 space-y-2 text-sm">
      <Row label="Principal">
        <AmountDisplay drops={principalRequested} token={token} />
      </Row>
      <Row label={`Interest (${(interestRate / 100).toFixed(1)}%)`}>
        <AmountDisplay drops={Math.round(totalInterest).toString()} token={token} />
      </Row>
      {interestNegligible && (
        <p className="text-[11px] text-muted-foreground">
          Interest is negligible at this payment interval — rates are annualized,
          so use a longer interval to see a meaningful amount.
        </p>
      )}
      <Row label={`Service fees (${paymentTotal}×)`}>
        <AmountDisplay drops={Math.round(totalServiceFees).toString()} token={token} />
      </Row>
      <Separator />
      <Row label="Total to repay" className="font-medium text-foreground">
        <AmountDisplay drops={Math.round(totalToRepay).toString()} token={token} />
      </Row>
      <Row label="Est. per payment" className="text-muted-foreground">
        <span className="font-mono">
          ~{formatAmount(periodicPayment)} {unit}
        </span>
      </Row>
      {parse(originationFee) > 0 && (
        <>
          <Separator />
          <Row label="Origination fee (deducted from principal)" className="text-muted-foreground text-xs">
            <AmountDisplay drops={originationFee} token={token} />
          </Row>
          <Row label="Borrower receives" className="text-muted-foreground text-xs">
            <AmountDisplay drops={(principal - parse(originationFee)).toString()} token={token} />
          </Row>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex items-center justify-between text-muted-foreground ${className || ""}`}>
      <span>{label}</span>
      {children}
    </div>
  );
}
