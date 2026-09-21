import { redirect } from "next/navigation";
import { cookies } from "next/headers"; // 🚀 Import cookies tool
import { createClient } from "@/lib/supabase/server";
import { isPlatformAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { LoginView } from "@/components/marketing/login-view";

export const metadata = {
  title: "Sign In | Wawprofi Cloud Engine",
  description: "Provide your authentication credentials to open your ledger dashboard.",
};

export default async function LoginPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    let needs2FA = mfaData?.currentLevel === 'aal1' && mfaData?.nextLevel === 'aal2';

    // 🚀 THE FIX: If they have a valid trusted device cookie, bypass the 2FA requirement!
    if (needs2FA) {
      const cookieStore = await cookies();
      const trustedUserId = cookieStore.get("wawprofi_trusted_device")?.value;
      if (trustedUserId === user.id) {
        needs2FA = false; // Device is recognized, turn off the challenge gate!
      }
    }

    // Decided inside the try below, acted on outside it: redirect() signals by
    // throwing NEXT_REDIRECT, which the catch would otherwise swallow.
    let adminDestination: string | null = null;
    let customerNeedsOnboarding = false;

    // ONLY auto-redirect to the dashboard if they do not need to complete a step-up challenge
    if (!needs2FA) {
      try {
        const roles: any[] = await prisma.$queryRaw`SELECT id FROM user_roles WHERE user_id = ${user.id} LIMIT 1`;

        if (!roles || roles.length === 0) {
          // Platform admins are staff and never have a workspace — send them to
          // the admin portal instead of asking them to onboard as a customer.
          if (isPlatformAdmin(user)) {
            adminDestination = "/admin";
          } else {
            customerNeedsOnboarding = true;
          }
        }
      } catch (error) {
        console.error("Raw query check failed:", error);
      }

      if (adminDestination) redirect(adminDestination);
      if (customerNeedsOnboarding) redirect("/onboarding");

      redirect("/dashboard");
    }
  }

  return <LoginView />;
}