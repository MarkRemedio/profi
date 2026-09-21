import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const TRUELAYER_STATE_COOKIE = "truelayer_bank_feed_state";
export const TRUELAYER_STATE_TTL_SECONDS = 15 * 60;

type StatePayload = {
  connectionId: string;
  organizationId: string;
  /** Present only when renewing an already-created WAW Profi bank account. */
  bankAccountId?: string;
  expiresAt: number;
};

function secret(): string | null {
  return process.env.TRUELAYER_STATE_SECRET ?? null;
}

function signature(payload: string, signingSecret: string): string {
  return createHmac("sha256", signingSecret).update(payload).digest("base64url");
}

export function trueLayerStateConfigured(): boolean {
  return Boolean(secret());
}

export function buildTrueLayerState(input: Omit<StatePayload, "expiresAt">): string {
  const signingSecret = secret();
  if (!signingSecret) throw new Error("TRUELAYER_STATE_SECRET is not set.");
  const body = Buffer.from(JSON.stringify({ ...input, expiresAt: Date.now() + TRUELAYER_STATE_TTL_SECONDS * 1000 })).toString("base64url");
  return `${body}.${signature(body, signingSecret)}`;
}

export function verifyTrueLayerState(value: string): StatePayload | null {
  const signingSecret = secret();
  const [body, suppliedSignature] = value.split(".");
  if (!signingSecret || !body || !suppliedSignature) return null;
  const expectedSignature = signature(body, signingSecret);
  const received = Buffer.from(suppliedSignature);
  const expected = Buffer.from(expectedSignature);
  if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as StatePayload;
    if (!parsed.connectionId || !parsed.organizationId || parsed.expiresAt < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}
