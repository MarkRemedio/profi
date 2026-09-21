import { createHmac, timingSafeEqual } from "node:crypto";

// Kept free of next/headers, Prisma, and nodemailer: this module is imported by
// the proxy, which must stay lean. Same body.sig HMAC format as impersonation.

export const ADMIN_OTP_COOKIE = "admin_otp";
export const ADMIN_OTP_COOKIE_TTL_MS = 12 * 60 * 60 * 1000;

export interface AdminOtpCookiePayload {
  /** Supabase user id the OTP was verified for. */
  sub: string;
  /** Expiry, epoch ms. */
  exp: number;
}

export function signAdminOtpCookie(payload: AdminOtpCookiePayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Returns null if absent, malformed, tampered, wrongly signed, or expired. */
export function verifyAdminOtpCookie(
  value: string | undefined,
  secret: string,
  now: number = Date.now()
): AdminOtpCookiePayload | null {
  if (!value || !secret) return null;
  const dot = value.indexOf(".");
  if (dot < 0) return null;
  const body = value.slice(0, dot);
  const sig = value.slice(dot + 1);
  const expected = createHmac("sha256", secret).update(body).digest("base64url");
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !timingSafeEqual(sigBuf, expBuf)) return null;
  try {
    const parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (typeof parsed?.sub !== "string" || typeof parsed?.exp !== "number") return null;
    if (parsed.exp <= now) return null;
    return parsed as AdminOtpCookiePayload;
  } catch {
    return null;
  }
}
