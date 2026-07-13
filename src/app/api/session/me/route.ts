import { NextRequest, NextResponse } from "next/server";
import { getOrCreateUserWallets } from "@/lib/user-wallets";
import { UserWalletsModel } from "@/lib/db";
import { redactSession } from "@/lib/session-public";
import { RateLimitError, getClientIp, tooManyRequests } from "@/lib/rate-limit";

/**
 * Returns the caller's UserWallets document. On the FIRST authenticated
 * request after Auth0 signup, this is where the 4 XRPL testnet wallets are
 * provisioned (~5–10s). Subsequent calls are a single Mongo lookup.
 */
export async function GET(request: NextRequest) {
  let userWallets;
  try {
    userWallets = await getOrCreateUserWallets(getClientIp(request));
  } catch (error) {
    if (error instanceof RateLimitError) {
      return tooManyRequests(error.retryAfterSec);
    }
    throw error;
  }
  if (!userWallets) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Heal stale state: an issuedToken without a vault can only come from an
  // earlier IOU/MPT vault that was deleted. Leaving it on the record would
  // cause downstream code to mis-build Amount fields for a fresh XRP vault.
  if (userWallets.issuedToken && !userWallets.vaultId) {
    await UserWalletsModel.findByIdAndUpdate(userWallets._id, {
      $unset: { issuedToken: 1 },
    });
    userWallets.issuedToken = undefined;
  }

  return NextResponse.json({ session: redactSession(userWallets) });
}
