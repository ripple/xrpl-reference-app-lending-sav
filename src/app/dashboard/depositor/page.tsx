"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/hooks/use-session";
import { DepositForm } from "./deposit-form";
import { WithdrawForm } from "./withdraw-form";
import { DepositHistory } from "./history";
import { TransactionStatus } from "@/components/transaction-status";
import { AmountDisplay } from "@/components/amount-display";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { motion, AnimatePresence } from "motion/react";
import {
  ArrowRight,
  Vault,
  ExternalLink,
  RefreshCw,
  Coins,
  TrendingUp,
} from "lucide-react";
import { explorerVaultUrl } from "@/lib/explorer";
import { DROPS_PER_XRP } from "@/lib/constants";
import { MPTokenIssuanceCreateFlags } from "xrpl";

interface VaultOnChain {
  vault?: {
    Owner: string;
    AssetsTotal?: string;
    AssetsAvailable?: string;
    AssetsMaximum?: string;
    Data?: string;
    ShareMPTID?: string;
    shares?: {
      OutstandingAmount?: string;
      AssetScale?: number;
      Flags?: number;
      MPTokenMetadata?: string;
    };
    Flags: number;
    WithdrawalPolicy?: number;
    Asset?: Record<string, string>;
  };
}

export default function DepositorPage() {
  const { session } = useSession();
  const [status, setStatus] = useState<{
    type: "success" | "error" | "pending";
    message: string;
    txHash?: string;
  } | null>(null);
  const [vaultData, setVaultData] = useState<VaultOnChain | null>(null);
  const [loadingVault, setLoadingVault] = useState(false);

  const vaultId = session?.vaultId;

  const fetchVault = useCallback(async () => {
    if (!vaultId) return;
    setLoadingVault(true);
    try {
      const res = await fetch(`/api/vault/${vaultId}`);
      if (res.ok) {
        const data = await res.json();
        setVaultData(data.onLedger);
      }
    } finally {
      setLoadingVault(false);
    }
  }, [vaultId]);

  useEffect(() => {
    fetchVault();
  }, [fetchVault]);

  if (!session) return null;

  if (!vaultId) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="border-dashed">
          <CardHeader className="text-center py-16">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
              <Vault className="h-7 w-7" />
            </div>
            <CardTitle className="text-xl">No Vault Available</CardTitle>
            <CardDescription className="flex items-center justify-center gap-1 mt-2 text-sm">
              Switch to the{" "}
              <span className="font-medium text-foreground">Loan Broker</span>{" "}
              tab
              <ArrowRight className="h-3 w-3" />
              create a vault first before depositing.
            </CardDescription>
          </CardHeader>
        </Card>
      </motion.div>
    );
  }

  const vault = vaultData?.vault;

  // Detect asset type from on-chain data or session
  const vaultAsset = vault?.Asset;
  const isToken = !!(
    session?.issuedToken ||
    (vaultAsset && (vaultAsset.issuer || vaultAsset.mpt_issuance_id))
  );
  const tokenLabel = isToken ? "TUSD" : undefined;

  // Parse vault metadata
  let vaultMeta: { n?: string; w?: string } | null = null;
  if (vault?.Data) {
    try {
      vaultMeta = JSON.parse(Buffer.from(vault.Data, "hex").toString("utf8"));
    } catch { /* invalid */ }
  }

  // Parse share MPT metadata
  let shareMeta: { ticker?: string; name?: string; t?: string; n?: string } | null = null;
  if (vault?.shares?.MPTokenMetadata) {
    try {
      shareMeta = JSON.parse(Buffer.from(vault.shares.MPTokenMetadata, "hex").toString("utf8"));
    } catch { /* invalid */ }
  }

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Depositor</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Provide liquidity to the vault and earn yield from loan interest.
        </p>
      </div>

      <AnimatePresence mode="wait">
        {status && (
          <motion.div
            key="status"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
          >
            <TransactionStatus status={status.type} message={status.message} txHash={status.txHash} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Vault overview */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Vault className="h-4 w-4 text-primary" />
                {vaultMeta?.n || "Active Vault"}
              </CardTitle>
              <div className="flex items-center gap-2">
                <a
                  href={explorerVaultUrl(vaultId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
                >
                  Explorer
                  <ExternalLink className="h-3 w-3" />
                </a>
                <button
                  onClick={fetchVault}
                  disabled={loadingVault}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RefreshCw
                    className={`h-3.5 w-3.5 ${loadingVault ? "animate-spin" : ""}`}
                  />
                </button>
              </div>
            </div>
            <CardDescription className="font-mono text-xs break-all">
              {vaultId}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Coins className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Total Assets</span>
                </div>
                {vault?.AssetsTotal ? (
                  <AmountDisplay drops={vault.AssetsTotal} className="text-sm font-semibold" token={tokenLabel} />
                ) : (
                  <span className="text-sm font-semibold">0.00 {tokenLabel || "XRP"}</span>
                )}
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Coins className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Available</span>
                </div>
                {vault?.AssetsAvailable ? (
                  <AmountDisplay drops={vault.AssetsAvailable} className="text-sm font-semibold" token={tokenLabel} />
                ) : (
                  <span className="text-sm font-semibold">0.00 {tokenLabel || "XRP"}</span>
                )}
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <TrendingUp className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Shares</span>
                </div>
                <span className="text-sm font-mono font-semibold">
                  {(() => {
                    const raw = vault?.shares?.OutstandingAmount;
                    if (!raw) return "0";
                    // Share MPT has its own AssetScale (rippled default = 6).
                    const scale = vault?.shares?.AssetScale ?? 6;
                    const value = Number(raw) / Math.pow(10, scale);
                    return value.toLocaleString(undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 6,
                    });
                  })()}
                </span>
              </div>
              <div className="rounded-lg border bg-muted/30 p-3 space-y-1">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Vault className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-medium">Deposit Cap</span>
                </div>
                <span className="text-sm font-semibold">
                  {vault?.AssetsMaximum && vault.AssetsMaximum !== "0"
                    ? isToken
                      ? `${parseFloat(vault.AssetsMaximum).toLocaleString()} ${tokenLabel}`
                      : `${(parseInt(vault.AssetsMaximum) / DROPS_PER_XRP).toLocaleString()} XRP`
                    : "Unlimited"}
                </span>
              </div>
            </div>

            {/* Vault info row */}
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-muted-foreground">
              <span>
                Type: <span className="font-medium text-foreground">{vault?.Flags === 0 ? "Public" : "Private"}</span>
              </span>
              <span>
                Shares:{" "}
                <span className="font-medium text-foreground">
                  {(vault?.shares?.Flags ?? 0) & MPTokenIssuanceCreateFlags.tfMPTCanTransfer
                    ? "Transferable"
                    : "Non-transferable"}
                </span>
              </span>
              <span>
                Withdrawal: <span className="font-medium text-foreground">{vault?.WithdrawalPolicy === 1 ? "First come, first served" : "Custom"}</span>
              </span>
              {shareMeta && (shareMeta.ticker || shareMeta.t || shareMeta.name || shareMeta.n) && (
                <span>
                  Share token: <span className="font-medium text-foreground font-mono">{shareMeta.ticker || shareMeta.t || shareMeta.name || shareMeta.n}</span>
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Deposit / Withdraw */}
      <div className="grid gap-8 lg:grid-cols-2">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Deposit</CardTitle>
              <CardDescription>
                Add {tokenLabel || "XRP"} liquidity to the vault so it can fund loans.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <DepositForm
                vaultId={vaultId}
                issuedToken={session.issuedToken}
                onSuccess={(msg, txHash) => {
                  setStatus({ type: "success", message: msg, txHash });
                  fetchVault();
                }}
                onError={(msg) => setStatus({ type: "error", message: msg })}
                onPending={(msg) =>
                  setStatus({ type: "pending", message: msg })
                }
              />
            </CardContent>
          </Card>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.2 }}
        >
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Withdraw</CardTitle>
              <CardDescription>
                Redeem your vault shares for the underlying asset.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <WithdrawForm
                vaultId={vaultId}
                issuedToken={session.issuedToken}
                vaultAssetsTotal={vault?.AssetsTotal}
                vaultAssetsAvailable={vault?.AssetsAvailable}
                onSuccess={(msg, txHash) => {
                  setStatus({ type: "success", message: msg, txHash });
                  fetchVault();
                }}
                onError={(msg) => setStatus({ type: "error", message: msg })}
                onPending={(msg) =>
                  setStatus({ type: "pending", message: msg })
                }
              />
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* History & PNL */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.3 }}
      >
        <DepositHistory
          vaultId={vaultId}
          vaultAssetsTotal={vault?.AssetsTotal}
          token={tokenLabel}
        />
      </motion.div>
    </div>
  );
}
