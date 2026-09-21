import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import {
  ALL_ADMIN_PERMISSION_KEYS,
  resolveAdminPermissions,
  type AdminPermissionKey,
  type AdminRoleValue,
} from "./permissions";

export const PLATFORM_ADMIN_ROLE = "platform_admin";

/**
 * Pure claim check. Safe to import anywhere (no server-only side effects),
 * so it can be reused by the edge proxy and unit-tested in isolation.
 */
export function isPlatformAdmin(
  user: { app_metadata?: Record<string, unknown> } | null | undefined
): boolean {
  return user?.app_metadata?.role === PLATFORM_ADMIN_ROLE;
}

/**
 * Server guard: redirects to /admin/login unless the current session user
 * carries the platform_admin claim. Returns the authenticated admin user.
 */
export async function requirePlatformAdmin(): Promise<User> {
  // Dynamic import keeps the top-level module free of `next/headers` so that
  // `isPlatformAdmin` stays importable from the edge proxy and tests.
  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!isPlatformAdmin(user)) {
    redirect("/admin/login");
  }

  return user as User;
}

export type AdminContext = {
  user: User;
  /** null when the admin was provisioned by the CLI and has no profile row yet. */
  profileId: string | null;
  role: AdminRoleValue;
  /** Effective grants — a Super Admin always resolves to every module. */
  permissions: AdminPermissionKey[];
  isSuperAdmin: boolean;
};

/**
 * The authenticated admin plus their module grants.
 *
 * Bootstrap rule: a platform admin with NO AdminProfile row is backfilled as a
 * Super Admin on first access. Those accounts were provisioned out-of-band via
 * `scripts/grant-admin.cjs` (service-role key — the highest-trust path), so the
 * row records what the claim already grants. Backfilling rather than treating
 * them as an implicit admin means they show up in Team Management like everyone
 * else, and the "last Super Admin" safety checks can actually count them.
 *
 * A profile whose status is not "Active" is bounced, so suspending an admin
 * takes effect on their next request without deleting their account.
 */
export async function getAdminContext(): Promise<AdminContext> {
  const user = await requirePlatformAdmin();

  // Dynamic import for the same edge-safety reason as above: `lib/prisma`
  // must never be pulled into the middleware bundle via this module.
  const { prisma } = await import("@/lib/prisma");
  let profile = await prisma.adminProfile.findUnique({
    where: { userId: user.id },
  });

  if (!profile) {
    profile = await prisma.adminProfile
      .create({
        data: {
          userId: user.id,
          role: "SUPER_ADMIN",
          permissions: [...ALL_ADMIN_PERMISSION_KEYS],
          status: "Active",
        },
      })
      .catch(async () => {
        // Concurrent first requests race on the userId unique constraint —
        // whichever lost simply reads the row the winner just wrote.
        return prisma.adminProfile.findUnique({ where: { userId: user.id } });
      });
  }

  if (!profile) {
    // Backfill failed and the row still isn't there. The claim is the real
    // gate and it passed, so allow through as Super Admin rather than locking
    // the founding admin out of their own panel over a transient DB error.
    return {
      user,
      profileId: null,
      role: "SUPER_ADMIN",
      permissions: ALL_ADMIN_PERMISSION_KEYS,
      isSuperAdmin: true,
    };
  }

  if (profile.status !== "Active") {
    redirect("/admin/login?error=suspended");
  }

  const role = profile.role as AdminRoleValue;

  return {
    user,
    profileId: profile.id,
    role,
    permissions: resolveAdminPermissions(role, profile.permissions),
    isSuperAdmin: role === "SUPER_ADMIN",
  };
}

/**
 * Page guard: the caller must hold `key`, otherwise they are bounced. Call this
 * at the top of every permission-gated admin page — hiding a nav item is
 * cosmetic, this is the actual enforcement.
 *
 * Denied requests land on /admin/settings — the one page every admin can always
 * reach. Bouncing to /admin is not an option: the overview is itself gated
 * behind the `overview` key, so an admin who lacks it would loop forever.
 */
export async function requireAdminPermission(
  key: AdminPermissionKey
): Promise<AdminContext> {
  const context = await getAdminContext();

  if (!context.permissions.includes(key)) {
    redirect("/admin/settings?error=forbidden");
  }

  return context;
}

/**
 * Guard for operations that change who can administer the platform.
 * Throws rather than redirects so it is safe to call inside server actions,
 * where a redirect would be indistinguishable from success to the caller.
 */
export async function requireSuperAdmin(): Promise<AdminContext> {
  const context = await getAdminContext();

  if (!context.isSuperAdmin) {
    throw new Error("Forbidden: this action requires Super Admin privileges.");
  }

  return context;
}
