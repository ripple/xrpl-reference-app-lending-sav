"use client";

import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useRippleNow } from "@/hooks/use-ripple-now";
import { useSession } from "@/hooks/use-session";
import { cn } from "@/lib/utils";
import {
  formatDuration,
  getVaultPhase,
  isClosedEnded,
  rippleToDate,
  type VaultPhase,
  type VaultSchedule,
} from "@/lib/vault-phase";

/** Pill marking UI that exists because of LendingProtocolV1_1 closed-ended vaults. */
export function ClosedEndedBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-primary/40 text-primary", className)}>
      Lending V1.1 · Closed-ended vaults
    </Badge>
  );
}

const PHASES: { key: Exclude<VaultPhase, "open-ended">; label: string; allows: string }[] = [
  { key: "subscription", label: "Subscription", allows: "Deposits and withdrawals open · no loans yet" },
  { key: "investment", label: "Investment", allows: "Loans open · deposits and withdrawals locked" },
  { key: "redemption", label: "Redemption", allows: "Withdrawals open · no new loans" },
];

/**
 * App-wide strip under the header: which lifecycle phase the session's vault
 * is in, what that allows, and a live countdown to the next transition.
 * Renders nothing without a closed-ended vault.
 */
export function VaultLifecycleBar() {
  const { session } = useSession();
  const vaultId = session?.vaultId;
  const [schedule, setSchedule] = useState<VaultSchedule | null>(null);
  const now = useRippleNow(1000);

  useEffect(() => {
    if (!vaultId) {
      setSchedule(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/vault/${vaultId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled) setSchedule(d?.onLedger?.vault ?? null);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [vaultId]);

  if (!isClosedEnded(schedule)) return null;

  const phase = getVaultPhase(schedule, now);
  const currentIndex = PHASES.findIndex((p) => p.key === phase);
  const fmt = (s: number) => rippleToDate(s).toLocaleString();

  let countdown: string;
  if (phase === "subscription") {
    countdown = `Investment starts in ${formatDuration(schedule.SubscriptionDate - now)}`;
  } else if (phase === "investment") {
    countdown = `Redemption opens in ${formatDuration(schedule.RedemptionDate - now)}`;
  } else {
    countdown = `Redemption open since ${fmt(schedule.RedemptionDate)}`;
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <ClosedEndedBadge />
        <div className="flex items-center gap-1">
          {PHASES.map((p, i) => (
            <div key={p.key} className="flex items-center gap-1">
              <span
                className={cn(
                  "rounded-md px-2 py-0.5 font-medium transition-colors",
                  i === currentIndex && "bg-primary text-primary-foreground",
                  i < currentIndex && "bg-primary/20 text-primary line-through decoration-primary/40",
                  i > currentIndex && "bg-muted text-muted-foreground"
                )}
                title={
                  p.key === "subscription"
                    ? `Closes ${fmt(schedule.SubscriptionDate)}`
                    : p.key === "investment"
                      ? `${fmt(schedule.SubscriptionDate)} → ${fmt(schedule.RedemptionDate)}`
                      : `From ${fmt(schedule.RedemptionDate)}`
                }
              >
                {p.label}
              </span>
              {i < PHASES.length - 1 && <span className="h-px w-3 bg-border" />}
            </div>
          ))}
        </div>
        <span className="text-muted-foreground">{PHASES[currentIndex].allows}</span>
      </div>
      <div className="flex items-center gap-1.5 font-mono font-medium text-primary tabular-nums">
        <Clock className="h-3.5 w-3.5" />
        {countdown}
      </div>
    </div>
  );
}
