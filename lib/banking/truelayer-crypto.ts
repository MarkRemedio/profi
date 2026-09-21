import "server-only";

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12;
const VERSION = "v1";

function encryptionKey(): Buffer {
  const secret = process.env.TRUELAYER_TOKEN_KEY;
  if (!secret) {
    throw new Error(
      "TRUELAYER_TOKEN_KEY is not set. TrueLayer credentials are never stored unencrypted.",
    );
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function trueLayerTokenEncryptionConfigured(): boolean {
  return Boolean(process.env.TRUELAYER_TOKEN_KEY);
}

export function encryptTrueLayerSecret(plaintext: string): string {
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, encryptionKey(), iv);
  const payload = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString("base64url"), tag.toString("base64url"), payload.toString("base64url")].join(".");
}

export function decryptTrueLayerSecret(stored: string): string {
  const [version, iv, tag, payload] = stored.split(".");
  if (version !== VERSION || !iv || !tag || !payload) {
    throw new Error("Stored TrueLayer credential is not in a recognised format.");
  }
  const decipher = createDecipheriv(ALGORITHM, encryptionKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(payload, "base64url")), decipher.final()]).toString("utf8");
}
