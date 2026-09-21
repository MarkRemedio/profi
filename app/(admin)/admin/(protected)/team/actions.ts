"use server";

import { revalidatePath } from "next/cache";
import { createClient as createServiceClient } from "@supabase/supabase-js";

import { prisma } from "@/lib/prisma";
import { getAdminContext, requireSuperAdmin, PLATFORM_ADMIN_ROLE } from "@/lib/admin/auth";
import { auditActorFrom, logAdminAction } from "@/lib/admin/audit";
import {
  ALL_ADMIN_PERMISSION_KEYS,
  normalizeAdminPermissions,
  type AdminRoleValue,
} from "@/lib/admin/permissions";

export type AdminUserItem = {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: AdminRoleValue;
  status: string;
  permissions: string[];
};

export type TeamActionState = {
  error?: string;
  success?: boolean;
  message?: string;
} | null;

const MIN_PASSWORD_LENGTH = 8;
const VALID_ROLES: AdminRoleValue[] = ["SUPER_ADMIN", "SUPPORT", "CUSTOM"];

/**
 * Service-role client — required to create auth users and to write the
 * `platform_admin` claim. Never expose this key to the browser; it is only
 * ever constructed inside a server action that has already passed a guard.
 */
function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured — admin provisioning is unavailable."
    );
  }

  return createServiceClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function parseRole(value: FormDataEntryValue | null): AdminRoleValue | null {
  const role = typeof value === "string" ? (value as AdminRoleValue) : null;
  return role && VALID_ROLES.includes(role) ? role : null;
}

/**
 * A Super Admin implicitly holds everything, so we persist the full key list
 * for them rather than whatever the (disabled) checkboxes submitted.
 */
function permissionsForRole(role: AdminRoleValue, submitted: string[]): string[] {
  if (role === "SUPER_ADMIN") return [...ALL_ADMIN_PERMISSION_KEYS];
  return normalizeAdminPermissions(submitted);
}

/** Same precedence the admin shell uses, so a name never renders two ways. */
function displayNameFrom(meta: unknown, email: string | null): string {
  if (meta && typeof meta === "object") {
    const record = meta as Record<string, unknown>;
    if (typeof record.name === "string" && record.name) return record.name;
    if (typeof record.full_name === "string" && record.full_name) return record.full_name;
  }
  return email?.split("@")[0] || "Admin User";
}

/** Guards against demoting or removing the last remaining Super Admin. */
async function isLastSuperAdmin(profileId: string): Promise<boolean> {
  const superAdmins = await prisma.adminProfile.findMany({
    where: { role: "SUPER_ADMIN", status: "Active" },
    select: { id: true },
  });

  return superAdmins.length <= 1 && superAdmins.some((p) => p.id === profileId);
}

/**
 * Fetch all admin users and their profiles.
 *
 * Guarded even though it is only called from the (protected) team page — an
 * exported server function is reachable over HTTP on its own.
 */
export async function getAdminUsers(): Promise<AdminUserItem[]> {
  await getAdminContext();

  const adminProfiles = await prisma.adminProfile.findMany({
    include: { users: true },
    orderBy: { createdAt: "desc" },
  });

  return adminProfiles.map((profile) => ({
    id: profile.id,
    userId: profile.userId,
    name: displayNameFrom(profile.users.raw_user_meta_data, profile.users.email),
    email: profile.users.email || "",
    role: profile.role as AdminRoleValue,
    status: profile.status,
    permissions: profile.permissions,
  }));
}

/**
 * Create a brand-new administrator: auth user + platform_admin claim + profile.
 *
 * All three steps matter. The AdminProfile row alone grants nothing — the
 * `app_metadata.role` claim is what the edge gate and `requirePlatformAdmin`
 * actually check.
 */
