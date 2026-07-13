"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { WalletBadge } from "@/components/wallet-badge";
import { AmountDisplay } from "@/components/amount-display";
import {
  ExternalLink,
  RefreshCw,
  Trash2,
  Loader2,
  Vault,
  Coins,
  TrendingUp,
  Tag,
} from "lucide-react";
import { explorerVaultUrl, explorerMptUrl } from "@/lib/explorer";
import { MPTokenIssuanceCreateFlags } from "xrpl";

interface VaultDetailsProps {
  vaultId: string;
  loanBrokerId?: string | null;
  onDeleted: (txHash?: string) => void;
}

interface VaultOnChain {
  vault?: {
    Asset: unknown;
    Account?: string;
    Owner: string;
    Flags: number;
    AssetsTotal?: string;
    AssetsAvailable?: string;
    AssetsMaximum?: string;
    Data?: string;
    ShareMPTID?: string;
    shares?: {
      OutstandingAmount?: string;
      AssetScale?: number;
      Flags?: number;
      mpt_issuance_id?: string;
      MPTokenMetadata?: string;
    };
    Sequence?: number;
    WithdrawalPolicy?: number;
  };
}

interface BrokerOnChain {
  CoverAvailable?: string;
  ManagementFeeRate?: number;
  CoverRateMinimum?: number;
  CoverRateLiquidation?: number;
  DebtTotal?: string;
  DebtMaximum?: string;
}

