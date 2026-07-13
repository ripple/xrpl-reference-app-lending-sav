/**
 * Strip secret fields from a UserWallets document before sending it to the
 * client. Wallet `seed` and `privateKey` are server-only — they must never
 * appear in JSON responses.
 *
 * The XRPL accounts are custodial server-side, so the client never needs
 * the seeds; signing happens in API routes.
 */

interface RawWallet {
  role: string;
  address: string;
  publicKey?: string;
  privateKey?: string;
  seed?: string;
  balance?: string;
}

interface RawUserWallets {
  _id?: unknown;
  auth0Sub?: string;
  email?: string;
  wallets?: RawWallet[];
  vaultId?: string;
  loanBrokerId?: string;
  issuedToken?: unknown;
  createdAt?: Date;
  updatedAt?: Date;
  toObject?: () => RawUserWallets;
}

export function redactSession(doc: unknown): Record<string, unknown> {
  if (!doc || typeof doc !== "object") return {};
  const raw = doc as RawUserWallets;
  const obj = typeof raw.toObject === "function" ? raw.toObject() : { ...raw };

  if (Array.isArray(obj.wallets)) {
    obj.wallets = obj.wallets.map((w) => {
      const copy = { ...w };
      delete copy.seed;
      delete copy.privateKey;
      return copy;
    });
  }

  return obj as Record<string, unknown>;
}