export async function createAdminAction(
  _prevState: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  try {
    const context = await requireSuperAdmin();

    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim().toLowerCase();
    const password = String(formData.get("password") ?? "");
    const role = parseRole(formData.get("role"));
    const permissions = permissionsForRole(
      role ?? "CUSTOM",
      formData.getAll("permissions").map(String)
    );

    if (!name) return { error: "Full name is required." };
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { error: "A valid email address is required." };
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` };
    }
    if (!role) return { error: "Select a valid role." };
    if (role !== "SUPER_ADMIN" && permissions.length === 0) {
      return { error: "Select at least one module this admin can access." };
    }

    const existing = await prisma.users.findFirst({ where: { email } });
    if (existing) {
      return {
        error:
          "An account with this email already exists. Remove it first, or grant admin access to that user directly.",
      };
    }

    const supabaseAdmin = serviceClient();

    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Skip the confirmation email — an admin provisioned this account.
      user_metadata: { name, display_name: name },
      app_metadata: { role: PLATFORM_ADMIN_ROLE },
    });

    if (createError || !created.user) {
      return { error: createError?.message || "Failed to create the authentication account." };
    }

    try {
      await prisma.adminProfile.create({
        data: {
          userId: created.user.id,
          role,
          permissions,
          status: "Active",
        },
      });
    } catch (profileError) {
      // Roll back the auth user so a failed profile write cannot leave behind
      // an account that holds the platform_admin claim with no profile — which
      // the bootstrap rule in getAdminContext would read as a Super Admin.
      await supabaseAdmin.auth.admin.deleteUser(created.user.id).catch(() => {});
      throw profileError;
    }

    await logAdminAction({
      actor: auditActorFrom(context),
      action: "admin.create",
      targetType: "admin",
      targetId: created.user.id,
      targetLabel: `${name} <${email}>`,
      severity: "warning",
      metadata: { role, permissions },
    });

    revalidatePath("/admin/team");
    return { success: true, message: `${name} can now sign in to the admin portal.` };
  } catch (error) {
    console.error("Failed to create admin:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to create the administrator.",
    };
  }
}

/** Change an existing administrator's role and module grants. */
export async function updateAdminAction(
  _prevState: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  try {
    const context = await requireSuperAdmin();

    const profileId = String(formData.get("profileId") ?? "");
    const role = parseRole(formData.get("role"));
    if (!profileId) return { error: "Missing administrator reference." };
    if (!role) return { error: "Select a valid role." };

    const permissions = permissionsForRole(
      role,
      formData.getAll("permissions").map(String)
    );
    if (role !== "SUPER_ADMIN" && permissions.length === 0) {
      return { error: "Select at least one module this admin can access." };
    }

    const target = await prisma.adminProfile.findUnique({ where: { id: profileId } });
    if (!target) return { error: "Administrator not found." };

    // Self-demotion would revoke the caller's own ability to undo the change.
    if (target.userId === context.user.id && role !== "SUPER_ADMIN") {
      return { error: "You cannot remove your own Super Admin role." };
    }

    if (
      target.role === "SUPER_ADMIN" &&
      role !== "SUPER_ADMIN" &&
      (await isLastSuperAdmin(profileId))
    ) {
      return { error: "This is the last Super Admin — promote another one first." };
    }

    await prisma.adminProfile.update({
      where: { id: profileId },
      data: { role, permissions },
    });

    await logAdminAction({
      actor: auditActorFrom(context),
      action: "admin.update_access",
      targetType: "admin",
      targetId: target.userId,
      targetLabel: profileId,
      severity: "warning",
      metadata: {
        before: { role: target.role, permissions: target.permissions },
        after: { role, permissions },
      },
    });

    revalidatePath("/admin/team");
    return { success: true, message: "Access updated." };
  } catch (error) {
    console.error("Failed to update admin:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to update the administrator.",
    };
  }
}

/**
 * Revoke admin access.
 *
 * Deletes the profile and strips the platform_admin claim, but deliberately
 * does NOT delete the auth user — the same person may hold a customer account,
 * and destroying it would cascade through their organization data.
 */
export async function removeAdminAction(profileId: string): Promise<TeamActionState> {
  try {
    const context = await requireSuperAdmin();

    const target = await prisma.adminProfile.findUnique({ where: { id: profileId } });
    if (!target) return { error: "Administrator not found." };

    if (target.userId === context.user.id) {
      return { error: "You cannot remove your own admin access." };
    }

    if (target.role === "SUPER_ADMIN" && (await isLastSuperAdmin(profileId))) {
      return { error: "This is the last Super Admin — promote another one first." };
    }

    const supabaseAdmin = serviceClient();
    const { error: claimError } = await supabaseAdmin.auth.admin.updateUserById(target.userId, {
      app_metadata: { role: null },
    });

    if (claimError) {
      return { error: `Failed to revoke portal access: ${claimError.message}` };
    }

    await prisma.adminProfile.delete({ where: { id: profileId } });

    await logAdminAction({
      actor: auditActorFrom(context),
      action: "admin.remove",
      targetType: "admin",
      targetId: target.userId,
      targetLabel: profileId,
      severity: "critical",
      metadata: { role: target.role },
    });

    revalidatePath("/admin/team");
    return { success: true, message: "Admin access revoked." };
  } catch (error) {
    console.error("Failed to remove admin:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to remove the administrator.",
    };
  }
}

/** Suspend or reactivate an admin without destroying their profile. */
export async function setAdminStatusAction(
  profileId: string,
  status: "Active" | "Suspended"
): Promise<TeamActionState> {
  try {
    const context = await requireSuperAdmin();

    const target = await prisma.adminProfile.findUnique({ where: { id: profileId } });
    if (!target) return { error: "Administrator not found." };

    if (target.userId === context.user.id) {
      return { error: "You cannot suspend your own account." };
    }

    if (
      status === "Suspended" &&
      target.role === "SUPER_ADMIN" &&
      (await isLastSuperAdmin(profileId))
    ) {
      return { error: "This is the last Super Admin — promote another one first." };
    }

    await prisma.adminProfile.update({ where: { id: profileId }, data: { status } });

    await logAdminAction({
      actor: auditActorFrom(context),
      action: status === "Suspended" ? "admin.suspend" : "admin.reactivate",
      targetType: "admin",
      targetId: target.userId,
      targetLabel: profileId,
      severity: status === "Suspended" ? "warning" : "info",
    });

    revalidatePath("/admin/team");
    return { success: true, message: `Administrator ${status.toLowerCase()}.` };
  } catch (error) {
    console.error("Failed to change admin status:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to change the status.",
    };
  }
}