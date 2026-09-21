"use client";

import Link from "next/link";
import { Suspense, useState, useEffect } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import {
  Building2,
  Calendar,
  CircleHelp,
  Clock,
  CreditCard,
  ClipboardList,
  FileText,
  Heart,
  Briefcase,
  Users,
  UserCircle,
  Quote,
  Receipt,
  Scale,
  LineChart,
  Building,
  Book,
  Truck,
  Settings,
  RotateCw,
  Menu,
  X,
  TrendingUp,
  ShoppingBag,
  Package,
  ScanBarcode,
  RotateCcw,
  Tag,
  Wallet,
  Gift,
  Shield,
  Globe, 
  ArrowRightLeft, 
  HardHat,
  Minus,
  Plus,
  PanelLeftClose,
  PanelLeftOpen,
  User, 
  BookOpen,
  PlayCircle,
  MessageSquare,
  Sparkles,
  ShieldCheck, // 🚀 Added
  Key,         // 🚀 Added
  History,     // 🚀 Added
  UserCog,     // 🚀 Added
  type LucideIcon,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { useBodyScrollLock } from "@/lib/use-body-scroll-lock";

import { navItems } from "@/components/chart-of-accounts/constants";
import { NAV_MODULES } from "./nav-tree";
import { makeCanSeeMenu } from "./nav-visibility";
import { useOrgLogo } from "./use-org-logo";
import type { Organization, Role } from "@/components/chart-of-accounts/types";

const dashboardModule = NAV_MODULES.find((module) => module.key === "dashboard");

const navHrefs: Record<string, string> = {
  Dashboard: "/dashboard",
  Purchases: "/purchases",
  Banking: "/banking",
  Payroll: "/payroll",
  Taxes: "/taxes",
  Accounting: "/accounting/chart-of-accounts",
  Reports: "/reports",
  Settings: "/settings",
  Help: "/help",
  "Profile & Access": "/settings/profile-access",
  "My Profile Settings": "/settings/profile-access", // 🚀 Added fallback route support
  // Currency, VAT registration and the tax profile. Reachable from the
  // Workspace button in the top nav too, but people look for settings here.
  "Workspace Settings": "/settings/workspace",
};

type SidebarProps = {
  organization?: Organization | null;
  role?: Role | null;
  customFeatures?: string[]; // 🚀 NEW: Accept custom checkbox roles
  isCollapsed?: boolean;
  setIsCollapsed?: (val: boolean) => void;
  isMobileOpen?: boolean; 
  setIsMobileOpen?: (val: boolean) => void; 
  userProfile?: { name: string; email: string } | null;
};

const getActiveMenu = (path: string) => {
  if (path.startsWith("/sales")) return "sales";
  if (path.startsWith("/purchases")) return "purchases";
  if (path.startsWith("/banking")) return "banking";
  if (path.startsWith("/payroll")) return "payroll";
  if (path.startsWith("/pos")) return "pos";
  if (path.startsWith("/taxes")) return "taxes";
  if (path.startsWith("/accounting")) return "accounting";
  if (path.startsWith("/reports")) return "reports";
  if (path.startsWith("/settings")) return "settings"; // 🚀 Added Settings Registration
  if (path.startsWith("/help")) return "help";
  return null;
};

export function Sidebar({ 
  organization, 
  role, 
  customFeatures = [], // 🚀 Destructure and default to empty array
  isCollapsed: propIsCollapsed, 
  setIsCollapsed: propSetIsCollapsed,
  isMobileOpen = false, 
  setIsMobileOpen,
  userProfile 
}: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  
  const [localIsCollapsed, setLocalIsCollapsed] = useState(true);
  const desktopIsCollapsed = propIsCollapsed !== undefined ? propIsCollapsed : localIsCollapsed;
  const safeSetIsCollapsed = propSetIsCollapsed || setLocalIsCollapsed;

  const isCollapsed = isMobileOpen ? false : desktopIsCollapsed;

  const [manualOpenMenu, setManualOpenMenu] = useState<string | null>(null);
  const activeMenu = getActiveMenu(pathname);
  const openMenu = manualOpenMenu ?? activeMenu;

  /* Settings saves the logo through a server action, but this organisation
     comes from a client-side hook holding its own copy in state, which neither
     the action nor router.refresh() can reach. The shared store bridges that
     gap — see use-org-logo for why it cannot be component state. */
  const orgLogo = useOrgLogo(organization?.logoUrl);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768 && setIsMobileOpen) setIsMobileOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [setIsMobileOpen]);

  // The overlay covers the page but does not stop it scrolling underneath, so
  // the drawer would slide over a moving background.
  useBodyScrollLock(isMobileOpen);

  const handleIconClick = (menuName: string, targetHref: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setManualOpenMenu(menuName);
    router.push(targetHref);
    if (setIsMobileOpen) setIsMobileOpen(false); 
  };

  const handleToggleClick = (menuName: string, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setManualOpenMenu(openMenu === menuName ? null : menuName);
  };

  const DashboardIcon = dashboardModule?.icon ?? navItems[0].icon;
  const dashboardHref = dashboardModule?.href ?? "/dashboard";
  const dashboardLabel = dashboardModule?.label ?? "Dashboard";

