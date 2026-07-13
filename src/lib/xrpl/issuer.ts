/**
 * Demo issuer setup: bootstraps IOU or MPT trust so that the vault flow can
 * use a non-XRP asset. Not part of XLS-65/66 themselves — this is app-level
 * plumbing for the demo, built on XLS-33 (MPT) and classic IOU mechanics.
 */
import { Wallet, MPTokenIssuanceCreateFlags } from "xrpl";
import { getXrplClient } from "./client";
import { submitTransaction } from "./vault";
import {
  DEMO_TOKEN_DISTRIBUTION,
  DEMO_TOKEN_TICKER,
  DEMO_TOKEN_NAME,
  DEMO_TOKEN_DESCRIPTION,
  DEFAULT_ISSUER_NAME,
  DEFAULT_TOKEN_ICON,
  DEMO_IOU_TRUST_LIMIT,
  DEMO_MPT_MAXIMUM_AMOUNT,
  MPT_ASSET_SCALE,
  MPT_SCALE_MULTIPLIER,
  withSourceTag,
} from "@/lib/constants";

/**
 * Enable DefaultRipple on the issuer, create trustlines for broker/depositor/
 * borrower, and seed each role with `DEMO_TOKEN_DISTRIBUTION` units so the
 * demo flows (deposit, first-loss cover, interest/fee repayment) all have
 * enough balance to run end-to-end.
 * Returns `{ currency, issuer }` for use in a subsequent VaultCreate.
 */
export async function setupIOU(
  issuerWallet: Wallet,
  brokerWallet: Wallet,
  depositorWallet: Wallet,
  borrowerWallet: Wallet
): Promise<{ currency: string; issuer: string }> {
  const currency = "USD";
  const issuerAddress = issuerWallet.classicAddress;
  const limit = DEMO_IOU_TRUST_LIMIT;

  // DefaultRipple lets intermediate accounts rebalance through the issuer —
  // required for vaults holding IOU assets.
  await submitTransaction(issuerWallet, {
    TransactionType: "AccountSet",
    Account: issuerAddress,
    SetFlag: 8, // asfDefaultRipple
  });

  await Promise.all([
    submitTransaction(brokerWallet, {
      TransactionType: "TrustSet",
      Account: brokerWallet.classicAddress,
      LimitAmount: { currency, issuer: issuerAddress, value: limit },
    }),
    submitTransaction(depositorWallet, {
      TransactionType: "TrustSet",
      Account: depositorWallet.classicAddress,
      LimitAmount: { currency, issuer: issuerAddress, value: limit },
    }),
    submitTransaction(borrowerWallet, {
      TransactionType: "TrustSet",
      Account: borrowerWallet.classicAddress,
      LimitAmount: { currency, issuer: issuerAddress, value: limit },
    }),
  ]);

  // Seed all three roles. The borrower needs a non-zero stake to cover
  // interest + fees on repayment; the broker needs it to post first-loss cover.
  for (const recipient of [depositorWallet, borrowerWallet, brokerWallet]) {
    await submitTransaction(issuerWallet, {
      TransactionType: "Payment",
      Account: issuerAddress,
      Destination: recipient.classicAddress,
      Amount: { currency, issuer: issuerAddress, value: DEMO_TOKEN_DISTRIBUTION },
    });
  }

  return { currency, issuer: issuerAddress };
}

/**
 * Create an MPT issuance, authorize the three role wallets, and seed each
 * role with the demo distribution (scaled by `MPT_ASSET_SCALE`) so all flows
 * — deposit, first-loss cover, repayment — can run end-to-end.
 */
export async function setupMPT(
  issuerWallet: Wallet,
  brokerWallet: Wallet,
  depositorWallet: Wallet,
  borrowerWallet: Wallet
): Promise<{ mptIssuanceId: string }> {
  const issuerAddress = issuerWallet.classicAddress;

  // Compressed metadata keys: t=ticker, n=name, d=desc, i=icon, ac=asset-class,
  // as=asset-subclass, in=issuer-name. A test stablecoin maps to the schema's
  // rwa class with the stablecoin subclass (the valid enum values).
  const metadata = {
    t: DEMO_TOKEN_TICKER,
    n: DEMO_TOKEN_NAME,
    d: DEMO_TOKEN_DESCRIPTION,
    i: DEFAULT_TOKEN_ICON,
    ac: "rwa",
    as: "stablecoin",
    in: DEFAULT_ISSUER_NAME,
  };
  const metadataHex = Buffer.from(JSON.stringify(metadata)).toString("hex").toUpperCase();

  const createResult = await submitTransaction(issuerWallet, {
    TransactionType: "MPTokenIssuanceCreate",
    Account: issuerAddress,
    AssetScale: MPT_ASSET_SCALE,
    MaximumAmount: DEMO_MPT_MAXIMUM_AMOUNT,
    Flags: MPTokenIssuanceCreateFlags.tfMPTCanTransfer,
    MPTokenMetadata: metadataHex,
  });

  // rippled emits `mpt_issuance_id` (UINT192, 48 hex chars) directly in the
  // transaction metadata — distinct from the MPTokenIssuance ledger entry's
  // LedgerIndex (Hash256, 64 chars). Subsequent MPTokenAuthorize / Payment
  // txs expect this UINT192 form.
  const meta = createResult.result.meta as unknown as { mpt_issuance_id?: string } | undefined;
  const mptIssuanceId = meta?.mpt_issuance_id;
  if (!mptIssuanceId) {
    throw new Error("MPTokenIssuanceCreate succeeded but mpt_issuance_id missing from metadata");
  }

  await Promise.all([
    submitTransaction(brokerWallet, {
      TransactionType: "MPTokenAuthorize",
      Account: brokerWallet.classicAddress,
      MPTokenIssuanceID: mptIssuanceId,
    }),
    submitTransaction(depositorWallet, {
      TransactionType: "MPTokenAuthorize",
      Account: depositorWallet.classicAddress,
      MPTokenIssuanceID: mptIssuanceId,
    }),
    submitTransaction(borrowerWallet, {
      TransactionType: "MPTokenAuthorize",
      Account: borrowerWallet.classicAddress,
      MPTokenIssuanceID: mptIssuanceId,
    }),
  ]);

  const distributionMptValue = String(
    Math.round(parseFloat(DEMO_TOKEN_DISTRIBUTION) * MPT_SCALE_MULTIPLIER)
  );
  const client = await getXrplClient();
  for (const recipient of [depositorWallet, borrowerWallet, brokerWallet]) {
    const paymentTx = {
      TransactionType: "Payment",
      Account: issuerAddress,
      Destination: recipient.classicAddress,
      Amount: { mpt_issuance_id: mptIssuanceId, value: distributionMptValue },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prepared = await client.autofill(withSourceTag(paymentTx) as any);
    const signed = issuerWallet.sign(prepared);
    await client.submitAndWait(signed.tx_blob);
  }

  return { mptIssuanceId };
}
