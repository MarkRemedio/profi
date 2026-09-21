import { redirect } from "next/navigation";
import { cookies } from "next/headers"; // 🚀 Fix: Add the missing cookies import!
import { WorkspaceShell } from "@/components/accounting/workspace-shell";
import { readImpersonation } from "@/lib/admin/impersonation";
import { isPlatformAdmin } from "@/lib/admin/auth";
import { prisma } from "@/lib/prisma";
import { runAsSystem } from "@/lib/tenancy/context";
import { createClient } from "@/lib/supabase/server"; 
import { openBillingPortal, signOutLockedUser } from "@/app/(dashboard)/billing.actions"; // 🚀 Add this! 
import { getNavPreferences } from "@/app/(dashboard)/nav-preference-actions";

export default async function DashboardMasterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  
  // 🚀 1. Fetch the real logged-in user from Supabase
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // 🔒 THE TRAPDOOR: Check if 2FA code is missing
  const { data: mfaData } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (mfaData?.currentLevel === 'aal1' && mfaData?.nextLevel === 'aal2') {
    
    // 🚀 READ COOKIES: Check if this user checked "Remember Me" on this device
    const cookieStore = await cookies();
    const trustedUserId = cookieStore.get("wawprofi_trusted_device")?.value;
    
    // ONLY boot them out if the trusted device cookie is missing or invalid!
    if (trustedUserId !== user?.id) {
      redirect("/login");
    }
  }

  let currentUser = null;
  if (user) {
    currentUser = {
      // 🚀 Added user_metadata?.name to catch standard Supabase dashboard string values!
      name: user.user_metadata?.display_name || user.user_metadata?.full_name || user.user_metadata?.name || user.email?.split('@')[0] || "User",
      email: user.email || ""
    };
  }

  // 2. Read your teammate's encrypted session pass
  const impersonation = await readImpersonation();
  let impersonationData: any = null;

  if (impersonation) {
    const org = await runAsSystem(() =>
      prisma.organization.findUnique({
        where: { id: impersonation.orgId },
        include: {
          subscriptionPlan: true,
          members: {
            where: { role: "OWNER" },
            include: { users: true },
          },
        },
      })
    );

    if (org) {
      impersonationData = {
        name: org.name,
        email: org.members[0]?.users?.email || "No email provided",
        plan: org.subscriptionPlan?.name || org.tier || "Trial",
        features: org.features, 
      };
    }
  }

  // 🕵️‍♂️ 3. DYNAMIC WORKSPACE LOOKUP: Locate the active organization ID
  let activeOrgId = impersonation?.orgId;

  // 🕵️‍♂️ 3. DYNAMIC WORKSPACE LOOKUP & SUBSCRIPTION CHECK
  let orgBillingDetails = null;
  let activeCustomFeatures: string[] = []; 
  let activeRole: string | null = null; // 🚀 NEW: Variable to hold the exact database role

  if (!activeOrgId && user) {
    const userOrg = await prisma.organization.findFirst({
      where: {
        members: { some: { userId: user.id } }
      },
      select: { 
        id: true,
        subscription_status: true,
        trialEndsAt: true,
        cancelAtPeriodEnd: true,
        currentPeriodEnd: true,
        stripeCustomerId: true,
        members: { // 🚀 NEW: Pull the user's specific role & features from the UserRole table
          where: { userId: user.id },
          select: { role: true, customFeatures: true }
        }
      }
    });
    activeOrgId = userOrg?.id;
    orgBillingDetails = userOrg;
    
    // Extract the features and exact role from the database result
    if (userOrg?.members?.[0]) {
      if (userOrg.members[0].customFeatures) {
        activeCustomFeatures = userOrg.members[0].customFeatures;
      }
      if (userOrg.members[0].role) {
        activeRole = userOrg.members[0].role; // 🚀 GRAB EXACT ROLE FROM DB
      }
    }
  }

  // 📊 4. LEDGER ENGINE: Fetch the lightweight accounts array for the onboarding checklist
  let accounts: any[] = [];
  /* The currency every amount below is formatted in. Read here rather than left
     to the shell, which fetches the organisation in an effect — so until that
     came back the provider fell through to its GBP default and the whole app
     rendered a second of sterling before flipping to the real currency. Two
     more columns on a query already being made. */
  let serverCurrency: { currency: string; multicurrencyEnabled: boolean } | null = null;
  if (activeOrgId) {
    const orgData = await runAsSystem(() =>
      prisma.organization.findUnique({
        where: { id: activeOrgId },
        select: {
          baseCurrency: true,
          multicurrencyEnabled: true,
          accounts: {
            select: { id: true, accountType: true } // We only pull what the checklist needs!
          }
        }
      })
    );
    accounts = orgData?.accounts || [];
    if (orgData) {
      serverCurrency = {
        currency: orgData.baseCurrency,
        multicurrencyEnabled: orgData.multicurrencyEnabled,
      };
    }
  }

  // 🔒 5. THE SUBSCRIPTION PAYWALL
  let isLockedOut = false;

  // If you are impersonating (Admin), you never get locked out!
  if (!impersonationData) {
    
    // 🛡️ ZERO-WORKSPACE GUARD:
    // If they have no organization record in the database at all, they haven't paid yet!
    // Bounce them straight to onboarding instantly on the server side—zero visual flash.
    if (!orgBillingDetails) {
      // Platform admins are staff, not customers — they have no workspace by
      // design, so sending them to onboarding would ask them to create one.
      // Anyone who is both an admin and a customer has orgBillingDetails and
      // never reaches this branch.
      if (isPlatformAdmin(user)) {
        redirect("/admin");
      }
      redirect("/onboarding");
    }

    const { subscription_status, trialEndsAt } = orgBillingDetails;

    if (subscription_status === "incomplete") {
      redirect("/onboarding");
    }

    const now = new Date();

    // Did an admin manually grant them a free trial extension?
    const hasValidManualTrial = trialEndsAt && trialEndsAt > now;

    // If they have no valid manual trial AND their Stripe status is dead, lock them out!
    if (!hasValidManualTrial && ['past_due', 'canceled', 'unpaid'].includes(subscription_status)) {
      isLockedOut = true;
    }
  }

  if (isLockedOut) {
    return (
      <div className="min-h-screen w-full bg-slate-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 max-w-md w-full p-8 text-center space-y-6">
          <div className="size-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
          </div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">Payment Required</h2>
          <p className="text-slate-500 font-medium text-sm leading-relaxed">
            Your workspace subscription has expired or a recent payment failed. Please update your billing information to restore full access to your ledger.
          </p>
          <div className="pt-4 space-y-3">
            {/* 🚀 FORM 1: Open Stripe Portal */}
            <form action={openBillingPortal.bind(null, orgBillingDetails?.stripeCustomerId)}>
              <button type="submit" className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3.5 rounded-xl shadow-md transition-all active:scale-95">
                Open Billing Portal
              </button>
            </form>

            {/* 🚀 FORM 2: Secure Sign Out */}
            <form action={signOutLockedUser}>
              <button type="submit" className="w-full bg-white hover:bg-slate-50 border border-slate-200 text-slate-600 font-bold py-3.5 rounded-xl transition-all active:scale-95">
                Sign Out
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // 🚀 6. If they paid, let them into the app normally!
  /* Read here rather than fetched by the shell, so the value is in the first
     render instead of arriving a moment later and moving the menu. */
  const navPreferences = await getNavPreferences();

  return (
    <WorkspaceShell
      navPreferences={navPreferences} 
      impersonation={impersonationData} 
      currentUser={currentUser} 
      accounts={accounts} 
      customFeatures={activeCustomFeatures}
      serverCurrency={serverCurrency}
      serverRole={activeRole} // 🚀 PASS THE EXACT ROLE TO THE FRONTEND
    >
      {children}
    </WorkspaceShell>
  );
}