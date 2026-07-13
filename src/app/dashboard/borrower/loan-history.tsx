import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AmountDisplay } from "@/components/amount-display";
import { LoanStatusBadge } from "@/components/loan-status-badge";
import { ExternalLink } from "lucide-react";
import { explorerVaultUrl } from "@/lib/explorer";
import type { LoanState } from "@/types/loan";

export function LoanHistory({
  loans,
  token,
  vaultId,
}: {
  loans: LoanState[];
  token?: string;
  vaultId: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Loan History</CardTitle>
        <CardDescription>
          {loans.length} loan{loans.length !== 1 ? "s" : ""}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {loans.map((loan) => (
            <div
              key={loan.loanId}
              className="flex items-center justify-between rounded-lg border px-4 py-3"
            >
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <AmountDisplay
                    drops={loan.principalRequested}
                    className="text-sm font-medium"
                    token={token}
                  />
                  <LoanStatusBadge status={loan.status} />
                  <a
                    href={explorerVaultUrl(vaultId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground hover:text-primary transition-colors"
                    title="View on XRPL Explorer"
                  >
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
                <p className="text-xs text-muted-foreground">
                  {loan.paymentsRemaining}/{loan.paymentTotal} remaining
                  &middot; {(loan.interestRate / 100).toFixed(1)}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
