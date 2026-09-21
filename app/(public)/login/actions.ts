"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";

export type SignInState = { 
  error: string | null; 
  requires2FA?: boolean; 
  factorId?: string; 
} | null;

export async function signIn(
  _prevState: SignInState,
  formData: FormData
): Promise<SignInState> {
  const email = formData.get("email");
  const password = formData.get("password");

  if (typeof email !== "string" || typeof password !== "string" || !email || !password) {
    return { error: "Email and password are required." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: error.message };
  }

  if (data.session && data.user) {
    // 🚀 Force-sync session token into local execution memory
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    // Fetch active factors directly from the clean session
    const { data: factors } = await supabase.auth.mfa.listFactors();
    const totpFactor = factors?.totp.find(f => f.status === 'verified');
    
    if (totpFactor) {
      // 🚀 PRODUCTION READY: Read cookies to see if this browser window is trusted
      const cookieStore = await cookies();
      const trustedUserId = cookieStore.get("wawprofi_trusted_device")?.value;
      
      // 🔒 If the cookie is missing or belongs to a different user, trigger 2FA!
      if (trustedUserId !== data.user.id) {
        return { error: null, requires2FA: true, factorId: totpFactor.id };
      }
    }
  }

  // Workspace redirection verification pipeline
  if (data.user) {
    const hasWorkspace = await runAsSystem(async () => {
      return await prisma.userRole.findFirst({
        where: { userId: data.user.id }
      });
    });

    if (!hasWorkspace) {
      // Platform admins are staff and have no workspace by design — send them
      // to the admin portal rather than into customer onboarding.
      if (isPlatformAdmin(data.user)) {
        redirect("/admin");
      }
      redirect("/onboarding");
    }
  }

  redirect("/dashboard");
}

export async function verify2FACode(factorId: string, code: string, rememberMe: boolean) {
  const supabase = await createClient();
  
  // 1. Open the time-sensitive challenge window
  const challenge = await supabase.auth.mfa.challenge({ factorId });
  if (challenge.error) return { error: challenge.error.message };

  // 2. Verify the typed code
  const verify = await supabase.auth.mfa.verify({
    factorId,
    challengeId: challenge.data.id,
    code
  });

  if (verify.error) return { error: "Invalid 6-digit code. Please try again." };

  // 3. Success! Now check the workspace and redirect them in
  const { data: { user } } = await supabase.auth.getUser();
  if (user) {
    
    // If "Remember Me" was checked, drop a secure 7-day browser cookie!
    if (rememberMe) {
      const cookieStore = await cookies();
      cookieStore.set("wawprofi_trusted_device", user.id, {
        maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      });
    }

    const hasWorkspace = await runAsSystem(async () => {
      return await prisma.userRole.findFirst({
        where: { userId: user.id }
      });
    });
    if (!hasWorkspace) {
      // Same staff-vs-customer split as the password path above.
      if (isPlatformAdmin(user)) redirect("/admin");
      redirect("/onboarding");
    }
  }
  
  redirect("/dashboard");
}