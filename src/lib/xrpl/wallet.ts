import { Wallet } from "xrpl";
import { getXrplClient } from "./client";
import { XRPL_FAUCET_URL } from "@/lib/constants";

export async function generateAndFundWallet(): Promise<{
  address: string;
  publicKey: string;
  privateKey: string;
  seed: string;
  balance: string;
}> {
  const client = await getXrplClient();
  const { wallet, balance } = await client.fundWallet(null, {
    faucetHost: new URL(XRPL_FAUCET_URL).host,
    faucetPath: new URL(XRPL_FAUCET_URL).pathname,
  });
  return {
    address: wallet.classicAddress,
    publicKey: wallet.publicKey,
    privateKey: wallet.privateKey,
    seed: wallet.seed!,
    balance: balance.toString(),
  };
}

export function walletFromSeed(seed: string): Wallet {
  return Wallet.fromSeed(seed);
}