export function VaultDetails({ vaultId, loanBrokerId, onDeleted }: VaultDetailsProps) {
  const [onChain, setOnChain] = useState<VaultOnChain | null>(null);
  const [brokerData, setBrokerData] = useState<BrokerOnChain | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const fetchVault = useCallback(async () => {
    try {
      const res = await fetch(`/api/vault/${vaultId}`);
      if (res.ok) {
        const data = await res.json();
        setOnChain(data.onLedger);
      }
      // Also fetch broker data if available
      if (loanBrokerId) {
        try {
          const brokerRes = await fetch(`/api/loan/${loanBrokerId}`);
          if (brokerRes.ok) {
            const bData = await brokerRes.json();
            if (bData.onLedger?.node) setBrokerData(bData.onLedger.node);
          }
        } catch { /* broker fetch failed */ }
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [vaultId, loanBrokerId]);

  useEffect(() => {
    fetchVault();
  }, [fetchVault]);

  async function handleRefresh() {
    setRefreshing(true);
    await fetchVault();
  }

  async function handleDelete() {
    if (!confirm("Delete this vault? This will delete all loans, the broker, and the vault from the ledger.")) return;
    setDeleting(true);
    try {
      const res = await fetch("/api/vault/delete", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Failed to delete vault");
        return;
      }
      onDeleted(data.result?.hash);
    } finally {
      setDeleting(false);
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader><Skeleton className="h-6 w-32" /></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-20 rounded-lg" />
            <Skeleton className="h-20 rounded-lg" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const vault = onChain?.vault;

  // Parse hex-encoded vault Data field
  let vaultMeta: { n?: string; w?: string } | null = null;
  if (vault?.Data) {
    try {
      vaultMeta = JSON.parse(Buffer.from(vault.Data, "hex").toString("utf8"));
    } catch { /* invalid */ }
  }

  // Parse hex-encoded MPToken metadata from shares
  let shareMeta: {
    ticker?: string; name?: string; desc?: string; icon?: string;
    t?: string; n?: string; d?: string; i?: string;
    ac?: string; in?: string;
  } | null = null;
  if (vault?.shares?.MPTokenMetadata) {
    try {
      shareMeta = JSON.parse(Buffer.from(vault.shares.MPTokenMetadata, "hex").toString("utf8"));
    } catch { /* invalid */ }
  }

  const vaultAsset = vault?.Asset as Record<string, string> | undefined;
  const isTokenVault = !!(vaultAsset && (vaultAsset.issuer || vaultAsset.mpt_issuance_id));
  const tokenLabel = isTokenVault ? "TUSD" : undefined;

  const assetLabel = (() => {
    if (!vaultAsset) return "XRP";
    if (vaultAsset.currency === "XRP" || (!vaultAsset.currency && !vaultAsset.mpt_issuance_id)) return "XRP";
    if (vaultAsset.mpt_issuance_id) return "TUSD (MPT)";
    return "TUSD (IOU)";
  })();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <CardTitle className="flex items-center gap-2">
              <Vault className="h-5 w-5 text-primary" />
              {vaultMeta?.n || "Vault Dashboard"}
            </CardTitle>
            <p className="font-mono text-xs text-muted-foreground break-all">{vaultId}</p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={explorerVaultUrl(vaultId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs text-muted-foreground hover:text-primary hover:border-primary/30 transition-colors"
            >
              Explorer
              <ExternalLink className="h-3 w-3" />
            </a>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleRefresh} disabled={refreshing}>
              <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<Coins className="h-4 w-4" />} label="Total Assets" value={
            vault?.AssetsTotal
              ? <AmountDisplay drops={vault.AssetsTotal} className="text-sm font-semibold" token={tokenLabel} />
              : <span className="text-sm font-semibold">0.00 {tokenLabel || "XRP"}</span>
          } />
          <StatCard icon={<Coins className="h-4 w-4" />} label="Available" value={
            vault?.AssetsAvailable
              ? <AmountDisplay drops={vault.AssetsAvailable} className="text-sm font-semibold" token={tokenLabel} />
              : <span className="text-sm font-semibold">0.00 {tokenLabel || "XRP"}</span>
          } />
          <StatCard icon={<TrendingUp className="h-4 w-4" />} label="Shares Issued" value={
            <span className="text-sm font-mono font-semibold">
              {(() => {
                const raw = vault?.shares?.OutstandingAmount;
                if (!raw) return "0";
                // The share MPT carries its own AssetScale; rippled defaults
                // to 6 if VaultCreate didn't override it. Divide here so the
                // user sees circulating supply, not raw ledger units.
                const scale = vault?.shares?.AssetScale ?? 6;
                const value = Number(raw) / Math.pow(10, scale);
                return value.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 6,
                });
              })()}
            </span>
          } />
          <StatCard icon={<Vault className="h-4 w-4" />} label="Deposit Cap" value={
            <span className="text-sm font-semibold">
              {vault?.AssetsMaximum && vault.AssetsMaximum !== "0"
                ? isTokenVault
                  ? `${parseFloat(vault.AssetsMaximum).toLocaleString()} ${tokenLabel}`
                  : `${(parseInt(vault.AssetsMaximum) / 1_000_000).toLocaleString()} XRP`
                : "Unlimited"}
            </span>
          } />
        </div>

        {/* Owner */}
        {vault?.Owner && (
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Owner</span>
            <WalletBadge address={vault.Owner} />
          </div>
        )}

        <Separator />

        {/* Configuration */}
        <div className="space-y-3">
          <p className="text-sm font-medium">Configuration</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
            <TermRow label="Type" value={vault?.Flags === 0 ? "Public" : "Private"} />
            <TermRow label="Asset" value={assetLabel} />
            <TermRow
              label="Shares"
              value={
                // XLS-65: the share MPT exposes tfMPTCanTransfer (0x20) on its
                // Flags. Presence of the bit = transferable; absence = the vault
                // was created with tfVaultShareNonTransferable.
                (vault?.shares?.Flags ?? 0) & MPTokenIssuanceCreateFlags.tfMPTCanTransfer
                  ? "Transferable"
                  : "Non-transferable"
              }
            />
            <TermRow label="Withdrawal" value={vault?.WithdrawalPolicy === 1 ? "First come, first served" : "Custom"} />
            {vaultMeta?.w && (
              <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-0.5">
                <span className="text-muted-foreground text-xs">Website</span>
                <a
                  href={vaultMeta.w.startsWith("http") ? vaultMeta.w : `https://${vaultMeta.w}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-primary hover:underline flex items-center gap-1"
                >
                  {vaultMeta.w}
                  <ExternalLink className="h-2.5 w-2.5" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Broker config */}
        {brokerData && (
          <>
            <Separator />
            <div className="space-y-3">
              <p className="text-sm font-medium">Broker</p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                {brokerData.CoverAvailable && (
                  <TermRow
                    label="First-loss capital"
                    value={isTokenVault ? `${parseFloat(brokerData.CoverAvailable).toFixed(2)} ${tokenLabel}` : `${(parseInt(brokerData.CoverAvailable) / 1_000_000).toFixed(2)} XRP`}
                  />
                )}
                {brokerData.ManagementFeeRate !== undefined && (
                  <TermRow
                    label="Management fee"
                    value={`${(brokerData.ManagementFeeRate / 1000).toFixed(2)}%`}
                  />
                )}
                {brokerData.DebtTotal !== undefined && (
                  <TermRow
                    label="Total debt"
                    value={isTokenVault ? `${parseFloat(brokerData.DebtTotal || "0").toFixed(2)} ${tokenLabel}` : `${(parseInt(brokerData.DebtTotal || "0") / 1_000_000).toFixed(2)} XRP`}
                  />
                )}
                <TermRow
                  label="Max debt"
                  value={
                    brokerData.DebtMaximum && Number(brokerData.DebtMaximum) > 0
                      ? isTokenVault
                        ? `${parseFloat(brokerData.DebtMaximum).toLocaleString()} ${tokenLabel}`
                        : `${(Number(brokerData.DebtMaximum) / 1_000_000).toLocaleString()} XRP`
                      : "Unlimited"
                  }
                />
                {brokerData.CoverRateMinimum !== undefined && (
                  <TermRow
                    label="Min cover rate"
                    value={`${(brokerData.CoverRateMinimum / 1000).toFixed(2)}%`}
                  />
                )}
                {brokerData.CoverRateLiquidation !== undefined && (
                  <TermRow
                    label="Liquidation rate"
                    value={`${(brokerData.CoverRateLiquidation / 1000).toFixed(2)}%`}
                  />
                )}
              </div>
            </div>
          </>
        )}

        {/* Share token metadata */}
        {(shareMeta || vault?.ShareMPTID) && (
          <>
            <Separator />
            <div className="space-y-3">
              <p className="text-sm font-medium flex items-center gap-1.5">
                <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                Share Token
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-2 text-sm">
                {(shareMeta?.ticker || shareMeta?.t) && (
                  <TermRow label="Ticker" value={shareMeta.ticker || shareMeta.t || ""} />
                )}
                {(shareMeta?.name || shareMeta?.n) && (
                  <TermRow label="Name" value={shareMeta.name || shareMeta.n || ""} />
                )}
                {(shareMeta?.desc || shareMeta?.d) && (
                  <TermRow label="Description" value={shareMeta.desc || shareMeta.d || ""} />
                )}
                {shareMeta?.in && <TermRow label="Issuer" value={shareMeta.in} />}
                {shareMeta?.ac && <TermRow label="Asset class" value={shareMeta.ac} />}
                {vault?.ShareMPTID && (
                  <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-0.5">
                    <span className="text-muted-foreground text-xs">MPT ID</span>
                    <a
                      href={explorerMptUrl(vault.ShareMPTID)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-mono font-medium text-primary hover:underline flex items-center gap-1"
                    >
                      {vault.ShareMPTID.slice(0, 12)}...
                      <ExternalLink className="h-2.5 w-2.5" />
                    </a>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <Separator />

        {/* Actions */}
        <div className="flex justify-end">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 text-destructive border-destructive/30 hover:bg-destructive/10 hover:text-destructive"
            onClick={handleDelete}
            disabled={deleting}
          >
            {deleting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
            Delete Vault
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TermRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between sm:flex-col sm:items-start sm:gap-0.5">
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="font-mono text-xs font-medium">{value}</span>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-[11px] font-medium">{label}</span>
      </div>
      {value}
    </div>
  );
}
