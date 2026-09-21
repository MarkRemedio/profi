import "server-only";

import { prisma } from "@/lib/prisma";
import type { AdminContext } from "@/lib/admin/auth";

export type AdminAuditSeverity = "info" | "warning" | "critical";

/**
 * Every admin-portal action worth recording.
 *
 * Kept as a union rather than free strings so the Security page can label them
 * reliably and a typo can't create a silently unfilterable action.
 */
export type AdminAuditAction =
  // Team
  | "admin.create"
  | "admin.update_access"
  | "admin.remove"
  | "admin.suspend"
  | "admin.reactivate"
  | "admin.otp_send"
  | "admin.otp_verify"
  | "admin.otp_fail"
  // Accountant / clients
  | "client.invite"
  | "client.invite_resend"
  | "client.invite_cancel"
  | "client.assign_accountant"
  | "client.wipe_data"
  | "client.delete"
  | "client.impersonate_start"
  | "client.impersonate_stop"
  // Platform
  | "settings.update";

export type AdminAuditTargetType =
  | "admin"
  | "organization"
  | "client_invitation"
  | "platform";

/** Actor fields captured at write time so the record survives admin deletion. */
export type AdminAuditActor = {
  userId: string;
  email?: string | null;
  name?: string | null;
};

/** Convenience: pull the actor out of an AdminContext. */
export function auditActorFrom(context: AdminContext): AdminAuditActor {
  return {
    userId: context.user.id,
    email: context.user.email ?? null,
    name:
      (context.user.user_metadata?.name as string | undefined) ??
      (context.user.user_metadata?.full_name as string | undefined) ??
      null,
  };
}

/**
 * Record an admin action.
 *
 * Deliberately never throws. A failed audit write must not roll back or block
 * the operation the admin actually asked for — it is logged to the server
 * console instead so the gap is visible without breaking the request.
 */
export async function logAdminAction(input: {
  actor: AdminAuditActor;
  action: AdminAuditAction;
  targetType: AdminAuditTargetType;
  targetId?: string | null;
  targetLabel?: string | null;
  severity?: AdminAuditSeverity;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await prisma.adminAuditEvent.create({
      data: {
        actorUserId: input.actor.userId,
        actorEmail: input.actor.email ?? null,
        actorName: input.actor.name ?? null,
        action: input.action,
        targetType: input.targetType,
        targetId: input.targetId ?? null,
        targetLabel: input.targetLabel ?? null,
        severity: input.severity ?? "info",
        metadata: (input.metadata ?? {}) as object,
      },
    });
  } catch (error) {
    console.error(`Failed to write admin audit event (${input.action}):`, error);
  }
}

/** Human labels for the Security page. */
export const ADMIN_AUDIT_LABELS: Record<AdminAuditAction, string> = {
  "admin.create": "Created administrator",
  "admin.update_access": "Changed administrator access",
  "admin.remove": "Removed administrator",
  "admin.suspend": "Suspended administrator",
  "admin.reactivate": "Reactivated administrator",
  "admin.otp_send": "Sent login verification code",
  "admin.otp_verify": "Verified login code",
  "admin.otp_fail": "Failed login code attempt",
  "client.invite": "Invited client",
  "client.invite_resend": "Resent client invitation",
  "client.invite_cancel": "Cancelled client invitation",
  "client.assign_accountant": "Reassigned accountant",
  "client.wipe_data": "Wiped client data",
  "client.delete": "Deleted client",
  "client.impersonate_start": "Started impersonation",
  "client.impersonate_stop": "Stopped impersonation",
  "settings.update": "Updated platform settings",
};
