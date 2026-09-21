"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom"; 
import { useRouter } from "next/navigation";
import {
  Bell,
  CircleHelp,
  Search,
  Settings,
  LogOut,
  X,
  Menu, 
  Clock, // 🚀 ADDED FOR TRIAL BADGE
  type LucideIcon,
} from "lucide-react";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { canManageWorkspaceSettings } from "@/lib/accounting/workspace-permissions"; 
import { ImpersonationBanner } from "@/components/accounting/impersonation-banner"; 
// 🌟 Import your new secure tutorial component
import { HelpTourTooltip } from "@/components/accounting/help-tour-tooltip";
import { NotificationBell } from "@/components/accounting/notification-bell";

// 🚀 Dropdown Menu for Workspace Settings
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Receipt, ShoppingCart, Wallet, ShieldCheck, KeyRound, UserCog, History, Users, CreditCard } from "lucide-react";

type TopNavProps = {
  query: string;
  onQueryChange: (query: string) => void;
  onSignOut: () => void;
  onSettingsClick?: () => void;
  onToggleSidebar?: () => void; 
  isCollapsed?: boolean; 
  /** Whether a sidebar is occupying the left of the screen. False when the
   *  menu runs along the bottom, where there is no gutter to clear. */
  hasSidebar?: boolean; 
  impersonation?: { name: string; email: string; plan: string } | null; 
  accounts: any[]; 
  organization?: any; 
  role?: string | null; 
  customFeatures?: string[]; // 🚀 NEW: Accept custom checkbox roles
};

const searchablePages = [
  { name: "Dashboard", href: "/dashboard" },
  { name: "Sales & Invoices", href: "/sales" },
  { name: "Purchases & Bills", href: "/purchases" },
  { name: "Banking & Transactions", href: "/banking" },
  // Payroll deliberately absent: it lives in a separate repository, so what is
  // routable from here is a mirror rather than the real module. Offering it in
  // search sends people to a page this codebase does not own.
  { name: "Point of Sale (POS)", href: "/pos" },
  { name: "Taxes & VAT", href: "/taxes" },
  { name: "Accounting & Chart", href: "/accounting/chart-of-accounts" },
  { name: "Reports & Financials", href: "/reports" },
  // /settings has no page of its own — searching "Settings" landed on a 404.
  // The workspace page is the one people mean, and it is reachable by every
  // role now that personal notification preferences live on it.
  { name: "Workspace Settings", href: "/settings/workspace" },
  { name: "waitlist", href: "/waitlist?tab=waitlist" },
];

