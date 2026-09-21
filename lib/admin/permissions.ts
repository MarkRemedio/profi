/**
 * The single source of truth for admin module access.
 *
 * Every consumer derives from this file — the sidebar nav (components/admin/shell.tsx),
 * the checkbox matrix (components/admin/team/role-permissions-matrix.tsx), and the
 * server-side page guards (lib/admin/auth.ts). Adding a module here is the only step
 * needed to make it appear in the nav, in the matrix, and become grantable.
 *
 * Keys are STABLE SLUGS, never display labels: they are persisted into
 * AdminProfile.permissions[], so renaming a label must not orphan stored grants.
 *
 * NOTE: no icons live here on purpose. This module is imported by server code
 * (server actions, page guards), so it stays pure data with no React dependency.
 * The icon map lives in the shell.
 */

export type AdminPermissionKey =
  | "overview"
  | "clients"
  | "subscriptions"
  | "plans"
  | "billing_controls"
  | "support"
  | "feedback"
  | "health"
  | "roadmap"
  | "analytics"
  | "impersonate"
  | "accountant"
  | "security"
  | "team";

export type AdminModule = {
  key: AdminPermissionKey;
  label: string;
  href: string;
};

export type AdminModuleGroup = {
  group: string;
  items: AdminModule[];
};

/**
 * `/admin/settings` is deliberately absent: it is each admin's own account page
 * (read-only email + change password), so it is never permission-gated —
 * every admin must be able to reach it. The shell renders it as a fixed item.
 */
export const ADMIN_MODULE_GROUPS: AdminModuleGroup[] = [
  {
    group: "Command Center",
    items: [
      { key: "overview", label: "Overview", href: "/admin" },
      { key: "clients", label: "Clients", href: "/admin/clients" },
      { key: "subscriptions", label: "Subscriptions", href: "/admin/subscriptions" },
    ],
  },
  {
    group: "Billing",
    items: [
      { key: "plans", label: "Plans", href: "/admin/plans" },
      { key: "billing_controls", label: "Billing Controls", href: "/admin/billing-extras" },
    ],
  },
  {
    group: "Operations",
    items: [
      { key: "support", label: "Support & Chat", href: "/admin/support-new" },
      { key: "feedback", label: "Feedback Center", href: "/admin/feedback" },
      { key: "health", label: "System Health", href: "/admin/health" },
      { key: "roadmap", label: "Feature Requests", href: "/admin/roadmap" },
      { key: "analytics", label: "Analytics", href: "/admin/support-analytics" },
      { key: "impersonate", label: "Impersonate", href: "/admin/impersonate" },
    ],
  },
  {
    group: "Accountant",
    items: [{ key: "accountant", label: "Accountant", href: "/admin/accountant" }],
  },
  {
    group: "System",
    items: [
      { key: "security", label: "Security", href: "/admin/security" },
      { key: "team", label: "Team", href: "/admin/team" },
    ],
  },
];

export const ALL_ADMIN_PERMISSION_KEYS: AdminPermissionKey[] = ADMIN_MODULE_GROUPS.flatMap(
  (group) => group.items.map((item) => item.key)
);

const PERMISSION_KEY_SET = new Set<string>(ALL_ADMIN_PERMISSION_KEYS);

const MODULE_LABELS: Record<string, string> = Object.fromEntries(
  ADMIN_MODULE_GROUPS.flatMap((group) => group.items.map((item) => [item.key, item.label]))
);

/** Mirrors the Prisma `AdminRole` enum without importing @prisma/client into client bundles. */
export type AdminRoleValue = "SUPER_ADMIN" | "SUPPORT" | "CUSTOM";

export const ADMIN_ROLE_LABELS: Record<AdminRoleValue, string> = {
  SUPER_ADMIN: "Super Admin",
  SUPPORT: "Support Manager",
  CUSTOM: "Custom Access",
};

/**
 * Starting checkboxes when a role is picked in the form.
 *
 * SUPER_ADMIN is not a preset but a rule — it always resolves to every key
 * (see `resolveAdminPermissions`), so new modules are granted automatically.
 * SUPPORT seeds a sensible default that the operator can still tick/untick.
 */
export const ADMIN_ROLE_PRESETS: Record<AdminRoleValue, AdminPermissionKey[]> = {
  SUPER_ADMIN: ALL_ADMIN_PERMISSION_KEYS,
  SUPPORT: ["overview", "clients", "support", "feedback", "roadmap", "analytics"],
  CUSTOM: [],
};

export function isAdminPermissionKey(value: string): value is AdminPermissionKey {
  return PERMISSION_KEY_SET.has(value);
}

/** Drops anything that is not a known key — never trust a permission list from the client. */
export function normalizeAdminPermissions(values: readonly string[]): AdminPermissionKey[] {
  const seen = new Set<AdminPermissionKey>();
  for (const value of values) {
    if (isAdminPermissionKey(value)) seen.add(value);
  }
  // Return in registry order so stored arrays are stable and diffable.
  return ALL_ADMIN_PERMISSION_KEYS.filter((key) => seen.has(key));
}

/**
 * The effective grant list. A Super Admin implicitly holds every permission,
 * including modules added after their profile row was written.
 */
export function resolveAdminPermissions(
  role: AdminRoleValue,
  permissions: readonly string[]
): AdminPermissionKey[] {
  if (role === "SUPER_ADMIN") return ALL_ADMIN_PERMISSION_KEYS;
  return normalizeAdminPermissions(permissions);
}

export function hasAdminPermission(
  role: AdminRoleValue,
  permissions: readonly string[],
  key: AdminPermissionKey
): boolean {
  if (role === "SUPER_ADMIN") return true;
  return permissions.includes(key);
}

export function adminPermissionLabel(key: string): string {
  return MODULE_LABELS[key] ?? key;
}

/**
 * Where to send an admin after sign-in.
 *
 * `/admin` (Overview) is itself a grantable module, so a Clients-only admin
 * would be bounced straight back off it. Land them on the first module they
 * actually hold instead, falling back to the always-reachable settings page.
 */
export function adminHomeHref(permissions: readonly string[]): string {
  const granted = new Set(permissions);

  for (const group of ADMIN_MODULE_GROUPS) {
    for (const item of group.items) {
      if (granted.has(item.key)) return item.href;
    }
  }

  return "/admin/settings";
}
