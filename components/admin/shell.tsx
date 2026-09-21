"use client";

import { useMemo, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Bell,
  Building2,
  Calculator,
  PanelLeftClose,
  PanelLeftOpen,
  CreditCard,
  Eye,
  FlaskConical,
  HeadphonesIcon,
  LayoutDashboard,
  LogOut,
  Map,
  MessageSquareWarning,
  Settings,
  Shield,
  Tag,
  Activity,
  Menu,
  X, // also used as the per-notification dismiss control
  User, // 🚀 Added User icon for profile card
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  ADMIN_MODULE_GROUPS,
  type AdminPermissionKey,
} from "@/lib/admin/permissions";
import type { AdminNotifications } from "@/lib/admin/notifications";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import { adminSignOut } from "@/app/(admin)/admin/login/actions";
import {
  clearAdminNotificationsAction,
  dismissAdminNotificationAction,
} from "@/app/(admin)/admin/(protected)/notifications-actions";
import { AdminSearch } from "./admin-search";
import { ImpersonationProvider } from "./impersonation-context";
import { ImpersonationBanner } from "./impersonation-banner";

export interface AdminIdentity {
  email: string;
  name: string;
}

/**
 * Icons live here rather than in the registry so `lib/admin/permissions.ts`
 * stays pure data and safe to import from server actions and guards.
 */
const MODULE_ICONS: Record<AdminPermissionKey, typeof LayoutDashboard> = {
  overview: LayoutDashboard,
  clients: Building2,
  subscriptions: CreditCard,
  plans: FlaskConical,
  billing_controls: Tag,
  support: HeadphonesIcon,
  feedback: MessageSquareWarning,
  health: Activity,
  roadmap: Map,
  analytics: BarChart3,
  impersonate: Eye,
  accountant: Calculator,
  security: Shield,
  team: User,
};

/**
 * Account settings is not a grantable module — every admin needs it to change
 * their own password — so it is appended to the System group unconditionally.
 */
const SETTINGS_ITEM = {
  key: "settings" as const,
  label: "Settings",
  href: "/admin/settings",
  icon: Settings,
};

interface MasterSidebarProps {
  isCollapsed: boolean;
  setIsCollapsed: (v: boolean) => void;
  identity: AdminIdentity;
  isMobileOpen: boolean;
  setIsMobileOpen: (v: boolean) => void;
  feedbackNewCount: number;
  permissions: string[];
}

