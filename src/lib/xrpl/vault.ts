/**
 * XLS-65 Single Asset Vault transaction builders.
 * Spec: https://github.com/XRPLF/XRPL-Standards/tree/master/XLS-0065-single-asset-vault
 */
import { Wallet, VaultCreateFlags } from "xrpl";
import { getXrplClient } from "./client";
import { assertTxSuccess } from "./helpers";
import { DEFAULT_ISSUER_NAME, DEFAULT_TOKEN_ICON, withSourceTag } from "@/lib/constants";

export interface VaultAsset {
  type: "XRP" | "IOU" | "MPT";
  currency?: string; // IOU currency code, e.g. "USD"
  issuer?: string; // IOU issuer account
  mptIssuanceId?: string; // XLS-33 MPTokenIssuance ID
}

export interface VaultCreateOptions {
  asset?: VaultAsset;
  name?: string;
  website?: string;
  /** Deposit cap. Drops for XRP; asset units for IOU/MPT. */
  assetsMaximum?: string;
  /** tfVaultShareNonTransferable — shares cannot be transferred to another account. */
  nonTransferableShares?: boolean;
  /** XLS-89 compressed metadata for the share MPT (`t`, `n`, `d`, `i`, `ac`, `as`, `in`). */
  shareMetadata?: {
    ticker?: string;
    name?: string;
    description?: string;
    icon?: string;
    issuerName?: string;
    assetClass?: string;
    assetSubclass?: string;
  };
}

/**
 * Build a VaultCreate transaction. The vault's pseudo-account issues a share
 * MPT; share metadata is encoded as hex JSON via XLS-89 compressed keys.
 */
export function buildVaultCreate(
  ownerAddress: string,
  options: VaultCreateOptions = {}
) {
  let asset: Record<string, string>;
  const assetConfig = options.asset;
  if (assetConfig?.type === "IOU" && assetConfig.currency && assetConfig.issuer) {
    asset = { currency: assetConfig.currency, issuer: assetConfig.issuer };
  } else if (assetConfig?.type === "MPT" && assetConfig.mptIssuanceId) {
    asset = { mpt_issuance_id: assetConfig.mptIssuanceId };
  } else {
    asset = { currency: "XRP" };
  }

  const tx: Record<string, unknown> = {
    TransactionType: "VaultCreate",
    Account: ownerAddress,
    Asset: asset,
    Flags: options.nonTransferableShares ? VaultCreateFlags.tfVaultShareNonTransferable : 0,
    WithdrawalPolicy: 1, // vaultStrategyFirstComeFirstServe
  };

  if (options.name || options.website) {
    const data: Record<string, string> = {};
    if (options.name) data.n = options.name;
    if (options.website) data.w = options.website;
    tx.Data = Buffer.from(JSON.stringify(data)).toString("hex").toUpperCase();
  }

  if (options.assetsMaximum) {
    tx.AssetsMaximum = options.assetsMaximum;
  }

  if (options.shareMetadata) {
    const meta = options.shareMetadata;
    const mptMeta: Record<string, unknown> = {};
    if (meta.ticker) mptMeta.t = meta.ticker.toUpperCase();
    if (meta.name) mptMeta.n = meta.name;
    if (meta.description) mptMeta.d = meta.description;
    mptMeta.i = meta.icon || DEFAULT_TOKEN_ICON;
    mptMeta.ac = meta.assetClass || "defi";
    if (meta.assetSubclass) mptMeta.as = meta.assetSubclass;
    mptMeta.in = meta.issuerName || DEFAULT_ISSUER_NAME;
    tx.MPTokenMetadata = Buffer.from(JSON.stringify(mptMeta)).toString("hex").toUpperCase();
  }

  return tx;
}

/** VaultDeposit — move assets into the vault in exchange for shares. */
export function buildVaultDeposit(
  depositorAddress: string,
  vaultId: string,
  amount: string | Record<string, string>
) {
  return {
    TransactionType: "VaultDeposit",
    Account: depositorAddress,
    VaultID: vaultId,
    Amount: amount,
  };
}

/** VaultWithdraw — redeem assets out of the vault. Redeem-all is done by passing
 *  the vault's current AssetsAvailable as the asset amount; a zero Amount is
 *  rejected by the ledger (temBAD_AMOUNT). */
export function buildVaultWithdraw(
  address: string,
  vaultId: string,
  amount: string | Record<string, string>
) {
  return {
    TransactionType: "VaultWithdraw",
    Account: address,
    VaultID: vaultId,
    Amount: amount,
  };
}

/**
 * VaultDelete — only succeeds when AssetsTotal, AssetsAvailable, and the shares
 * OutstandingAmount are all 0. The caller must be the vault Owner.
 */
export function buildVaultDelete(ownerAddress: string, vaultId: string) {
  return {
    TransactionType: "VaultDelete",
    Account: ownerAddress,
    VaultID: vaultId,
  };
}

/**
 * Autofill, sign and submit a transaction. Throws if the ledger returns
 * anything other than tesSUCCESS so callers never silently persist DB state.
 */
export async function submitTransaction(
  wallet: Wallet,
  tx: Record<string, unknown>
) {
  const client = await getXrplClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const prepared = await client.autofill(withSourceTag(tx) as any);
  const signed = wallet.sign(prepared);
  const result = await client.submitAndWait(signed.tx_blob);
  assertTxSuccess(result, String(tx.TransactionType || "Transaction"));
  return result;
}

/** vault_info — rippled RPC returning the Vault ledger entry and share MPT. */
export async function getVaultInfo(vaultId: string) {
  const client = await getXrplClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const result = await (client as any).request({
    command: "vault_info",
    vault_id: vaultId,
  });
  return result;
}
