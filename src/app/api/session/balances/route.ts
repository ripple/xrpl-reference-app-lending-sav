import { NextResponse } from "next/server";
import { getXrplClient } from "@/lib/xrpl/client";
import { getUserWallets } from "@/lib/user-wallets";
import { MPT_SCALE_MULTIPLIER } from "@/lib/constants";

export async function GET() {
  try {
    const session = await getUserWallets();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const client = await getXrplClient();
    const issuedToken = session.issuedToken;

    const wallets = await Promise.all(
      session.wallets.map(async (w: { address: string; role: string }) => {
        let balance = "0";
        let tokenBalance: string | undefined;

        // Fetch XRP balance
        try {
          const response = await client.request({
            command: "account_info",
            account: w.address,
            ledger_index: "validated",
          });
          balance = response.result.account_data.Balance;
        } catch { /* default 0 */ }

        // Fetch IOU/MPT balance if issued token exists
        if (issuedToken?.type === "IOU" && issuedToken.currency && issuedToken.issuer) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const linesRes = await (client as any).request({
              command: "account_lines",
              account: w.address,
              peer: issuedToken.issuer,
              ledger_index: "validated",
            });
            const line = linesRes.result?.lines?.find(
              (l: { currency: string }) => l.currency === issuedToken.currency
            );
            if (line && parseFloat(line.balance) > 0) {
              tokenBalance = parseFloat(line.balance).toFixed(2);
            }
          } catch { /* no trustline yet */ }
        } else if (issuedToken?.type === "MPT" && issuedToken.mptIssuanceId) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const objRes = await (client as any).request({
              command: "account_objects",
              account: w.address,
              type: "mptoken",
              ledger_index: "validated",
            });
            const mpt = objRes.result?.account_objects?.find(
              (o: { MPTokenIssuanceID: string }) =>
                o.MPTokenIssuanceID === issuedToken.mptIssuanceId
            );
            if (mpt && Number(mpt.MPTAmount) > 0) {
              tokenBalance = (Number(mpt.MPTAmount) / MPT_SCALE_MULTIPLIER).toFixed(2);
            }
          } catch { /* no MPT holding yet */ }
        }

        return { role: w.role, balance, tokenBalance };
      })
    );

    // Update XRP balances in DB
    for (const w of wallets) {
      const idx = session.wallets.findIndex(
        (sw: { role: string }) => sw.role === w.role
      );
      if (idx !== -1) {
        session.wallets[idx].balance = w.balance;
      }
    }
    await session.save();

    return NextResponse.json({ wallets });
  } catch (error) {
    console.error("Balance fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch balances" },
      { status: 500 }
    );
  }
}
