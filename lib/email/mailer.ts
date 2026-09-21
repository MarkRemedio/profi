import "server-only";

import nodemailer from "nodemailer";

/**
 * The SMTP transport, in one place.
 *
 * The same six-line config is currently copied into the admin OTP mailer, the
 * client invite, the accountant invite and the team invite. This is the shared
 * one for anything new; those can migrate when they are next touched.
 *
 * `rejectUnauthorized: false` matches what the existing call sites use — the
 * configured host presents a certificate Node will not otherwise accept.
 */
function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD },
    tls: { rejectUnauthorized: false },
    connectionTimeout: 5_000,
    greetingTimeout: 5_000,
    socketTimeout: 5_000,
  });
}

/** Authenticate with SMTP without sending a message. */
export async function verifyMailConnection(): Promise<void> {
  if (!isMailConfigured()) throw new Error("Email is not configured on this deployment.");
  await transporter().verify();
}

/**
 * Whether mail can be sent at all.
 *
 * Checked before offering to send rather than after failing to: a button that
 * promises delivery and cannot deliver is worse than one that is not there.
 */
export function isMailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

export async function sendMail(input: {
  to: string;
  /** Extra recipients (e.g. a customer's secondary contacts). */
  cc?: string[];
  subject: string;
  html: string;
  /** Shown as the sender name; defaults to the product. */
  fromName?: string;
  replyTo?: string;
  attachments?: Array<{ filename: string; content: Buffer; contentType: string }>;
}): Promise<void> {
  if (!isMailConfigured()) {
    throw new Error("Email is not configured on this deployment.");
  }

  await transporter().sendMail({
    from: `"${input.fromName ?? "WAWPROFI"}" <${process.env.SMTP_USER}>`,
    to: input.to,
    cc: input.cc && input.cc.length > 0 ? input.cc : undefined,
    replyTo: input.replyTo,
    subject: input.subject,
    html: input.html,
    attachments: input.attachments,
  });
}
