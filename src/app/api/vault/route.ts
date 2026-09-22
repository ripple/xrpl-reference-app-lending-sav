import { NextRequest, NextResponse } from "next/server";
import { UserWalletsModel, VaultModel } from "@/lib/db";
import {
  buildVaultCreate,
  submitTransaction,
  getVaultInfo,
} from "@/lib/xrpl/vault";
import { setupIOU, setupMPT } from "@/lib/xrpl/issuer";
import {
  getRoleWallet,
  extractCreatedLedgerId,
  fetchVaultSnapshot,
  unscaleVaultNodeForMPT,
  humanToMptUnits,
  getValidatedCloseTime,
} from "@/lib/xrpl/helpers";
import {
  validateDrops,
  validateAmount,
  validateNumber,
  sanitizeString,
} from "@/lib/validation";
import {
  DEFAULT_INVESTMENT_SECONDS,
  DEFAULT_SUBSCRIPTION_SECONDS,
  MAX_VAULT_TERM_SECONDS,
  MIN_INVESTMENT_SECONDS,
  MIN_SUBSCRIPTION_SECONDS,
} from "@/lib/constants";
import { getUserWallets } from "@/lib/user-wallets";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import {
  MPT_ASSET_CLASSES,
  MPT_ASSET_SUBCLASSES,
  MPT_TICKER_RE,
} from "@/lib/xrpl/mpt-metadata";

