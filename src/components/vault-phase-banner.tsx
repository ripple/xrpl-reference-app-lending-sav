"use client";

import { Clock } from "lucide-react";
import { useRippleNow } from "@/hooks/use-ripple-now";
import { LOAN_REDEMPTION_BUFFER_SECONDS } from "@/lib/constants";
import {
  formatDuration,
  getVaultPhase,
  isClosedEnded,
  rippleToDate,
  VAULT_PHASE_LABEL,
  type VaultSchedule,
} from "@/lib/vault-phase";

/**
 * Explains where a closed-ended vault is in its lifecycle and what that
 * allows right now. Renders nothing for open-ended vaults.
 */
export function VaultPhaseBanner({ vault }: { vault: VaultSchedule | null | undefined }) {
  const now = useRippleNow();
  if (!isClosedEnded(vault)) return null;

  const phase = getVaultPhase(vault, now);
  const fmt = (s: number) => rippleToDate(s).toLocaleString();

  let detail: string;
  if (phase === "subscription") {
    detail = `Deposits and withdrawals are open. Loans can be issued once the subscription window closes in ${formatDuration(
      vault.SubscriptionDate - now
    )} (${fmt(vault.SubscriptionDate)}).`;
  } else if (phase === "investment") {
    detail = `Funds are locked: no deposits or withdrawals until redemption in ${formatDuration(
      vault.RedemptionDate - now
    )} (${fmt(vault.RedemptionDate)}). Loans must fully repay at least ${LOAN_REDEMPTION_BUFFER_SECONDS} s before that date.`;
  } else {
    detail = `The vault is winding down since ${fmt(
      vault.RedemptionDate
    )}. Depositors can redeem their shares; no new loans can be issued.`;
  }

  return (
    <div className="flex gap-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-sm">
      <Clock className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <div className="space-y-0.5">
        <p className="font-medium">
          Closed-ended vault · {VAULT_PHASE_LABEL[phase]} phase
        </p>
        <p className="text-xs text-muted-foreground leading-relaxed">{detail}</p>
      </div>
    </div>
  );
}
