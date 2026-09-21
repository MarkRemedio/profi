"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin/auth";
import {
  adminHomeHref,
  resolveAdminPermissions,
  type AdminRoleValue,
} from "@/lib/admin/permissions";
import {
  ADMIN_OTP_COOKIE,
  ADMIN_OTP_COOKIE_TTL_MS,
  signAdminOtpCookie,
} from "@/lib/admin/otp-cookie";

export type AdminOtpState = { error?: string; info?: string } | null;

export async function verifyAdminOtp(
  prevState: AdminOtpState,
  formData: FormData
): Promise<AdminOtpState> {
  const code = ((formData.get("code") as string | null) ?? "").trim();
  if (!/^\d{6}$/.test(code)) {
    return { error: "Enter the 6-digit code from your email." };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isPlatformAdmin(user)) {
    redirect("/admin/login");
  }

  const { prisma } = await import("@/lib/prisma");
  const { evaluateOtpAttempt, requireOtpSecret, OTP_MAX_ATTEMPTS } = await import(
    "@/lib/admin/otp"
  );
  const { logAdminAction } = await import("@/lib/admin/audit");

  const row = await prisma.adminOtpCode.findUnique({ where: { userId: user.id } });
  if (!row) {
    return { error: "No pending verification code. Use resend to get a new one." };
  }

  const actor = { userId: user.id, email: user.email ?? null };
  const outcome = evaluateOtpAttempt(row, code, requireOtpSecret());

  if (outcome === "expired") {
    return { error: "This code has expired. Request a new one below." };
  }
  if (outcome === "locked") {
    return { error: "Too many incorrect attempts. Request a new code below." };
  }
  if (outcome === "mismatch") {
    await prisma.adminOtpCode.update({
      where: { userId: user.id },
      data: { attempts: { increment: 1 } },
    });
    await logAdminAction({
      actor,
      action: "admin.otp_fail",
      targetType: "admin",
      targetId: user.id,
      severity: "warning",
    });
    const remaining = OTP_MAX_ATTEMPTS - (row.attempts + 1);
    return {
      error:
        remaining > 0
          ? `Incorrect code. ${remaining} attempt${remaining === 1 ? "" : "s"} remaining.`
          : "Too many incorrect attempts. Request a new code below.",
    };
  }

  await prisma.adminOtpCode.delete({ where: { userId: user.id } });

  const store = await cookies();
  store.set(
    ADMIN_OTP_COOKIE,
    signAdminOtpCookie(
      { sub: user.id, exp: Date.now() + ADMIN_OTP_COOKIE_TTL_MS },
      requireOtpSecret()
    ),
    { httpOnly: true, secure: true, sameSite: "lax", path: "/" }
  );

  await logAdminAction({
    actor,
    action: "admin.otp_verify",
    targetType: "admin",
    targetId: user.id,
  });

  // Land them on a module they actually hold (same logic the password stage
  // used before the OTP step was inserted).
  const profile = await prisma.adminProfile.findUnique({
    where: { userId: user.id },
    select: { role: true, permissions: true },
  });
  const destination = profile
    ? adminHomeHref(
        resolveAdminPermissions(profile.role as AdminRoleValue, profile.permissions)
      )
    : "/admin";

  // redirect() throws by design — keep it outside any try/catch.
  redirect(destination);
}

export async function resendAdminOtp(
  prevState: AdminOtpState,
  formData: FormData
): Promise<AdminOtpState> {
  void formData;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !isPlatformAdmin(user) || !user.email) {
    redirect("/admin/login");
  }

  const { prisma } = await import("@/lib/prisma");
  const { issueAdminOtp, OTP_RESEND_COOLDOWN_MS } = await import("@/lib/admin/otp");
  const { logAdminAction } = await import("@/lib/admin/audit");

  const existing = await prisma.adminOtpCode.findUnique({
    where: { userId: user.id },
  });
  if (existing && Date.now() - existing.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    return { error: "Please wait a minute before requesting another code." };
  }

  try {
    await issueAdminOtp(user.id, user.email);
  } catch (sendError) {
    console.error("Failed to resend admin verification code:", sendError);
    return { error: "Could not send the code. Please try again." };
  }

  await logAdminAction({
    actor: { userId: user.id, email: user.email },
    action: "admin.otp_send",
    targetType: "admin",
    targetId: user.id,
  });

  return { info: "A new code is on its way to your email." };
}
