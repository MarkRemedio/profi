"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/prisma";
import { getAdminContext, requireAdminPermission } from "@/lib/admin/auth";
import {
  ADMIN_AUDIT_LABELS,
  auditActorFrom,
  logAdminAction,
  type AdminAuditAction,
} from "@/lib/admin/audit";
import {
  getMulticurrencyDefault,
  getOnboardingVisibility,
  setMulticurrencyDefault,
  setOnboardingChartOfAccounts,
  type OnboardingVisibilitySettings,
} from "@/lib/admin/platform-settings";

export type AuditSeverity = "info" | "warning" | "critical";

export type AuditEntry = {
  id: string;
  actor: string;
  actorEmail: string;
  action: string;
  /** Raw dotted action, for filtering. */
  actionKey: string;
  targetType: string;
  target: string;
  timestamp: string;
  severity: AuditSeverity;
};

const AUDIT_LIMIT = 500;

export type SecurityOverview = {
  auditLog: AuditEntry[];
  onboarding: OnboardingVisibilitySettings;
  /** Whether multicurrency is the platform-wide default. */
  multicurrency: boolean;
};

/**
 * The ADMIN audit trail plus the platform onboarding switches.
 *
 * Reads `admin_audit_events` — actions taken in this portal. Deliberately NOT
 * `audit_events`, which is each tenant's own bookkeeping trail (invoices posted,
 * journals reversed) and belongs to the client, not to platform administration.
 *
 * No runAsSystem needed: admin_audit_events has no organizationId, so the
 * tenancy extension does not scope it.
 */
export async function getSecurityOverview(): Promise<SecurityOverview> {
  await requireAdminPermission("security");

  const [events, onboarding, multicurrency] = await Promise.all([
    prisma.adminAuditEvent.findMany({
      orderBy: { createdAt: "desc" },
      take: AUDIT_LIMIT,
    }),
    getOnboardingVisibility(),
    getMulticurrencyDefault(),
  ]);

  const auditLog: AuditEntry[] = events.map((event) => ({
    id: event.id,
    // Actor details are denormalised on the row, so they still resolve after
    // the admin who performed the action has been removed.
    actor: event.actorName || event.actorEmail?.split("@")[0] || "System",
    actorEmail: event.actorEmail ?? "—",
    action:
      ADMIN_AUDIT_LABELS[event.action as AdminAuditAction] ??
      event.action.replace(/[._]/g, " "),
    actionKey: event.action,
    targetType: event.targetType,
    target: event.targetLabel ?? event.targetId ?? "—",
    timestamp: event.createdAt.toISOString(),
    severity: (event.severity as AuditSeverity) ?? "info",
  }));

  return { auditLog, onboarding, multicurrency };
}

export type SettingsActionResult = { success: boolean; error?: string; message?: string };

/** Toggle whether the customer onboarding wizard shows the chart-of-accounts step. */
export async function setOnboardingChartOfAccountsAction(
  enabled: boolean
): Promise<SettingsActionResult> {
  try {
    const context = await getAdminContext();
    if (!context.permissions.includes("security")) {
      return { success: false, error: "You do not have access to security settings." };
    }

    await setOnboardingChartOfAccounts(enabled, context.profileId);

    await logAdminAction({
      actor: auditActorFrom(context),
      action: "settings.update",
      targetType: "platform",
      targetLabel: "Onboarding · chart of accounts step",
      metadata: { chartOfAccounts: enabled },
    });

    // Customer onboarding reads this, so clear both trees.
    revalidatePath("/admin/security");
    revalidatePath("/onboarding");

    return {
      success: true,
      message: enabled
        ? "Clients will choose their chart of accounts during onboarding."
        : "Chart of accounts will be set up automatically — step hidden for clients.",
    };
  } catch (error) {
    console.error("Failed to update onboarding settings:", error);
    return { success: false, error: "Could not save the setting." };
  }
}

/**
 * Turn multicurrency on or off as the platform default.
 *
 * Enabling reaches every existing workspace as well as new ones, because making
 * the option available changes no figure already recorded. Disabling only stops
 * it being the default — see the note on the setting key for why.
 */
export async function setMulticurrencyDefaultAction(
  enabled: boolean
): Promise<SettingsActionResult> {
  try {
    const context = await getAdminContext();
    if (!context.permissions.includes("security")) {
      return { success: false, error: "You do not have access to security settings." };
    }

    const { workspacesUpdated } = await setMulticurrencyDefault(enabled, context.profileId);

    await logAdminAction({
      actor: auditActorFrom(context),
      action: "settings.update",
      targetType: "platform",
      targetLabel: "Multicurrency · platform default",
      metadata: { multicurrency: enabled, workspacesUpdated },
    });

    // Read by the customer app's currency provider and settings dialog.
    revalidatePath("/admin/security");
    revalidatePath("/", "layout");

    return {
      success: true,
      message: enabled
        ? workspacesUpdated > 0
          ? `Multicurrency enabled — switched on for ${workspacesUpdated} existing workspace${workspacesUpdated === 1 ? "" : "s"}.`
          : "Multicurrency enabled — every workspace already had it on."
        : "New workspaces will start without multicurrency. Existing ones keep their own setting.",
    };
  } catch (error) {
    console.error("Failed to update the multicurrency default:", error);
    return { success: false, error: "Could not save the setting." };
  }
}
