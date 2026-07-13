import { NextResponse } from "next/server";
import {
  UserWalletsModel,
  VaultModel,
  LoanModel,
  DepositHistoryModel,
} from "@/lib/db";
import { getUserWallets } from "@/lib/user-wallets";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";

/**
 * Wipe the current session so the next /api/session/me re-provisions fresh
 * wallets. On-chain objects (vault/broker/loans) are abandoned — devnet only.
 */
export async function POST() {
  try {
    const session = await getUserWallets();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Reset triggers faucet re-provisioning on the next /api/session/me — cap it.
    const rl = await checkRateLimit(`reset:${session._id}`, 3, 600);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

    // Delete children first so nothing references a removed UserWallets._id.
    await Promise.all([
      VaultModel.deleteMany({ sessionId: session._id }),
      LoanModel.deleteMany({ sessionId: session._id }),
      DepositHistoryModel.deleteMany({ sessionId: session._id }),
    ]);
    await UserWalletsModel.deleteOne({ _id: session._id });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Session reset error:", error);
    return NextResponse.json({ error: "Failed to reset session" }, { status: 500 });
  }
}
