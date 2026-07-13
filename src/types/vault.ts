export interface VaultState {
  sessionId: string;
  vaultId: string;
  ownerAddress: string;
  asset: { currency: string; issuer?: string; mptIssuanceId?: string };
  totalDeposited: string;
  sharesMinted: string;
  status: "active" | "deleted";
  createdAt: Date;
}
