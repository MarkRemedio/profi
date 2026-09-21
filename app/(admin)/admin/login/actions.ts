"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";

import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin/auth";
import { ADMIN_OTP_COOKIE } from "@/lib/admin/otp-cookie";

export type AdminSignInState = { error?: string } | null;

export async function adminSignIn(
  prevState: AdminSignInState,
  formData: FormData
): Promise<AdminSignInState> {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  if (!email || !password) {
    return { error: "Admin email and security password are required." };
  }

  const supabase = await createClient();

  // signInWithPassword via the @supabase/ssr server client persists the
  // session as httpOnly cookies (this runs inside a Server Action).
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: error?.message || "Invalid administrative credentials." };
  }

  if (!isPlatformAdmin(data.user)) {
    await supabase.auth.signOut();
    return {
      error: "Access Denied: this account does not have platform-admin privileges.",
    };
  }

  // A suspended admin still holds the claim, so reject here with a real message
  // rather than letting the layout guard bounce them back to this page silently.
  const { prisma } = await import("@/lib/prisma");
  const profile = await prisma.adminProfile.findUnique({
    where: { userId: data.user.id },
    select: { status: true },
  });

  if (profile && profile.status !== "Active") {
    await supabase.auth.signOut();
    return { error: "This administrator account has been suspended." };
  }

  // Second factor: the password session alone cannot pass the proxy's OTP
  // cookie gate, so nothing under /admin is reachable until the emailed code
  // is verified. A failed send unwinds the session entirely.
  if (!data.user.email) {
    await supabase.auth.signOut();
    return { error: "This administrator account has no email address on file." };
  }

  const { issueAdminOtp } = await import("@/lib/admin/otp");
  try {
    await issueAdminOtp(data.user.id, data.user.email);
  } catch (sendError) {
    console.error("Failed to send admin verification code:", sendError);
    await supabase.auth.signOut();
    return { error: "Could not send the verification code email. Please try again." };
  }

  const { logAdminAction } = await import("@/lib/admin/audit");
  await logAdminAction({
    actor: { userId: data.user.id, email: data.user.email },
    action: "admin.otp_send",
    targetType: "admin",
    targetId: data.user.id,
  });

  // redirect() throws by design — keep it outside any try/catch.
  redirect("/admin/login/verify");
}

export async function adminSignOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  const store = await cookies();
  store.delete(ADMIN_OTP_COOKIE);
  redirect("/admin/login");
}