export function TopNav({ 
  query, 
  onQueryChange, 
  onSignOut, 
  onSettingsClick, 
  onToggleSidebar, 
  isCollapsed = false, 
  hasSidebar = true, 
  impersonation = null,
  accounts,
  organization,
  role, 
  customFeatures = [], // 🚀 Destructure and default to empty array
}: TopNavProps) {
  const router = useRouter();

  // 🚀 Normalize the active user role token
  const userRole = String(role || "EMPLOYEE").toUpperCase();

  // 🚀 Filter autocomplete searches dynamically based on role access limits
  const isUrlAllowed = (href: string) => {
    // 👑 RULE 0: Whitelist personal security and profile pages for EVERYONE
    // Workspace Settings alongside the personal pages: it now carries each
    // person's own notification preferences, so every role has a reason to
    // reach it. What they can change once there is decided on the page.
    if (
      href.startsWith("/settings/profile-access") ||
      href.startsWith("/settings/security") ||
      href.startsWith("/settings/workspace")
    ) {
      return true;
    }

    if (userRole === "OWNER") return true;
    
    if (userRole === "EMPLOYEE") {
      const forbidden = ["/accounting", "/banking", "/payroll", "/taxes", "/purchases", "/sales", "/reports", "/settings"];
      return !forbidden.some(route => href.startsWith(route));
    }
    
    if (userRole === "ACCOUNTANT") {
      return !href.startsWith("/pos");
    }

    // 🚀 NEW: Block Custom Roles from searching modules they don't own
    if (userRole === "CUSTOM") {
      const coreModules = ["sales", "purchases", "banking", "payroll", "pos", "taxes", "accounting", "reports"];
      for (const mod of coreModules) {
        if (href.startsWith(`/${mod}`) && !customFeatures.includes(mod)) {
          return false; // Hide from search autocomplete!
        }
      }
      if (href.startsWith("/settings")) return false; // Hide global settings from custom users
    }
    
    return true;
  };

  const hasFeature = (featureName: string) => {
    if (!organization || !organization.features) return false;
    return organization.features.some((f: string) => f.toLowerCase() === featureName.toLowerCase());
  };

  // 🚀 Gated visibility flags for workspace layout dropdown sections
  // For CUSTOM roles, they only see settings if they have that specific custom feature checked!
  const hasModuleSettings = userRole === "CUSTOM" 
    ? (customFeatures.includes("sales") || customFeatures.includes("purchases") || customFeatures.includes("payroll"))
    : (hasFeature("sales") || hasFeature("purchases") || hasFeature("payroll")) && userRole !== "EMPLOYEE";

  const hasPosSettings = userRole === "CUSTOM"
    ? customFeatures.includes("pos")
    : hasFeature("pos") && userRole !== "ACCOUNTANT" && userRole !== "EMPLOYEE";

  // Helper function to check if a specific dropdown item should be visible for Custom users
  const canSeeSetting = (module: string) => {
    if (userRole === "EMPLOYEE") return false;
    if (userRole === "CUSTOM") return customFeatures.includes(module);
    return hasFeature(module);
  };
  const [isFocused, setIsFocused] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false); 
  const [isMounted, setIsMounted] = useState(false); 
  const [is2FASetup, setIs2FASetup] = useState(true); // Defaults true to prevent flashing

  // 🚀 NEW: State to hold the REAL trial data directly from the DB
  const [trialInfo, setTrialInfo] = useState({ isTrial: false, daysLeft: 0 });

  useEffect(() => {
    setIsMounted(true);
    const supabase = createClient();
    
    // 1. Check 2FA Status (With Instant Realtime Listener)
    async function checkSecurityStatus() {
      const { data } = await supabase.auth.mfa.listFactors();
      if (data && data.totp.length > 0) {
        const verifiedFactor = data.totp.find((f: any) => f.status === 'verified');
        setIs2FASetup(!!verifiedFactor);
      } else {
        setIs2FASetup(false);
      }
    }
    checkSecurityStatus();

    // 🚀 INSTANT REALTIME LISTENER: Hides or shows blue dot in 0ms without page refresh
    const handleMfaUpdate = (e: Event) => {
      const customEvent = e as CustomEvent;
      if (customEvent.detail && typeof customEvent.detail.enabled === "boolean") {
        setIs2FASetup(customEvent.detail.enabled);
      } else {
        checkSecurityStatus();
      }
    };

    window.addEventListener("mfa_updated", handleMfaUpdate);

   // 2. 🚀 FETCH REAL TRIAL STATUS FROM DATABASE
    async function fetchRealTrialData() {
      if (!organization?.id) return;

      try {
        // 🚀 Target "organizations" instead of "workspaces"
        let { data, error } = await supabase
          .from("organizations") 
          .select("subscription_status, trial_ends_at")
          .eq("id", organization.id)
          .single();

        // 🚀 Fallback just in case your table is called workspaces
        if (error || !data) {
          const fallback = await supabase
            .from("workspaces") 
            .select("subscription_status, trial_ends_at")
            .eq("id", organization.id)
            .single();
          data = fallback.data;
        }

        console.log("🔥 HEADER FETCHED BILLING DATA:", data);

        if (data) {
          const status = data.subscription_status;
          const isTrial = status === "trial" || status === "trialing";
          const trialEnds = data.trial_ends_at;
          
          if (isTrial && trialEnds) {
            // Handle both Stripe Unix timestamps and standard ISO dates
            const endDateMs = typeof trialEnds === "number" || (typeof trialEnds === "string" && !isNaN(Number(trialEnds))) 
              ? Number(trialEnds) * 1000 
              : new Date(trialEnds).getTime();

            const now = new Date().getTime();
            const daysLeft = Math.max(0, Math.ceil((endDateMs - now) / (1000 * 60 * 60 * 24)));
            
            console.log("🔥 TRIAL DAYS CALCULATION:", daysLeft);
            setTrialInfo({ isTrial: true, daysLeft });
          }
        }
      } catch (err) {
        console.error("Skipped trial fetch:", err);
      }
    }
    
    fetchRealTrialData();

    return () => {
      window.removeEventListener("mfa_updated", handleMfaUpdate);
    };
  }, [organization?.id]);

  const filteredPages = searchablePages.filter((page) =>
    page.name.toLowerCase().includes(query.toLowerCase()) && isUrlAllowed(page.href)
  );

  const navContent = (
    <header 
      className={cn(
        "fixed top-0 right-0 z-40 flex flex-col bg-transparent transition-all duration-300 ease-in-out pointer-events-none",
        /* Pinned to the right and narrowed by the sidebar's width, so the bar
           starts where the sidebar ends. With the menu along the bottom there
           is no sidebar to clear, and keeping the inset left the search field
           floating in dead space with the page heading squarely to its left. */
        hasSidebar && (isCollapsed ? "md:w-[calc(100%-5rem)]" : "md:w-[calc(100%-16rem)]"), 
        "w-full" 
      )}
    >
      <div className="pointer-events-auto">
        {impersonation && <ImpersonationBanner serverData={impersonation} />}
      </div>

      <div className="flex h-16 w-full items-center justify-between gap-2 px-4 pt-2 md:gap-6 md:px-8 pointer-events-auto">
        
        {/* MOBILE HAMBURGER MENU */}
        {/* Hidden when the menu runs along the bottom: the drawer this opens
            is the sidebar, and with the sidebar not rendered the button would
            be a hamburger that does nothing. */}
        {!showMobileSearch && onToggleSidebar && (
          <Button 
            variant="ghost" 
            size="icon" 
            className="md:hidden shrink-0 -ml-2 text-slate-600 bg-white shadow-sm rounded-full" 
            onClick={onToggleSidebar}
          >
            <Menu className="size-5" />
          </Button>
        )}

        <div className={cn("flex-1 items-center transition-all", showMobileSearch ? "flex w-full" : "hidden md:flex")}>
          <div className="relative w-full md:max-w-md">
            <Search className="absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <span className="sr-only">Search workspace</span>
            <input
              autoFocus={showMobileSearch}
              className="h-10 w-full rounded-full border border-slate-200/60 bg-white shadow-sm pl-10 pr-4 text-sm outline-none transition focus:border-blue-300 focus:ring-4 focus:ring-blue-500/10"
              placeholder="Search..."
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setTimeout(() => setIsFocused(false), 200)}
            />

            {isFocused && query.length > 0 && (
              <div className="absolute left-0 top-full mt-2 w-full rounded-xl border border-slate-200 bg-white p-2 shadow-xl sm:w-80">
                <p className="px-2 py-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  Jump to page
                </p>
                {filteredPages.length > 0 ? (
                  filteredPages.map((page) => (
                      <button
                          key={page.href}
                          onClick={() => {
                              router.push(page.href);
                              onQueryChange("");
                              setIsFocused(false);
                              setShowMobileSearch(false);
                          }}
                          className="mt-1 flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm font-medium text-slate-700 transition hover:bg-blue-50 hover:text-blue-700"
                      >
                          <Search className="size-3.5 text-slate-400" />
                          {page.name}
                      </button>
                  ))
                ) : (
                  <p className="px-2 py-3 text-sm text-slate-500">No pages found.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {!showMobileSearch && <div className="flex-1 md:hidden"></div>}

        <div className={cn("shrink-0 items-center gap-1.5 sm:gap-2.5", showMobileSearch ? "hidden md:flex" : "flex")}>
          <div className="flex items-center gap-1">
            <div className="md:hidden">
              <IconButton label="Search" icon={Search} onClick={() => setShowMobileSearch(true)} />
            </div>
            
            <div className="flex items-center rounded-full bg-white shadow-sm border border-slate-200/50 p-0.5">
              <NotificationBell />
              
              {/* 🚀 STEP 3: Wrap the standard Help icon with our automated tour portal */}
              <HelpTourTooltip accounts={accounts}>
                <IconButton label="Help" icon={CircleHelp} />
              </HelpTourTooltip>

              {/* 🚀 NEW: Conditional Trial Countdown Badge (Clickable ONLY for Owners) */}
              {trialInfo.isTrial && trialInfo.daysLeft > 0 && (
                <div 
                  className={cn(
                    "hidden sm:flex items-center gap-1.5 bg-purple-50 border border-purple-200/60 pl-2 pr-3 py-1 ml-1 rounded-full shadow-sm select-none",
                    userRole === "OWNER" ? "cursor-pointer hover:bg-purple-100 transition-colors" : "cursor-default"
                  )} 
                  onClick={() => {
                    if (userRole === "OWNER") router.push('/settings/billing');
                  }}
                >
                  <Clock className="size-3.5 text-purple-600" />
                  <span className="text-[10px] font-black uppercase tracking-wider text-purple-700">
                    {trialInfo.daysLeft} {trialInfo.daysLeft === 1 ? 'Day' : 'Days'} Left
                  </span>
                </div>
              )}

              {/* 🚀 UPGRADED: Rich Dropdown Menu for Workspace & Security */}
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    className="relative h-8 sm:h-9 px-3 rounded-full hover:bg-slate-100 flex items-center gap-1.5 text-slate-500 hover:text-slate-700 outline-none focus-visible:ring-2 focus-visible:ring-blue-500/20 data-[state=open]:bg-slate-100"
                  >
                    <Settings className="size-4 sm:size-[18px]" />
                    <span className="text-xs sm:text-sm font-semibold text-slate-600">Workspace</span>
                    
                    {/* 🚀 Main Button Notification Dot! */}
                    {!is2FASetup && (
                      <span className="absolute top-0 right-0 -mt-0.5 -mr-0.5 flex size-2.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full size-2.5 bg-blue-500"></span>
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                
               {/* 🚀 RESPONSIVE GRID LAYOUT (Stacks on mobile, horizontal on desktop) */}
                <DropdownMenuContent align="end" sideOffset={8} className="w-[340px] sm:w-[520px] max-w-[calc(100vw-1rem)] max-h-[85vh] overflow-y-auto rounded-2xl p-3 shadow-xl border-slate-100 bg-white">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                    
                    {/* LEFT COLUMN: Module Settings (Conditionally Rendered) */}
                    <div className="flex flex-col">
                      {/*
                        Workspace-level settings — currency, VAT registration
                        and the tax profile. Owners and accountants only: the
                        page carries the UTR and PAYE reference, and the route
                        refuses anyone else regardless of this menu.
                      */}
                      {/* Offered to everyone, because each person's own
                          notification preferences live on that page. The label
                          says what this particular role will find there:
                          "General" is the notification settings alone,
                          "General & Currency" once an owner has granted the
                          currency, VAT and tax profile sections. */}
                      {onSettingsClick && (
                        <>
                          <DropdownMenuLabel className="text-xs font-bold uppercase tracking-widest text-slate-400 px-2 py-1.5">
                            Workspace
                          </DropdownMenuLabel>
                          <DropdownMenuItem
                            onClick={onSettingsClick}
                            className="flex items-center gap-2 cursor-pointer rounded-xl p-2 hover:bg-slate-50 focus:bg-slate-50"
                          >
                            <Settings className="size-4 text-slate-500" />
                            <span className="font-medium text-slate-700">
                              {canManageWorkspaceSettings(userRole, customFeatures)
                                ? "General & Currency"
                                : "General"}
                            </span>
                          </DropdownMenuItem>
                          {hasModuleSettings && <DropdownMenuSeparator className="my-1.5 bg-slate-100" />}
                        </>
                      )}

                      {hasModuleSettings && (
                        <DropdownMenuLabel className="text-xs font-bold uppercase tracking-widest text-slate-400 px-2 py-1.5">
                          Module Settings
                        </DropdownMenuLabel>
                      )}

                      {canSeeSetting("sales") && (
                        <DropdownMenuItem onClick={() => router.push('/sales/settings')} className="flex items-center gap-2 cursor-pointer rounded-xl p-2 hover:bg-slate-50 focus:bg-slate-50">
                          <Receipt className="size-4 text-slate-500" />
                          <span className="font-medium text-slate-700">Sales & Invoices</span>
                        </DropdownMenuItem>
                      )}

                      {canSeeSetting("purchases") && (
                        <DropdownMenuItem onClick={() => router.push('/purchases/settings')} className="flex items-center gap-2 cursor-pointer rounded-xl p-2 hover:bg-slate-50 focus:bg-slate-50">
                          <ShoppingCart className="size-4 text-slate-500" />
                          <span className="font-medium text-slate-700">Purchases & Bills</span>
                        </DropdownMenuItem>
                      )}

                      {canSeeSetting("payroll") && (
                        <DropdownMenuItem onClick={() => router.push('/payroll/settings')} className="flex items-center gap-2 cursor-pointer rounded-xl p-2 hover:bg-slate-50 focus:bg-slate-50">
                          <Wallet className="size-4 text-slate-500" />
                          <span className="font-medium text-slate-700">Payroll Configurations</span>
                        </DropdownMenuItem>
                      )}

                      {hasPosSettings && (
                        <>
                          {hasModuleSettings && <DropdownMenuSeparator className="my-1.5 bg-slate-100" />}
                          <DropdownMenuLabel className="text-xs font-bold uppercase tracking-widest text-slate-400 px-2 py-1.5">
                            POS Settings
                          </DropdownMenuLabel>
                          <DropdownMenuItem onClick={() => router.push('/pos/customers')} className="flex items-center gap-2 cursor-pointer rounded-xl p-2 hover:bg-slate-50 focus:bg-slate-50">
                            <Users className="size-4 text-slate-500" />
                            <span className="font-medium text-slate-700">Customers CRM</span>
                          </DropdownMenuItem>
                          {/* Hardware Hub and App Integrations hidden — see sidebar.tsx */}
                        </>
                      )}
                    </div>

                    {/* RIGHT COLUMN: Security & Account */}
                    <div className="flex flex-col border-t sm:border-t-0 sm:border-l border-slate-100 pt-2 sm:pt-0 sm:pl-2 mt-2 sm:mt-0">
                      <DropdownMenuLabel className="text-xs font-bold uppercase tracking-widest text-slate-400 px-2 py-1.5">
                        Security & Account
                      </DropdownMenuLabel>

                      {/* 👑 Workspace-level properties remain locked to OWNER profiles */}
                      {userRole === "OWNER" && (
                        <DropdownMenuItem onClick={() => router.push('/settings/billing')} className="flex items-center gap-2 cursor-pointer rounded-xl p-2 hover:bg-slate-50 focus:bg-slate-50">
                          <CreditCard className="size-4 text-slate-500" />
                          <span className="font-medium text-slate-700">Billing & Plans</span>
                        </DropdownMenuItem>
                      )}

                      {/* 🛡️ Universal personal settings: visible to EVERY user role */}
                      <DropdownMenuItem onClick={() => router.push('/settings/security')} className="flex items-center justify-between cursor-pointer rounded-xl p-2 hover:bg-blue-50 focus:bg-blue-50 group">
                        <div className="flex items-center gap-2">
                          <ShieldCheck className="size-4 text-blue-500 group-hover:scale-110 transition-transform" />
                          <span className="font-bold text-blue-700">Two-Factor Auth (2FA)</span>
                        </div>
                        {!is2FASetup && (
                          <span className="relative flex size-2.5">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full size-2.5 bg-blue-500"></span>
                          </span>
                        )}
                      </DropdownMenuItem>

                      {/* 🛡️ Universal security setup items: visible to EVERY user role */}
                      <DropdownMenuItem onClick={() => router.push('/settings/security?tab=questions')} className="flex items-center gap-2 cursor-pointer rounded-xl p-2 hover:bg-slate-50 focus:bg-slate-50">
                        <KeyRound className="size-4 text-slate-500" />
                        <span className="font-medium text-slate-700">Security Questions</span>
                      </DropdownMenuItem>

                      {/* 📈 Internal Audit: Restricted from basic employees */}
                      {userRole !== "EMPLOYEE" && (
                        <DropdownMenuItem onClick={() => router.push('/reports/audit-trail')} className="flex items-center gap-2 cursor-pointer rounded-xl p-2 hover:bg-slate-50 focus:bg-slate-50">
                          <History className="size-4 text-slate-500" />
                          <span className="font-medium text-slate-700">Audit Trail Logs</span>
                        </DropdownMenuItem>
                      )}

                      {/* 🛡️ Universal Profile Entry: visible to all roles, dynamically labeled */}
                      <DropdownMenuItem onClick={() => router.push('/settings/profile-access')} className="flex items-center gap-2 cursor-pointer rounded-xl p-2 hover:bg-slate-50 focus:bg-slate-50">
                        <UserCog className="size-4 text-slate-500" />
                        <span className="font-medium text-slate-700">
                          {userRole === "OWNER" ? "Profile & Access" : "My Profile Settings"}
                        </span>
                      </DropdownMenuItem>
                    </div>

                  </div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
          
          <Button variant="outline" size="sm" onClick={onSignOut} className="px-2 sm:px-3 rounded-full bg-white shadow-sm border-slate-200/60 hover:bg-slate-50">
            <span className="hidden sm:inline">Sign out</span>
            <LogOut className="size-4 sm:hidden" />
          </Button>
        </div>

        {showMobileSearch && (
          <Button variant="ghost" size="icon" className="md:hidden shrink-0 bg-white shadow-sm rounded-full" onClick={() => { setShowMobileSearch(false); onQueryChange(""); }}>
            <X className="size-5 text-slate-500" />
          </Button>
        )}
      </div> 
    </header>
  );

  if (!isMounted) return navContent;
  return createPortal(navContent, document.body);
}

function IconButton({ label, icon: Icon, onClick }: { label: string; icon: LucideIcon; onClick?: () => void }) {
  return (
    <Button variant="ghost" size="icon" aria-label={label} onClick={onClick} className="size-8 sm:size-9 rounded-full hover:bg-slate-100">
      <Icon className="size-4 sm:size-[18px] text-slate-500" />
    </Button>
  );
}