export async function POST(request: NextRequest) {
  try {
    const session = await getUserWallets();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const rl = await checkRateLimit(`tx:${session._id}`, 30, 60);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);
    const body = await request.json();
    const raw = body.vaultOptions || {};

    const vaultOptions: Record<string, unknown> = {};
    if (raw.name) vaultOptions.name = sanitizeString(raw.name, 64);
    if (raw.website) vaultOptions.website = sanitizeString(raw.website, 128);
    if (raw.nonTransferableShares) vaultOptions.nonTransferableShares = true;

    // Closed-ended lifecycle (LendingProtocolV1_1): LoanBrokerSet is rejected
    // with tecNO_PERMISSION on an open-ended vault, so every vault is created
    // closed-ended. Validate the durations here, before the IOU/MPT bootstrap
    // submits anything, so bad input has no on-ledger side effects.
    const subscriptionSeconds = validateNumber(
      raw.subscriptionSeconds ?? DEFAULT_SUBSCRIPTION_SECONDS,
      MIN_SUBSCRIPTION_SECONDS,
      MAX_VAULT_TERM_SECONDS - 1
    );
    if (subscriptionSeconds === null || !Number.isInteger(subscriptionSeconds)) {
      return NextResponse.json(
        {
          error: `subscriptionSeconds must be an integer between ${MIN_SUBSCRIPTION_SECONDS} and ${MAX_VAULT_TERM_SECONDS - 1}`,
        },
        { status: 400 }
      );
    }
    const investmentSeconds = validateNumber(
      raw.investmentSeconds ?? DEFAULT_INVESTMENT_SECONDS,
      MIN_INVESTMENT_SECONDS,
      MAX_VAULT_TERM_SECONDS - 1
    );
    if (investmentSeconds === null || !Number.isInteger(investmentSeconds)) {
      return NextResponse.json(
        {
          error: `investmentSeconds must be an integer between ${MIN_INVESTMENT_SECONDS} and ${MAX_VAULT_TERM_SECONDS - 1}`,
        },
        { status: 400 }
      );
    }

    const brokerWallet = getRoleWallet(session, "broker");

    const assetType = raw.asset?.type;

    // assetsMaximum must match the vault's asset denomination:
    //   XRP → integer drops; IOU → decimal value; MPT → integer scaled by AssetScale.
    if (raw.assetsMaximum) {
      if (assetType === "MPT") {
        const valid = validateAmount(raw.assetsMaximum);
        if (valid) vaultOptions.assetsMaximum = humanToMptUnits(valid);
      } else if (assetType === "IOU") {
        const valid = validateAmount(raw.assetsMaximum);
        if (valid) vaultOptions.assetsMaximum = valid;
      } else {
        const valid = validateDrops(raw.assetsMaximum);
        if (valid) vaultOptions.assetsMaximum = valid;
      }
    }
    let assetRecord: { currency: string; issuer?: string; mptIssuanceId?: string } = {
      currency: "XRP",
    };

    // XRP vault: make sure no prior issuedToken lingers on the session.
    if (assetType !== "IOU" && assetType !== "MPT") {
      await UserWalletsModel.findByIdAndUpdate(session._id, { $unset: { issuedToken: 1 } });
    }

    if (assetType === "IOU" || assetType === "MPT") {
      const issuerWallet = getRoleWallet(session, "issuer");
      const depositorWallet = getRoleWallet(session, "depositor");
      const borrowerWallet = getRoleWallet(session, "borrower");

      if (assetType === "IOU") {
        const iou = await setupIOU(issuerWallet, brokerWallet, depositorWallet, borrowerWallet);
        vaultOptions.asset = { type: "IOU", currency: iou.currency, issuer: iou.issuer };
        assetRecord = { currency: iou.currency, issuer: iou.issuer };
        await UserWalletsModel.findByIdAndUpdate(session._id, {
          issuedToken: { type: "IOU", currency: iou.currency, issuer: iou.issuer },
        });
      } else {
        const mpt = await setupMPT(issuerWallet, brokerWallet, depositorWallet, borrowerWallet);
        vaultOptions.asset = { type: "MPT", mptIssuanceId: mpt.mptIssuanceId };
        assetRecord = { currency: "TUSD", mptIssuanceId: mpt.mptIssuanceId };
        await UserWalletsModel.findByIdAndUpdate(session._id, {
          issuedToken: { type: "MPT", mptIssuanceId: mpt.mptIssuanceId },
        });
      }
    }

    // Share token metadata. The MPT schema requires ticker, name, icon,
    // asset_class and issuer_name; we make ticker, name, asset_class and
    // issuer_name mandatory (icon/description stay optional for the demo) and
    // validate server-side regardless of the client.
    const rawSm = raw.shareMetadata;
    if (!rawSm) {
      return NextResponse.json(
        { error: "Share token metadata is required" },
        { status: 400 }
      );
    }
    const ticker = sanitizeString(rawSm.ticker ?? "", 6).toUpperCase();
    const shareName = sanitizeString(rawSm.name ?? "", 64);
    const issuerName = sanitizeString(rawSm.issuerName ?? "", 64);
    const shareAssetClass = sanitizeString(rawSm.assetClass ?? "", 16);
    const shareAssetSubclass = sanitizeString(rawSm.assetSubclass ?? "", 16);

    if (!MPT_TICKER_RE.test(ticker)) {
      return NextResponse.json(
        { error: "Ticker must be 1-6 uppercase letters or digits" },
        { status: 400 }
      );
    }
    if (!shareName) {
      return NextResponse.json(
        { error: "Share token name is required" },
        { status: 400 }
      );
    }
    if (!issuerName) {
      return NextResponse.json(
        { error: "Issuer name is required" },
        { status: 400 }
      );
    }
    if (!(MPT_ASSET_CLASSES as readonly string[]).includes(shareAssetClass)) {
      return NextResponse.json({ error: "Invalid asset class" }, { status: 400 });
    }
    if (
      shareAssetClass === "rwa" &&
      !(MPT_ASSET_SUBCLASSES as readonly string[]).includes(shareAssetSubclass)
    ) {
      return NextResponse.json(
        { error: "Asset subclass is required for real-world assets" },
        { status: 400 }
      );
    }

    const sm: Record<string, string> = {
      ticker,
      name: shareName,
      issuerName,
      assetClass: shareAssetClass,
    };
    if (shareAssetClass === "rwa") sm.assetSubclass = shareAssetSubclass;
    if (rawSm.description) sm.description = sanitizeString(rawSm.description, 256);
    if (rawSm.icon) sm.icon = sanitizeString(rawSm.icon, 128);
    vaultOptions.shareMetadata = sm;

    // Anchor the closed-ended schedule to the validated ledger close time (not
    // the server clock, so skew can't yield tecEXPIRED). Computed last, after
    // any IOU/MPT bootstrap, so the window isn't eaten by those txs.
    const subscriptionDate = (await getValidatedCloseTime()) + subscriptionSeconds;
    const redemptionDate = subscriptionDate + investmentSeconds;
    vaultOptions.subscriptionDate = subscriptionDate;
    vaultOptions.redemptionDate = redemptionDate;

    const tx = buildVaultCreate(brokerWallet.classicAddress, vaultOptions);
    const result = await submitTransaction(brokerWallet, tx);
    const vaultId = extractCreatedLedgerId(result, "Vault");
    if (!vaultId) {
      return NextResponse.json(
        { error: "Vault created but ID not found in metadata" },
        { status: 500 }
      );
    }

    const snapshot = await fetchVaultSnapshot(vaultId);
    const vault = await VaultModel.create({
      sessionId: session._id,
      vaultId,
      ownerAddress: brokerWallet.classicAddress,
      asset: assetRecord,
      totalDeposited: snapshot?.assetsTotal || "0",
      sharesMinted: snapshot?.sharesMinted || "0",
      status: "active",
    });

    await UserWalletsModel.findByIdAndUpdate(session._id, { vaultId });

    return NextResponse.json({ vault, result: result.result }, { status: 201 });
  } catch (error) {
    console.error("Vault creation error:", error);
    return NextResponse.json({ error: "Failed to create vault" }, { status: 500 });
  }
}

export async function GET() {
  try {
    const session = await getUserWallets();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const isMPT = session?.issuedToken?.type === "MPT";
    const vaults = await VaultModel.find({ sessionId: session._id, status: "active" });

    const enriched = await Promise.all(
      vaults.map(async (v) => {
        const doc = v.toObject();
        try {
          const info = await getVaultInfo(doc.vaultId);
          const vaultNode = info.result?.vault || null;
          unscaleVaultNodeForMPT(vaultNode, isMPT);
          doc.onLedger = vaultNode;
        } catch {
          doc.onLedger = null;
        }
        return doc;
      })
    );

    return NextResponse.json({ vaults: enriched });
  } catch (error) {
    console.error("Vault list error:", error);
    return NextResponse.json({ error: "Failed to list vaults" }, { status: 500 });
  }
}
