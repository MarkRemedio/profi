import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getMulticurrencyDefault, getOnboardingVisibility } from "@/lib/admin/platform-settings";
import { WorkspaceSetupView } from "@/components/onboarding/workspace-setup-view";
import { Suspense } from "react";
import { Loader2 } from "lucide-react";

export default async function OnboardingPage() {
  const supabase = await createClient();
  
  // 🛡️ SECURITY GATEWAY: User MUST be authenticated to see this page
  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    redirect("/login");
  }

  // 🚀 Pull the plan they selected during signup directly from their secure profile!
  // We add a fallback to "starter" just in case it's missing, to prevent crashes.
  const userPlan = user.user_metadata?.plan_code || "starter";

  // Platform switch set in Admin → Security → Onboarding.
  const { chartOfAccounts } = await getOnboardingVisibility();

  // Seeds the multicurrency choice rather than deciding it. The wizard now
  // asks, but an administrator who turned multicurrency on platform-wide
  // should still see it start switched on for new workspaces.
  const multicurrencyDefault = await getMulticurrencyDefault();

  // 🚀 Render the beautifully isolated client UI component
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    }>
      <WorkspaceSetupView
        planCode={userPlan}
        showChartOfAccounts={chartOfAccounts}
        multicurrencyDefault={multicurrencyDefault}
      />
    </Suspense>
  );
}