// 🚀 Normalize role value safely for comparison checks
const userRole = String(role || "EMPLOYEE").toUpperCase();

// Shared with the bottom menu rather than written twice — see nav-visibility.
const canSeeMenu = makeCanSeeMenu({
  organization: organization as any,
  role,
  customFeatures,
});

// 🛡️ DYNAMIC SPLIT TITLE LOGIC: Only show "Finance" header text if a sub-item is visible
const showFinanceHeader = canSeeMenu("payroll") || canSeeMenu("pos") || canSeeMenu("taxes");

  return (
    <>
      {isMobileOpen && (
        <div
          // 🚀 Boosted to z-50 so the dark blur covers the z-40 TopNav!
          // touch-none stops a drag on the backdrop from scrolling anything
          // beneath it; taps still close the drawer.
          className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-sm md:hidden touch-none overscroll-contain"
          onClick={() => setIsMobileOpen?.(false)}
        />
      )}

      <aside
        className={cn(
          // 🚀 Boosted to z-50 on mobile to completely hide the hamburger button!
          "fixed z-50 flex flex-col transition-all duration-300 ease-in-out md:z-40",
          // dvh, not vh: on iOS Safari 100vh includes the strip behind the
          // address bar, so the profile footer at the bottom of this column sat
          // underneath it and was unreachable. dvh tracks the visible area as
          // the browser chrome collapses.
          "top-0 left-0 h-dvh rounded-none border-r border-slate-200 bg-slate-50",
          "md:top-4 md:left-4 md:h-[calc(100dvh-2rem)] md:rounded-3xl md:border md:bg-white md:shadow-2xl md:shadow-slate-200/50",
          isCollapsed ? "w-20" : "w-64",
          isMobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        )}
      >
        <button
          onClick={() => setIsMobileOpen?.(false)}
          aria-label="Close menu"
          // z-10 is load-bearing: the logo link below carries hover:opacity-80,
          // and opacity under 1 creates a stacking context. Without an explicit
          // z-index both paint in the same layer, where DOM order wins and the
          // hovered link covers this button.
          className="absolute right-3 top-6 z-10 rounded-md p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-700 md:hidden"
        >
          <X className="size-5" />
        </button>

        {/* pr-14 on mobile keeps the full-width logo link clear of the close
            button, so their hit areas never overlap in the first place. */}
        <div className={cn("pt-8 pb-4 flex flex-col", isCollapsed ? "items-center px-0" : "items-start pl-6 pr-14 md:pr-4")}>
          <Link 
            href="/"
            className={cn("flex items-center gap-3 group transition-opacity hover:opacity-80 w-full", isCollapsed && "justify-center")}
          >
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white font-extrabold text-xl shadow-md transition-transform group-hover:scale-105">
              W
            </div>
            
            {!isCollapsed && (
              <div className="flex items-baseline gap-2 min-w-0 flex-1 overflow-hidden">
                <span className="text-base font-black uppercase tracking-wider text-slate-950 truncate">
                  WAWPROFI
                </span>
              </div>
            )}
          </Link>
          
          {/* The customer's own workspace, under ours. Their logo where they
              have set one in Workspace Settings, their initial where they have
              not — the mark is drawn either way so the row does not change
              height when one is uploaded.

              A logo gets no chip behind it. Business logos are drawn to sit on
              whatever they are placed on, and a grey rounded square around one
              reads as a placeholder that failed to load. The initial keeps its
              chip, because a bare letter floating in the margin does not read
              as a mark at all. */}
          {organization?.name && (
            <div className={cn("mt-4 w-full shrink-0 animate-in fade-in", isCollapsed ? "flex justify-center" : "flex items-center gap-2.5 min-w-0")}>
              <div
                className={cn(
                  "grid size-8 shrink-0 place-items-center overflow-hidden rounded-lg text-sm font-bold",
                  orgLogo
                    ? "bg-transparent"
                    : "border border-slate-200 bg-slate-100 text-slate-700 shadow-sm",
                )}
                title={organization.name}
              >
                {orgLogo ? (
                  /* A plain img rather than next/image: the allowed remote host
                     is a single hardcoded Supabase project, so the optimiser
                     would reject this on any deployment pointing elsewhere.
                     These are sidebar-sized and already in storage. */
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={orgLogo}
                    alt=""
                    className="size-full object-contain"
                    /* An unreachable or deleted file would otherwise leave a
                       broken-image glyph sitting in the sidebar forever. */
                    onError={(event) => { event.currentTarget.style.display = "none"; }}
                  />
                ) : (
                  organization.name.charAt(0).toUpperCase()
                )}
              </div>

              {!isCollapsed && (
                <h2 className="m-0 min-w-0 flex-1 truncate text-sm font-bold text-slate-700">
                  {organization.name}
                </h2>
              )}
            </div>
          )}
        </div>

        {/* overscroll-contain: reaching the end of the menu must not start
            scrolling the page behind the drawer. */}
        <nav className="flex-1 overflow-y-auto overscroll-contain px-3 py-2 modern-scrollbar flex flex-col gap-1.5">
          
          <div className={cn("hidden md:flex items-center pb-2 pt-1", isCollapsed ? "justify-center" : "justify-between px-3")}>
            {!isCollapsed && (
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 animate-in fade-in">
                Menu
              </p>
            )}
            <button
              onClick={() => safeSetIsCollapsed(!isCollapsed)}
              className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700"
              title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            >
              {isCollapsed ? <PanelLeftOpen className="size-4" /> : <PanelLeftClose className="size-4" />}
            </button>
          </div>

          <div
            className={cn(
              "mb-0.5 flex w-full items-center rounded-lg text-sm font-semibold transition group relative",
              pathname === dashboardHref ? "text-orange-500" : "text-slate-600 hover:bg-slate-100 hover:text-orange-500"
            )}
          >
            {/* 🚀 Active Indicator Pill */}
            {pathname === dashboardHref && <div className="absolute -left-3 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r-md bg-orange-500" />}
            <button
              type="button"
              onClick={(e) => handleIconClick("dashboard", dashboardHref, e)}
              className={cn("flex items-center justify-center outline-none bg-transparent border-none cursor-pointer", isCollapsed ? "w-full py-3" : "py-2 pl-3")}
            >
              <DashboardIcon className="size-5 shrink-0" />
            </button>
            {!isCollapsed && (
              <Link 
                href={dashboardHref}
                onClick={(e) => handleIconClick("dashboard", dashboardHref, e)}
                className="flex-1 text-left py-2 outline-none pl-3"
              >
                <span>{dashboardLabel}</span>
              </Link>
            )}
          </div>
          
          {canSeeMenu("sales") && <SalesNavItem pathname={pathname} salesIcon={navItems[1].icon} isCollapsed={isCollapsed} isOpen={openMenu === "sales"} onIconClick={(e: any) => handleIconClick("sales", "/sales", e)} onToggleMenu={(e: any) => handleToggleClick("sales", e)} />}
          {canSeeMenu("purchases") && <PurchasesNavItem pathname={pathname} purchasesIcon={navItems[2].icon} isCollapsed={isCollapsed} isOpen={openMenu === "purchases"} onIconClick={(e: any) => handleIconClick("purchases", "/purchases", e)} onToggleMenu={(e: any) => handleToggleClick("purchases", e)} />}
          {canSeeMenu("banking") && <BankingNavItem pathname={pathname} bankingIcon={Building2} isCollapsed={isCollapsed} isOpen={openMenu === "banking"} onIconClick={(e: any) => handleIconClick("banking", "/banking", e)} onToggleMenu={(e: any) => handleToggleClick("banking", e)} />}

          {showFinanceHeader && (
            !isCollapsed ? (
              <p className="px-3 py-4 text-[10px] font-bold uppercase tracking-widest text-slate-400 animate-in fade-in">
                Finance
              </p>
            ) : (
              <div className="my-4 mx-auto h-px w-8 bg-slate-200" />
            )
          )}

          {canSeeMenu("payroll") && <PayrollNavItem pathname={pathname} payrollIcon={Users} isCollapsed={isCollapsed} isOpen={openMenu === "payroll"} onIconClick={(e: any) => handleIconClick("payroll", "/payroll", e)} onToggleMenu={(e: any) => handleToggleClick("payroll", e)} />}
          {canSeeMenu("pos") && <PosNavItem pathname={pathname} posIcon={ShoppingBag} isCollapsed={isCollapsed} isOpen={openMenu === "pos"} onIconClick={(e: any) => handleIconClick("pos", "/pos", e)} onToggleMenu={(e: any) => handleToggleClick("pos", e)} />}
          {canSeeMenu("taxes") && <TaxesNavItem pathname={pathname} taxesIcon={Scale} isCollapsed={isCollapsed} isOpen={openMenu === "taxes"} onIconClick={(e: any) => handleIconClick("taxes", "/taxes", e)} onToggleMenu={(e: any) => handleToggleClick("taxes", e)} />}
          
          {navItems.slice(3).map((item) => {
            if (item.label === "Banking" || item.label === "Payroll" || item.label === "Taxes") return null;

            if (item.label === "Accounting") {
              if (!canSeeMenu("accounting")) return null; 
              return <AccountingNavItem key={item.label} pathname={pathname} accountingIcon={item.icon} isCollapsed={isCollapsed} isOpen={openMenu === "accounting"} onIconClick={(e: any) => handleIconClick("accounting", "/accounting/chart-of-accounts", e)} onToggleMenu={(e: any) => handleToggleClick("accounting", e)} />;
            }
            
            if (item.label === "Reports") {
              if (!canSeeMenu("reports")) return null; 
              return <ReportsNavItem key={item.label} pathname={pathname} reportsIcon={item.icon} isCollapsed={isCollapsed} onIconClick={(e: any) => handleIconClick("reports", "/reports", e)} />;
            }
            return (
              <SidebarItem key={item.label} label={item.label} icon={item.icon} pathname={pathname} isCollapsed={isCollapsed} onIconClick={handleIconClick} />
            );
          })}
        </nav>

        <div className="mt-auto px-3 pt-4 pb-4 flex flex-col gap-1">
          {isCollapsed ? <div className="my-2 mx-auto h-px w-8 bg-slate-200" /> : <p className="px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-slate-400 animate-in fade-in">Settings</p>}
          
          {/* 🚀 Open to all profiles, adjusting the label text dynamically based on role context */}
          <SidebarItem 
            label={userRole === "OWNER" ? "Profile & Access" : "My Profile Settings"} 
            icon={UserCog} 
            pathname={pathname} 
            isCollapsed={isCollapsed} 
            onIconClick={(menuKey: string, href: string, e: any) => handleIconClick(menuKey, href, e)} 
          />

          {/* Shown to everyone now that personal notification settings live on
              this page — hiding it would hide somebody's own bell preferences.
              The business sections behind it are still gated: the page renders
              a lock notice in place of currency, VAT and the tax profile for
              anyone without permission, and the server action refuses the write
              regardless. Hiding a link was never the control. */}
          <SidebarItem
            label="Workspace Settings"
            icon={Settings}
            pathname={pathname}
            isCollapsed={isCollapsed}
            onIconClick={(menuKey: string, href: string, e: any) =>
              handleIconClick(menuKey, href, e)
            }
          />

          <HelpNavItem
            pathname={pathname}
            helpIcon={CircleHelp} 
            isCollapsed={isCollapsed} 
            isOpen={openMenu === "help"} 
            onIconClick={(e: any) => handleIconClick("help", "/help", e)} 
            onToggleMenu={(e: any) => handleToggleClick("help", e)} 
          />
        </div>

        <div className={cn("mt-1 mb-6 shrink-0 flex items-center border-t border-slate-100 pt-5", isCollapsed ? "justify-center px-0" : "px-6 gap-3.5")}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#0055ff] text-white shadow-sm ring-2 ring-white">
            <User className="size-5 fill-white" />
          </div>
          {!isCollapsed && (
            <div className="flex flex-col overflow-hidden">
              <span className="truncate text-xs font-bold text-[#0055ff] min-h-[16px]">
                {userProfile?.name || ""}
              </span>
              <span className="truncate text-[10px] font-semibold text-[#0055ff]/80 min-h-[15px]">
                {userProfile?.email || ""}
              </span>
            </div>
          )}
        </div>

      </aside>
    </>
  );
}

