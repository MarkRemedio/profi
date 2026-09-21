import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * The CSRF state carried through the HMRC authorisation journey.
 *
 * Signed rather than stored: the value has to survive a round trip through
 * HMRC's servers and come back intact, and a signature proves we issued it
 * without needing a table of pending journeys to expire.
 *
 * The organisation id travels inside the signed payload. Without it, somebody
 * could start the journey in a workspace they own and finish it after switching
 * to another, binding their HMRC grant to a different company's books.
 */

export const STATE_COOKIE = "hmrc_oauth_state";
/** Long enough to sign in at HMRC and clear their MFA, short enough to be useless later. */
export const STATE_TTL_SECONDS = 15 * 60;

export function stateSecret(): string | null {
  // Reuses an existing signing secret rather than demanding another variable:
  // both sign short-lived, server-issued values that never leave this app.
  return process.env.IMPERSONATION_SECRET ?? process.env.HMRC_TOKEN_KEY ?? null;
}

export function signState(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function buildState(organizationId: string, nonce: string, secret: string): string {
  const payload = `${organizationId}.${nonce}`;
  return `${payload}.${signState(payload, secret)}`;
}

/** Constant-time compare, so a signature cannot be recovered a byte at a time. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export type StateCheck =
  | { ok: true; organizationId: string }
  | { ok: false; reason: "malformed" | "signature" };

/**
 * Verify a returned state and recover the organisation it was issued for.
 *
 * The caller must *also* confirm the value matches the cookie it set — this
 * function proves the state is ours and unmodified, not that it belongs to this
 * particular browser session.
 */
export function verifyState(state: string, secret: string): StateCheck {
  const [organizationId, nonce, signature] = state.split(".");
  if (!organizationId || !nonce || !signature) return { ok: false, reason: "malformed" };
  if (!safeEqual(signature, signState(`${organizationId}.${nonce}`, secret))) {
    return { ok: false, reason: "signature" };
  }
  return { ok: true, organizationId };
}
