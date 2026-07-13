"use client";

import { useEffect, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { BorderBeam } from "@/components/ui/border-beam";
import { ShimmerButton } from "@/components/ui/shimmer-button";
import { Loader2, ArrowRight, Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { motion } from "motion/react";
import { createVaultAndBroker } from "./actions";
import { DROPS_PER_XRP } from "@/lib/constants";
import {
  MPT_ASSET_CLASSES,
  MPT_ASSET_SUBCLASSES,
  MPT_TICKER_RE,
} from "@/lib/xrpl/mpt-metadata";

interface CreateVaultProps {
  onCreated: (vaultId: string, brokerId: string, txHash?: string) => void;
  onError: (message: string) => void;
  onPending: (message: string) => void;
}

export function CreateVault({
  onCreated,
  onError,
  onPending,
}: CreateVaultProps) {
  const [loading, setLoading] = useState(false);
  const [brokerXrp, setBrokerXrp] = useState<number | null>(null);

  // Broker XRP balance drives the first-loss-capital guard: the deposit is
  // posted from the broker wallet, which must keep XRPL reserve + fees.
  useEffect(() => {
    fetch("/api/session/balances")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const broker = d?.wallets?.find((w: { role: string }) => w.role === "broker");
        if (broker?.balance) setBrokerXrp(parseInt(broker.balance) / DROPS_PER_XRP);
      })
      .catch(() => {});
  }, []);

  // Asset type
  const [assetType, setAssetType] = useState<"XRP" | "IOU" | "MPT">("XRP");
  const unit = assetType === "XRP" ? "XRP" : "TUSD";

  // Vault metadata
  const [vaultName, setVaultName] = useState("");
  const [website, setWebsite] = useState("");

  // Max deposit cap
  const [hasMaxCap, setHasMaxCap] = useState(false);
  const [maxCapXrp, setMaxCapXrp] = useState("1000");

  // Non-transferable shares
  const [nonTransferable, setNonTransferable] = useState(false);

  // Broker config
  const [managementFee, setManagementFee] = useState("");
  const [debtMaximum, setDebtMaximum] = useState("");
  const [coverRateMin, setCoverRateMin] = useState("");
  const [coverRateLiq, setCoverRateLiq] = useState("");
  const [firstLossCapital, setFirstLossCapital] = useState("");

  // Share metadata (MPT - XLS-89 compressed keys)
  const [shareTicker, setShareTicker] = useState("");
  const [shareName, setShareName] = useState("");
  const [shareDesc, setShareDesc] = useState("");
  const [shareIcon, setShareIcon] = useState("");
  const [shareIssuerName, setShareIssuerName] = useState("");
  const [shareAssetClass, setShareAssetClass] = useState("defi");
  const [shareAssetSubclass, setShareAssetSubclass] = useState("");

  // Share token metadata required by the MPT schema: ticker, name, issuer
  // name, asset class (+ asset subclass when the class is "rwa"). Icon and
  // description stay optional.
  const shareMetaValid =
    MPT_TICKER_RE.test(shareTicker.trim().toUpperCase()) &&
    shareName.trim() !== "" &&
    shareIssuerName.trim() !== "" &&
    shareAssetClass !== "" &&
    (shareAssetClass !== "rwa" || shareAssetSubclass !== "");

  // First-loss capital is posted from the broker wallet — leave ~2 XRP for the
  // XRPL reserve + fees. Guard applies to XRP vaults (token FLC uses a
  // different balance).
  const FLC_XRP_BUFFER = 2;
  const flcNum = parseFloat(firstLossCapital) || 0;
  const flcExceedsBalance =
    assetType === "XRP" &&
    brokerXrp !== null &&
    flcNum > 0 &&
    flcNum > brokerXrp - FLC_XRP_BUFFER;

  async function handleCreate() {
    setLoading(true);
    onPending(
      assetType !== "XRP"
        ? `Setting up TUSD (${assetType})... This may take a moment.`
        : "Creating vault and broker on XRPL Devnet..."
    );

    try {
      const { vaultId, loanBrokerId, txHash } = await createVaultAndBroker({
        assetType,
        vaultName,
        website,
        nonTransferable,
        hasMaxCap,
        maxCap: maxCapXrp,
        shareMetadata: {
          ticker: shareTicker,
          name: shareName,
          description: shareDesc,
          icon: shareIcon,
          issuerName: shareIssuerName,
          assetClass: shareAssetClass,
          assetSubclass: shareAssetSubclass,
        },
        managementFee,
        debtMaximum,
        coverRateMin,
        coverRateLiq,
        firstLossCapital,
      });
      onCreated(vaultId, loanBrokerId, txHash);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to create vault");
    } finally {
      setLoading(false);
    }
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

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.4 }}
    >
      <Card className="relative overflow-hidden">
        <BorderBeam size={150} duration={10} />
        <CardHeader className="space-y-2">
          <CardTitle className="text-xl">Create a Vault</CardTitle>
          <CardDescription>
            Configure and deploy a public vault on the ledger. A loan broker
            will be registered automatically.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Asset type */}
          <div className="space-y-4">
            <p className="text-sm font-medium">Asset</p>
            <div className="flex flex-wrap gap-2">
              {(
                [
                  { key: "XRP", label: "XRP" },
                  { key: "IOU", label: "TUSD (IOU)" },
                  { key: "MPT", label: "TUSD (MPT)" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setAssetType(opt.key)}
                  className={`rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                    assetType === opt.key
                      ? "border-primary bg-primary/5 text-primary"
                      : "text-muted-foreground hover:bg-muted/50"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>

            {assetType !== "XRP" && (
              <div className="rounded-lg bg-primary/5 border border-primary/20 px-3 py-2 text-xs text-primary">
                {assetType === "IOU"
                  ? "TUSD — Test USD token will be automatically issued via trustlines. 10,000 TUSD distributed to the depositor wallet."
                  : "TUSD — Test USD token will be automatically issued as an MPT (Multi-Purpose Token). 10,000 TUSD distributed to the depositor wallet."}
              </div>
            )}
          </div>

          <Separator />

          {/* Vault identity */}
          <div className="space-y-4">
            <p className="text-sm font-medium">Vault Identity</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vault-name">Name</Label>
                <Input
                  id="vault-name"
                  placeholder="e.g. XRP Lending Pool"
                  value={vaultName}
                  onChange={(e) => setVaultName(e.target.value)}
                  maxLength={64}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vault-website">Website</Label>
                <Input
                  id="vault-website"
                  placeholder="e.g. example.com"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  maxLength={128}
                />
              </div>
            </div>
          </div>

          <Separator />

          {/* Vault settings */}
          <div className="space-y-4">
            <p className="text-sm font-medium">Settings</p>

            {/* Max cap */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="has-max-cap"
                  checked={hasMaxCap}
                  onChange={(e) => setHasMaxCap(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                <Label htmlFor="has-max-cap" className="text-sm font-normal">
                  Set a maximum deposit cap
                </Label>
              </div>
              {hasMaxCap && (
                <div className="space-y-2 pl-6">
                  <Label htmlFor="max-cap">Max assets ({unit})</Label>
                  <Input
                    id="max-cap"
                    type="number"
                    min="1"
                    step="1"
                    value={maxCapXrp}
                    onChange={(e) => setMaxCapXrp(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Non-transferable shares */}
            <div className="flex items-start gap-2">
              <input
                type="checkbox"
                id="non-transferable"
                checked={nonTransferable}
                onChange={(e) => setNonTransferable(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-input accent-primary"
              />
              <div>
                <Label
                  htmlFor="non-transferable"
                  className="text-sm font-normal"
                >
                  Non-transferable shares
                </Label>
                <p className="text-xs text-muted-foreground">
                  Vault shares cannot be transferred between accounts.
                </p>
              </div>
            </div>
          </div>

          <Separator />

          {/* Share metadata */}
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium">
                Share Token Metadata{" "}
                <span className="font-normal text-muted-foreground">
                  (required)
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                MPToken metadata for the vault&apos;s share tokens. Populating
                these lets wallets and explorers display the token correctly.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="share-ticker">
                  Ticker <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="share-ticker"
                  placeholder="e.g. SHARE1"
                  value={shareTicker}
                  onChange={(e) =>
                    setShareTicker(e.target.value.toUpperCase())
                  }
                  maxLength={6}
                />
                <p className="text-xs text-muted-foreground">
                  Uppercase A–Z and digits, up to 6 characters.
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="share-name">
                  Name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="share-name"
                  placeholder="e.g. Vault Shares"
                  value={shareName}
                  onChange={(e) => setShareName(e.target.value)}
                  maxLength={64}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="share-issuer">
                  Issuer name <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="share-issuer"
                  placeholder="e.g. MyBank"
                  value={shareIssuerName}
                  onChange={(e) => setShareIssuerName(e.target.value)}
                  maxLength={64}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="share-asset-class">
                  Asset class <span className="text-destructive">*</span>
                </Label>
                <select
                  id="share-asset-class"
                  value={shareAssetClass}
                  onChange={(e) => setShareAssetClass(e.target.value)}
                  className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  {MPT_ASSET_CLASSES.map((ac) => (
                    <option key={ac} value={ac}>
                      {ac}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {shareAssetClass === "rwa" && (
              <div className="space-y-2">
                <Label htmlFor="share-asset-subclass">
                  Asset subclass <span className="text-destructive">*</span>
                </Label>
                <select
                  id="share-asset-subclass"
                  value={shareAssetSubclass}
                  onChange={(e) => setShareAssetSubclass(e.target.value)}
                  className="h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                >
                  <option value="">Select a subclass…</option>
                  {MPT_ASSET_SUBCLASSES.map((sub) => (
                    <option key={sub} value={sub}>
                      {sub}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-muted-foreground">
                  Required when the asset class is rwa.
                </p>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="share-desc">
                Description{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                id="share-desc"
                placeholder="e.g. Proportional ownership shares of the vault"
                value={shareDesc}
                onChange={(e) => setShareDesc(e.target.value)}
                maxLength={256}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="share-icon">
                Icon URL{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </Label>
              <Input
                id="share-icon"
                placeholder="e.g. example.com/icon.png"
                value={shareIcon}
                onChange={(e) => setShareIcon(e.target.value)}
                maxLength={128}
              />
            </div>
          </div>

          <Separator />

          {/* Broker config */}
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium">
                Broker Configuration{" "}
                <span className="font-normal text-muted-foreground">
                  (optional)
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Risk management and fee parameters for the loan broker.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="mgmt-fee">Management fee (%)</Label>
                  <InfoTip text="Percentage the broker earns on loan interest. E.g. 1% means the broker takes 1% of all interest generated, the rest goes to vault depositors." />
                </div>
                <Input
                  id="mgmt-fee"
                  type="number"
                  min="0"
                  max="10"
                  step="0.01"
                  placeholder="e.g. 1.0"
                  value={managementFee}
                  onChange={(e) => setManagementFee(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="debt-max">Max debt ({unit})</Label>
                  <InfoTip text="Maximum total debt the broker can issue across all loans. Leave empty for unlimited." />
                </div>
                <Input
                  id="debt-max"
                  type="number"
                  min="0"
                  step="1"
                  placeholder="Unlimited"
                  value={debtMaximum}
                  onChange={(e) => setDebtMaximum(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="cover-min">Min cover rate (%)</Label>
                  <InfoTip text="Minimum ratio of first-loss capital to total debt. If cover drops below this, the broker can't issue new loans and fees are redirected to replenish the capital. Must be set together with the liquidation rate (both zero or both non-zero)." />
                </div>
                <Input
                  id="cover-min"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="e.g. 10.0"
                  value={coverRateMin}
                  onChange={(e) => setCoverRateMin(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-1.5">
                  <Label htmlFor="cover-liq">Liquidation rate (%)</Label>
                  <InfoTip text="On a loan default, the maximum share of the required minimum cover (DebtTotal × min cover rate) that is drawn from first-loss capital to cover the loss. E.g. 100% liquidates the full required cover, 10% only a tenth. Must be set together with min cover rate (both zero or both non-zero)." />
                </div>
                <Input
                  id="cover-liq"
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  placeholder="e.g. 100.0"
                  value={coverRateLiq}
                  onChange={(e) => setCoverRateLiq(e.target.value)}
                />
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-1.5">
                <Label htmlFor="first-loss">First-loss capital ({unit})</Label>
                <InfoTip text="Assets deposited by the broker as a buffer against loan defaults. Protects depositors by absorbing initial losses. Deposited from the broker wallet after creation." />
              </div>
              <Input
                id="first-loss"
                type="number"
                min="0"
                step="1"
                placeholder="Amount to deposit as first-loss capital"
                value={firstLossCapital}
                onChange={(e) => setFirstLossCapital(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Deposited from the broker wallet after creation. Acts as a buffer against loan defaults.
              </p>
              {flcExceedsBalance && (
                <p className="text-xs text-destructive">
                  Exceeds the broker&apos;s available balance ({brokerXrp?.toFixed(2)} XRP).
                  Leave ~{FLC_XRP_BUFFER} XRP for the reserve and fees.
                </p>
              )}
            </div>
          </div>

          <Separator />

          {/* Summary */}
          <div className="rounded-lg bg-muted/50 p-3 text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Asset</span>
              <span className="font-medium font-mono">
                {assetType === "XRP" ? "XRP" : `TUSD (${assetType})`}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Type</span>
              <span className="font-medium">Public</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Deposit cap</span>
              <span className="font-medium">
                {hasMaxCap ? `${maxCapXrp} ${unit}` : "Unlimited"}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Shares</span>
              <span className="font-medium">
                {nonTransferable ? "Non-transferable" : "Transferable"}
              </span>
            </div>
            {managementFee && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Management fee</span>
                <span className="font-medium">{managementFee}%</span>
              </div>
            )}
            {firstLossCapital && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">First-loss capital</span>
                <span className="font-medium">{firstLossCapital} {unit}</span>
              </div>
            )}
          </div>

          <ShimmerButton
            className="w-full h-10 text-sm font-semibold"
            shimmerColor="hsl(213, 100%, 60%)"
            shimmerSize="0.1em"
            background="hsl(213, 100%, 40%)"
            disabled={loading || !shareMetaValid || flcExceedsBalance}
            onClick={handleCreate}
          >
            {loading ? (
              <span className="flex items-center gap-2 text-white">
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating vault...
              </span>
            ) : (
              <span className="flex items-center gap-2 text-white">
                Create Vault & Register Broker
                <ArrowRight className="h-4 w-4" />
              </span>
            )}
          </ShimmerButton>
        </CardContent>
      </Card>
    </motion.div>
  );
}
