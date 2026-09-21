import "server-only";

import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import nodemailer from "nodemailer";

import { prisma } from "@/lib/prisma";

export const OTP_EXPIRY_MS = 10 * 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;

export function requireOtpSecret(): string {
  const s = process.env.ADMIN_OTP_SECRET;
  if (!s) {
    throw new Error("ADMIN_OTP_SECRET is not set — required for admin login verification.");
  }
  return s;
}

export function generateOtpCode(): string {
  return randomInt(0, 1_000_000).toString().padStart(6, "0");
}

export function hashOtpCode(code: string, secret: string): string {
  return createHmac("sha256", secret).update(code).digest("hex");
}

export type OtpAttemptOutcome = "ok" | "expired" | "locked" | "mismatch";

/** Pure decision function so the policy is unit-testable without a DB. */
export function evaluateOtpAttempt(
  row: { codeHash: string; expiresAt: Date; attempts: number },
  submittedCode: string,
  secret: string,
  now: Date = new Date()
): OtpAttemptOutcome {
  if (row.expiresAt.getTime() <= now.getTime()) return "expired";
  if (row.attempts >= OTP_MAX_ATTEMPTS) return "locked";
  const submitted = Buffer.from(hashOtpCode(submittedCode, secret));
  const stored = Buffer.from(row.codeHash);
  if (submitted.length !== stored.length || !timingSafeEqual(submitted, stored)) {
    return "mismatch";
  }
  return "ok";
}

/**
 * Create (or replace) the admin's pending code and email it.
 * Throws on SMTP failure — the caller decides how to unwind the session.
 */
export async function issueAdminOtp(userId: string, email: string): Promise<void> {
  const secret = requireOtpSecret();
  const code = generateOtpCode();
  const now = new Date();
  const data = {
    codeHash: hashOtpCode(code, secret),
    expiresAt: new Date(now.getTime() + OTP_EXPIRY_MS),
    attempts: 0,
    createdAt: now,
  };

  await prisma.adminOtpCode.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    tls: { rejectUnauthorized: false },
  });

  await transporter.sendMail({
    from: `"WAWPROFI Cloud" <${process.env.SMTP_USER}>`,
    to: email,
    subject: `${code} is your WAWPROFI admin verification code`,
    html: otpEmailHtml(code),
  });
}

function otpEmailHtml(code: string) {
  return `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; padding: 40px 20px;">
      <div style="max-width: 520px; margin: 0 auto; background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 24px; padding: 40px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);">

        <div style="text-align: center; margin-bottom: 30px;">
          <div style="display: inline-block; background-color: #2563eb; color: #ffffff; font-weight: 900; font-size: 24px; width: 50px; height: 50px; line-height: 50px; border-radius: 14px;">W</div>
          <div style="color: #0f172a; font-size: 18px; font-weight: 900; margin-top: 16px; letter-spacing: -0.5px;">WAWPROFI</div>
        </div>

        <h2 style="color: #0f172a; font-size: 24px; font-weight: 800; text-align: center; margin: 0 0 24px; letter-spacing: -0.5px;">
          Admin verification code
        </h2>

        <p style="color: #475569; font-size: 15px; line-height: 1.6; margin-bottom: 24px; text-align: center;">
          Enter this code to finish signing in to the WAWPROFI admin portal.
        </p>

        <div style="text-align: center; margin-bottom: 24px;">
          <div style="display: inline-block; background-color: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 14px; padding: 16px 28px; font-size: 32px; font-weight: 900; letter-spacing: 10px; color: #0f172a;">${code}</div>
        </div>

        <p style="color: #64748b; font-size: 13px; line-height: 1.6; text-align: center; margin: 0;">
          The code expires in 10 minutes. If you did not try to sign in, someone
          may know your password — change it immediately.
        </p>
      </div>
    </div>
  `;
}
