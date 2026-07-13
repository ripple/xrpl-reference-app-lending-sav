import { NextResponse } from "next/server";
import { getXrplClient } from "@/lib/xrpl/client";
import { Wallet } from "xrpl";
import { getUserWallets } from "@/lib/user-wallets";
import { checkRateLimit, tooManyRequests } from "@/lib/rate-limit";
import { decryptSecret } from "@/lib/crypto";

export async function POST() {
  try {
    const session = await getUserWallets();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Faucet-backed — tighter cap than the shared tx bucket.
    const rl = await checkRateLimit(`topup:${session._id}`, 5, 600);
    if (!rl.ok) return tooManyRequests(rl.retryAfterSec);

    const client = await getXrplClient();

    const results = await Promise.all(
      session.wallets.map(async (w: { seed: string; role: string }) => {
        try {
          const wallet = Wallet.fromSeed(decryptSecret(w.seed));
          const { balance } = await client.fundWallet(wallet);
          return { role: w.role, balance: balance.toString(), funded: true };
        } catch (err) {
          console.error(`Failed to fund ${w.role}:`, err);
          return { role: w.role, balance: "0", funded: false };
        }
      })
    );

    const balances = await Promise.all(
      session.wallets.map(async (w: { address: string; role: string }) => {
        try {
          const response = await client.request({
            command: "account_info",
            account: w.address,
            ledger_index: "validated",
          });
          return { role: w.role, balance: response.result.account_data.Balance };
        } catch {
          return { role: w.role, balance: "0" };
        }
      })
    );

    for (const b of balances) {
      const idx = session.wallets.findIndex(
        (sw: { role: string }) => sw.role === b.role
      );
      if (idx !== -1) session.wallets[idx].balance = b.balance;
    }
    await session.save();

    return NextResponse.json({
      success: results.every((r) => r.funded),
      wallets: balances,
    });
  } catch (error) {
    console.error("Topup error:", error);
    return NextResponse.json({ error: "Failed to top up wallets" }, { status: 500 });
  }
}
