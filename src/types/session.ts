/** Server-internal wallet record loaded from MongoDB. Includes secrets. */
export interface WalletInfo {
  address: string;
  publicKey: string;
  privateKey: string;
  seed: string;
  role: "broker" | "depositor" | "borrower" | "issuer";
  balance?: string;
}

/** Wire shape of a wallet returned to the client — secrets are stripped. */
export interface PublicWallet {
  address: string;
  publicKey: string;
  role: "broker" | "depositor" | "borrower" | "issuer";
  balance?: string;
}

export interface IssuedToken {
  type: "IOU" | "MPT";
  currency?: string;
  issuer?: string;
  mptIssuanceId?: string;
}

/**
 * Shape of the user record as the client receives it. Keyed by Auth0 `sub`.
 * `wallets` excludes `seed` / `privateKey` (see `lib/session-public.ts:redactSession`).
 */
export interface Session {
  _id: string;
  auth0Sub: string;
  email: string;
  wallets: PublicWallet[];
  vaultId?: string;
  loanBrokerId?: string;
  issuedToken?: IssuedToken;
  createdAt: Date;
  updatedAt: Date;
}
