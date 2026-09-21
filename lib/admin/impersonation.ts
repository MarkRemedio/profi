import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";

const COOKIE_NAME = "impersonation";

export interface ImpersonationPayload {
  orgId: string;
  adminUserId: string;
  sessionId: string;
  startedAt: number;
}

/** Sign a payload into a tamper-proof `body.signature` string. Pure — unit-testable. */
export function signPayload(payload: ImpersonationPayload, secret: string): string {
  const body = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sig = createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${sig}`;
}

/** Verify and decode a signed value. Returns null if absent, malformed, tampered, or wrongly signed. */
export function verifyPayload(
  value: string | undefined,
  secret: string
): ImpersonationPayload | null {
  if (!value) return null;
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
    if (
      typeof parsed?.orgId === "string" &&
      typeof parsed?.adminUserId === "string" &&
      typeof parsed?.sessionId === "string" &&
      typeof parsed?.startedAt === "number"
    ) {
      return parsed as ImpersonationPayload;
    }
    return null;
  } catch {
    return null;
  }
}

function requireSecret(): string {
  const s = process.env.IMPERSONATION_SECRET;
  if (!s) {
    throw new Error(
      "IMPERSONATION_SECRET is not set — required to start an impersonation session."
    );
  }
  return s;
}

export async function setImpersonation(payload: ImpersonationPayload): Promise<void> {
  const store = await cookies();
  store.set(COOKIE_NAME, signPayload(payload, requireSecret()), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
}

export async function readImpersonation(): Promise<ImpersonationPayload | null> {
  // Impersonation is simply disabled (never crashes /dashboard) when unconfigured.
  const secret = process.env.IMPERSONATION_SECRET;
  if (!secret) return null;
  const store = await cookies();
  return verifyPayload(store.get(COOKIE_NAME)?.value, secret);
}

export async function clearImpersonation(): Promise<void> {
  const store = await cookies();
  store.delete(COOKIE_NAME);
}
