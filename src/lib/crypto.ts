import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Application-level encryption for wallet secrets (seed, privateKey) at rest.
 *
 * Threat model: a leaked MongoDB dump. The key lives in the
 * `WALLET_ENCRYPTION_KEY` env var — separate from the database — so possession
 * of the data alone cannot recover secrets. Signing stays server-side: secrets
 * are decrypted only in-memory at the moment a transaction is signed, never
 * persisted in the clear and never sent to the client.
 *
 * Stored format: `v1:<iv_b64>:<tag_b64>:<ciphertext_b64>` (AES-256-GCM).
 * The `v1:` prefix versions the scheme so the algorithm/key can be rotated
 * later. base64 never contains ':', so splitting on ':' is safe.
 */

const VERSION = "v1";
const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // 96-bit nonce — the recommended size for GCM.

let cachedKey: Buffer | null = null;

/**
 * Decode and validate the encryption key on first use. Lazy (not at import)
 * so `next build`, which never touches secrets, does not require the key to be
 * present. Fails loudly the first time a secret is encrypted or decrypted.
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;
  const raw = process.env.WALLET_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error(
      "WALLET_ENCRYPTION_KEY is not set — required to encrypt/decrypt wallet secrets. " +
        "Generate one with: openssl rand -base64 32"
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      `WALLET_ENCRYPTION_KEY must decode to 32 bytes for AES-256 (got ${key.length}). ` +
        "Generate one with: openssl rand -base64 32"
    );
  }
  cachedKey = key;
  return key;
}

/** Encrypt a secret into the `v1:` envelope format. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    ciphertext.toString("base64"),
  ].join(":");
}

/**
 * Decrypt a `v1:` secret back to plaintext.
 *
 * Tolerant read: a value without the `v1:` prefix is assumed to be a
 * not-yet-migrated plaintext secret and returned unchanged. This lets the app
 * keep working during the migration window; it never re-writes plaintext.
 * A corrupted `v1:` value (bad GCM tag / malformed) throws — a silent
 * passthrough would mask a tampered database or a wrong key.
 */
export function decryptSecret(stored: string): string {
  if (!stored.startsWith(`${VERSION}:`)) return stored;

  const [, ivB64, tagB64, ctB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error("Malformed encrypted secret: expected v1:<iv>:<tag>:<ciphertext>");
  }
  const tag = Buffer.from(tagB64, "base64");
  // GCM accepts short tags (weaker forgery resistance); we always emit 16 bytes,
  // so reject anything else and pin the expected tag length on the decipher.
  if (tag.length !== 16) {
    throw new Error("Malformed encrypted secret: auth tag must be 16 bytes");
  }
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"), {
    authTagLength: 16,
  });
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