function MasterSidebar({ isCollapsed, setIsCollapsed, identity, isMobileOpen, setIsMobileOpen, feedbackNewCount, permissions }: MasterSidebarProps) {
  const pathname = usePathname();

  // Hiding a link is cosmetic only — each page re-checks the grant server-side
  // via requireAdminPermission, so a typed-in URL is still refused.
  const granted = new Set(permissions);
  const navItems = ADMIN_MODULE_GROUPS.map((group) => ({
    group: group.group,
    items: [
      ...group.items
        .filter((item) => granted.has(item.key))
        .map((item) => ({ ...item, icon: MODULE_ICONS[item.key] })),
      ...(group.group === "System" ? [SETTINGS_ITEM] : []),
    ],
  })).filter((group) => group.items.length > 0);

  return (
    <aside
      className={cn(
        "fixed top-3 bottom-3 left-3 z-50 flex flex-col border border-slate-800 bg-slate-950 shadow-2xl transition-all duration-300 ease-in-out rounded-2xl",
        isCollapsed ? "md:w-16" : "md:w-64",
        isMobileOpen ? "translate-x-0 w-64" : "-translate-x-full md:translate-x-0"
      )}
    >
      {/* Sidebar Header Logo Area */}
      <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-900 px-4">
        <div className="flex items-center gap-2.5 mx-auto md:mx-0">
          {/* 🚀 BLUE "W" BRAND ICON - Styled exactly like the customer portal */}
          <div className="flex size-8 shrink-0 items-center justify-center rounded-xl bg-blue-600 shadow-md shadow-blue-500/25 font-black text-white text-base select-none tracking-tighter">
            W
          </div>
          {(!isCollapsed || isMobileOpen) && (
            <div>
              <p className="text-sm font-extrabold tracking-tight text-white mb-0">Waw Profi</p>
              <p className="text-[9px] font-bold uppercase tracking-widest text-blue-400 mt-0">Master Control</p>
            </div>
          )}
        </div>

        {/* 📱 Mobile Close Drawer Button */}
        <button
          onClick={() => setIsMobileOpen(false)}
          aria-label="Close menu"
          className="flex md:hidden size-8 items-center justify-center rounded-md text-slate-400 transition hover:bg-slate-800 hover:text-white border-none bg-transparent cursor-pointer"
        >
          <X className="size-5" />
        </button>
      </div>

      {/* COLLAPSED STATE ARROW TOGGLE */}
      {isCollapsed && !isMobileOpen && (
        <div className="flex justify-center py-2.5 border-b border-slate-900/50">
          <button
            onClick={() => setIsCollapsed(false)}
            className="flex size-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-slate-800 hover:text-white border-none bg-transparent cursor-pointer"
            title="Expand sidebar"
          >
            <PanelLeftOpen className="size-4" />
          </button>
        </div>
      )}

      {/* Main Navigation Matrix Loop */}
      <nav className="flex-1 overflow-y-auto px-2 py-4 scrollbar-none">
        {navItems.map((group, groupIndex) => (
          <div key={group.group} className="mb-5">
            {(!isCollapsed || isMobileOpen) && (
              <div className="flex items-center justify-between mb-2 px-2">
                <p className="text-[9px] font-bold uppercase tracking-[0.12em] text-slate-500 m-0">
                  {group.group}
                </p>
                {/* EXPANDED STATE INLINE TOGGLE — anchored to whichever group is
                    first, since Command Center may be filtered out entirely. */}
                {groupIndex === 0 && (
                  <button
                    onClick={() => setIsCollapsed(true)}
                    className="text-slate-500 hover:text-white transition border-none bg-transparent cursor-pointer p-0.5 flex items-center justify-center rounded-md hover:bg-slate-800"
                    title="Collapse sidebar"
                  >
                    <PanelLeftClose className="size-3.5" />
                  </button>
                )}
              </div>
            )}
            
            {group.items.map((item) => {
              const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setIsMobileOpen(false)}
                  className={cn(
                    "mb-0.5 flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm font-semibold transition-colors no-underline",
                    active
                      ? "bg-teal-500/15 text-teal-400"
                      : "text-slate-400 hover:bg-slate-800 hover:text-white",
                    isCollapsed && !isMobileOpen && "md:justify-center px-2"
                  )}
                  title={isCollapsed ? item.label : undefined}
                >
                  <item.icon className="size-4 shrink-0" />
                  {(!isCollapsed || isMobileOpen) && (
                    <span className="flex flex-1 items-center justify-between">
                      {item.label}
                      {item.href === "/admin/feedback" && feedbackNewCount > 0 && (
                        <span className="ml-2 rounded-full bg-teal-500/20 px-1.5 py-0.5 text-[10px] font-bold text-teal-400">
                          {feedbackNewCount}
                        </span>
                      )}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Identity and sign-out now live in the header's user dropdown. */}
    </aside>
  );
}

/**
 * Read-state marker for the header bell, mirroring the feedback bubble's
 * `wawprofi-feedback-last-seen` approach: a per-browser timestamp rather than a
 * DB column, so no schema change is needed. Anything newer than this counts as
 * unread; opening the dropdown marks everything read.
 */
const NOTIFICATIONS_SEEN_KEY = "wawprofi-admin-notifications-last-seen";

/**
 * Minimal external store over that localStorage key.
 *
 * `storage` events only fire in *other* tabs, so writes in this tab notify
 * subscribers directly. Reading via useSyncExternalStore (rather than
 * setState-in-an-effect) keeps the server snapshot explicit and avoids a
 * hydration mismatch: SSR sees null, the client re-reads after hydrating.
 */
const seenListeners = new Set<() => void>();

function subscribeSeen(onChange: () => void) {
  seenListeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    seenListeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

function getSeenSnapshot() {
  return window.localStorage.getItem(NOTIFICATIONS_SEEN_KEY);
}

/** No localStorage on the server — everything reads as unread. */
function getSeenServerSnapshot(): string | null {
  return null;
}

function writeSeen(value: string) {
  window.localStorage.setItem(NOTIFICATIONS_SEEN_KEY, value);
  seenListeners.forEach((listener) => listener());
}

function timeAgo(iso: string) {
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function MasterTopNav({
  identity,
  setIsMobileOpen,
  permissions,
  notifications,
}: {
  identity: AdminIdentity;
  setIsMobileOpen: (v: boolean) => void;
  permissions: string[];
  notifications: AdminNotifications;
}) {
  const initial = (identity.name || identity.email || "A").charAt(0).toUpperCase();
  const [signingOut, startSignOut] = useTransition();
  const [busy, startNotifUpdate] = useTransition();
  const [notifOpen, setNotifOpen] = useState(false);

  const lastSeen = useSyncExternalStore(
    subscribeSeen,
    getSeenSnapshot,
    getSeenServerSnapshot
  );

  const unread = useMemo(() => {
    if (!lastSeen) return notifications.total;
    const seenAt = new Date(lastSeen).getTime();
    return notifications.items.filter((i) => new Date(i.createdAt).getTime() > seenAt)
      .length;
  }, [lastSeen, notifications]);

  const markAllRead = () => {
    // Stamp with the newest item rather than "now", so a signup that lands
    // between this render and the click is not silently swallowed.
    writeSeen(notifications.items[0]?.createdAt ?? new Date().toISOString());
  };

  return (
    <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between bg-transparent px-4 md:px-8 mt-1">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* 📱 Mobile Drawer Toggle Menu Button */}
        <button
          onClick={() => setIsMobileOpen(true)}
          className="flex md:hidden size-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition shadow-sm hover:bg-slate-50 cursor-pointer"
        >
          <Menu className="size-5" />
        </button>

        <AdminSearch permissions={permissions} />
      </div>

      <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-xl px-2 py-1.5 shadow-sm">
        {/* Notifications */}
        <DropdownMenu
          open={notifOpen}
          onOpenChange={(open) => {
            setNotifOpen(open);
            if (open) markAllRead();
          }}
        >
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label={unread > 0 ? `Notifications, ${unread} unread` : "Notifications"}
              className="relative flex size-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 cursor-pointer border-none bg-transparent"
            >
              <Bell className="size-4" />
              {unread > 0 && (
                <span className="absolute right-0.5 top-0.5 flex min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-extrabold text-white">
                  {unread > 9 ? "9+" : unread}
                </span>
              )}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-80">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Notifications</span>
              <span className="text-[10px] font-normal text-slate-400">Last 7 days</span>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />

            {notifications.items.length === 0 ? (
              <p className="px-2 py-6 text-center text-xs text-slate-500">
                No new clients or subscribers.
              </p>
            ) : (
              <>
                <div className="flex gap-2 px-2 pb-2 text-[11px]">
                  <span className="rounded-full bg-blue-50 px-2 py-0.5 font-semibold text-blue-700">
                    {notifications.newClients} new client
                    {notifications.newClients === 1 ? "" : "s"}
                  </span>
                  <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">
                    {notifications.newSubscribers} subscriber
                    {notifications.newSubscribers === 1 ? "" : "s"}
                  </span>
                </div>

                <div className="max-h-72 overflow-y-auto">
                  {notifications.items.map((item) => (
                    <div
                      key={item.id}
                      className="group/notif flex items-start gap-2 rounded-sm px-2 py-1.5 hover:bg-slate-100"
                    >
                      <span
                        className={cn(
                          "mt-1.5 size-1.5 shrink-0 rounded-full",
                          item.kind === "subscriber"
                            ? "bg-emerald-500"
                            : item.kind === "admin"
                              ? "bg-violet-500"
                              : "bg-blue-500"
                        )}
                      />
                      <Link
                        href={item.href}
                        className="min-w-0 flex-1 no-underline"
                        onClick={() => setNotifOpen(false)}
                      >
                        <span className="block truncate text-xs font-semibold text-slate-900">
                          {item.title}
                        </span>
                        <span className="block truncate text-[11px] text-slate-500">
                          {item.detail} · {timeAgo(item.createdAt)}
                        </span>
                      </Link>
                      <button
                        type="button"
                        aria-label={`Dismiss notification for ${item.title}`}
                        disabled={busy}
                        onClick={() =>
                          startNotifUpdate(async () => {
                            await dismissAdminNotificationAction(item.id);
                          })
                        }
                        className="flex size-5 shrink-0 items-center justify-center rounded border-none bg-transparent text-slate-300 opacity-0 transition hover:bg-slate-200 hover:text-slate-600 focus:opacity-100 group-hover/notif:opacity-100 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>

                <DropdownMenuSeparator />
                <div className="flex items-center justify-between px-2 py-1">
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      startNotifUpdate(async () => {
                        await clearAdminNotificationsAction();
                      })
                    }
                    className="rounded border-none bg-transparent px-1 py-0.5 text-xs font-semibold text-slate-500 transition hover:text-slate-900 cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {busy ? "Clearing…" : "Clear all"}
                  </button>
                  <Link
                    href="/admin/clients"
                    onClick={() => setNotifOpen(false)}
                    className="text-xs font-semibold text-teal-700 no-underline hover:underline"
                  >
                    View all clients
                  </Link>
                </div>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="h-4 w-px bg-slate-200" />

        {/* Account menu — identity and sign-out, moved here from the sidebar. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="Account menu"
              className="flex size-8 items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-xs font-bold text-slate-600 transition hover:bg-slate-200 cursor-pointer select-none"
            >
              {initial}
            </button>
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64">
            <div className="flex items-center gap-3 px-2 py-2">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-slate-100 border border-slate-200 text-slate-500">
                <User className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900 m-0">
                  {identity.name || "Admin User"}
                </p>
                <p className="truncate text-xs text-slate-500 m-0">{identity.email}</p>
              </div>
            </div>

            <DropdownMenuSeparator />

            <DropdownMenuItem asChild>
              <Link href="/admin/settings" className="gap-2 no-underline">
                <Settings className="size-4" />
                Account settings
              </Link>
            </DropdownMenuItem>

            <DropdownMenuSeparator />

            {/* Invoked from onSelect rather than a nested <form action={...}>:
                as a menu item the form was unmounted by the menu closing while
                its POST was still in flight, which surfaced as "An unexpected
                response was received from the server". preventDefault keeps the
                menu mounted until the action's redirect navigates away.
                Progressive enhancement is moot here — the menu needs JS to open
                at all. */}
            <DropdownMenuItem
              disabled={signingOut}
              onSelect={(event) => {
                event.preventDefault();
                startSignOut(async () => {
                  await adminSignOut();
                });
              }}
              className="gap-2 text-red-600 focus:text-red-600"
            >
              <LogOut className="size-4" />
              {signingOut ? "Signing out…" : "Sign out"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}

// Declared here rather than imported: lib/admin/notifications.ts is
// `server-only`, so this client component can borrow its type but not its values.
const EMPTY_NOTIFICATIONS: AdminNotifications = {
  newClients: 0,
  newSubscribers: 0,
  newAdmins: 0,
  total: 0,
  items: [],
  allIds: [],
};

export function MasterShell({
  identity,
  feedbackNewCount = 0,
  permissions = [],
  notifications = EMPTY_NOTIFICATIONS,
  children,
}: {
  identity: AdminIdentity;
  feedbackNewCount?: number;
  /** Effective module grants for the signed-in admin; drives nav visibility. */
  permissions?: string[];
  /** Recent signups/conversions shown in the header bell. */
  notifications?: AdminNotifications;
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  return (
    <ImpersonationProvider>
      <div className="h-screen w-screen overflow-hidden bg-slate-50 text-slate-950 flex relative">

        {/* Mobile Backdrop Overlay Tint Toggle */}
        {isMobileOpen && (
          <div 
            // touch-none stops a drag on the backdrop from scrolling the page
            // underneath; taps still close the drawer.
            className="fixed inset-0 z-40 bg-slate-950/40 backdrop-blur-sm md:hidden transition-opacity touch-none overscroll-contain"
            onClick={() => setIsMobileOpen(false)}
          />
        )}

        <MasterSidebar
          isCollapsed={isCollapsed}
          setIsCollapsed={setIsCollapsed}
          identity={identity}
          isMobileOpen={isMobileOpen}
          setIsMobileOpen={setIsMobileOpen}
          feedbackNewCount={feedbackNewCount}
          permissions={permissions}
        />

        <div
          className={cn(
            "flex flex-col h-screen flex-1 overflow-hidden transition-all duration-300 ease-in-out",
            isCollapsed ? "md:pl-[88px]" : "md:pl-[280px]"
          )}
        >
          <ImpersonationBanner />
          <MasterTopNav
            identity={identity}
            setIsMobileOpen={setIsMobileOpen}
            permissions={permissions}
            notifications={notifications}
          />
          
          <main className="flex-1 overflow-y-auto px-4 md:px-8 py-6">
            {children}
          </main>
        </div>

      </div>
    </ImpersonationProvider>
  );
}