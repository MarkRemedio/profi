import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption for HMRC OAuth tokens at rest.
 *
 * A refresh token is a long-lived credential: it authorises filing VAT returns
 * on a real business's behalf, and HMRC issues them with an 18-month life. A
 * database backup or a stray query result must not hand that over, so tokens
 * are sealed before they are written and only opened in memory when a call is
 * about to be made.
 *
 * AES-256-GCM rather than CBC, so the ciphertext is authenticated — a tampered
 * row fails to decrypt instead of yielding a corrupted token that would be sent
 * to HMRC.
 *
 * The stored form is versioned (`v1.iv.tag.ciphertext`) so the algorithm or key
 * derivation can change later without guessing at what old rows contain.
 */

const ALGORITHM = "aes-256-gcm";
/** 96 bits is the nonce size GCM is specified for. */
const IV_BYTES = 12;
const VERSION = "v1";

/**
 * Hashed to exactly 32 bytes so any length of configured secret works, while a
 * short one is still obviously a weak choice rather than a crash.
 */
function encryptionKey(): Buffer {
  const secret = process.env.HMRC_TOKEN_KEY;
  if (!secret) {
    throw new Error(
      "HMRC_TOKEN_KEY is not set. HMRC tokens are never stored unencrypted, so connecting is refused until it is configured.",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

/**
 * Whether tokens can be stored at all.
 *
 * Checked before the OAuth journey starts, so somebody is told to configure the
 * key up front rather than after they have authorised at HMRC and come back to
 * a failure.
 */
export function tokenEncryptionConfigured(): boolean {
  return Boolean(process.env.HMRC_TOKEN_KEY);
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const sealed = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    VERSION,
    iv.toString("base64url"),
    tag.toString("base64url"),
    sealed.toString("base64url"),
  ].join(".");
}

/** Throws on a tampered or unreadable value — never returns a partial token. */
export function decryptToken(stored: string): string {
  const [version, iv, tag, payload] = stored.split(".");
  if (version !== VERSION || !iv || !tag || !payload) {
    throw new Error("Stored HMRC token is not in a recognised format.");
  }

  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
