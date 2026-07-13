"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { ThemeToggle } from "@/components/theme-toggle";
import { WalletBadge } from "@/components/wallet-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  LogOut,
  Briefcase,
  PiggyBank,
  HandCoins,
  Landmark,
  ChevronDown,
  Wallet,
  RefreshCw,
  ArrowRightLeft,
  Loader2,
  Send,
  Trash2,
} from "lucide-react";
import { DROPS_PER_XRP } from "@/lib/constants";
import { APP_SHORT_NAME } from "@/lib/branding";

const roleConfig = {
  broker: {
    icon: Briefcase,
    label: "Broker",
    color: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  },
  depositor: {
    icon: PiggyBank,
    label: "Depositor",
    color: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  borrower: {
    icon: HandCoins,
    label: "Borrower",
    color: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
  issuer: {
    icon: Landmark,
    label: "Currency Issuer",
    color: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  },
};

const roles = ["broker", "depositor", "borrower", "issuer"] as const;

export function SessionHeader() {
  const { session, logout } = useSession();
  const [open, setOpen] = useState(false);
  const [balances, setBalances] = useState<
    Record<string, string> | null
  >(null);
  const [tokenBalances, setTokenBalances] = useState<
    Record<string, string> | null
  >(null);
  const [loadingBalances, setLoadingBalances] = useState(false);
  const [toppingUp, setToppingUp] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // Transfer state
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferFrom, setTransferFrom] = useState("broker");
  const [transferTo, setTransferTo] = useState("depositor");
  const [transferAmount, setTransferAmount] = useState("10");
  const [transferAsset, setTransferAsset] = useState<"XRP" | "TUSD">("XRP");
  const [transferring, setTransferring] = useState(false);
  const [transferResult, setTransferResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const hasToken = !!session?.issuedToken;

  const fetchBalances = useCallback(async () => {
    if (!session?._id) return;
    setLoadingBalances(true);
    try {
      const res = await fetch("/api/session/balances");
      if (res.ok) {
        const data = await res.json();
        const map: Record<string, string> = {};
        const tokenMap: Record<string, string> = {};
        for (const w of data.wallets) {
          map[w.role] = w.balance;
          if (w.tokenBalance) tokenMap[w.role] = w.tokenBalance;
        }
        setBalances(map);
        if (Object.keys(tokenMap).length > 0) setTokenBalances(tokenMap);
      }
    } finally {
      setLoadingBalances(false);
    }
  }, [session?._id]);

  useEffect(() => {
    if (open && !balances) {
      fetchBalances();
    }
  }, [open, balances, fetchBalances]);

  if (!session) return null;

  function formatXrp(drops: string) {
    return (parseInt(drops) / DROPS_PER_XRP).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  async function handleTransfer() {
    if (!session || transferFrom === transferTo) return;
    setTransferring(true);
    setTransferResult(null);
    try {
      const res = await fetch("/api/session/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from: transferFrom,
          to: transferTo,
          amount: transferAmount,
          asset: transferAsset,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setTransferResult({ ok: true, msg: `Sent ${transferAmount} ${transferAsset}` });
      fetchBalances();
    } catch (err) {
      setTransferResult({ ok: false, msg: err instanceof Error ? err.message : "Transfer failed" });
    } finally {
      setTransferring(false);
    }
  }

  async function handleReset() {
    if (
      !confirm(
        "This deletes your current wallets, vault, and loans, then creates fresh funded wallets. Continue?"
      )
    )
      return;
    setResetting(true);
    setResetError(null);
    try {
      const res = await fetch("/api/session/reset", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Reset failed");
      }
      // Full reload: the session provider re-provisions fresh wallets and every
      // dashboard starts clean (no stale vaultId/loanBrokerId).
      window.location.reload();
    } catch (err) {
      setResetError(err instanceof Error ? err.message : "Reset failed");
      setResetting(false);
    }
  }

  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-2.5">
        <h1 className="text-base font-semibold tracking-tight">
          {APP_SHORT_NAME}
        </h1>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
          Devnet
        </span>
      </div>

      <div className="flex items-center gap-2">
        {/* Accounts dropdown */}
        <div className="relative">
          <button
            onClick={() => setOpen(!open)}
            className="flex items-center gap-2 rounded-lg border bg-card px-3 py-1.5 text-sm transition-colors hover:bg-accent"
          >
            <Wallet className="h-3.5 w-3.5 text-muted-foreground" />
            <span className="text-xs font-medium">Accounts</span>
            <ChevronDown
              className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
            />
          </button>

          {open && (
            <>
              <div
                className="fixed inset-0 z-30"
                onClick={() => setOpen(false)}
              />
              <div className="absolute right-0 top-full z-40 mt-2 w-80 rounded-xl border bg-card p-2 shadow-lg max-h-[80vh] overflow-y-auto">
                <div className="flex items-center justify-between px-2 py-1.5 mb-1">
                  <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    Session wallets
                  </p>
                  <button
                    onClick={fetchBalances}
                    disabled={loadingBalances}
                    className="text-muted-foreground hover:text-foreground transition-colors"
                    title="Refresh balances"
                  >
                    <RefreshCw
                      className={`h-3 w-3 ${loadingBalances ? "animate-spin" : ""}`}
                    />
                  </button>
                </div>

                {session.wallets.map((w) => {
                  const config =
                    roleConfig[w.role as keyof typeof roleConfig];
                  if (!config) return null;
                  const Icon = config.icon;
                  const balance = balances?.[w.role];

                  return (
                    <div
                      key={w.role}
                      className="flex items-center gap-3 rounded-lg px-2 py-2.5 hover:bg-muted/50 transition-colors"
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${config.color}`}
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold">
                            {config.label}
                          </p>
                          <div className="text-right">
                            {loadingBalances && !balance ? (
                              <Skeleton className="h-4 w-16" />
                            ) : balance ? (
                              <p className="text-xs font-mono font-semibold">
                                {formatXrp(balance)}{" "}
                                <span className="text-muted-foreground font-normal">
                                  XRP
                                </span>
                              </p>
                            ) : (
                              <p className="text-[11px] text-muted-foreground">
                                —
                              </p>
                            )}
                            {tokenBalances?.[w.role] && (
                              <p className="text-[11px] font-mono text-muted-foreground">
                                {tokenBalances[w.role]} TUSD
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="mt-0.5">
                          <WalletBadge address={w.address} />
                        </div>
                      </div>
                    </div>
                  );
                })}

                <div className="border-t mt-1 pt-1 space-y-1">
                  {/* Transfer toggle */}
                  <button
                    onClick={() => {
                      setShowTransfer(!showTransfer);
                      setTransferResult(null);
                    }}
                    className="w-full flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                  >
                    <ArrowRightLeft className="h-3 w-3" />
                    Transfer between wallets
                  </button>

                  {/* Transfer form */}
                  {showTransfer && (
                    <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
                      {/* Asset selector */}
                      <div className="flex gap-1.5">
                        <button
                          onClick={() => setTransferAsset("XRP")}
                          className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                            transferAsset === "XRP"
                              ? "bg-primary/10 text-primary border border-primary/30"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          XRP
                        </button>
                        {hasToken && (
                          <button
                            onClick={() => setTransferAsset("TUSD")}
                            className={`flex-1 rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                              transferAsset === "TUSD"
                                ? "bg-primary/10 text-primary border border-primary/30"
                                : "text-muted-foreground hover:bg-muted"
                            }`}
                          >
                            TUSD
                          </button>
                        )}
                      </div>

                      {/* From / To */}
                      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
                        <select
                          value={transferFrom}
                          onChange={(e) => setTransferFrom(e.target.value)}
                          className="rounded-md border bg-background px-2 py-1.5 text-[11px] font-medium"
                        >
                          {roles.map((r) => (
                            <option key={r} value={r}>
                              {roleConfig[r].label}
                            </option>
                          ))}
                        </select>
                        <Send className="h-3 w-3 text-muted-foreground" />
                        <select
                          value={transferTo}
                          onChange={(e) => setTransferTo(e.target.value)}
                          className="rounded-md border bg-background px-2 py-1.5 text-[11px] font-medium"
                        >
                          {roles.map((r) => (
                            <option key={r} value={r}>
                              {roleConfig[r].label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Amount */}
                      <div className="flex gap-2">
                        <Input
                          type="number"
                          min="0.01"
                          step="0.01"
                          value={transferAmount}
                          onChange={(e) => setTransferAmount(e.target.value)}
                          className="h-8 text-xs"
                          placeholder={`Amount (${transferAsset})`}
                        />
                        <Button
                          size="sm"
                          className="h-8 px-3 text-xs shrink-0"
                          disabled={transferring || transferFrom === transferTo || !transferAmount}
                          onClick={handleTransfer}
                        >
                          {transferring ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            "Send"
                          )}
                        </Button>
                      </div>

                      {/* Result */}
                      {transferResult && (
                        <p className={`text-[11px] ${transferResult.ok ? "text-emerald-600" : "text-destructive"}`}>
                          {transferResult.msg}
                        </p>
                      )}
                    </div>
                  )}

                  {/* Top up */}
                  <button
                    onClick={async () => {
                      setToppingUp(true);
                      try {
                        const res = await fetch("/api/session/topup", { method: "POST" });
                        if (res.ok) {
                          const data = await res.json();
                          const map: Record<string, string> = {};
                          for (const w of data.wallets) {
                            map[w.role] = w.balance;
                          }
                          setBalances(map);
                        }
                      } finally {
                        setToppingUp(false);
                      }
                    }}
                    disabled={toppingUp}
                    className="w-full flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-primary hover:bg-primary/5 transition-colors disabled:opacity-50"
                  >
                    {toppingUp ? (
                      <>
                        <RefreshCw className="h-3 w-3 animate-spin" />
                        Funding via faucet...
                      </>
                    ) : (
                      <>
                        <Wallet className="h-3 w-3" />
                        Top up all wallets
                      </>
                    )}
                  </button>
                  {/* Reset session */}
                  <button
                    onClick={handleReset}
                    disabled={resetting}
                    className="w-full flex items-center justify-center gap-2 rounded-lg px-2 py-2 text-xs font-medium text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-50"
                  >
                    {resetting ? (
                      <>
                        <Loader2 className="h-3 w-3 animate-spin" />
                        Resetting...
                      </>
                    ) : (
                      <>
                        <Trash2 className="h-3 w-3" />
                        Reset session — fresh wallets
                      </>
                    )}
                  </button>
                  {resetError && (
                    <p className="px-2 text-[11px] text-destructive">{resetError}</p>
                  )}

                  <div className="flex items-center gap-2 px-2 py-1 text-[11px] text-muted-foreground">
                    <span className="truncate">{session.email}</span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <ThemeToggle />
        <Button
          variant="ghost"
          size="icon"
          onClick={logout}
          className="text-muted-foreground h-8 w-8"
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