// ─── DROPDOWN COMPONENTS ──────────────────────────────────────────

function AnimatedToggleIcon({ isOpen }: { isOpen: boolean }) {
  return (
    <div className="relative flex items-center justify-center size-3.5">
      <Minus className={cn("absolute size-3.5 opacity-60 transition-all duration-300 ease-out", isOpen ? "rotate-0 scale-100" : "rotate-90 scale-0")} />
      <Plus className={cn("absolute size-3.5 opacity-60 transition-all duration-300 ease-out", isOpen ? "rotate-90 scale-0" : "rotate-0 scale-100")} />
    </div>
  );
}

function SalesNavItem({ pathname, salesIcon: SalesIcon, isCollapsed, isOpen, onIconClick, onToggleMenu }: any) {
  const isSalesRoute = pathname.startsWith("/sales");

  return (
    <div className="mb-0.5">
      <div
        className={cn(
          "flex w-full items-center rounded-lg text-sm font-semibold transition group relative",
          isSalesRoute ? "text-orange-500" : "text-slate-600 hover:bg-slate-100 hover:text-orange-500"
        )}
      >
        {isSalesRoute && <div className="absolute -left-3 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r-md bg-orange-500" />}
        <button type="button" onClick={onIconClick} className={cn("flex items-center justify-center outline-none bg-transparent border-none cursor-pointer", isCollapsed ? "w-full py-3" : "py-2 pl-3")}>
          <SalesIcon className="size-5 shrink-0" />
        </button>
        {!isCollapsed && (
          <>
            <Link href="/sales" onClick={onIconClick} className="flex-1 text-left py-2 outline-none pl-3">
              <span>Sales</span>
            </Link>
            <button type="button" onClick={onToggleMenu} className="p-1.5 mr-1.5 rounded-md hover:bg-black/5 transition-colors cursor-pointer outline-none border-none bg-transparent flex items-center justify-center">
              <AnimatedToggleIcon isOpen={isOpen} />
            </button>
          </>
        )}
      </div>
      <div className={cn("grid transition-all duration-300 ease-in-out", isOpen && !isCollapsed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2 pb-1">
            <SubLink href="/sales" label="Dashboard" icon={LineChart} pathname={pathname} isDefaultActive={pathname === "/sales"} />
            <SubLink href="/sales/invoices" label="Invoices" icon={FileText} pathname={pathname} />
            <SubLink href="/sales/receipts" label="Sales Receipts" icon={Receipt} pathname={pathname} />
            <SubLink href="/sales/quotes" label="Quotes" icon={Quote} pathname={pathname} />
            <SubLink href="/sales/customers" label="Customers" icon={Users} pathname={pathname} />
            <SubLink href="/sales/adjustments" label="Credit Notes" icon={Scale} pathname={pathname} />
            <SubLink href="/sales/refund-receipts" label="Refund Receipts" icon={RotateCcw} pathname={pathname} />
            <SubLink href="/sales/statements" label="Customer Statements" icon={FileText} pathname={pathname} />
            <div className="my-2 ml-2 h-px w-[90%] bg-slate-100" />
            <p className="mb-1 ml-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Settings</p>
            <SubLink href="/sales/settings" label="Sales Settings" icon={Settings} pathname={pathname} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PurchasesNavItem({ pathname, purchasesIcon: PurchasesIcon, isCollapsed, isOpen, onIconClick, onToggleMenu }: any) {
  const isPurchasesRoute = pathname.startsWith("/purchases");

  return (
    <div className="mb-0.5">
      <div
        className={cn(
          "flex w-full items-center rounded-lg text-sm font-semibold transition group relative",
          isPurchasesRoute ? "text-orange-500" : "text-slate-600 hover:bg-slate-100 hover:text-orange-500"
        )}
      >
        {isPurchasesRoute && <div className="absolute -left-3 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r-md bg-orange-500" />}
        <button type="button" onClick={onIconClick} className={cn("flex items-center justify-center outline-none bg-transparent border-none cursor-pointer", isCollapsed ? "w-full py-3" : "py-2 pl-3")}>
          <PurchasesIcon className="size-5 shrink-0" />
        </button>
        {!isCollapsed && (
          <>
            <Link href="/purchases" onClick={onIconClick} className="flex-1 text-left py-2 outline-none pl-3">
              <span>Purchases</span>
            </Link>
            <button type="button" onClick={onToggleMenu} className="p-1.5 mr-1.5 rounded-md hover:bg-black/5 transition-colors cursor-pointer outline-none border-none bg-transparent flex items-center justify-center">
              <AnimatedToggleIcon isOpen={isOpen} />
            </button>
          </>
        )}
      </div>
      <div className={cn("grid transition-all duration-300 ease-in-out", isOpen && !isCollapsed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2 pb-1">
            <SubLink href="/purchases" label="Dashboard" icon={LineChart} pathname={pathname} isDefaultActive={pathname === "/purchases"} />
            <SubLink href="/purchases/orders" label="Purchase Orders" icon={ClipboardList} pathname={pathname} />
            <SubLink href="/purchases/bills" label="Bills" icon={Receipt} pathname={pathname} />
            <SubLink href="/purchases/expense-claims" label="Expense Claims" icon={CreditCard} pathname={pathname} />
            <SubLink href="/purchases/suppliers" label="Suppliers" icon={Truck} pathname={pathname} />
            <div className="my-2 ml-2 h-px w-[90%] bg-slate-100" />
            <p className="mb-1 ml-2 text-[10px] font-bold uppercase tracking-widest text-slate-400">Settings</p>
            <SubLink href="/purchases/settings" label="Purchase Settings" icon={Settings} pathname={pathname} />
          </div>
        </div>
      </div>
    </div>
  );
}

function BankingNavItem({ pathname, bankingIcon: BankingIcon, isCollapsed, isOpen, onIconClick, onToggleMenu }: any) {
  const isBankingRoute = pathname.startsWith("/banking");

  return (
    <div className="mb-0.5">
      <div
        className={cn(
          "flex w-full items-center rounded-lg text-sm font-semibold transition group relative",
          isBankingRoute ? "text-orange-500" : "text-slate-600 hover:bg-slate-100 hover:text-orange-500"
        )}
      >
        {isBankingRoute && <div className="absolute -left-3 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r-md bg-orange-500" />}
        <button type="button" onClick={onIconClick} className={cn("flex items-center justify-center outline-none bg-transparent border-none cursor-pointer", isCollapsed ? "w-full py-3" : "py-2 pl-3")}>
          <BankingIcon className="size-5 shrink-0" />
        </button>
        {!isCollapsed && (
          <>
            <Link href="/banking" onClick={onIconClick} className="flex-1 text-left py-2 outline-none pl-3">
              <span>Banking</span>
            </Link>
            <button type="button" onClick={onToggleMenu} className="p-1.5 mr-1.5 rounded-md hover:bg-black/5 transition-colors cursor-pointer outline-none border-none bg-transparent flex items-center justify-center">
              <AnimatedToggleIcon isOpen={isOpen} />
            </button>
          </>
        )}
      </div>
      <div className={cn("grid transition-all duration-300 ease-in-out", isOpen && !isCollapsed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2 pb-1">
            <SubLink href="/banking" label="Dashboard" icon={Building2} pathname={pathname} isDefaultActive={pathname === "/banking"} />
            <SubLink href="/banking/transactions" label="Transactions" icon={Receipt} pathname={pathname} />
            <SubLink href="/banking/statements" label="Bank Statements" icon={FileText} pathname={pathname} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PayrollNavItem({ pathname, payrollIcon: PayrollIcon, isCollapsed, isOpen, onIconClick, onToggleMenu }: any) {
  const isPayrollRoute = pathname.startsWith("/payroll");

  return (
    <div className="mb-0.5">
      <div
        className={cn(
          "flex w-full items-center rounded-lg text-sm font-semibold transition group relative",
          isPayrollRoute ? "text-orange-500" : "text-slate-600 hover:bg-slate-100 hover:text-orange-500"
        )}
      >
        {isPayrollRoute && <div className="absolute -left-3 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r-md bg-orange-500" />}
        <button type="button" onClick={onIconClick} className={cn("flex items-center justify-center outline-none bg-transparent border-none cursor-pointer", isCollapsed ? "w-full py-3" : "py-2 pl-3")}>
          <PayrollIcon className="size-5 shrink-0" />
        </button>
        {!isCollapsed && (
          <>
            <Link href="/payroll" onClick={onIconClick} className="flex-1 text-left py-2 outline-none pl-3">
              <span>Payroll</span>
            </Link>
            <button type="button" onClick={onToggleMenu} className="p-1.5 mr-1.5 rounded-md hover:bg-black/5 transition-colors cursor-pointer outline-none border-none bg-transparent flex items-center justify-center">
              <AnimatedToggleIcon isOpen={isOpen} />
            </button>
          </>
        )}
      </div>
      <div className={cn("grid transition-all duration-300 ease-in-out", isOpen && !isCollapsed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2 pb-2">
            <p className="px-2 py-1 mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Admin</p>
            <SubLink href="/payroll" label="Dashboard" icon={LineChart} pathname={pathname} isDefaultActive={pathname === "/payroll"} />
            <SubLink href="/payroll/run-payroll" label="Run Payroll" icon={RotateCw} pathname={pathname} />
            <SubLink href="/payroll/employees" label="Employees" icon={Users} pathname={pathname} />
            <SubLink href="/payroll/benefits" label="Benefits" icon={Heart} pathname={pathname} />
            <SubLink href="/payroll/reports" label="Reports" icon={FileText} pathname={pathname} />
            <p className="px-2 py-1 mt-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">Employee Portal</p>
            <SubLink href="/payroll/timeclock" label="Time Clock" icon={CreditCard} pathname={pathname} />
            <SubLink href="/payroll/payslips" label="Payslips" icon={FileText} pathname={pathname} />
            <SubLink href="/payroll/timeoff" label="Time Off" icon={Calendar} pathname={pathname} />
            <SubLink href="/payroll/myprofile" label="My Profile" icon={UserCircle} pathname={pathname} />
            <p className="px-2 py-1 mt-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">Settings</p>
            <SubLink href="/payroll/timesheets" label="Timesheets & Reports" icon={TrendingUp} pathname={pathname} />
            <SubLink href="/payroll/settings" label="Payroll Settings" icon={Settings} pathname={pathname} />
          </div>
        </div>
      </div>
    </div>
  );
}

function PosNavItem({ pathname, posIcon: PosIcon, isCollapsed, isOpen, onIconClick, onToggleMenu }: any) {
  const isPosRoute = pathname.startsWith("/pos");

  return (
    <div className="mb-0.5">
      <div
        className={cn(
          "flex w-full items-center rounded-lg text-sm font-semibold transition group relative",
          isPosRoute ? "text-orange-500" : "text-slate-600 hover:bg-slate-100 hover:text-orange-500"
        )}
      >
        {isPosRoute && <div className="absolute -left-3 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r-md bg-orange-500" />}
        <button type="button" onClick={onIconClick} className={cn("flex items-center justify-center outline-none bg-transparent border-none cursor-pointer", isCollapsed ? "w-full py-3" : "py-2 pl-3")}>
          <PosIcon className="size-5 shrink-0" />
        </button>
        {!isCollapsed && (
          <>
            <Link href="/pos/terminal" onClick={onIconClick} className="flex-1 text-left py-2 outline-none pl-3">
              <span>POS</span>
            </Link>
            <button type="button" onClick={onToggleMenu} className="p-1.5 mr-1.5 rounded-md hover:bg-black/5 transition-colors cursor-pointer outline-none border-none bg-transparent flex items-center justify-center">
              <AnimatedToggleIcon isOpen={isOpen} />
            </button>
          </>
        )}
      </div>
      <div className={cn("grid transition-all duration-300 ease-in-out", isOpen && !isCollapsed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2 pb-2">
            <p className="px-2 py-1 mt-1 text-[9px] font-bold uppercase tracking-wider text-slate-400">Operations</p>
            <SubLink href="/pos/terminal" label="Terminal" icon={ScanBarcode} pathname={pathname} isDefaultActive={pathname === "/pos/terminal"} />
            <SubLink href="/pos/transactions" label="Transactions" icon={CreditCard} pathname={pathname} />
            <SubLink href="/pos/refunds" label="Returns & Refunds" icon={RotateCcw} pathname={pathname} />
            <p className="px-2 py-1 mt-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">Inventory</p>
            <SubLink href="/pos/inventory" label="Products" icon={Package} pathname={pathname} />
            <SubLink href="/pos/stock" label="Stock Levels" icon={Tag} pathname={pathname} />
            <p className="px-2 py-1 mt-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">Analytics</p>
            <SubLink href="/pos/reports" label="Sales Reports" icon={TrendingUp} pathname={pathname} />
            <SubLink href="/pos/reconciliation" label="End of Day" icon={Wallet} pathname={pathname} />
            <p className="px-2 py-1 mt-3 text-[9px] font-bold uppercase tracking-wider text-slate-400">POS Settings</p>
            <SubLink href="/pos/customers" label="Customers CRM" icon={Users} pathname={pathname} />
            {/*
              Hardware Hub (/pos/hardware) and App Integrations (/pos/integrations)
              are hidden: both are empty shells, and clicking through to a blank
              page reads as a broken product. The routes still exist, so putting
              them back is a one-line change once there is something behind them.
            */}
          </div>
        </div>
      </div>
    </div>
  );
}

function TaxesNavItem({ pathname, taxesIcon: TaxesIcon, isCollapsed, isOpen, onIconClick, onToggleMenu }: any) {
  const isTaxesRoute = pathname.startsWith("/taxes");

  return (
    <div className="mb-0.5">
      <div
        className={cn(
          "flex w-full items-center rounded-lg text-sm font-semibold transition group relative",
          isTaxesRoute ? "text-orange-500" : "text-slate-600 hover:bg-slate-100 hover:text-orange-500"
        )}
      >
        {isTaxesRoute && <div className="absolute -left-3 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r-md bg-orange-500" />}
        <button type="button" onClick={onIconClick} className={cn("flex items-center justify-center outline-none bg-transparent border-none cursor-pointer", isCollapsed ? "w-full py-3" : "py-2 pl-3")}>
          <TaxesIcon className="size-5 shrink-0" />
        </button>
        {!isCollapsed && (
          <>
            <Link href="/taxes" onClick={onIconClick} className="flex-1 text-left py-2 outline-none pl-3">
              <span>Taxes</span>
            </Link>
            <button type="button" onClick={onToggleMenu} className="p-1.5 mr-1.5 rounded-md hover:bg-black/5 transition-colors cursor-pointer outline-none border-none bg-transparent flex items-center justify-center">
              <AnimatedToggleIcon isOpen={isOpen} />
            </button>
          </>
        )}
      </div>
      <div className={cn("grid transition-all duration-300 ease-in-out", isOpen && !isCollapsed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2 pb-1">
            <SubLink href="/taxes" label="Dashboard" icon={Building2} pathname={pathname} isDefaultActive={pathname === "/taxes"} />
            <SubLink href="/taxes/ec-sales" label="EC Sales Tax" icon={Globe} pathname={pathname} />
            <SubLink href="/taxes/forex" label="Forex Gains/Losses" icon={ArrowRightLeft} pathname={pathname} />
            <SubLink href="/taxes/corporation" label="Corporation Tax" icon={Building2} pathname={pathname} />
            <SubLink href="/taxes/vat" label="VAT Details" icon={Receipt} pathname={pathname} />
            <SubLink href="/taxes/self-employed" label="Self-Employed (MTD)" icon={UserCircle} pathname={pathname} />
            <SubLink href="/taxes/cis" label="CIS (Construction)" icon={HardHat} pathname={pathname} />
            <SubLink href="/taxes/capital-gains" label="Capital Gains" icon={TrendingUp} pathname={pathname} />
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountingNavItem({ pathname, accountingIcon: AccountingIcon, isCollapsed, isOpen, onIconClick, onToggleMenu }: any) {
  const isAccountingRoute = pathname.startsWith("/accounting");

  return (
    <div className="mb-0.5">
      <div
        className={cn(
          "flex w-full items-center rounded-lg text-sm font-semibold transition group relative",
          isAccountingRoute ? "text-orange-500" : "text-slate-600 hover:bg-slate-100 hover:text-orange-500"
        )}
      >
        {isAccountingRoute && <div className="absolute -left-3 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r-md bg-orange-500" />}
        <button type="button" onClick={onIconClick} className={cn("flex items-center justify-center outline-none bg-transparent border-none cursor-pointer", isCollapsed ? "w-full py-3" : "py-2 pl-3")}>
          <AccountingIcon className="size-5 shrink-0" />
        </button>
        {!isCollapsed && (
          <>
            <Link href="/accounting/chart-of-accounts" onClick={onIconClick} className="flex-1 text-left py-2 outline-none pl-3">
              <span>Accounting</span>
            </Link>
            <button type="button" onClick={onToggleMenu} className="p-1.5 mr-1.5 rounded-md hover:bg-black/5 transition-colors cursor-pointer outline-none border-none bg-transparent flex items-center justify-center">
              <AnimatedToggleIcon isOpen={isOpen} />
            </button>
          </>
        )}
      </div>
      <div className={cn("grid transition-all duration-300 ease-in-out", isOpen && !isCollapsed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2 pb-1">
            <SubLink href="/accounting/chart-of-accounts" label="Chart of Accounts" icon={FileText} pathname={pathname} isDefaultActive={pathname === "/accounting"} />
            <SubLink href="/accounting/journals" label="Manual Journals" icon={Receipt} pathname={pathname} />
          </div>
        </div>
      </div>
    </div>
  );
}

function ReportsNavItem({ pathname, reportsIcon: ReportsIcon, isCollapsed, onIconClick }: any) {
  const isReportsRoute = pathname.startsWith("/reports");

  return (
    <div className="mb-0.5">
      <div
        className={cn(
          "flex w-full items-center rounded-lg text-sm font-semibold transition group relative",
          isReportsRoute ? "text-orange-500" : "text-slate-600 hover:bg-slate-100 hover:text-orange-500"
        )}
      >
        {isReportsRoute && <div className="absolute -left-3 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r-md bg-orange-500" />}
        <button type="button" onClick={onIconClick} className={cn("flex items-center justify-center outline-none bg-transparent border-none cursor-pointer", isCollapsed ? "w-full py-3" : "py-2 pl-3")}>
          <ReportsIcon className="size-5 shrink-0" />
        </button>
        {!isCollapsed && (
          <Link href="/reports" onClick={onIconClick} className="flex-1 text-left py-2 outline-none pl-3">
            <span>Reports</span>
          </Link>
        )}
      </div>
    </div>
  );
}

function HelpNavItem({ pathname, helpIcon: HelpIcon, isCollapsed, isOpen, onIconClick, onToggleMenu }: any) {
  const isHelpRoute = pathname.startsWith("/help");

  return (
    <div className="mb-0.5">
      <div
        className={cn(
          "flex w-full items-center rounded-lg text-sm font-semibold transition group relative",
          isHelpRoute ? "text-orange-500" : "text-slate-600 hover:bg-slate-100 hover:text-orange-500"
        )}
      >
        {isHelpRoute && <div className="absolute -left-3 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r-md bg-orange-500" />}
        <button type="button" onClick={onToggleMenu} className={cn("flex items-center justify-center outline-none bg-transparent border-none cursor-pointer", isCollapsed ? "w-full py-3" : "py-2 pl-3")}>
          <HelpIcon className="size-5 shrink-0" />
        </button>
        {!isCollapsed && (
          <>
            <button type="button" onClick={onToggleMenu} className="flex-1 text-left py-2 outline-none pl-3 bg-transparent border-none cursor-pointer font-semibold text-inherit">
              <span>Help & Support</span>
            </button>
            <button type="button" onClick={onToggleMenu} className="p-1.5 mr-1.5 rounded-md hover:bg-black/5 transition-colors cursor-pointer outline-none border-none bg-transparent flex items-center justify-center">
              <AnimatedToggleIcon isOpen={isOpen} />
            </button>
          </>
        )}
      </div>
      <div className={cn("grid transition-all duration-300 ease-in-out", isOpen && !isCollapsed ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <div className="ml-5 mt-1 flex flex-col gap-0.5 border-l border-slate-200 pl-2 pb-1">
            <SubLink href="/help/knowledge-base" label="Knowledge Base" icon={BookOpen} pathname={pathname} />
            {/* 🚀 Redirects to your homepage video section! Make sure you add id="features" or id="feature-experience" to your homepage block! */}
            <SubLink href="/#feature-experience" label="Video Tutorials" icon={PlayCircle} pathname={pathname} />
            <SubLink href="/help/contact" label="Contact Support" icon={MessageSquare} pathname={pathname} />
          </div>
        </div>
      </div>
    </div>
  );
}



// ─── UTILITY SUBLINKS & PLAIN ITEMS ──────────────────────────────────────────

function SubLink({ href, label, icon: Icon, pathname, isDefaultActive = false }: any) {
  return (
    <Suspense fallback={<SubLinkAnchor href={href} label={label} icon={Icon} isActive={pathname === href || isDefaultActive} />}>
      <SubLinkWithSearchParams href={href} label={label} icon={Icon} pathname={pathname} isDefaultActive={isDefaultActive} />
    </Suspense>
  );
}

function SubLinkWithSearchParams({ href, label, icon: Icon, pathname, isDefaultActive = false }: any) {
  const searchParams = useSearchParams();
  const currentView = searchParams.get("view");
  const isViewMatch = href.includes("?view=") && href.includes(`view=${currentView}`);
  const isActive = (currentView && isViewMatch) || (!currentView && (pathname === href || isDefaultActive));
  return <SubLinkAnchor href={href} label={label} icon={Icon} isActive={Boolean(isActive)} />;
}

function SubLinkAnchor({ href, label, icon: Icon, isActive }: any) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
        isActive 
          ? "font-bold text-orange-500" 
          : "font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      )}
    >
      <Icon className={cn("size-3.5", isActive ? "text-orange-500" : "text-slate-400")} />
      {label}
    </Link>
  );
}

function SidebarItem({ label, icon: Icon, pathname, isCollapsed, onIconClick }: any) {
  const href = navHrefs[label] ?? `/${label.toLowerCase()}`;
  const isActive = pathname === href || pathname.startsWith(href + "/");
  const menuKey = label.toLowerCase();

  return (
    <div
      className={cn(
        "mb-0.5 flex w-full items-center rounded-lg text-sm font-semibold transition group relative",
        isActive ? "text-orange-500" : "text-slate-600 hover:bg-slate-100 hover:text-orange-500"
      )}
    >
      {isActive && <div className="absolute -left-3 top-1/2 h-8 w-1.5 -translate-y-1/2 rounded-r-md bg-orange-500" />}
      <button
        type="button"
        onClick={(e) => onIconClick(menuKey, href, e)}
        className={cn("flex items-center justify-center outline-none bg-transparent border-none cursor-pointer", isCollapsed ? "w-full py-3" : "py-2 pl-3")}
      >
        <Icon className="size-5 shrink-0" />
      </button>
      {!isCollapsed && (
        <Link 
          href={href} 
          onClick={(e) => onIconClick(menuKey, href, e)} 
          className="flex-1 text-left py-2 pl-3"
        >
          <span>{label}</span>
        </Link>
      )}
    </div>
  );
}
