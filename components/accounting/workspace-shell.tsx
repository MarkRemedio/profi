"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom"; 
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { CurrencyProvider } from "@/components/currency-provider"; 

import { Sidebar } from "./sidebar";
import { BottomNav } from "./bottom-nav";
import { makeCanSeeMenu } from "./nav-visibility";
import { adoptSavedNavPreferences, useNavPosition } from "./use-nav-position";
import { useWorkspaceCurrency } from "./use-workspace-currency";
import { TopNav } from "./top-nav";
import { useChartOfAccounts } from "@/components/chart-of-accounts/use-chart-of-accounts";

export function WorkspaceShell({ 
  children,
  impersonation,
  currentUser,
  accounts = [], 
  customFeatures = [], 
  serverRole = null, // 🚀 NEW: Accept the role directly from the server layout
  serverCurrency = null,
  navPreferences,
}: { 
  children: React.ReactNode;
  impersonation?: { name: string; email: string; plan: string; features?: string[] } | null; 
  currentUser?: { name: string; email: string } | null; 
  accounts?: any[]; 
  customFeatures?: string[]; 
  serverRole?: string | null; // 🚀 Add TypeScript definition
  /**
   * The workspace's currency as the server already knows it, so the first paint
   * is correct. Without it every amount in the app rendered in sterling until
   * the client fetch below returned.
   */
  serverCurrency?: { currency: string; multicurrencyEnabled: boolean } | null;
  /** What this person's account holds, read by the server layout. */
  navPreferences?: { navPosition: "side" | "bottom"; navCompact: boolean };
}) {
  const workspace = useChartOfAccounts();
  /* useChartOfAccounts fetches the organisation once on mount, and this shell
     lives in the layout so it never remounts. Without the override, saving a
     new base currency or switching multicurrency on changed the settings card
     and nothing else until a hard reload. */
  /* Three sources, most recent first: an override written after a save, the
     organisation once the client fetch lands, and the server's own reading —
     which is present from the first render and is why the page no longer opens
     in sterling and corrects itself a second later. */
  const liveCurrency = useWorkspaceCurrency({
    currency: (workspace.organization as any)?.baseCurrency ?? serverCurrency?.currency,
    multicurrencyEnabled:
      (workspace.organization as any)?.multicurrencyEnabled ??
      serverCurrency?.multicurrencyEnabled,
  });
  /* Where the menu lives. A personal preference in localStorage, so it is read
     through a store rather than an effect — see use-nav-position. */
  const [navPosition, setNavPosition] = useNavPosition();
  const [query, setQuery] = useState("");
  const [isCollapsed, setIsCollapsed] = useState(true);
  const [isMobileOpen, setIsMobileOpen] = useState(false); 
  const [isMounted, setIsMounted] = useState(false); 
  const [animationsReady, setAnimationsReady] = useState(false); 
  
  const pathname = usePathname();
  const router = useRouter();

  const [features, setFeatures] = useState<string[] | null>(null);

  /* Once, on load. The store this writes to is the same one the menu reads
     from, so signing in on a new device moves the menu to where the account
     says it belongs — and does nothing at all on the device the choice was
     made on, where local and saved already agree. */
  useEffect(() => {
    if (navPreferences) adoptSavedNavPreferences(navPreferences);
    // Deliberately on mount alone: a later change comes from this browser, and
    // re-adopting the value the page loaded with would undo it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setIsMounted(true);
    
    const savedSidebar = localStorage.getItem("wawprofi-sidebar-closed");
    if (savedSidebar === "false") setIsCollapsed(false);
    else if (savedSidebar === "true") setIsCollapsed(true);

    const cachedFeatures = sessionStorage.getItem("wawprofi-features");
    if (cachedFeatures) setFeatures(JSON.parse(cachedFeatures));

    const timer = setTimeout(() => setAnimationsReady(true), 50);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const orgFeatures = (workspace.organization as any)?.features as string[] | undefined;
    if (orgFeatures) {
      setFeatures(orgFeatures);
      sessionStorage.setItem("wawprofi-features", JSON.stringify(orgFeatures));
    }
  }, [workspace.organization]);

  useEffect(() => {
    setIsMobileOpen(false);
  }, [pathname]);

  const effectiveFeatures = impersonation?.features || features;

  // 🚀 Bypass the client context entirely and use the exact server role!
  const userRole = String(serverRole || workspace.role || "EMPLOYEE").toUpperCase();
  const activeCustomFeatures = (workspace as any).customFeatures || customFeatures || []; // 🚀 Capture their approved modules

  const isAuthorized = (() => {
    // 👑 RULE 0: Personal profile and security pages are ALWAYS whitelisted for all roles
    //
    // Workspace Settings joins them because each person's own notification
    // preferences live on it. The business half — currency, VAT, the tax
    // profile — is gated inside the page, which renders a lock notice instead
    // and whose server action refuses the write regardless. Bouncing the whole
    // route to the dashboard denied somebody their own bell settings.
    if (
      pathname.startsWith("/settings/profile-access") ||
      pathname.startsWith("/settings/security") ||
      pathname.startsWith("/settings/workspace")
    ) {
      return true;
    }

    // 1. Block EMPLOYEES from financial, operational, and administrative setting areas
    if (userRole === "EMPLOYEE") {
      const forbiddenEmployeeRoutes = ["/accounting", "/banking", "/payroll", "/taxes", "/purchases", "/sales", "/reports", "/settings"];
      if (forbiddenEmployeeRoutes.some(route => pathname.startsWith(route))) {
        return false;
      }
    }

    // 2. Block ACCOUNTANTS from physical POS module
    if (userRole === "ACCOUNTANT") {
      if (pathname.startsWith("/pos")) {
        return false;
      }
    }

    // 3. 🚀 NEW: Block CUSTOM ROLES from modules they weren't assigned!
    if (userRole === "CUSTOM") {
      const coreModules = ["sales", "purchases", "banking", "payroll", "pos", "taxes", "accounting", "reports"];
      
      // If the current URL is a core module, check if they own it
      for (const mod of coreModules) {
        if (pathname.startsWith(`/${mod}`) && !activeCustomFeatures.includes(mod)) {
          return false; // 🚫 Kick them out if it wasn't checked!
        }
      }

      // Block Custom users from global workspace settings (like billing)
      if (pathname.startsWith("/settings") && !pathname.startsWith("/settings/profile-access") && !pathname.startsWith("/settings/security")) {
        return false;
      }
    }

    // 3. Plan Feature Fallback Check (Handles both text arrays and nested array objects safely)
    if (!effectiveFeatures) return true; 
    const has = (feat: string) => effectiveFeatures.some((f: any) => {
      const featureName = typeof f === "string" ? f : f?.name || String(f);
      return featureName.toLowerCase() === feat.toLowerCase();
    });
    
    if (pathname.startsWith("/payroll") && !has("payroll")) return false;
    if (pathname.startsWith("/pos") && !has("pos")) return false;
    if (pathname.startsWith("/taxes") && !has("taxes")) return false;
    if (pathname.startsWith("/accounting") && !has("accounting")) return false;
    if (pathname.startsWith("/reports") && !has("reports")) return false;
    if (pathname.startsWith("/sales") && !has("sales")) return false;
    if (pathname.startsWith("/purchases") && !has("purchases")) return false;
    if (pathname.startsWith("/banking") && !has("banking")) return false;
    return true;
  })();

  useEffect(() => {
    if (!isMounted || effectiveFeatures === null) return; 
    
    if (!isAuthorized) {
      router.replace("/dashboard");
    }
  }, [isAuthorized, effectiveFeatures, isMounted, router]);

  const handleToggleSidebar = (val: boolean) => {
    setIsCollapsed(val);
    localStorage.setItem("wawprofi-sidebar-closed", String(val));
  };

  const navOrganization = impersonation
    ? ({ features: impersonation.features } as any)
    : workspace.organization || (features ? ({ features } as any) : null);

  const bottomNavContent = (
    <BottomNav
      canSeeMenu={makeCanSeeMenu({
        organization: navOrganization,
        role: userRole,
        customFeatures: activeCustomFeatures,
      })}
      userRole={userRole}
      organization={navOrganization}
      onSwitchToSidebar={() => setNavPosition("side")}
    />
  );

  const sidebarContent = (
    <Sidebar
      organization={impersonation ? { features: impersonation.features } as any : (workspace.organization || (features ? { features } as any : null))}
      role={userRole as any} // 🚀 Pass the corrected server role!
      customFeatures={activeCustomFeatures} // 🚀 Pass the checkboxes!
      isCollapsed={isCollapsed}
      setIsCollapsed={handleToggleSidebar}
      isMobileOpen={isMobileOpen}
      setIsMobileOpen={setIsMobileOpen}
      userProfile={
        impersonation || 
        currentUser || 
        { 
          name: (workspace as any)?.user?.user_metadata?.display_name || (workspace as any)?.user?.user_metadata?.full_name || "", 
          email: (workspace as any)?.user?.email || "" 
        }
      }
    />
  );

  return (
    <CurrencyProvider
      currency={liveCurrency.currency}
      multicurrencyEnabled={liveCurrency.multicurrencyEnabled}
    >
    <div className="min-h-screen bg-[#f8f9ff] text-slate-950">

      {/* One or the other, never both. The sidebar is portalled to the body so
          its fixed positioning is not trapped by an ancestor transform; the
          bottom bar is already fixed and needs no such help. */}
      {navPosition === "side"
        ? isMounted
          ? createPortal(sidebarContent, document.body)
          : sidebarContent
        : isMounted
          ? createPortal(bottomNavContent, document.body)
          : null}

      <div
        className={cn(
          "flex flex-col",
          animationsReady ? "transition-all duration-300 ease-in-out" : "",
          // No left margin when the menu is along the bottom — that gutter is
          // the sidebar's width, and reserving it would leave a blank column.
          navPosition === "bottom" ? "" : isCollapsed ? "md:ml-20" : "md:ml-64"
        )}
      >
        <TopNav
          role={userRole} // 🚀 Fix: Use the true server role instead of workspace.role!
          customFeatures={activeCustomFeatures} // 🚀 Fix: Pass the checkboxes down to the header dropdown!
          accounts={workspace.accounts.length > 0 ? workspace.accounts : accounts} 
          organization={impersonation ? { features: impersonation.features } as any : (workspace.organization || (features ? { features } as any : null))} 
          query={query}
          onQueryChange={setQuery}
          onSignOut={workspace.signOut}
          onSettingsClick={() => router.push("/settings/workspace")}
          isCollapsed={isCollapsed} 
          hasSidebar={navPosition === "side"}
          impersonation={impersonation}
          onToggleSidebar={navPosition === "side" ? () => setIsMobileOpen(true) : undefined} 
        />
        
        <div className="h-20 md:h-20" /> 
        
        {/* Extra bottom padding when the bar floats over the page, so the last
            row of a table is not sitting underneath it. */}
        <main className={cn("px-4 md:px-8", navPosition === "bottom" ? "pb-32" : "pb-10")}>
          {!isMounted || effectiveFeatures === null || !isAuthorized ? (
            <div className="flex h-[50vh] items-center justify-center">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
            </div>
          ) : (
            children
          )}
        </main>
      </div>

    </div>
    </CurrencyProvider>
  );
}