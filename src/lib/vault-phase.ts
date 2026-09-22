/**
 * Closed-ended vault phase helpers (XLS-65 + LendingProtocolV1_1). Pure and
 * client-safe: shared by API routes (gating with a friendly 400 instead of a
 * bare tec code) and by the dashboards (disable controls, show countdowns).
 *
 * Phase boundaries follow the ledger: Investment starts once the validated
 * close time passes SubscriptionDate, Redemption once it reaches
 * RedemptionDate. Clients pass their wall clock in Ripple seconds; the ledger
 * stays authoritative and rejects anything borderline.
 */
import {
  LOAN_REDEMPTION_BUFFER_SECONDS,
  LOAN_TERM_DRIFT_MARGIN_SECONDS,
  RIPPLE_EPOCH_OFFSET,
  SECONDS_PER_DAY,
  VAULT_KIND_CLOSED_ENDED,
} from "./constants";

export type VaultPhase = "open-ended" | "subscription" | "investment" | "redemption";

/** Subset of a `Vault` ledger entry / `vault_info` node that drives the phase. */
export interface VaultSchedule {
  VaultKind?: number;
  SubscriptionDate?: number;
  RedemptionDate?: number;
}

export function isClosedEnded(v: VaultSchedule | null | undefined): v is Required<VaultSchedule> {
  return (
    v?.VaultKind === VAULT_KIND_CLOSED_ENDED &&
    typeof v.SubscriptionDate === "number" &&
    typeof v.RedemptionDate === "number"
  );
}

export function getVaultPhase(v: VaultSchedule | null | undefined, nowRipple: number): VaultPhase {
  if (!isClosedEnded(v)) return "open-ended";
  // Spec: Subscription while now <= SubscriptionDate, Investment while
  // SubscriptionDate < now < RedemptionDate, Redemption from RedemptionDate.
  if (nowRipple <= v.SubscriptionDate) return "subscription";
  if (nowRipple < v.RedemptionDate) return "investment";
  return "redemption";
}

export const VAULT_PHASE_LABEL: Record<VaultPhase, string> = {
  "open-ended": "Open-ended",
  subscription: "Subscription",
  investment: "Investment",
  redemption: "Redemption",
};

/** VaultDeposit: open-ended any time; closed-ended only while subscribing. */
export function canDeposit(phase: VaultPhase): boolean {
  return phase === "open-ended" || phase === "subscription";
}

/** VaultWithdraw: blocked only during the investment lockup. */
export function canWithdraw(phase: VaultPhase): boolean {
  return phase !== "investment";
}

/**
 * Longest loan term (PaymentTotal × PaymentInterval, seconds) the ledger will
 * accept right now, or null when the vault imposes no bound. rippled checks
 * `StartDate + term + buffer <= RedemptionDate` with StartDate = the close
 * time of the ledger the tx lands in, which is a few seconds after any "now"
 * we can observe, so a small drift margin keeps the advertised max honest.
 */
export function maxLoanTermSeconds(
  v: VaultSchedule | null | undefined,
  nowRipple: number
): number | null {
  if (!isClosedEnded(v)) return null;
  return Math.max(
    0,
    v.RedemptionDate - LOAN_REDEMPTION_BUFFER_SECONDS - LOAN_TERM_DRIFT_MARGIN_SECONDS - nowRipple
  );
}

/**
 * Why a LoanSet against this vault would fail right now, as a user-facing
 * sentence, or null when it is admissible. Single source for the API route
 * (400 body) and the Issue Loan form (warning), so the rules can't drift.
 */
export function loanIssuanceBlocker(
  v: VaultSchedule | null | undefined,
  nowRipple: number,
  termSeconds: number
): string | null {
  if (!isClosedEnded(v)) return null;
  const phase = getVaultPhase(v, nowRipple);
  if (phase === "subscription") {
    return `Loans can only be issued once the vault's subscription window closes (${rippleToDate(
      v.SubscriptionDate
    ).toLocaleString()}, in ${formatDuration(v.SubscriptionDate - nowRipple)}).`;
  }
  if (phase === "redemption") {
    return "The vault has entered its redemption phase; no new loans can be issued.";
  }
  const maxTerm = maxLoanTermSeconds(v, nowRipple) ?? Infinity;
  if (termSeconds > maxTerm) {
    return `Loan term (${formatDuration(termSeconds)}) must end at least ${LOAN_REDEMPTION_BUFFER_SECONDS} s before the vault's redemption date. Maximum term right now: ${formatDuration(
      maxTerm
    )}. Reduce the number of payments or the payment interval.`;
  }
  return null;
}

export function rippleToDate(rippleSeconds: number): Date {
  return new Date((rippleSeconds + RIPPLE_EPOCH_OFFSET) * 1000);
}

/** "3d 4h", "12m 05s", … for countdowns and error messages. */
export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const d = Math.floor(s / SECONDS_PER_DAY);
  const h = Math.floor((s % SECONDS_PER_DAY) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return h > 0 ? `${d}d ${h}h` : `${d}d`;
  if (h > 0) return m > 0 ? `${h}h ${m}m` : `${h}h`;
  if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
  return `${sec}s`;
}

export type DurationUnit = "minutes" | "hours" | "days";
const DURATION_UNIT_SECONDS: Record<DurationUnit, number> = {
  minutes: 60,
  hours: 3600,
  days: SECONDS_PER_DAY,
};

export function durationToSeconds(value: string, unit: DurationUnit): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.round(n * DURATION_UNIT_SECONDS[unit]);
}
